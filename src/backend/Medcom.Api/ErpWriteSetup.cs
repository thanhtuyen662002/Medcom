using System.Text.Json;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Erp;
using Microsoft.Data.SqlClient;

namespace Medcom.Api;

// Operator-only one-shot command. Never builds the host, logs credentials or invokes
// authentication/business operations. Only explicit install creates the Web journal.
public static class ErpWriteSetup
{
    public const string PrepareSwitch = "--prepare-erp-writes";
    public const string InstallSwitch = "--install-erp-writes";
    public static bool IsRequested(string[] args) => args.Any(value => value.StartsWith(PrepareSwitch, StringComparison.OrdinalIgnoreCase)
        || value.StartsWith(InstallSwitch, StringComparison.OrdinalIgnoreCase));
    public static async Task<int> RunAsync(string[] args, TextWriter output)
    {
        try
        {
            if (args.Length != 3 || args[0] is not (PrepareSwitch or InstallSwitch) || args[1] != "--Medcom:PrivateConfigPath")
                throw new InvalidOperationException();
            using var configuration = new ConfigurationManager();
            configuration.AddCommandLine(args.Skip(1).ToArray());
            ServerConfiguration.LoadPrivateConfiguration(configuration, Directory.GetCurrentDirectory(), args.Skip(1).ToArray());
            var settings = ErpWriteStartup.Read(configuration, preparation: true) ?? throw new InvalidOperationException();
            var connection = ServerConfiguration.ResolveConnectionString(configuration, out var testTls);
            var store = new SqlLegacyUserStore(connection, developmentTestTlsTarget: testTls);
            using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(2));
            var receipt = await SqlErpWritePreparation.PrepareAsync(store, settings.Binding, settings.Database,
                settings.Modules, args[0] == InstallSwitch, timeout.Token);
            await output.WriteLineAsync(JsonSerializer.Serialize(new { status = "prepared", receipt.SchemaFingerprint,
                receipt.CatalogHash, receipt.Installed, receipt.Modules, productionAccepted = false }, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
            return 0;
        }
        catch (Exception error)
        {
            await output.WriteLineAsync(JsonSerializer.Serialize(new { status = "failed", code = "erp_write_preparation_failed",
                exceptionKind = error.GetType().Name, providerNumber = error is SqlException sql ? (int?)sql.Number : null }));
            return 2;
        }
    }
}
