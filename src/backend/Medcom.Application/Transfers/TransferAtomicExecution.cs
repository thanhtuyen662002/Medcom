namespace Medcom.Application.Transfers;

public enum TransferGatewayOutcome
{
    Committed,
    Conflict,
    Rejected
}

public sealed record TransferGatewayReceipt(
    TransferGatewayOutcome Outcome,
    string IdempotencyKey,
    int? ObservedPostStatus = null,
    string? DurableAuditId = null,
    string? RejectionCode = null);

public interface ITransferAtomicGateway
{
    // Implementations must re-read authority, status and row version; execute the source procedure;
    // and append the durable audit in one transaction. A duplicate idempotency key returns its
    // original receipt. The adapter deliberately supplies no client role/status parameter.
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
