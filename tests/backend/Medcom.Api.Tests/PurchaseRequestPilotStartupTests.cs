using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using Medcom.Api;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.PurchaseRequests;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Medcom.Api.Tests;

// All inputs are synthetic. No application is started here: no DB, DLL, password
// or live private-settings access. The HTTP suite starts only recording providers.
[Collection("Purchase pilot startup configuration")]
public sealed class PurchaseRequestPilotStartupTests : IDisposable
{
    private readonly string path = Path.Combine(Path.GetTempPath(), "medcom-i58-synthetic-" + Guid.NewGuid().ToString("N") + ".json");
    private int factories;
    private int connections;
    private string[] Args(params string[] extra) => [PurchaseRequestPilotStartup.Switch,
        "--environment", "Production", "--Medcom:PrivateConfigPath", path, .. extra];

    internal static Dictionary<string, string?> SyntheticSettings(DateTimeOffset? now = null)
    {
        var time = now ?? DateTimeOffset.UtcNow;
        return new()
        {
            ["Legacy:Enabled"] = "true", ["Legacy:EnableReadOnlyPilots"] = "true",
            ["Legacy:TenantId"] = PurchaseFixtures.Company.TenantId,
            ["Legacy:CompanyId"] = PurchaseFixtures.Company.CompanyId,
            ["Legacy:CompanyName"] = "Synthetic offline company",
            ["Legacy:ToolsPath"] = "/synthetic-unused-tools.dll",
            ["ConnectionStrings:Medcom"] = "Server=Synthetic;Database=Synthetic;Integrated Security=True;Encrypt=True;TrustServerCertificate=False",
            [Key("Server")] = "Synthetic", [Key("Database")] = "Synthetic",
            [Key("DatabaseBindingId")] = PurchaseFixtures.Binding.ToString("D"),
            [Key("TenantId")] = PurchaseFixtures.Company.TenantId,
            [Key("CompanyId")] = PurchaseFixtures.Company.CompanyId,
            [Key("ActorId")] = PurchaseFixtures.Actor, [Key("BranchId")] = "B1",
            [Key("DocumentId")] = PurchaseFixtures.DocumentId,
            [Key("AuthorizationReference")] = "I58-offline-recording-only",
            [Key("WriteStartsAtUtc")] = Stamp(time.AddMinutes(-1)),
            [Key("WriteExpiresAtUtc")] = Stamp(time.AddMinutes(3))
        };
    }
    internal static string Key(string field) => PurchaseRequestPilotStartup.PermitSection + ":" + field;
    private static string Stamp(DateTimeOffset value) => value.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fffffff'Z'", CultureInfo.InvariantCulture);
    private void Write(Dictionary<string, string?> values) => File.WriteAllText(path, JsonSerializer.Serialize(values));
    private PurchaseRequestCommandFactory Record(PurchaseRequestPilotAuthorization authorization, LegacyCompany company)
    {
        factories++;
        return PurchaseRequestCommandFactory.ForOwnerAuthorizedPilot(authorization, company,
            (Func<DbConnection>)(() => { connections++; throw new InvalidOperationException("No connection expected."); }));
    }

    [Fact]
    public async Task Complete_private_permit_builds_real_ordinary_composition_without_opening_or_accepting_runtime()
    {
        Write(SyntheticSettings());
        await using var app = PurchaseRequestPilotStartup.Build(Args());
        var factory = app.Services.GetRequiredService<PurchaseRequestCommandFactory>();
        Assert.True(factory.IsOwnerAuthorizedPilot);
        Assert.False(factory.RuntimeAccepted);
        Assert.True(factory.PilotWriteAllowed);
        Assert.IsType<LocalWebSessions>(app.Services.GetRequiredService<IWebSessions>());
        Assert.IsType<LegacyIdentityAuthority>(app.Services.GetRequiredService<IIdentityAuthority>());
        Assert.IsType<LegacyPasswordVerifier>(app.Services.GetRequiredService<ILegacyPasswordVerifier>());
    }

