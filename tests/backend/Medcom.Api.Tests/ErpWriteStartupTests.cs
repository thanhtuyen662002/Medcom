using System.Text.Json;
using Medcom.Api;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Erp;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Medcom.Api.Tests;

[Collection("Purchase pilot startup configuration")]
public sealed class ErpWriteStartupTests : IDisposable
{
    private readonly string path = Path.Combine(Path.GetTempPath(), "medcom-i74-synthetic-" + Guid.NewGuid().ToString("N") + ".json");
    private static string Key(string field) => ErpWriteStartup.Section + ":" + field;
    private Dictionary<string, string?> Settings() => new()
    {
        ["Legacy:Enabled"] = "true", ["Legacy:EnableReadOnlyPilots"] = "false",
        ["Legacy:TenantId"] = "SYNTHETIC", ["Legacy:CompanyId"] = "SYNTHETIC", ["Legacy:CompanyName"] = "Synthetic",
        ["Legacy:ToolsPath"] = Path.Combine(Path.GetTempPath(), "synthetic-unused-tools.dll"),
        ["ConnectionStrings:Medcom"] = "Server=Synthetic;Database=Synthetic;Integrated Security=True;Encrypt=True;TrustServerCertificate=False",
        [Key("DatabaseBindingId")] = "d194f9b5-c32b-4d55-a152-3f290ca4a8a2", [Key("Database")] = "Synthetic",
        [Key("SchemaFingerprint")] = new string('a', 64), [Key("Modules")] = string.Join(';', ErpScreenCatalog.ModuleIds)
    };
    private void Write(Dictionary<string, string?> values) => File.WriteAllText(path, JsonSerializer.Serialize(values));
    private string[] Args(params string[] extra) => ["--environment", "Production", "--Medcom:PrivateConfigPath", path, .. extra];

