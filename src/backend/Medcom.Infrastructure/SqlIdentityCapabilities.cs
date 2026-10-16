using System.Data;
using System.Data.Common;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Infrastructure.PurchaseRequests;

namespace Medcom.Infrastructure;

internal static class SqlIdentityCapabilities
{
    // Only compiled, source-bound screens. The purchase-request pilot retains its stricter Run/parent policy.
    private static readonly ErpScreenDescription[] Screens = ErpScreenCatalog.ModuleIds
        .Where(id => id != "purchase-requests").Select(id => ErpScreenCatalog.Get(id)!).ToArray();
    // Seek the one ASCII menu before evaluating the physical Unicode principal/delegation predicates.
    // The existing exact menu/parent/principal checks remain authoritative after this narrowing predicate.
    internal static readonly string PurchaseGrantsText = SqlPurchaseRequestQueries.GrantsText
        .Replace("WHERE DATALENGTH(CONVERT(nvarchar(max),P.UserGroupID))", "WHERE P.MenuID=@menuSeek AND DATALENGTH(CONVERT(nvarchar(max),P.UserGroupID))", StringComparison.Ordinal)
        .Replace("WHERE DATALENGTH(CONVERT(nvarchar(max),P.UserName))", "WHERE P.MenuID=@menuSeek AND DATALENGTH(CONVERT(nvarchar(max),P.UserName))", StringComparison.Ordinal)
        .Replace("WHERE DATALENGTH(CONVERT(nvarchar(max),U.UserAuthority))", "WHERE P.MenuID=@menuSeek AND DATALENGTH(CONVERT(nvarchar(max),U.UserAuthority))", StringComparison.Ordinal)
        .Replace("@username", "@purchaseUsername", StringComparison.Ordinal).Replace("@group", "@purchaseGroup", StringComparison.Ordinal);
    internal static readonly string Text = SqlNativeIdentity.Text + "\n" + SqlLegacyPolicy.GrantsCte + """
        SELECT DISTINCT M.MenuID,M.FormName FROM Grants P JOIN dbo.SY_Menu M ON M.MenuID=P.MenuID
        WHERE M.isDisable=0 AND COALESCE(M.Para,'')=''
        """ + " AND M.MenuID IN (" + string.Join(',', Screens.Select(s => "'" + s.MenuId + "'")) + ")"
        + " AND " + SqlLegacyPolicy.ViewGrant + ";\n" + SqlPurchaseRequestQueries.CredentialText + "\n"
        + PurchaseGrantsText;

    internal static async Task<LegacyUser> ReadAsync(DbTransaction transaction, LegacyUser expected, CancellationToken token)
    {
        if (transaction.IsolationLevel != IsolationLevel.Serializable)
            throw new InvalidOperationException("Serializable identity authority required.");
        await using var command = SqlLegacyBranchScope.Command(transaction, Text, expected.Username);
        Parameter(command, "@username", DbType.AnsiString, expected.Username, 100);
        Parameter(command, "@group", DbType.AnsiString, expected.GroupId, 50);
        Parameter(command, "@purchaseUsername", DbType.String, expected.Username, 100);
        Parameter(command, "@purchaseGroup", DbType.String, expected.GroupId, 50);
        Parameter(command, "@menu", DbType.String, PurchaseRequestCommandRules.MenuId, 50);
        Parameter(command, "@menuSeek", DbType.AnsiString, PurchaseRequestCommandRules.MenuId, 50);
        await using var reader = await command.ExecuteReaderAsync(token);
        var observation = await SqlNativeIdentity.ReadBatch(reader, expected.Username,
            user => LegacyIdentityAuthority.Stamp(user) == LegacyIdentityAuthority.Stamp(expected), token)
            ?? throw new InvalidOperationException("Native principal changed.");
        await SqlNativeIdentity.Next(reader, token);
        if (reader.FieldCount != 2) throw new InvalidOperationException("Unexpected capability projection.");
        var capabilities = new HashSet<string>(StringComparer.Ordinal);
        while (await reader.ReadAsync(token))
        {
            if (reader.IsDBNull(0) || reader.IsDBNull(1)) throw new InvalidOperationException("Invalid capability identity.");
            var screen = Screens.SingleOrDefault(s => s.MenuId == reader.GetString(0) && s.FormId == reader.GetString(1));
            if (screen is not null) capabilities.Add(screen.Id + ".read");
        }
        await SqlNativeIdentity.Next(reader, token);
        var credential = await PurchaseCredential(reader, expected, token);
        await SqlNativeIdentity.Next(reader, token);
        var grant = await PurchaseGrant(reader, token);
        if (await reader.NextResultAsync(token)) throw new InvalidOperationException("Unexpected capability result.");
        if (credential && grant) capabilities.Add("purchase-requests.read");
        return expected with { Capabilities = capabilities.Order(StringComparer.Ordinal).ToArray(),
            BranchIds = observation.Scope.BranchIds, BranchSelection = observation.Scope.BranchSelection };
    }

    private static async Task<bool> PurchaseCredential(DbDataReader reader, LegacyUser expected, CancellationToken token)
    {
        if (reader.FieldCount != 5) throw new InvalidOperationException("Unexpected purchase credential projection.");
        if (!await reader.ReadAsync(token) || Enumerable.Range(0, 5).Any(reader.IsDBNull)) return false;
        var user = new LegacyUser(reader.GetString(0), "", reader.GetString(1), reader.GetBoolean(2), reader.GetString(3), !reader.GetBoolean(4));
        return !await reader.ReadAsync(token) && user.Username == expected.Username && !user.Disabled && user.GroupEnabled
            && PurchaseRequestCommandRules.Identifier(user.GroupId, 20) && !string.IsNullOrEmpty(user.StoredHash)
            && LegacyIdentityAuthority.Stamp(user) == LegacyIdentityAuthority.Stamp(expected);
    }

    private static async Task<bool> PurchaseGrant(DbDataReader reader, CancellationToken token)
    {
        if (reader.FieldCount != 8) throw new InvalidOperationException("Unexpected purchase grant projection.");
        if (!await reader.ReadAsync(token) || new[] { 0, 1, 3, 4, 5, 6 }.Any(reader.IsDBNull)) return false;
        var allowed = reader.GetString(0) == PurchaseRequestCommandRules.MenuId && reader.GetString(1) == PurchaseRequestCommandRules.FormId
            && (reader.IsDBNull(2) || reader.GetString(2).Length == 0) && !reader.GetBoolean(3)
            && reader.GetString(4) == "05" && !reader.GetBoolean(5) && reader.GetInt32(6) == 1;
        return !await reader.ReadAsync(token) && allowed;
    }

    private static void Parameter(DbCommand command, string name, DbType type, string? value, int size)
    {
        var parameter = command.CreateParameter(); parameter.ParameterName = name; parameter.DbType = type;
        parameter.Size = size; parameter.Value = (object?)value ?? DBNull.Value; command.Parameters.Add(parameter);
    }
}
