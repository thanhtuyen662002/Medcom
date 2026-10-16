using System.Data;
using System.Data.Common;
using Medcom.Contracts;

namespace Medcom.Infrastructure;

// One fresh, read-only batch. No cross-request identity, grant or branch cache.
internal static class SqlNativeIdentity
{
    internal const string ErpUserText = """
        SELECT TOP(2) U.UserName,U.[Password],U.[Disable],U.UserGroupID,G.IsDisable
        FROM dbo.SY_User U WITH(HOLDLOCK) LEFT JOIN dbo.SY_UserGroup G WITH(HOLDLOCK) ON G.UserGroupID=U.UserGroupID
        WHERE U.UserName=@legacyActor;
        """;
    internal const string Text = SqlLegacyBranchScope.NativeUserText + "\n" + """
        IF EXISTS(SELECT 1 FROM dbo.SY_User WITH(HOLDLOCK)
          WHERE UserName=@actor AND (BranchID IS NULL OR DATALENGTH(BranchID)=0))
        BEGIN
        """ + "\n" + SqlLegacyBranchScope.CatalogShapeText + "\n" + SqlLegacyBranchScope.CatalogText + "\n" + """
        END
        ELSE BEGIN
        """ + "\n" + SqlLegacyBranchScope.RestrictedText + "\nEND;\n";
    internal const string ErpText = ErpUserText + "\n" + Text;

    internal sealed record Observation(LegacyUser User, SqlLegacyBranchScope.Resolution Scope);

    internal static async Task<Observation?> ReadAsync(DbTransaction transaction, string actor,
        Func<LegacyUser, bool> accept, CancellationToken token, bool checkLegacyGroupMatch = false)
    {
        if (transaction.IsolationLevel != IsolationLevel.Serializable)
            throw new InvalidOperationException("Serializable native authority required.");
        await using var command = SqlLegacyBranchScope.Command(transaction, checkLegacyGroupMatch ? ErpText : Text, actor);
        if (checkLegacyGroupMatch)
        {
            var parameter = command.CreateParameter(); parameter.ParameterName = "@legacyActor";
            parameter.DbType = DbType.AnsiString; parameter.Size = 100; parameter.Value = actor; command.Parameters.Add(parameter);
        }
        await using var reader = await command.ExecuteReaderAsync(token);
        if (checkLegacyGroupMatch)
        {
            // The modern screen provider historically rejects ambiguous collation matches
            // in its preliminary group join as well as checking the physical native group.
            if (reader.FieldCount != 5 || !await reader.ReadAsync(token) || Enumerable.Range(0, 5).Any(reader.IsDBNull)) return null;
            var preliminary = new LegacyUser(reader.GetString(0), "", reader.GetString(1), reader.GetBoolean(2), reader.GetString(3), !reader.GetBoolean(4));
            if (await reader.ReadAsync(token) || preliminary.Username != actor || preliminary.Disabled
                || !preliminary.GroupEnabled || !accept(preliminary)) return null;
            await Next(reader, token);
        }
        var result = await ReadBatch(reader, actor, accept, token);
        if (result is not null && await reader.NextResultAsync(token))
            throw new InvalidOperationException("Unexpected native identity result.");
        return result;
    }

    // Leaves the reader on the final scope result so a larger fixed batch can follow it.
    internal static async Task<Observation?> ReadBatch(DbDataReader reader, string actor,
        Func<LegacyUser, bool> accept, CancellationToken token)
    {
        Shape(reader, typeof(string), typeof(string), typeof(bool), typeof(string), typeof(bool), typeof(string));
        if (!await reader.ReadAsync(token) || Enumerable.Range(0, 5).Any(reader.IsDBNull)) return null;
        var user = new LegacyUser(reader.GetString(0), "", reader.GetString(1), reader.GetBoolean(2),
            reader.GetString(3), !reader.GetBoolean(4));
        var native = reader.IsDBNull(5) ? null : reader.GetString(5);
        if (await reader.ReadAsync(token) || user.Username != actor || user.Disabled || !user.GroupEnabled
            || string.IsNullOrEmpty(user.StoredHash) || !accept(user)) return null;
        await Next(reader, token);
        if (!SqlLegacyBranchScope.NativeAll(native))
        {
            SqlLegacyBranchScope.Validate([native], true);
            Shape(reader, typeof(string));
            var values = new List<string?>();
            while (await reader.ReadAsync(token))
            {
                if (values.Count == 400) throw new InvalidOperationException("Native scope exceeds bound.");
                values.Add(reader.IsDBNull(0) ? null : reader.GetString(0));
            }
            var branches = SqlLegacyBranchScope.Validate(values, false);
            return new(user, new(branches, branches.Contains(native!, StringComparer.Ordinal)
                ? new BranchSelection("assigned", native, true) : null));
        }
        Shape(reader, typeof(int));
        if (!await reader.ReadAsync(token) || reader.IsDBNull(0) || reader.GetInt32(0) != 1 || await reader.ReadAsync(token))
            throw new InvalidOperationException("Unqualified branch catalog.");
        await Next(reader, token);
        Shape(reader, typeof(string), typeof(int));
        var catalog = new List<string?>();
        while (await reader.ReadAsync(token))
        {
            if (catalog.Count == SqlLegacyBranchScope.MaximumBranches || reader.IsDBNull(0)
                || reader.IsDBNull(1) || reader.GetInt32(1) != 0)
                throw new InvalidOperationException("Ambiguous or excessive branch catalog.");
            catalog.Add(reader.GetString(0));
        }
        var all = SqlLegacyBranchScope.Validate(catalog, true);
        return new(user, new(all, all.Length > 0 ? new BranchSelection("all", null, false) : null));
    }

    internal static async Task Next(DbDataReader reader, CancellationToken token)
    {
        if (!await reader.NextResultAsync(token)) throw new InvalidOperationException("Missing native identity result.");
    }

    private static void Shape(DbDataReader reader, params Type[] types)
    {
        if (reader.FieldCount != types.Length || types.Where((type, index) => reader.GetFieldType(index) != type).Any())
            throw new InvalidOperationException("Unexpected native identity projection.");
    }
}
