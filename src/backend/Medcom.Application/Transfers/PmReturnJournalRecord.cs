namespace Medcom.Application.Transfers;

// Server-only observation data, not persistence, authorization proof or API DTOs.
// Binding is a stable opaque configured GUID; never derive it from a secret/connection string.
public sealed record PmReturnJournalKey(Guid DatabaseBindingId, string TenantId, string CompanyId,
    string Actor, string ActionId, string IdempotencyKey);

// A receipt envelope repeats the journal correlation so a wrong row/receipt fails closed.
public sealed record PmReturnJournalReceipt(PmReturnJournalKey Key, string DocumentKey,
    string SubmissionIdentity, string SourceProcedureSha256, string OriginalExecutionFingerprint,
    string AuditId, TransferGatewayReceipt OriginalReceipt);

public sealed record PmReturnJournalRecord(PmReturnJournalKey Key, string DocumentKey,
    string SubmissionIdentity, string SourceProcedureSha256, string OriginalExecutionFingerprint,
    string AuditId, PmReturnJournalReceipt? CommittedReceipt);

public enum PmReturnJournalState { Absent, Committed, InProgress, OutcomeUnknown, Tombstone, Unavailable }

// Explicit absence is distinct from a null result, missing receipt or unresolved retained key.
public sealed record PmReturnJournalObservation(TransferSnapshotOrigin Origin,
    PmReturnJournalKey Key, PmReturnJournalState State, PmReturnJournalRecord? Record = null);

public sealed class PmReturnSubmittedIntent
{
    private PmReturnSubmittedIntent(PmReturnJournalKey key, string documentKey, string submissionIdentity)
    {
        Key = key with { };
        DocumentKey = documentKey;
        SubmissionIdentity = submissionIdentity;
        SourceProcedureSha256 = PmReturnPreparation.Action.ProcedureSha256;
    }
    public PmReturnJournalKey Key { get; }
    public string DocumentKey { get; }
    public string SubmissionIdentity { get; }
    public string SourceProcedureSha256 { get; }

    // Submitted reason is validated/hashed by the unchanged I06 boundary; not retained here.
    public static bool TryCreate(PmReturnJournalKey? key, TransferCommandRequest? request,
        out PmReturnSubmittedIntent? intent)
    {
        intent = null;
        if (!PmReturnJournalValues.ValidKey(key) || request is null
            || request.ActionId != key!.ActionId || request.IdempotencyKey != key.IdempotencyKey
            || !LosslessAnsiValue.TryCreate(request.DocumentKey, 30, out _)
            || request.Payload is not ReturnByPmPayload returned || !PmReturnPreparation.ValidReason(returned.Reason))
            return false;
        intent = new(key, request.DocumentKey, TransferSubmissionIdentity.ForPmReturn(key.TenantId,
            key.CompanyId, key.Actor, request.DocumentKey, key.IdempotencyKey, returned));
        return true;
    }
}

