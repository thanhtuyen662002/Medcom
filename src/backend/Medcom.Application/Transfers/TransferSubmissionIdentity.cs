using System.Globalization;
using System.Security.Cryptography;

namespace Medcom.Application.Transfers;

// Stable submitted intent, not authority and not a durable idempotency implementation.
public static class TransferSubmissionIdentity
{
    public static string ForPmReturn(string tenantId, string companyId, string actor,
        string documentKey, string idempotencyKey, ReturnByPmPayload payload)
    {
        ArgumentNullException.ThrowIfNull(payload);
        if (!TransferStateSnapshot.ValidIdentifier(tenantId, 100)
            || !TransferStateSnapshot.ValidIdentifier(companyId, 100)
            || !LosslessAnsiValue.TryCreate(actor, 50, out _)
            || !LosslessAnsiValue.TryCreate(documentKey, 30, out _)
            || !LosslessAnsiValue.TryCreate(idempotencyKey, 100, out _) || idempotencyKey.Length < 16
            || !PmReturnPreparation.ValidReason(payload.Reason))
            throw new ArgumentException("The submitted PM Return intent is invalid.");
        var action = PmReturnPreparation.Action;
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        foreach (var field in new[] { "Medcom.PmReturn.Submission.v1", tenantId, companyId, actor,
            action.Id, action.FormId, action.ControlId, action.MenuId, action.Procedure,
            action.ProcedureSha256, action.BeforeCheckProcedure, action.Entity.ToString(),
            action.Effect.Kind.ToString(), action.Effect.RequiresAtomicLegacyLog ? "1" : "0",
            string.Join(",", action.AllowedSourceStatuses.Order().Select(status => status.ToString(CultureInfo.InvariantCulture))),
            string.Join(",", action.Effect.AllowedPostStatuses.Order().Select(status => status.ToString(CultureInfo.InvariantCulture))),
            documentKey, idempotencyKey, payload.Reason })
            TransferFingerprintFields.Append(hash, field);
        return "pmr-submission-v1:" + Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
    }
}