    [Fact]
    public async Task Nested_private_JSON_and_exact_eight_hour_window_are_supported()
    {
        var settings = SyntheticSettings(); var start = DateTimeOffset.UtcNow.AddMinutes(-1);
        settings[Key("WriteStartsAtUtc")] = Stamp(start);
        settings[Key("WriteExpiresAtUtc")] = Stamp(start.AddHours(8));
        var nested = new
        {
            Medcom = new { PurchaseRequestPilot = settings.Where(pair => pair.Key.StartsWith(PurchaseRequestPilotStartup.PermitSection + ":", StringComparison.Ordinal))
                .ToDictionary(pair => pair.Key[(PurchaseRequestPilotStartup.PermitSection.Length + 1)..], pair => pair.Value) },
            Legacy = settings.Where(pair => pair.Key.StartsWith("Legacy:", StringComparison.Ordinal))
                .ToDictionary(pair => pair.Key[7..], pair => pair.Value),
            ConnectionStrings = new { Medcom = settings["ConnectionStrings:Medcom"] }
        };
        File.WriteAllText(path, JsonSerializer.Serialize(nested));
        await using var app = PurchaseRequestPilotStartup.Build(Args());
        Assert.True(app.Services.GetRequiredService<PurchaseRequestCommandFactory>().PilotWriteAllowed);
    }

    [Fact]
    public void Duplicate_private_JSON_field_is_rejected_by_existing_loader_with_sanitized_error()
    {
        var json = JsonSerializer.Serialize(SyntheticSettings());
        File.WriteAllText(path, json[..^1] + ",\"Medcom:PurchaseRequestPilot:ActorId\":\"different-synthetic-actor\"}");
        AssertClosed(Args());
    }

    [Fact]
    public async Task Normal_host_ignores_even_complete_permit_and_keeps_commands_unavailable()
    {
        Write(SyntheticSettings());
        await using var app = ApiHost.Build(Args().Skip(1).ToArray());
        Assert.Null(app.Services.GetService<PurchaseRequestCommandFactory>());
        using var scope = app.Services.CreateScope();
        Assert.IsType<UnavailablePurchaseRequestCommands>(scope.ServiceProvider.GetRequiredService<IPurchaseRequestCommands>());
        Assert.IsType<UnavailablePurchaseRequestCommandAccess>(scope.ServiceProvider.GetRequiredService<IPurchaseRequestCommandAccess>());
    }

    public static IEnumerable<object[]> RequiredFields() => SyntheticSettings().Keys
        .Where(key => key.StartsWith(PurchaseRequestPilotStartup.PermitSection + ":", StringComparison.Ordinal))
        .Select(key => new object[] { key });

    [Theory]
    [MemberData(nameof(RequiredFields))]
    public void Every_field_is_required_in_the_private_file_before_factory_construction(string field)
    {
        var settings = SyntheticSettings(); settings.Remove(field); Write(settings); AssertClosed(Args());
    }

    [Theory]
    [InlineData("Server", "*")]
    [InlineData("Server", "OtherSynthetic")]
    [InlineData("Database", "OtherSynthetic")]
    [InlineData("TenantId", "other")]
    [InlineData("CompanyId", "other")]
    [InlineData("ActorId", "*")]
    [InlineData("BranchId", "B?")]
    [InlineData("DocumentId", " document ")]
    [InlineData("AuthorizationReference", "")]
    [InlineData("DatabaseBindingId", "bad-guid")]
    [InlineData("DatabaseBindingId", "00000000-0000-0000-0000-000000000000")]
    [InlineData("WriteStartsAtUtc", "2026-10-08T10:00:00+07:00")]
    [InlineData("WriteStartsAtUtc", "2026-10-08T10:00:00")]
    [InlineData("WriteExpiresAtUtc", "bad-date")]
    [InlineData("Unknown", "must-not-be-accepted")]
    [InlineData("ActorId:Nested", "must-not-be-accepted")]
    public void Malformed_unknown_or_mismatched_permit_fails_closed_without_disclosing_values(string field, string value)
    {
        var settings = SyntheticSettings(); settings[Key(field)] = value; Write(settings); AssertClosed(Args());
    }

