using System.Data;
using Medcom.Application;
using Medcom.Application.Transfers;
using Microsoft.Data.SqlClient;

namespace Medcom.Infrastructure.Transfers;

public sealed record PmReturnReadResult(TransferStateSnapshot? State,
    PmReturnAuthorityEvidence? Authority, string? FailureCode);

// Not registered in ApiHost. Does not open, commit, roll back or dispose caller-owned SQL resources.
public sealed class SqlPmReturnAuthorityReader(LegacyCompany company)
{
    public async Task<PmReturnReadResult> ReadAsync(SqlTransaction transaction,
        AuthoritativeIdentity identity, string documentKey, CancellationToken cancellationToken = default)
    {
        var connection = PmReturnTransactionContract.Require(transaction);
        ArgumentNullException.ThrowIfNull(identity);
        if (!LosslessAnsiValue.TryCreate(identity.PrincipalId, 50, out _)
            || !LosslessAnsiValue.TryCreate(documentKey, 30, out _)
            || identity.TenantId != company.TenantId || identity.CompanyId != company.CompanyId
            || string.IsNullOrWhiteSpace(identity.CredentialStamp)) return Denied();

        // The private stored hash is used only by the existing credential-revalidation boundary.
        // It never enters a state/submission token, observation, result, API or diagnostic.
        LegacyUser user;
        await using (var command = Query(connection, transaction, """
            SELECT TOP (2) U.UserName,U.[Password],U.[Disable],U.UserGroupID,G.IsDisable
            FROM dbo.SY_User U WITH (UPDLOCK,HOLDLOCK)
            LEFT JOIN dbo.SY_UserGroup G WITH (UPDLOCK,HOLDLOCK) ON G.UserGroupID=U.UserGroupID
            WHERE U.UserName=@actor;
            """))
        {
            command.Parameters.Add("@actor", SqlDbType.VarChar, 100).Value = identity.PrincipalId;
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken) || Enumerable.Range(0, 5).Any(reader.IsDBNull)) return Denied();
            user = new(reader.GetString(0), "", reader.GetString(1), reader.GetBoolean(2),
                reader.GetString(3), !reader.GetBoolean(4));
            if (await reader.ReadAsync(cancellationToken) || user.Username != identity.PrincipalId
                || user.Disabled || !user.GroupEnabled || string.IsNullOrWhiteSpace(user.StoredHash)
                || !LosslessAnsiValue.TryCreate(user.GroupId, 20, out _)
                || LegacyIdentityAuthority.Stamp(user) != identity.CredentialStamp) return Denied();
        }

        bool menuEnabled;
        bool bothGranted;
        string menuId;
        string formId;
        await using (var command = Query(connection, transaction, SqlLegacyPolicy.GrantsCte + """
            SELECT TOP (2) M.MenuID,M.FormName,M.Para,M.isDisable,
              COALESCE((SELECT MAX(CASE WHEN P.IsRun=1 AND P.IsUpdate=1 THEN 1 ELSE 0 END)
                FROM Grants P WHERE P.MenuID=M.MenuID),0)
            FROM dbo.SY_Menu M WITH (UPDLOCK,HOLDLOCK) WHERE M.MenuID=@menu;
            """))
        {
            command.Parameters.Add("@username", SqlDbType.VarChar, 100).Value = user.Username;
            command.Parameters.Add("@group", SqlDbType.VarChar, 20).Value = user.GroupId!;
            command.Parameters.Add("@menu", SqlDbType.VarChar, 50).Value = PmReturnPreparation.MenuId;
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken) || reader.IsDBNull(0) || reader.IsDBNull(1)
                || reader.IsDBNull(3) || reader.IsDBNull(4)) return Denied();
            menuId = reader.GetString(0);
            formId = reader.GetString(1);
            menuEnabled = !reader.GetBoolean(3) && (reader.IsDBNull(2) || reader.GetString(2).Length == 0);
            bothGranted = reader.GetInt32(4) == 1;
            if (await reader.ReadAsync(cancellationToken) || !menuEnabled || !bothGranted
                || menuId != PmReturnPreparation.MenuId || formId != PmReturnPreparation.FormId) return Denied();
        }

        var branches = new List<string>();
        await using (var command = Query(connection, transaction, """
            SELECT DISTINCT TOP (201) BranchID FROM (
              SELECT BranchID FROM dbo.SY_User WHERE UserName=@actor
              UNION ALL SELECT BranchID FROM dbo.SY_UserBranch WHERE UserName=@actor
            ) S WHERE BranchID IS NOT NULL AND BranchID<>'';
            """))
        {
            command.Parameters.Add("@actor", SqlDbType.VarChar, 100).Value = user.Username;
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                if (branches.Count == 200 || !LosslessAnsiValue.TryCreate(reader.GetString(0), 50, out _)) return Denied();
                branches.Add(reader.GetString(0));
            }
        }

        TransferRequestHeadState head;
        await using (var command = Query(connection, transaction, """
            SELECT TOP (2) DocumentID,BranchID,FromBranchID,ToBranchID,SalesUser,AssignedPM,
              StatusID,isLock,DateUpdate
            FROM dbo.IV_InternalTransferRequestTbl WITH (UPDLOCK,HOLDLOCK) WHERE DocumentID=@document;
            """))
        {
            command.Parameters.Add("@document", SqlDbType.NVarChar, 50).Value = documentKey;
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)
                || new[] { 0, 1, 2, 3, 4, 6, 7 }.Any(reader.IsDBNull)) return Denied();
            head = new(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
                reader.GetString(4), reader.IsDBNull(5) ? null : reader.GetString(5), reader.GetInt32(6),
                reader.GetBoolean(7), reader.IsDBNull(8) ? null : reader.GetDateTime(8));
            if (await reader.ReadAsync(cancellationToken) || head.DocumentKey != documentKey) return Denied();
        }
        var details = new List<TransferRequestDetailState>();
        await using (var command = Query(connection, transaction, """
            SELECT TOP (1001) UserAutoID,DocumentID,ItemID,RequestedQty,PMApprovedQty
            FROM dbo.IV_InternalTransferRequestDetailTbl WITH (UPDLOCK,HOLDLOCK)
            WHERE DocumentID=@document ORDER BY UserAutoID;
            """))
        {
            command.Parameters.Add("@document", SqlDbType.NVarChar, 50).Value = documentKey;
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                if (details.Count == TransferStateSnapshot.MaximumDetails || Enumerable.Range(0, 4).Any(reader.IsDBNull)) return Denied();
                details.Add(new(reader.GetString(0), reader.GetString(1), reader.GetString(2),
                    reader.GetDecimal(3), reader.IsDBNull(4) ? null : reader.GetDecimal(4)));
            }
        }
        if (!TransferStateSnapshot.TryCreate(company.TenantId, company.CompanyId, head, details, out var state)) return Denied();
        var observation = new PmReturnAuthorityEvidence(TransferSnapshotOrigin.DatabaseAuthority,
            user.Username, documentKey, true, true, menuEnabled, menuId, formId, bothGranted, bothGranted,
            Array.AsReadOnly(branches.ToArray()));
        return new(state, observation, null);
    }

    private static SqlCommand Query(SqlConnection connection, SqlTransaction transaction, string text) =>
        new(text, connection, transaction) { CommandTimeout = 15 };
    private static PmReturnReadResult Denied() => new(null, null, "authority_unavailable");
}

internal static class PmReturnTransactionContract
{
    internal static SqlConnection Require(SqlTransaction transaction)
    {
        ArgumentNullException.ThrowIfNull(transaction);
        try
        {
            var connection = transaction.Connection;
            if (connection?.State == ConnectionState.Open && transaction.IsolationLevel == IsolationLevel.Serializable)
                return connection;
        }
        catch (InvalidOperationException) { }
        throw new InvalidOperationException("A live caller-owned SERIALIZABLE SQL transaction is required.");
    }
}
