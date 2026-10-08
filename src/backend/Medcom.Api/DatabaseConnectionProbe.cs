using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Data.SqlClient;

[assembly: InternalsVisibleTo("Medcom.Api.Tests")]

namespace Medcom.Api;

// No HTTP route, host, private-file loader, logger, legacy provider or retry loop.
public static class DatabaseConnectionProbe
{
    public const string Switch = "--probe-database";
    private const string PasswordPlaceholder = "REPLACE_PASSWORD_HERE";

    public static bool IsRequested(string[] args) => args.Contains(Switch, StringComparer.Ordinal);

    public static async Task<int> RunAsync(string[] args, TextWriter output)
    {
        if (args.Length != 1 || args[0] != Switch)
            return await ReportAsync(output, "arguments", "invalid_arguments", 2);
        // Environment only: never accept a connection string/password on argv or read files.
        try
        {
            using var configuration = new ConfigurationManager();
            configuration.AddEnvironmentVariables();
            return await RunCoreAsync(configuration, output, () => new SqlProbeSession());
        }
        catch (Exception)
        {
            return await ReportAsync(output, "configuration", "probe_failed", 3);
        }
    }

    internal static async Task<int> RunCoreAsync(IConfiguration configuration, TextWriter output,
        Func<IProbeSession> createSession)
    {
        var stage = "configuration";
        var scalarIsOne = false;
        try
        {
            var connectionString = ServerConfiguration.ResolveConnectionString(configuration);
            var settings = new SqlConnectionStringBuilder(connectionString);
            // This bounded Railway diagnostic requires explicit SQL-password authentication.
            // It must not silently use machine identity, interactive auth or an empty placeholder.
            if (settings.IntegratedSecurity || settings.Authentication is not
                (SqlAuthenticationMethod.NotSpecified or SqlAuthenticationMethod.SqlPassword)
                || string.IsNullOrWhiteSpace(settings.UserID)
                || string.IsNullOrWhiteSpace(settings.Password)
                || settings.Password.Equals(PasswordPlaceholder, StringComparison.Ordinal))
                return await ReportAsync(output, stage, "missing_sql_password", 2);
            // Preserve resolved TLS/target policy; only bound time/retries and disable pooling.
            settings.ConnectTimeout = 10;
            settings.ConnectRetryCount = 0;
            settings.Pooling = false;
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
            await using var session = createSession();
            stage = "open";
            await session.OpenAsync(settings.ConnectionString, timeout.Token);
            stage = "select_one";
            scalarIsOne = await session.SelectOneAsync(timeout.Token);
        }
        catch (SqlException exception)
        {
            // Only the numeric provider code is safe: never serialize exception/message/data.
            return await ReportAsync(output, stage, "sql_error", 3, exception.Number);
        }
        catch (OperationCanceledException)
        {
            return await ReportAsync(output, stage, "timeout", 3);
        }
        catch (Exception)
        {
            return await ReportAsync(output, stage,
                stage == "configuration" ? "invalid_configuration" : "probe_failed", 3);
        }
        return scalarIsOne
            ? await ReportAsync(output, "complete", "ok", 0)
            : await ReportAsync(output, "select_one", "unexpected_scalar", 3);
    }

    private static async Task<int> ReportAsync(TextWriter output, string stage, string code,
        int exitCode, int? sqlNumber = null)
    {
        try
        {
            await output.WriteLineAsync(JsonSerializer.Serialize(new
            {
                provider = "Microsoft.Data.SqlClient",
                providerVersion = typeof(SqlConnection).Assembly.GetName().Version?.ToString(),
                runtimeVersion = Environment.Version.ToString(),
                stage,
                code,
                sqlNumber
            }));
            return exitCode;
        }
        catch (Exception)
        {
            // An unavailable/broken output sink must not escape to the process's raw
            // exception handler, retry the write, or echo its possibly sensitive error.
            return 4;
        }
    }

    internal interface IProbeSession : IAsyncDisposable
    {
        Task OpenAsync(string connectionString, CancellationToken cancellationToken);
        Task<bool> SelectOneAsync(CancellationToken cancellationToken);
    }

    private sealed class SqlProbeSession : IProbeSession
    {
        private SqlConnection? connection;

        public async Task OpenAsync(string connectionString, CancellationToken cancellationToken)
        {
            connection = new SqlConnection(connectionString);
            await connection.OpenAsync(cancellationToken);
        }

        public async Task<bool> SelectOneAsync(CancellationToken cancellationToken)
        {
            using var command = connection!.CreateCommand();
            command.CommandText = "SELECT 1";
            command.CommandTimeout = 5;
            return await command.ExecuteScalarAsync(cancellationToken) is int value && value == 1;
        }

        public async ValueTask DisposeAsync()
        {
            if (connection is not null) await connection.DisposeAsync();
        }
    }
}