// Captures only the current authority/scoped head fields needed for receipt disclosure.
// Status, assignment, lock, state token, credential stamp and old authority version are not stored.
public sealed class PmReturnReplayAuthority
{
    private PmReturnReplayAuthority(Guid bindingId, AuthoritativeIdentity identity,
        TransferRequestHeadState head, PmReturnAuthorityEvidence evidence,
        string[] sessionBranches, string[] currentBranches)
    {
        DatabaseBindingId = bindingId; TenantId = identity.TenantId; CompanyId = identity.CompanyId;
        Actor = identity.PrincipalId; DocumentKey = head.DocumentKey;
        BranchId = head.BranchId; FromBranchId = head.FromBranchId; ToBranchId = head.ToBranchId;
        Origin = evidence.Origin; AccountEnabled = evidence.AccountEnabled;
        CredentialMatches = evidence.CredentialMatches; MenuEnabled = evidence.MenuEnabled;
        MenuId = evidence.MenuId; FormId = evidence.FormId;
        RunGranted = evidence.RunGranted; UpdateGranted = evidence.UpdateGranted;
        HasSessionAuthority = !string.IsNullOrWhiteSpace(identity.CredentialStamp) && identity.AuthorityVersion > 0;
        SessionBranchIds = Array.AsReadOnly(sessionBranches);
        CurrentBranchIds = Array.AsReadOnly(currentBranches);
    }
    public Guid DatabaseBindingId { get; }
    public string TenantId { get; }
    public string CompanyId { get; }
    public string Actor { get; }
    public string DocumentKey { get; }
    public string BranchId { get; }
    public string FromBranchId { get; }
    public string ToBranchId { get; }
    public TransferSnapshotOrigin Origin { get; }
    public bool AccountEnabled { get; }
    public bool CredentialMatches { get; }
    public bool MenuEnabled { get; }
    public string MenuId { get; }
    public string FormId { get; }
    public bool RunGranted { get; }
    public bool UpdateGranted { get; }
    public bool HasSessionAuthority { get; }
    public IReadOnlyList<string> SessionBranchIds { get; }
    public IReadOnlyList<string> CurrentBranchIds { get; }

    // Caller must supply a freshly revalidated identity and matching current database observation.
    // Origin labels do not authenticate callers and are never accepted from an HTTP request.
    public static bool TryCapture(Guid databaseBindingId, AuthoritativeIdentity? identity,
        TransferStateSnapshot? currentState, PmReturnAuthorityEvidence? evidence,
        out PmReturnReplayAuthority? authority)
    {
        authority = null;
        if (databaseBindingId == Guid.Empty || identity is null || currentState is null || evidence is null
            || !LosslessAnsiValue.TryCreate(identity.PrincipalId, 50, out _)
            || identity.TenantId != currentState.TenantId || identity.CompanyId != currentState.CompanyId
            || evidence.Actor != identity.PrincipalId || evidence.DocumentKey != currentState.Head.DocumentKey
            || !LosslessAnsiValue.TryCreate(evidence.MenuId, 100, out _)
            || !LosslessAnsiValue.TryCreate(evidence.FormId, 100, out _)
            || !CopyBranches(identity.BranchIds, out var sessionBranches)
            || !CopyBranches(evidence.CurrentBranchIds, out var currentBranches)) return false;
        authority = new(databaseBindingId, identity, currentState.Head, evidence, sessionBranches!, currentBranches!);
        return true;
    }

    private static bool CopyBranches(IEnumerable<string>? source, out string[]? branches)
    {
        branches = null;
        if (source is null) return false;
        var copy = new List<string>();
        try
        {
            foreach (var branch in source)
            {
                if (copy.Count == 200 || !LosslessAnsiValue.TryCreate(branch, 50, out _)) return false;
                copy.Add(branch);
            }
        }
        catch (Exception error) when (error is not OutOfMemoryException) { return false; }
        branches = copy.ToArray();
        return true;
    }
}

internal static class PmReturnJournalValues
{
    internal static bool ValidKey(PmReturnJournalKey? key) => key is not null
        && key.DatabaseBindingId != Guid.Empty && TransferStateSnapshot.ValidIdentifier(key.TenantId, 100)
        && TransferStateSnapshot.ValidIdentifier(key.CompanyId, 100)
        && LosslessAnsiValue.TryCreate(key.Actor, 50, out _)
        && key.ActionId == PmReturnPreparation.ActionId
        && LosslessAnsiValue.TryCreate(key.IdempotencyKey, 100, out _) && key.IdempotencyKey.Length >= 16;

    internal static bool Sha256(string? value) => value is { Length: 64 }
        && value.All(character => character is >= '0' and <= '9' or >= 'a' and <= 'f');

    internal static bool Submission(string? value)
    {
        const string prefix = "pmr-submission-v1:";
        return value is not null && value.StartsWith(prefix, StringComparison.Ordinal)
            && value.Length == prefix.Length + 64 && Sha256(value[prefix.Length..]);
    }
}
