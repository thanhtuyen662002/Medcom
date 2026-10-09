using System.Data;
using System.Data.Common;
using System.Text.Json;
using Medcom.Application.PurchaseRequests;
using Medcom.Infrastructure.PurchaseRequests;
using Microsoft.Data.SqlClient;

namespace Medcom.Api;

// Explicit, one-shot, read-only observations. Never builds the host, authenticates
// an ERP user, loads Tools, creates a permit or qualifies any command factory.
public static class PurchaseRequestPilotPreflight
{
    public const string Switch = "--probe-purchase-pilot";
    internal const string ControlSql = """
        SELECT TOP (2) SingletonId,SchemaVersion,DatabaseBindingId
        FROM dbo.MedcomPurchaseRequestCommandSchema WITH (HOLDLOCK);
        """;
    // Resolve precisely the same native collation/unique user+group match as login.
    // The returned spelling is the stored principal, not the operator's spelling.
    // No password, credential stamp, display name or user business data is selected.
    internal const string PrincipalSql = """
        SELECT TOP (2) CONVERT(nvarchar(101),U.UserName),U.[Disable],CONVERT(nvarchar(51),U.UserGroupID),G.IsDisable
        FROM dbo.SY_User U WITH (HOLDLOCK)
        LEFT JOIN dbo.SY_UserGroup G WITH (HOLDLOCK) ON G.UserGroupID=U.UserGroupID
        WHERE U.UserName=@username;
        """;
    internal const string DocumentSql = """
        SELECT TOP (2) CONVERT(nvarchar(51),PurchaseRequestID),CONVERT(nvarchar(51),BranchID),StatusID,isLock
        FROM dbo.AP_PurchaseRequestTbl WITH (HOLDLOCK)
        WHERE DATALENGTH(PurchaseRequestID)=DATALENGTH(@document)
          AND CONVERT(varbinary(max),PurchaseRequestID)=CONVERT(varbinary(max),@document)
          AND DATALENGTH(CONVERT(nvarchar(max),BranchID))=DATALENGTH(@branch)
          AND CONVERT(varbinary(max),CONVERT(nvarchar(max),BranchID))=CONVERT(varbinary(max),@branch);
        """;

    internal sealed record Inputs(string Actor, string Document, string Branch);
    internal sealed record Observation(string CanonicalPrincipalId, string DocumentId, string BranchId,
        int StatusId, bool? IsLocked, Guid DatabaseBindingId, byte SingletonId, int SchemaVersion,
        bool SchemaMatchesWriter, bool DatabaseDurabilityEligible);

    public static bool IsRequested(string[] args) => args.Any(value =>
        value.StartsWith(Switch, StringComparison.OrdinalIgnoreCase));

    internal static Inputs Parse(string[] args)
    {
        if (args.Length != 7 || args[0] != Switch || args[1] != "--actor"
            || args[3] != "--document" || args[5] != "--branch"
            || !Literal(args[2], 100) || !Literal(args[4], 50) || !Literal(args[6], 50))
            throw new ArgumentException();
        return new(args[2], args[4], args[6]);
    }

    private static bool Literal(string? value, int maximum) =>
        PurchaseRequestCommandRules.Identifier(value, maximum) && value == value!.Trim()
        && !value.StartsWith("--", StringComparison.Ordinal)
        && !value.Any(c => c is '*' or '?');

    public static async Task<int> RunAsync(string[] args, TextWriter output)
    {
        try { _ = Parse(args); }
        catch (Exception) { return await Report(output, "arguments", "invalid_arguments", 2); }
        try
        {
            // Reuse the existing provisioned target/TLS policy, without reading a
            // private file or accepting connection settings/secrets on argv.
            using var configuration = new ConfigurationManager();
            configuration.AddEnvironmentVariables();
            return await RunCoreAsync(args, configuration, output, value => new SqlConnection(value));
        }
        catch (Exception) { return await Report(output, "configuration", "configuration_unavailable", 3); }
    }