    [Fact]
    public async Task Ordinary_host_wires_actual_SQL_commands_numbering_reads_and_legacy_identity_without_a_pilot_launch()
    {
        Write(Settings()); IServiceCollection? registrations = null;
        await using var app = ApiHost.Build(Args(), builder => registrations = builder.Services);
        Assert.IsType<ErpWriteRuntime>(app.Services.GetRequiredService<IErpSqlWriteAcceptance>());
        Assert.IsType<SqlErpDocumentNumberAllocator>(app.Services.GetRequiredService<IErpDocumentNumberAllocator>());
        Assert.IsType<LegacyIdentityAuthority>(app.Services.GetRequiredService<IIdentityAuthority>());
        Assert.IsType<LegacyPasswordVerifier>(app.Services.GetRequiredService<ILegacyPasswordVerifier>());
        var executor = Assert.Single(registrations!, entry => entry.ServiceType == typeof(IErpSqlCommandExecutor));
        Assert.Equal(ServiceLifetime.Scoped, executor.Lifetime); Assert.NotNull(executor.ImplementationFactory);
        Assert.NotNull(registrations!.Last(entry => entry.ServiceType == typeof(IErpScreenService)).ImplementationFactory);
        foreach (var module in ErpScreenCatalog.ModuleIds)
            Assert.True(app.Services.GetRequiredService<IErpSqlWriteAcceptance>().Includes(module));
    }
    [Theory]
    [InlineData("DatabaseBindingId", "00000000-0000-0000-0000-000000000000")]
    [InlineData("DatabaseBindingId", "bad")]
    [InlineData("Database", "Different")]
    [InlineData("SchemaFingerprint", "bad")]
    [InlineData("SchemaFingerprint", "")]
    [InlineData("Modules", "sales-orders;sales-orders")]
    [InlineData("Modules", "unknown")]
    [InlineData("Modules", " sales-orders")]
    [InlineData("Modules", "sales-orders;")]
    [InlineData("Modules", "")]
    [InlineData("SQL", "DELETE synthetic")]
    public void Malformed_or_target_mismatched_write_settings_fail_at_startup_with_sanitized_error(string field, string value)
    {
        var settings = Settings(); settings[Key(field)] = value; Write(settings);
        var error = Assert.Throws<InvalidOperationException>(() => ApiHost.Build(Args()));
        Assert.Equal("Complete protected ERP write configuration required.", error.Message);
        Assert.Null(error.InnerException);
    }
    [Theory]
    [InlineData("DatabaseBindingId")][InlineData("Database")][InlineData("SchemaFingerprint")][InlineData("Modules")]
    public void Incomplete_profile_fails_at_startup_instead_of_publishing_a_dormant_writer(string field)
    {
        var settings = Settings(); settings.Remove(Key(field)); Write(settings);
        Assert.Throws<InvalidOperationException>(() => ApiHost.Build(Args()));
    }
    [Fact]
    public void Process_arguments_cannot_override_the_protected_profile()
    {
        Write(Settings());
        Assert.Throws<InvalidOperationException>(() => ApiHost.Build(Args("--" + Key("Modules"), "sales-orders")));
    }
    [Theory]
    [InlineData(false)][InlineData(true)]
    public async Task One_complete_operator_environment_profile_is_supported_but_cannot_overlay_a_file_profile(bool overlay)
    {
        var settings = Settings(); var profile = settings.Where(entry => entry.Key.StartsWith(ErpWriteStartup.Section, StringComparison.Ordinal)).ToArray();
        var originals = profile.ToDictionary(entry => entry.Key.Replace(":", "__", StringComparison.Ordinal),
            entry => Environment.GetEnvironmentVariable(entry.Key.Replace(":", "__", StringComparison.Ordinal)));
        Write(overlay ? settings : settings.Where(entry => !entry.Key.StartsWith(ErpWriteStartup.Section, StringComparison.Ordinal)).ToDictionary());
        try
        {
            foreach (var entry in profile) Environment.SetEnvironmentVariable(entry.Key.Replace(":", "__", StringComparison.Ordinal), entry.Value);
            if (overlay) Assert.Throws<InvalidOperationException>(() => ApiHost.Build(Args()));
            else
            {
                await using var app = ApiHost.Build(Args());
                Assert.IsType<ErpWriteRuntime>(app.Services.GetRequiredService<IErpSqlWriteAcceptance>());
            }
        }
        finally { foreach (var entry in originals) Environment.SetEnvironmentVariable(entry.Key, entry.Value); }
    }
    [Fact]
    public void Write_profile_requires_real_legacy_identity_configuration()
    {
        var settings = Settings(); settings["Legacy:Enabled"] = "false"; Write(settings);
        Assert.Throws<InvalidOperationException>(() => ApiHost.Build(Args()));
    }
    [Fact]
    public async Task Read_only_installations_keep_the_existing_optional_write_boundary()
    {
        Write(Settings().Where(entry => !entry.Key.StartsWith(ErpWriteStartup.Section, StringComparison.Ordinal)).ToDictionary());
        await using var app = ApiHost.Build(Args());
        Assert.Null(app.Services.GetService<IErpSqlWriteAcceptance>());
        Assert.Null(app.Services.GetService<IErpDocumentNumberAllocator>());
    }
    [Theory]
    [InlineData("purchase-requests", "PO")][InlineData("sales-orders", "DMB")][InlineData("internal-transfer-requests", "DCNB")]
    [InlineData("machine-movements", "MLI")][InlineData("machine-repairs", "MLRP")]
    public void Numbering_uses_the_current_fixed_ERP_prefixes(string module, string prefix)
    {
        Assert.True(new SqlErpDocumentNumberAllocator().IsQualified(module));
        Assert.Equal(prefix, SqlErpDocumentNumberAllocator.Prefix(module));
    }
    [Theory]
    [InlineData("warehouse-qr")][InlineData("sales-qr")][InlineData("unknown")]
    public void Scan_screens_do_not_offer_a_parent_document_number_allocator(string module)
        => Assert.False(new SqlErpDocumentNumberAllocator().IsQualified(module));
    [Theory]
    [InlineData(ErpWriteSetup.InstallSwitch)][InlineData(ErpWriteSetup.PrepareSwitch)]
    public async Task Setup_requires_the_exact_operator_switch_and_private_file_arguments(string mode)
    {
        using var output = new StringWriter();
        Assert.Equal(2, await ErpWriteSetup.RunAsync([mode, "--connection", "private-value"], output));
        Assert.DoesNotContain("private-value", output.ToString());
    }
    public void Dispose() => File.Delete(path);
}