    [Theory]
    [InlineData("WriteStartsAtUtc")]
    [InlineData("WriteExpiresAtUtc")]
    public void Empty_fractional_UTC_timestamp_is_rejected_before_factory_construction(string field)
    {
        var settings = SyntheticSettings();
        settings[Key(field)] = settings[Key(field)]![..19] + ".Z";
        Write(settings); AssertClosed(Args());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    [InlineData(5)]
    [InlineData(6)]
    [InlineData(7)]
    public async Task Plain_UTC_and_one_through_seven_fractional_digits_remain_supported(int digits)
    {
        var settings = SyntheticSettings();
        foreach (var field in new[] { "WriteStartsAtUtc", "WriteExpiresAtUtc" })
        {
            var original = settings[Key(field)]!;
            settings[Key(field)] = original[..19] + (digits == 0 ? "" : original.Substring(19, digits + 1)) + "Z";
        }
        Write(settings);
        await using var app = PurchaseRequestPilotStartup.Build(Args());
        Assert.True(app.Services.GetRequiredService<PurchaseRequestCommandFactory>().PilotWriteAllowed);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(9)]
    public void Nonpositive_or_over_eight_hour_intervals_fail_before_factory(int hours)
    {
        var settings = SyntheticSettings(); var start = DateTimeOffset.UtcNow;
        settings[Key("WriteStartsAtUtc")] = Stamp(start);
        settings[Key("WriteExpiresAtUtc")] = Stamp(start.AddHours(hours));
        Write(settings); AssertClosed(Args());
    }

    [Theory]
    [InlineData("Legacy:Enabled", "false")]
    [InlineData("Legacy:EnableReadOnlyPilots", "false")]
    [InlineData("Legacy:TenantId", "other")]
    [InlineData("Legacy:CompanyId", "other")]
    [InlineData("Legacy:ToolsPath", "")]
    [InlineData("ConnectionStrings:Medcom", "invalid-secret-sentinel")]
    [InlineData("ConnectionStrings:Medcom", "Server=Synthetic;Database=Synthetic;Encrypt=False;TrustServerCertificate=False")]
    [InlineData("ConnectionStrings:Medcom", "Server=Synthetic;Database=Synthetic;Encrypt=True;TrustServerCertificate=True")]
    [InlineData("ConnectionStrings:Medcom", "Server=Synthetic;Database=Synthetic;Encrypt=True;Failover Partner=OtherSynthetic")]
    [InlineData("ConnectionStrings:Medcom", "Server=Synthetic;Database=Synthetic;Encrypt=True;Application Intent=ReadOnly")]
    public void Missing_ordinary_composition_or_widened_connection_cannot_construct_a_factory(string key, string value)
    {
        var settings = SyntheticSettings(); settings[key] = value; Write(settings); AssertClosed(Args());
    }

    [Theory]
    [InlineData("ActorId", "other")]
    [InlineData("ActorId", PurchaseFixtures.Actor)]
    [InlineData("Unknown", "other")]
    public void Even_identical_or_partial_cli_permit_overrides_are_rejected(string field, string value)
    {
        Write(SyntheticSettings()); AssertClosed(Args("--" + Key(field), value));
    }

    [Fact]
    public void Complete_cli_permit_without_private_permit_is_rejected()
    {
        var settings = SyntheticSettings();
        var permit = settings.Where(pair => pair.Key.StartsWith(PurchaseRequestPilotStartup.PermitSection, StringComparison.Ordinal)).ToArray();
        foreach (var pair in permit) settings.Remove(pair.Key);
        Write(settings);
        AssertClosed(Args(permit.SelectMany(pair => new[] { "--" + pair.Key, pair.Value! }).ToArray()));
    }

    [Fact]
    public void Environment_override_cannot_mix_with_or_replace_the_private_permit()
    {
        var key = "Medcom__PurchaseRequestPilot__ActorId";
        var previous = Environment.GetEnvironmentVariable(key);
        try
        {
            Environment.SetEnvironmentVariable(key, "different-synthetic-actor");
            Write(SyntheticSettings()); AssertClosed(Args());
            var settings = SyntheticSettings(); settings.Remove(Key("ActorId"));
            Write(settings); AssertClosed(Args());
        }
        finally { Environment.SetEnvironmentVariable(key, previous); }
    }

    [Fact]
    public void Public_configuration_permit_is_rejected_even_when_private_values_are_identical()
    {
        var directory = Path.Combine(Path.GetTempPath(), "medcom-i58-public-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            var settings = SyntheticSettings(); Write(settings);
            File.WriteAllText(Path.Combine(directory, "appsettings.json"), JsonSerializer.Serialize(settings));
            AssertClosed(Args("--contentRoot", directory));
        }
        finally { Directory.Delete(directory, true); }
    }

    [Fact]
    public void Missing_private_configuration_is_rejected()
    {
        AssertClosed(Args());
    }

    [Theory]
    [InlineData("--purchase-request-pilot=true")]
    [InlineData("--purchase-request-pilot=false")]
    [InlineData("--purchase-request-pilot-unknown")]
    [InlineData("--PURCHASE-REQUEST-PILOT")]
    public void Malformed_launch_selection_is_detected_but_not_accepted(string selection)
    {
        Assert.True(PurchaseRequestPilotStartup.IsRequested([selection]));
        Write(SyntheticSettings()); AssertClosed([selection, "--Medcom:PrivateConfigPath", path]);
    }

    [Fact]
    public void Duplicate_or_missing_launch_selection_is_rejected()
    {
        Write(SyntheticSettings());
        AssertClosed(Args(PurchaseRequestPilotStartup.Switch));
        AssertClosed(Args().Skip(1).ToArray());
        Assert.False(PurchaseRequestPilotStartup.IsRequested([]));
    }

    [Theory]
    [InlineData(-10)]
    [InlineData(10)]
    public async Task Expired_or_future_permit_does_not_grant_writes_but_can_build_for_original_lookup(int minutes)
    {
        Write(SyntheticSettings(DateTimeOffset.UtcNow.AddMinutes(minutes)));
        await using var app = PurchaseRequestPilotStartup.Build(Args());
        var factory = app.Services.GetRequiredService<PurchaseRequestCommandFactory>();
        Assert.False(factory.PilotWriteAllowed);
        Assert.False(factory.RuntimeAccepted);
    }

    [Fact]
    public async Task Recording_substitution_happens_only_after_all_startup_gates_and_never_opens_connection()
    {
        Write(SyntheticSettings());
        await using var app = PurchaseRequestPilotStartup.BuildForRecording(Args(), _ => { }, Record);
        Assert.Equal(1, factories); Assert.Equal(0, connections);
        Assert.False(app.Services.GetRequiredService<PurchaseRequestCommandFactory>().RuntimeAccepted);
    }

    [Fact]
    public void Infrastructure_helper_reuses_fresh_closed_reader_connections_and_existing_TLS_policy()
    {
        var store = new SqlLegacyUserStore("Server=Synthetic;Database=Synthetic;Integrated Security=True;Encrypt=True;TrustServerCertificate=False");
        using var first = store.CreateConnection(); using var second = store.CreateConnection();
        Assert.NotSame(first, second); Assert.Equal(ConnectionState.Closed, first.State); Assert.Equal(ConnectionState.Closed, second.State);
        Assert.Equal(first.ConnectionString, second.ConnectionString);
        var authorization = new PurchaseRequestPilotAuthorization("Synthetic", "Synthetic", PurchaseFixtures.Binding,
            PurchaseFixtures.Company.TenantId, PurchaseFixtures.Company.CompanyId, PurchaseFixtures.Actor, "B1",
            PurchaseFixtures.DocumentId, "offline-only", DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddMinutes(1));
        var factory = PurchaseRequestPilotConnectionFactory.Create(authorization, PurchaseFixtures.Company, store);
        Assert.True(factory.IsOwnerAuthorizedPilot); Assert.False(factory.RuntimeAccepted);
    }

    private void AssertClosed(string[] args)
    {
        var error = Assert.Throws<InvalidOperationException>(() => PurchaseRequestPilotStartup.BuildForRecording(args, _ => { }, Record));
        Assert.Equal("Purchase pilot startup requires a complete protected server permit and ordinary ERP composition.", error.Message);
        Assert.Null(error.InnerException); Assert.Equal(0, factories); Assert.Equal(0, connections);
    }
    public void Dispose() => File.Delete(path);
}

[CollectionDefinition("Purchase pilot startup configuration", DisableParallelization = true)]
public sealed class PurchasePilotStartupConfigurationCollection { }