    internal static async Task<int> RunCoreAsync(string[] args, IConfiguration configuration,
        TextWriter output, Func<string, DbConnection> createConnection, CancellationToken cancellationToken = default)
    {
        Inputs input;
        try { input = Parse(args); }
        catch (Exception) { return await Report(output, "arguments", "invalid_arguments", 2); }
        var stage = "configuration";
        Observation? observed = null;
        var code = "probe_failed";
        var exit = 3;
        DbConnection? connection = null;
        DbTransaction? transaction = null;
        var owned = false;
        var cleanupOk = true;
        try
        {
            if (System.Transactions.Transaction.Current is not null) throw new InvalidOperationException();
            var settings = new SqlConnectionStringBuilder(ServerConfiguration.ResolveConnectionString(configuration));
            if (settings.IntegratedSecurity || settings.Authentication is not
                (SqlAuthenticationMethod.NotSpecified or SqlAuthenticationMethod.SqlPassword)
                || string.IsNullOrWhiteSpace(settings.UserID) || string.IsNullOrWhiteSpace(settings.Password)
                || settings.Password == "REPLACE_PASSWORD_HERE"
                || !string.IsNullOrWhiteSpace(settings.FailoverPartner)
                || settings.ApplicationIntent != ApplicationIntent.ReadWrite)
                throw new InvalidOperationException();
            settings.ConnectTimeout = 10; settings.ConnectRetryCount = 0;
            settings.Pooling = false; settings.Enlist = false;
            using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            budget.CancelAfter(TimeSpan.FromSeconds(30));
            var token = budget.Token;
            token.ThrowIfCancellationRequested();
            connection = createConnection(settings.ConnectionString);
            if (connection is null || connection.State != ConnectionState.Closed)
                throw new InvalidOperationException();
            owned = true;
            void Target()
            {
                if (connection.DataSource != settings.DataSource || connection.Database != settings.InitialCatalog)
                    throw new InvalidOperationException();
            }
            Target(); stage = "open";
            await connection.OpenAsync(token); Target();
            stage = "transaction";
            await TransactionState(connection, null, 0, token);
            var started = await connection.BeginTransactionAsync(IsolationLevel.Serializable, token);
            // Do not roll back a transaction owned by another connection.
            if (!ReferenceEquals(started.Connection, connection)) throw new InvalidOperationException();
            transaction = started;
            if (transaction.IsolationLevel != IsolationLevel.Serializable) throw new InvalidOperationException();
            await TransactionState(connection, transaction, 1, token);
            stage = "control";
            var control = await ReadOne(connection, transaction, ControlSql, [typeof(byte), typeof(int), typeof(Guid)], [], token);
            if (control[0] is not byte singleton || singleton != 1 || control[1] is not int version || version != 1
                || control[2] is not Guid binding || binding == Guid.Empty) throw new InvalidOperationException();
            stage = "schema";
            var shape = await ReadOne(connection, transaction, PurchaseRequestSql.ProbeText,
                [typeof(int), typeof(Guid), typeof(int), typeof(int)], [], token);
            if (shape[0] is not int schema || schema != version || shape[1] is not Guid probeBinding || probeBinding != binding
                || shape[2] is not int durable || durable is < 0 or > 1
                || shape[3] is not int matches || matches is < 0 or > 1) throw new InvalidOperationException();
            stage = "principal";
            var principal = await ReadOne(connection, transaction, PrincipalSql,
                [typeof(string), typeof(bool), typeof(string), typeof(bool)],
                [("@username", DbType.AnsiString, 100, input.Actor)], token);
            if (principal[0] is not string canonical || !Literal(canonical, 100)
                || principal[1] is not false || principal[2] is not string group || !Literal(group, 50)
                || principal[3] is not false) throw new InvalidOperationException();
            stage = "document";
            var document = await ReadOne(connection, transaction, DocumentSql,
                [typeof(string), typeof(string), typeof(int), typeof(bool)],
                [("@document", DbType.String, 50, input.Document), ("@branch", DbType.String, 50, input.Branch)], token);
            if (document[0] is not string documentId || documentId != input.Document
                || document[1] is not string branch || branch != input.Branch
                || document[2] is not int status || document[3] is not (bool or DBNull)) throw new InvalidOperationException();
            stage = "transaction";
            await TransactionState(connection, transaction, 1, token);
            token.ThrowIfCancellationRequested();
            observed = new(canonical, documentId, branch, status, document[3] is bool locked ? locked : null,
                binding, singleton, version, matches == 1, durable == 1);
            stage = "complete"; code = "observed"; exit = 0;
        }
        catch (OperationCanceledException) { code = "cancelled_or_timed_out"; }
        catch (SqlException) { code = "sql_unavailable"; }
        catch (Exception) { code = "probe_failed"; }
        finally
        {
            if (transaction is not null)
            {
                try { await transaction.RollbackAsync(CancellationToken.None); } catch (Exception) { cleanupOk = false; }
                try { await transaction.DisposeAsync(); } catch (Exception) { cleanupOk = false; }
            }
            if (owned && connection is not null)
                try { await connection.DisposeAsync(); } catch (Exception) { cleanupOk = false; }
        }
        if (!cleanupOk) { stage = "cleanup"; code = "cleanup_failed"; exit = 3; }
        if (cancellationToken.IsCancellationRequested) { code = "cancelled_or_timed_out"; exit = 3; }
        return await Report(output, stage, code, exit, exit == 0 ? observed : null);
    }

    private static async Task TransactionState(DbConnection connection, DbTransaction? transaction, int expected, CancellationToken token)
    {
        var state = await ReadOne(connection, transaction, PurchaseRequestSql.TransactionText, [typeof(int), typeof(int)], [], token);
        if (state[0] is not int count || count != expected || state[1] is not int active || active != expected)
            throw new InvalidOperationException();
    }

    private static async Task<object[]> ReadOne(DbConnection connection, DbTransaction? transaction, string sql, Type[] types,
        (string Name, DbType Type, int Size, object Value)[] parameters, CancellationToken token)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction; command.CommandText = sql; command.CommandType = CommandType.Text;
        command.CommandTimeout = 5;
        foreach (var (name, type, size, value) in parameters)
        {
            var parameter = command.CreateParameter(); parameter.ParameterName = name;
            parameter.DbType = type; parameter.Size = size; parameter.Value = value;
            command.Parameters.Add(parameter);
        }
        await using var reader = await command.ExecuteReaderAsync(token);
        if (reader.FieldCount != types.Length || types.Where((type, index) => reader.GetFieldType(index) != type).Any()
            || !await reader.ReadAsync(token)) throw new InvalidOperationException();
        var row = new object[types.Length]; reader.GetValues(row);
        if (await reader.ReadAsync(token) || await reader.NextResultAsync(token)) throw new InvalidOperationException();
        return row;
    }

    private static async Task<int> Report(TextWriter output, string stage, string code, int exit,
        Observation? observation = null)
    {
        try
        {
            await output.WriteLineAsync(JsonSerializer.Serialize(new
            {
                schemaVersion = 1, purpose = "read_only_preflight_not_write_authorization", readOnly = true,
                stage, code, observation, qualification = "not_established"
            }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
            return exit;
        }
        catch (Exception) { return 4; }
    }
}
