using System.Security.Cryptography;
using System.Text;

namespace Medcom.Application.Audit;

// These values describe audit observations, never authorize a business action.
public enum AuditOperation { CommandAttempt, CommandResult, AuthorizationDenied, SessionRevoked }
public enum AuditOutcome { Pending, Rejected, Committed, OutcomeUnknown }
public enum AuditAppendOutcome { Acknowledged, AlreadyRecorded, Conflict, Invalid, Unavailable, OutcomeUnknown, CapacityExceeded }
public enum AuditReadOutcome { Success, Invalid, Unavailable }

public sealed record AuditScope(string TenantId, string CompanyId)
{
    public bool IsValid => ValidId(TenantId) && ValidId(CompanyId);
    private static bool ValidId(string? value) => value is { Length: > 0 and <= 100 }
        && value.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.');
}

// Intentionally no payload, free text, password, username, SQL or connection string.
public sealed record AuditRecord(Guid EventId, AuditScope Scope, DateTimeOffset OccurredAt,
    string ActorReference, AuditOperation Operation, AuditOutcome Outcome, Guid CorrelationId)
{
    public bool IsValid => EventId != Guid.Empty && Scope is { IsValid: true }
        && OccurredAt.Offset == TimeSpan.Zero && OccurredAt >= DateTimeOffset.UnixEpoch
        && ActorReference is { Length: 64 }
        && ActorReference.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f')
        && Enum.IsDefined(Operation) && Enum.IsDefined(Outcome) && CorrelationId != Guid.Empty;
}

public sealed record AuditPage(AuditReadOutcome Outcome, IReadOnlyList<AuditRecord> Records,
    int? NextOffset = null);

// Acknowledged means the adapter observed its configured persistence acknowledgement.
// It does not prove atomicity with ERP writes, target-host durability or production GO.
public interface IAuditJournal
{
    Task<AuditAppendOutcome> AppendAsync(AuditRecord record, CancellationToken cancellationToken);
    Task<AuditPage> ReadAsync(AuditScope scope, int offset, int take, CancellationToken cancellationToken);
}

public static class AuditActorReference
{
    // Call only with server-derived scope/principal. Never pass client claims as authority.
    // Operator key custody and retention/deletion policy remain deployment prerequisites.
    public static string Create(AuditScope scope, string principalId, ReadOnlySpan<byte> key)
    {
        if (scope is not { IsValid: true } || string.IsNullOrWhiteSpace(principalId)
            || principalId.Length > 250 || principalId.Contains('\0') || key.Length is < 32 or > 64)
            throw new ArgumentException("Invalid audit identity inputs.");
        return Convert.ToHexStringLower(HMACSHA256.HashData(key,
            Encoding.UTF8.GetBytes(scope.TenantId + "\0" + scope.CompanyId + "\0" + principalId)));
    }
}

// Fail closed at the command integration boundary. Caller must reconcile Unknown;
// audit availability must not silently become a success-returning substitute.
public sealed class AuditAdmission(IAuditJournal journal)
{
    public async Task<AuditAppendOutcome> RecordAsync(AuditRecord record, CancellationToken cancellationToken)
    {
        if (record is null || !record.IsValid) return AuditAppendOutcome.Invalid;
        cancellationToken.ThrowIfCancellationRequested();
        try { return await journal.AppendAsync(record, cancellationToken); }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception) { return AuditAppendOutcome.OutcomeUnknown; }
    }

    public static bool HasAcknowledgement(AuditAppendOutcome outcome) =>
        outcome is AuditAppendOutcome.Acknowledged or AuditAppendOutcome.AlreadyRecorded;
}
