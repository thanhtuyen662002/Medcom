using System.Globalization;

namespace Medcom.Application.Transfers;

// A server-side observation. This is not an API DTO and no client flag creates authority.
public sealed record PmReturnAuthorityEvidence(TransferSnapshotOrigin Origin, string Actor,
    string DocumentKey, bool AccountEnabled, bool CredentialMatches, bool MenuEnabled,
    string MenuId, string FormId, bool RunGranted, bool UpdateGranted,
    IReadOnlyList<string> CurrentBranchIds);

public sealed class PreparedPmReturn
{
    internal PreparedPmReturn(PreparedTransferCommand command, TransferStateSnapshot state,
        string submissionIdentity)
    {
        Command = command;
        State = state;
        SubmissionIdentity = submissionIdentity;
    }
    public PreparedTransferCommand Command { get; }
    public TransferStateSnapshot State { get; }
    public string SubmissionIdentity { get; }
}

public sealed record PmReturnPreparationResult(PreparedPmReturn? Prepared, string? RejectionCode)
{
    public bool Accepted => Prepared is not null;
}

public static class PmReturnPreparation
{
    public const string ActionId = "IV_InternalTransferPMFrm:ExecSQLWithParaButtonCtl_1";
    public const string MenuId = "07010110";
    public const string FormId = "IV_InternalTransferPMFrm";
    public static TransferActionDefinition Action { get; } = TransferActionCatalog.All.Single(a => a.Id == ActionId);

    public static PmReturnPreparationResult Prepare(AuthoritativeIdentity? identity,
        TransferCommandRequest? request, TransferStateSnapshot? state, PmReturnAuthorityEvidence? evidence)
    {
        if (identity is null || request is null || state is null || evidence is null
            || evidence.Origin != TransferSnapshotOrigin.DatabaseAuthority)
            return Denied(TransferValidationCodes.UntrustedSnapshot);
        if (request.ActionId != ActionId) return Denied(TransferValidationCodes.UnknownAction);
        if (!LosslessAnsiValue.TryCreate(identity.PrincipalId, 50, out _)
            || evidence.Actor != identity.PrincipalId) return Denied(TransferValidationCodes.InvalidActor);
        if (request.DocumentKey != state.Head.DocumentKey || evidence.DocumentKey != request.DocumentKey
            || identity.TenantId != state.TenantId || identity.CompanyId != state.CompanyId
            || string.IsNullOrWhiteSpace(identity.CredentialStamp) || identity.AuthorityVersion <= 0)
            return Denied(TransferValidationCodes.UntrustedSnapshot);
        if (request.Payload is not ReturnByPmPayload reason || !ValidReason(reason.Reason))
            return Denied(TransferValidationCodes.InvalidPayload);
        if (!evidence.AccountEnabled || !evidence.CredentialMatches || !evidence.MenuEnabled
            || evidence.MenuId != MenuId || evidence.FormId != FormId
            || !evidence.RunGranted || !evidence.UpdateGranted || state.Head.IsLocked
            || state.Head.AssignedPm != identity.PrincipalId
            || !BranchesGranted(identity.BranchIds, evidence.CurrentBranchIds, state.Head))
            return Denied(TransferValidationCodes.ScopeDenied);

        var trusted = new TransferAuthoritySnapshot(TransferSnapshotOrigin.DatabaseAuthority,
            state.TenantId, state.CompanyId, state.Head.BranchId, identity.PrincipalId, ActionId,
            state.Head.DocumentKey, state.Head.Status, state.StateEqualityToken,
            identity.AuthorityVersion.ToString(CultureInfo.InvariantCulture), true, true, true, true);
        var admitted = TransferCommandAdmission.Prepare(request, trusted);
        if (admitted.Command is null) return Denied(admitted.RejectionCode ?? TransferValidationCodes.UntrustedSnapshot);
        return new(new PreparedPmReturn(admitted.Command, state, TransferSubmissionIdentity.ForPmReturn(
            state.TenantId, state.CompanyId, identity.PrincipalId, request.DocumentKey,
            request.IdempotencyKey, reason)), null);
    }

    internal static bool ValidReason(string? reason) => !string.IsNullOrWhiteSpace(reason) && reason == reason.Trim()
        && reason.Length <= 1000 && !reason.Contains('\0') && TransferStateSnapshot.ValidUnicode(reason);

    private static bool BranchesGranted(IReadOnlyList<string>? frozen,
        IReadOnlyList<string>? current, TransferRequestHeadState head)
    {
        if (frozen is null || current is null) return false;
        try
        {
            var first = Scope(frozen);
            var second = Scope(current);
            return first is not null && second is not null
                && new[] { head.BranchId, head.FromBranchId, head.ToBranchId }
                    .All(branch => first.Contains(branch) && second.Contains(branch));
        }
        catch (Exception error) when (error is not OutOfMemoryException) { return false; }
    }

    private static HashSet<string>? Scope(IEnumerable<string> source)
    {
        var branches = new HashSet<string>(StringComparer.Ordinal);
        var count = 0;
        foreach (var branch in source)
        {
            if (++count > 200 || !LosslessAnsiValue.TryCreate(branch, 50, out _)) return null;
            branches.Add(branch);
        }
        return branches;
    }

    private static PmReturnPreparationResult Denied(string code) => new(null, code);
}
