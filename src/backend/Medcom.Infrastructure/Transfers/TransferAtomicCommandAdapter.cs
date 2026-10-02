using Medcom.Application.Transfers;

namespace Medcom.Infrastructure.Transfers;

public sealed class TransferAtomicCommandAdapter(ITransferAtomicGateway gateway)
{
    public async ValueTask<TransferExecutionResult> ExecuteAsync(
        PreparedTransferCommand command,
        CancellationToken cancellationToken = default)
    {
        if (cancellationToken.IsCancellationRequested)
        {
            return new(TransferExecutionOutcome.CancelledBeforeDispatch);
        }

        try
        {
            var receipt = await gateway.ExecuteAsync(command, cancellationToken);
            if (!string.Equals(receipt.IdempotencyKey, command.IdempotencyKey.Value,
                    StringComparison.Ordinal))
            {
                return Unknown("The gateway returned a receipt for a different idempotency key.");
            }

            return receipt.Outcome switch
            {
                TransferGatewayOutcome.Conflict => new(TransferExecutionOutcome.Conflict, receipt),
                TransferGatewayOutcome.Rejected => new(TransferExecutionOutcome.Rejected, receipt),
                TransferGatewayOutcome.Committed when ValidCommittedReceipt(command, receipt) =>
                    new(TransferExecutionOutcome.Committed, receipt),
                _ => Unknown("The committed receipt did not prove the expected effect and durable audit.")
            };
        }
        catch (OperationCanceledException)
        {
            return Unknown("Cancellation after dispatch cannot prove whether the legacy transaction committed.");
        }
        catch (TimeoutException)
        {
            return Unknown("Timeout after dispatch cannot prove whether the legacy transaction committed.");
        }
        catch (Exception)
        {
            return Unknown("Gateway failure after dispatch cannot prove whether the legacy transaction committed.");
        }
    }

    private static bool ValidCommittedReceipt(
        PreparedTransferCommand command,
        TransferGatewayReceipt receipt)
    {
        if (string.IsNullOrWhiteSpace(receipt.DurableAuditId))
        {
            return false;
        }

        return command.Action.Effect.Kind == TransferEffectKind.ContentSynchronization
            ? receipt.ObservedPostStatus == command.ExpectedStatus
            : receipt.ObservedPostStatus is int status &&
              command.Action.Effect.AllowedPostStatuses.Contains(status);
    }

    private static TransferExecutionResult Unknown(string detail) =>
        new(TransferExecutionOutcome.OutcomeUnknown, Detail: detail);
}
