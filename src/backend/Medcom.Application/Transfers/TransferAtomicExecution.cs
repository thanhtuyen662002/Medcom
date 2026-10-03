namespace Medcom.Application.Transfers;

public enum TransferGatewayOutcome
{
    Committed,
    Conflict,
    Rejected
}

public sealed record TransferGatewayReceipt(
    TransferGatewayOutcome Outcome,
    string ActionId,
    string DocumentKey,
    string IdempotencyKey,
    string CommandFingerprint,
    int? ObservedPostStatus = null,
    string? DurableAuditId = null,
    string? RejectionCode = null);

public interface ITransferAtomicGateway
{
    // Implementations must re-read authority, status, row version and every identified detail;
    // atomically apply the admitted detail values before executing the source procedure; and append
    // the durable audit in the same transaction. A duplicate idempotency key returns its original
    // receipt, correlated by a canonical fingerprint over the admitted command as well as its
    // action, document and idempotency key. The adapter deliberately supplies no client
    // role/status parameter.
    ValueTask<TransferGatewayReceipt> ExecuteAsync(
        PreparedTransferCommand command,
        CancellationToken cancellationToken);
}

public enum TransferExecutionOutcome
{
    Committed,
    Conflict,
    Rejected,
    CancelledBeforeDispatch,
    OutcomeUnknown
}

public sealed record TransferExecutionResult(
    TransferExecutionOutcome Outcome,
    TransferGatewayReceipt? Receipt = null,
    string? Detail = null);
