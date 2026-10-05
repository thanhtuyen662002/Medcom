namespace Medcom.Application.Transfers;

public enum PmReturnReplayDisposition
{
    InvalidInput, Denied, InvalidObservation, Conflict, Blocked, NeedsFreshAdmission, ReplayOriginalReceipt
}

public sealed class PmReturnReplayDecision
{
    internal PmReturnReplayDecision(PmReturnReplayDisposition disposition, TransferGatewayReceipt? receipt = null)
    { Disposition = disposition; OriginalReceipt = receipt; }
    public PmReturnReplayDisposition Disposition { get; }
    public TransferGatewayReceipt? OriginalReceipt { get; }
    // Even explicit absence is advice to perform fresh admission, never a prepared dispatch.
    public bool PermitsDispatch => false;
}

// Pure validation/selection only. No journal I/O, admission, source execution or commit.
public static class PmReturnReplayPolicy
{
    public static PmReturnReplayDecision Evaluate(PmReturnSubmittedIntent? submitted,
        PmReturnReplayAuthority? currentAuthority, PmReturnJournalObservation? observation)
    {
        if (submitted is null) return Decision(PmReturnReplayDisposition.InvalidInput);
        // Do not disclose existence/corruption/outcome to a revoked or cross-scope caller.
        if (!Authorized(submitted, currentAuthority)) return Decision(PmReturnReplayDisposition.Denied);
        if (observation is null || observation.Origin != TransferSnapshotOrigin.DatabaseAuthority
            || !PmReturnJournalValues.ValidKey(observation.Key) || observation.Key != submitted.Key
            || !Enum.IsDefined(observation.State)) return Decision(PmReturnReplayDisposition.InvalidObservation);
        if (observation.State == PmReturnJournalState.Absent)
            return Decision(observation.Record is null ? PmReturnReplayDisposition.NeedsFreshAdmission
                : PmReturnReplayDisposition.InvalidObservation);
        if (observation.State != PmReturnJournalState.Committed)
            return Decision(PmReturnReplayDisposition.Blocked);

        var record = observation.Record;
        if (!ValidCommitted(record) || record!.Key != observation.Key)
            return Decision(PmReturnReplayDisposition.InvalidObservation);
        if (record.DocumentKey != submitted.DocumentKey || record.SubmissionIdentity != submitted.SubmissionIdentity
            || record.SourceProcedureSha256 != submitted.SourceProcedureSha256)
            return Decision(PmReturnReplayDisposition.Conflict);
        // Keep the original execution fingerprint; no new status/version-based admission is attempted.
        return new(PmReturnReplayDisposition.ReplayOriginalReceipt, record.CommittedReceipt!.OriginalReceipt);
    }

    private static bool Authorized(PmReturnSubmittedIntent submitted, PmReturnReplayAuthority? current)
    {
        if (current is null || current.Origin != TransferSnapshotOrigin.DatabaseAuthority
            || !current.HasSessionAuthority || !current.AccountEnabled || !current.CredentialMatches
            || !current.MenuEnabled || !current.RunGranted || !current.UpdateGranted
            || current.MenuId != PmReturnPreparation.MenuId || current.FormId != PmReturnPreparation.FormId
            || current.DatabaseBindingId != submitted.Key.DatabaseBindingId
            || current.TenantId != submitted.Key.TenantId || current.CompanyId != submitted.Key.CompanyId
            || current.Actor != submitted.Key.Actor || current.DocumentKey != submitted.DocumentKey) return false;
        return new[] { current.BranchId, current.FromBranchId, current.ToBranchId }.All(branch =>
            current.SessionBranchIds.Contains(branch, StringComparer.Ordinal)
            && current.CurrentBranchIds.Contains(branch, StringComparer.Ordinal));
    }

    private static bool ValidCommitted(PmReturnJournalRecord? row)
    {
        if (row is null || !PmReturnJournalValues.ValidKey(row.Key)
            || !LosslessAnsiValue.TryCreate(row.DocumentKey, 30, out _)
            || !PmReturnJournalValues.Submission(row.SubmissionIdentity)
            || !PmReturnJournalValues.Sha256(row.SourceProcedureSha256)
            || !PmReturnJournalValues.Sha256(row.OriginalExecutionFingerprint)
            || !LosslessAnsiValue.TryCreate(row.AuditId, 100, out _)
            || row.CommittedReceipt is not { OriginalReceipt: not null } envelope) return false;
        var receipt = envelope.OriginalReceipt;
        return envelope.Key == row.Key && envelope.DocumentKey == row.DocumentKey
            && envelope.SubmissionIdentity == row.SubmissionIdentity
            && envelope.SourceProcedureSha256 == row.SourceProcedureSha256
            && envelope.OriginalExecutionFingerprint == row.OriginalExecutionFingerprint
            && envelope.AuditId == row.AuditId && receipt.ActionId == row.Key.ActionId
            && receipt.DocumentKey == row.DocumentKey && receipt.IdempotencyKey == row.Key.IdempotencyKey
            && receipt.CommandFingerprint == row.OriginalExecutionFingerprint
            && receipt.DurableAuditId == row.AuditId && receipt.Outcome == TransferGatewayOutcome.Committed
            && receipt.RejectionCode is null && receipt.ObservedPostStatus is int status
            && PmReturnPreparation.Action.Effect.AllowedPostStatuses.Contains(status);
    }

    private static PmReturnReplayDecision Decision(PmReturnReplayDisposition disposition) => new(disposition);
}
