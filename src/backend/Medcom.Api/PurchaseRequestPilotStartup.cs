using System.Globalization;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Infrastructure;
using Medcom.Infrastructure.PurchaseRequests;
using Microsoft.Extensions.Configuration.Memory;

namespace Medcom.Api;

// An explicit operator launch, never an HTTP activation route or a production
// acceptance attestation. Normal ApiHost startup remains write-unavailable.
public static class PurchaseRequestPilotStartup
{
    public const string Switch = "--purchase-request-pilot";
    public const string PermitSection = "Medcom:PurchaseRequestPilot";
    private const string ConfigurationError = "Purchase pilot startup requires a complete protected server permit and ordinary ERP composition.";
    private static readonly string[] Fields = ["Server", "Database", "DatabaseBindingId", "TenantId", "CompanyId",
        "ActorId", "BranchId", "DocumentId", "AuthorizationReference", "WriteStartsAtUtc", "WriteExpiresAtUtc"];

    public static bool IsRequested(string[] args) => args.Any(value =>
        value.StartsWith(Switch, StringComparison.OrdinalIgnoreCase));

    public static WebApplication Build(string[] args) => BuildCore(args, null, null);

    // Offline tests substitute only after validating the same protected permit,
    // real login/read/session registrations and closed production connection target.
    // This internal seam is inaccessible to process settings and HTTP callers.
    internal static WebApplication BuildForRecording(string[] args, Action<WebApplicationBuilder> configure,
        Func<PurchaseRequestPilotAuthorization, LegacyCompany, PurchaseRequestCommandFactory> factory)
        => BuildCore(args, configure, factory);

    private static WebApplication BuildCore(string[] args, Action<WebApplicationBuilder>? configureRecording,
        Func<PurchaseRequestPilotAuthorization, LegacyCompany, PurchaseRequestCommandFactory>? recordingFactory)
    {
        try
        {
            if (args.Count(value => value == Switch) != 1
                || args.Any(value => value.StartsWith(Switch, StringComparison.OrdinalIgnoreCase) && value != Switch))
                throw new InvalidOperationException();
            var ordinaryArgs = args.Where(value => value != Switch).ToArray();
            return ApiHost.Build(ordinaryArgs, builder =>
            {
                var authorization = ReadProtectedPermit(builder.Configuration);
                if (!builder.Configuration.GetValue<bool>("Legacy:Enabled")
                    || !builder.Configuration.GetValue<bool>("Legacy:EnableReadOnlyPilots")
                    || Last<IIdentityAuthority>(builder.Services)?.ImplementationType != typeof(LegacyIdentityAuthority)
                    || Last<ILegacyPasswordVerifier>(builder.Services)?.ImplementationType != typeof(LegacyPasswordVerifier)
                    || Last<IWebSessions>(builder.Services)?.ImplementationType != typeof(LocalWebSessions)
                    || Last<IPurchaseRequestQueries>(builder.Services)?.ImplementationFactory is null
                    || Last<LegacyCompany>(builder.Services)?.ImplementationInstance is not LegacyCompany company
                    || Last<SqlLegacyUserStore>(builder.Services)?.ImplementationInstance is not SqlLegacyUserStore store)
                    throw new InvalidOperationException();
                var factory = PurchaseRequestPilotConnectionFactory.Create(authorization, company, store);
                if (recordingFactory is not null) factory = recordingFactory(authorization, company);
                builder.Services.AddSingleton(factory);
                builder.Services.AddOwnerAuthorizedPurchaseRequestPilotCommands(factory);
                configureRecording?.Invoke(builder);
            });
        }
        catch (Exception exception) when (exception is ArgumentException or InvalidOperationException
            or FormatException or NotSupportedException or IOException or UnauthorizedAccessException)
        {
            // Configuration/connection/parser errors can include private values.
            throw new InvalidOperationException(ConfigurationError);
        }
    }

    private static ServiceDescriptor? Last<T>(IServiceCollection services) =>
        services.LastOrDefault(descriptor => descriptor.ServiceType == typeof(T));

    private static PurchaseRequestPilotAuthorization ReadProtectedPermit(ConfigurationManager configuration)
    {
        // ServerConfiguration adds one private-file snapshot immediately before its
        // one-key path marker. Accept only that snapshot; never merge permit fields
        // from public appsettings, environment variables or command-line providers.
        var providers = ((IConfigurationRoot)configuration).Providers.ToArray();
        var markers = configuration.Sources.Select((source, index) => (source, index))
            .Where(item => item.source is MemoryConfigurationSource
            {
                InitialData: Dictionary<string, string?> values
            } && values.Count == 1 && values.ContainsKey(ServerConfiguration.PrivateConfigPathKey))
            .Select(item => item.index).ToArray();
        if (markers.Length != 1 || markers[0] < 1
            || configuration.Sources[markers[0] - 1] is not MemoryConfigurationSource
            || providers.Length != configuration.Sources.Count)
            throw new InvalidOperationException();
        var privateProvider = providers[markers[0] - 1];
        foreach (var provider in providers)
            if (!ReferenceEquals(provider, privateProvider)
                && (provider.TryGet(PermitSection, out _)
                    || provider.GetChildKeys([], PermitSection).Any()))
                throw new InvalidOperationException();
        var fields = privateProvider.GetChildKeys([], PermitSection).Distinct(StringComparer.Ordinal).ToArray();
        if (fields.Length != Fields.Length || fields.Except(Fields, StringComparer.Ordinal).Any()
            || privateProvider.TryGet(PermitSection, out var scalar) && scalar is not null)
            throw new InvalidOperationException();
        string Required(string field)
        {
            var key = PermitSection + ":" + field;
            if (!privateProvider.TryGet(key, out var value) || string.IsNullOrWhiteSpace(value)
                || value != value.Trim() || value.Any(c => char.IsControl(c) || c is '*' or '?')
                || privateProvider.GetChildKeys([], key).Any())
                throw new InvalidOperationException();
            return value;
        }
        if (!Guid.TryParseExact(Required("DatabaseBindingId"), "D", out var binding) || binding == Guid.Empty)
            throw new InvalidOperationException();
        DateTimeOffset Utc(string field)
        {
            var text = Required(field);
            // FFFFFFF alone also accepts an empty fractional part (seconds.Z).
            // Require either the plain UTC form or exactly 1-7 ASCII digits.
            if (text.Length != 20 && (text.Length is < 22 or > 28 || text[19] != '.' || text[^1] != 'Z'
                || text.Skip(20).SkipLast(1).Any(c => !char.IsAsciiDigit(c))))
                throw new InvalidOperationException();
            if (!DateTimeOffset.TryParseExact(text,
                ["yyyy-MM-dd'T'HH:mm:ss'Z'", "yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'"],
                CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var value))
                throw new InvalidOperationException();
            return value;
        }
        return new PurchaseRequestPilotAuthorization(Required("Server"), Required("Database"), binding,
            Required("TenantId"), Required("CompanyId"), Required("ActorId"), Required("BranchId"),
            Required("DocumentId"), Required("AuthorizationReference"), Utc("WriteStartsAtUtc"), Utc("WriteExpiresAtUtc"));
    }
}
