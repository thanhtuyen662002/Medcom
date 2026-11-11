using System.Text.Json;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Audit;
using Microsoft.Data.SqlClient;

namespace Medcom.Api;

/// <summary>
/// Operator-only one-shot commands for the Web activity log table. Never builds the host.
///   dotnet Medcom.Api.dll --check-web-audit   --Medcom:PrivateConfigPath D:\Config\appsettings.Private.json
///   dotnet Medcom.Api.dll --install-web-audit --Medcom:PrivateConfigPath D:\Config\appsettings.Private.json
/// Install only creates dbo.MedcomWebAuditLog (and its indexes) when it is absent.
/// </summary>
public static class WebAuditSetup
{
    public const string CheckSwitch = "--check-web-audit";
    public const string InstallSwitch = "--install-web-audit";

    public static bool IsRequested(string[] args) => args.Length > 0 && args[0] is CheckSwitch or InstallSwitch;

    public static async Task<int> RunAsync(string[] args, TextWriter output)
    {
        try
        {
            if (args.Length != 3 || args[1] != "--" + ServerConfiguration.PrivateConfigPathKey)
                throw new ArgumentException("Usage: --install-web-audit --Medcom:PrivateConfigPath <file>");
            using var configuration = new ConfigurationManager();
            configuration.AddCommandLine(args.Skip(1).ToArray());
            ServerConfiguration.LoadPrivateConfiguration(configuration, Directory.GetCurrentDirectory(), args.Skip(1).ToArray());
            var connection = ServerConfiguration.ResolveConnectionString(configuration, out var testTls);
            var store = SqlWebAuditStore.FromStore(new SqlLegacyUserStore(connection, developmentTestTlsTarget: testTls));
            using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(3));
            if (args[0] == CheckSwitch)
            {
                var installed = await store.InstalledAsync(timeout.Token);
                await output.WriteLineAsync(JsonSerializer.Serialize(new { status = installed ? "installed" : "not_installed", table = SqlWebAuditStore.Table }));
                return installed ? 0 : 1;
            }
            var created = await store.InstallAsync(timeout.Token);
            await output.WriteLineAsync(JsonSerializer.Serialize(new { status = created ? "created" : "already_installed", table = SqlWebAuditStore.Table }));
            return 0;
        }
        catch (Exception error)
        {
            await output.WriteLineAsync(JsonSerializer.Serialize(new
            {
                status = "failed", code = "web_audit_setup_failed", exceptionKind = error.GetType().Name,
                providerNumber = error is SqlException sql ? (int?)sql.Number : null
            }));
            return 2;
        }
    }
}
