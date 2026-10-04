using Medcom.Application.Transfers;

namespace Medcom.Infrastructure.Transfers;

public sealed class TransferAtomicCommandAdapter(ITransferAtomicGateway gateway)
{
    private readonly ITransferAtomicGateway store = gateway
        ?? throw new ArgumentNullException(nameof(gateway));

    public async ValueTask<TransferExecutionResult> ExecuteAsync(
        PreparedTransferCommand command,
        CancellationToken cancellationToken = default)
    {
        if (cancellationToken.IsCancellationRequested)
        {
            return new(TransferExecutionOutcome.CancelledBeforeDispatch);
        }

        if (command is null)
        {
            return Unknown("No prepared command was supplied for dispatch.");
        }

        try
        {
            var receipt = await store.ExecuteAsync(command, cancellationToken);
            if (!string.Equals(receipt.ActionId, command.Action.Id, StringComparison.Ordinal) ||
                !string.Equals(receipt.DocumentKey, command.DocumentKey.Value, StringComparison.Ordinal) ||
                !string.Equals(receipt.IdempotencyKey, command.IdempotencyKey.Value,
                    StringComparison.Ordinal) ||
                !string.Equals(receipt.CommandFingerprint, command.CorrelationFingerprint,
                    StringComparison.Ordinal))
            {
                return Unknown("The gateway returned a receipt for a different command correlation.");
            }
            if (!LosslessAnsiValue.TryCreate(receipt.DurableAuditId, 100, out _))
            {
                return Unknown("The gateway receipt did not prove a bounded durable audit observation.");
            }

            return receipt.Outcome switch
            {
                TransferGatewayOutcome.Conflict when ValidRejectionCode(receipt.RejectionCode) =>
                    new(TransferExecutionOutcome.Conflict, receipt),
                TransferGatewayOutcome.Rejected when ValidRejectionCode(receipt.RejectionCode) =>
                    new(TransferExecutionOutcome.Rejected, receipt),
                TransferGatewayOutcome.Committed when receipt.RejectionCode is null &&
                    ValidCommittedReceipt(command, receipt) =>
                    new(TransferExecutionOutcome.Committed, receipt),
                _ => Unknown("The terminal receipt was contradictory or did not prove the expected effect.")
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
        return command.Action.Effect.Kind == TransferEffectKind.ContentSynchronization
            ? receipt.ObservedPostStatus == command.ExpectedStatus
            : receipt.ObservedPostStatus is int status &&
              command.Action.Effect.AllowedPostStatuses.Contains(status);
    }

    private static bool ValidRejectionCode(string? code) =>
        LosslessAnsiValue.TryCreate(code, 100, out _);

    private static TransferExecutionResult Unknown(string detail) =>
        new(TransferExecutionOutcome.OutcomeUnknown, Detail: detail);
}
