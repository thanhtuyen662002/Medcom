using System.Buffers.Binary;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Medcom.Application.Transfers;

public static class TransferValidationCodes
{
    public const string UnknownAction = "unknown_action";
    public const string InvalidDocumentKey = "invalid_document_key";
    public const string InvalidActor = "invalid_actor";
    public const string InvalidIdempotencyKey = "invalid_idempotency_key";
    public const string UntrustedSnapshot = "untrusted_snapshot";
    public const string ScopeDenied = "scope_denied";
    public const string StatusChanged = "status_changed";
    public const string MissingConcurrencyEvidence = "missing_concurrency_evidence";
    public const string InvalidPayload = "invalid_payload";
    public const string PayloadContractUnavailable = "payload_contract_unavailable";
}

public readonly record struct LosslessAnsiValue(string Value)
{
    public static bool TryCreate(string? candidate, int maximumLength, out LosslessAnsiValue value)
    {
        value = default;
        if (candidate is null || candidate.Length == 0 || candidate.Length > maximumLength ||
            candidate != candidate.Trim() || candidate.Any(character => character is < '!' or > '~'))
        {
            return false;
        }

        value = new LosslessAnsiValue(candidate);
        return true;
    }
}

public interface ITransferActionPayload;

public sealed record SendToPmPayload(string AssignedPm1, string AssignedPm2, string? Notes)
    : ITransferActionPayload;

public sealed record PmApprovalLine(
    string DetailId,
    decimal RequestedQuantity,
    decimal? ApprovedQuantity);

public sealed record ConfirmByPmPayload(IReadOnlyList<PmApprovalLine> Lines, string? Notes)
    : ITransferActionPayload;

public sealed record ReturnByPmPayload(string Reason) : ITransferActionPayload;

public sealed record TransferCommandRequest(
    string ActionId,
    string DocumentKey,
    string IdempotencyKey,
    ITransferActionPayload Payload);

public enum TransferSnapshotOrigin
{
    ClientClaim,
    DatabaseAuthority
}

public sealed record TransferAuthoritySnapshot(
    TransferSnapshotOrigin Origin,
    string TenantId,
    string CompanyId,
    string BranchId,
    string Actor,
    string ActionId,
    string DocumentKey,
    int CurrentStatus,
    string RowVersionToken,
    string AuthorityVersion,
    bool MenuGranted,
    bool CapabilityGranted,
    bool BranchGranted,
    bool AssignmentGranted);

public sealed record PreparedTransferCommand
{
    internal PreparedTransferCommand(
        TransferActionDefinition action,
        LosslessAnsiValue documentKey,
        LosslessAnsiValue actor,
        LosslessAnsiValue idempotencyKey,
        string tenantId,
        string companyId,
        string branchId,
        int expectedStatus,
        string expectedRowVersion,
        string authorityVersion,
        string correlationFingerprint,
        ITransferActionPayload payload)
    {
        Action = action;
        DocumentKey = documentKey;
        Actor = actor;
        IdempotencyKey = idempotencyKey;
        TenantId = tenantId;
        CompanyId = companyId;
        BranchId = branchId;
        ExpectedStatus = expectedStatus;
        ExpectedRowVersion = expectedRowVersion;
        AuthorityVersion = authorityVersion;
        CorrelationFingerprint = correlationFingerprint;
        Payload = payload;
    }

    public TransferActionDefinition Action { get; }
    public LosslessAnsiValue DocumentKey { get; }
    public LosslessAnsiValue Actor { get; }
    public LosslessAnsiValue IdempotencyKey { get; }
    public string TenantId { get; }
    public string CompanyId { get; }
    public string BranchId { get; }
    public int ExpectedStatus { get; }
    public string ExpectedRowVersion { get; }
    public string AuthorityVersion { get; }
    public string CorrelationFingerprint { get; }
    public ITransferActionPayload Payload { get; }
}

public sealed record TransferAdmissionResult(
    PreparedTransferCommand? Command,
    string? RejectionCode = null,
    string? RejectionDetail = null)
{
    public bool Accepted => Command is not null;
}

public static class TransferCommandAdmission
{
    private const int MaximumApprovalLines = 1000;
    private const string SendPmAction = "IV_InternalTransferRequestFrm:ExecSQLWithParaButtonCtl";
    private const string ConfirmPmAction = "IV_InternalTransferPMFrm:ExecSQLWithParaButtonCtl";
    private const string ReturnPmAction = "IV_InternalTransferPMFrm:ExecSQLWithParaButtonCtl_1";

    public static TransferAdmissionResult Prepare(
        TransferCommandRequest? request,
        TransferAuthoritySnapshot? snapshot)
    {
        if (request is null)
        {
            return Reject(TransferValidationCodes.UnknownAction);
        }

        if (snapshot is null)
        {
            return Reject(TransferValidationCodes.UntrustedSnapshot);
        }

        if (!TransferActionCatalog.TryGet(request.ActionId, out var action))
        {
            return Reject(TransferValidationCodes.UnknownAction);
        }

        if (!LosslessAnsiValue.TryCreate(request.DocumentKey, 30, out var documentKey))
        {
            return Reject(TransferValidationCodes.InvalidDocumentKey,
                "The legacy varchar(30) key must be supplied exactly as printable ASCII.");
        }

        if (!LosslessAnsiValue.TryCreate(snapshot.Actor, 100, out var actor))
        {
            return Reject(TransferValidationCodes.InvalidActor);
        }

        if (!LosslessAnsiValue.TryCreate(request.IdempotencyKey, 100, out var idempotencyKey) ||
            request.IdempotencyKey.Length < 16)
        {
            return Reject(TransferValidationCodes.InvalidIdempotencyKey);
        }

        if (snapshot.Origin != TransferSnapshotOrigin.DatabaseAuthority ||
            !string.Equals(snapshot.ActionId, request.ActionId, StringComparison.Ordinal) ||
            !string.Equals(snapshot.DocumentKey, documentKey.Value, StringComparison.Ordinal))
        {
            return Reject(TransferValidationCodes.UntrustedSnapshot);
        }

        if (!snapshot.MenuGranted || !snapshot.CapabilityGranted || !snapshot.BranchGranted ||
            !snapshot.AssignmentGranted || !ValidScopedIdentifier(snapshot.TenantId) ||
            !ValidScopedIdentifier(snapshot.CompanyId) || !ValidScopedIdentifier(snapshot.BranchId))
        {
            return Reject(TransferValidationCodes.ScopeDenied);
        }

        if (!action.AllowedSourceStatuses.Contains(snapshot.CurrentStatus))
        {
            return Reject(TransferValidationCodes.StatusChanged);
        }

        if (!LosslessAnsiValue.TryCreate(snapshot.RowVersionToken, 250, out _) ||
            !LosslessAnsiValue.TryCreate(snapshot.AuthorityVersion, 250, out _))
        {
            return Reject(TransferValidationCodes.MissingConcurrencyEvidence);
        }

        ITransferActionPayload frozenPayload;
        (string Code, string Detail)? payloadError;
        try
        {
            frozenPayload = FreezePayload(request.Payload);
            payloadError = ValidatePayload(action.Id, frozenPayload);
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            return Reject(TransferValidationCodes.InvalidPayload,
                "The payload could not be read as a stable bounded value.");
        }
        if (payloadError is not null)
        {
            return Reject(payloadError.Value.Code, payloadError.Value.Detail);
        }

        var correlationFingerprint = ComputeCorrelationFingerprint(
            action, documentKey, actor, idempotencyKey, snapshot, frozenPayload);

        return new TransferAdmissionResult(new PreparedTransferCommand(
            action, documentKey, actor, idempotencyKey, snapshot.TenantId, snapshot.CompanyId,
            snapshot.BranchId, snapshot.CurrentStatus, snapshot.RowVersionToken,
            snapshot.AuthorityVersion, correlationFingerprint, frozenPayload));
    }

    private static ITransferActionPayload FreezePayload(ITransferActionPayload payload) =>
        payload is ConfirmByPmPayload { Lines: not null } confirm
            ? FreezeConfirmPayload(confirm)
            : payload;

    private static ConfirmByPmPayload FreezeConfirmPayload(ConfirmByPmPayload payload)
    {
        var expectedCount = payload.Lines.Count;
        if (expectedCount is < 1 or > MaximumApprovalLines)
        {
            throw new InvalidOperationException("The approval collection is outside its bound.");
        }

        var lines = new List<PmApprovalLine>(expectedCount);
        foreach (var line in payload.Lines)
        {
            if (lines.Count == expectedCount)
            {
                throw new InvalidOperationException("The approval collection is outside its bound.");
            }
            lines.Add(line);
        }

        if (lines.Count != expectedCount)
        {
            throw new InvalidOperationException("The approval collection changed while being copied.");
        }

        return payload with { Lines = Array.AsReadOnly(lines.ToArray()) };
    }

    private static (string Code, string Detail)? ValidatePayload(string actionId, ITransferActionPayload payload) =>
        actionId switch
        {
            SendPmAction when payload is SendToPmPayload send => ValidateSend(send),
            ConfirmPmAction when payload is ConfirmByPmPayload confirm => ValidateConfirm(confirm),
            ReturnPmAction when payload is ReturnByPmPayload returned => ValidateReturn(returned),
            SendPmAction or ConfirmPmAction or ReturnPmAction =>
                (TransferValidationCodes.InvalidPayload, "The payload type does not match the action."),
            _ => (TransferValidationCodes.PayloadContractUnavailable,
                "The action is catalogued but its typed payload is not yet eligible for execution.")
        };

    private static (string Code, string Detail)? ValidateSend(SendToPmPayload payload)
    {
        if (!LosslessAnsiValue.TryCreate(payload.AssignedPm1, 100, out _) ||
            !LosslessAnsiValue.TryCreate(payload.AssignedPm2, 100, out _) ||
            string.Equals(payload.AssignedPm1, payload.AssignedPm2, StringComparison.OrdinalIgnoreCase))
        {
            return (TransferValidationCodes.InvalidPayload,
                "Two distinct lossless legacy PM identifiers are required.");
        }

        return ValidateOptionalUnicode(payload.Notes, 1000);
    }

    private static (string Code, string Detail)? ValidateConfirm(ConfirmByPmPayload payload)
    {
        if (payload.Lines is null || payload.Lines.Count == 0 || payload.Lines.Any(line =>
                !ValidTechnicalUnicodeIdentifier(line.DetailId, 50) ||
                line.RequestedQuantity <= 0 || !FitsDecimal28Scale4(line.RequestedQuantity) ||
                line.ApprovedQuantity is null ||
                !FitsDecimal28Scale4(line.ApprovedQuantity.Value) ||
                line.ApprovedQuantity < 0 || line.ApprovedQuantity > line.RequestedQuantity) ||
            payload.Lines.Select(line => line.DetailId)
                .Distinct(StringComparer.OrdinalIgnoreCase).Count() != payload.Lines.Count ||
            !payload.Lines.Any(line => line.ApprovedQuantity > 0))
        {
            return (TransferValidationCodes.InvalidPayload,
                "Every uniquely identified detail approval must be between zero and the requested quantity, with one positive line.");
        }

        return ValidateOptionalUnicode(payload.Notes, 1000);
    }

    private static bool FitsDecimal28Scale4(decimal value)
    {
        // Validate mathematical representability, not redundant trailing zeros in the CLR scale.
        // Compare before rounding so out-of-range values (including decimal.MinValue) stay bounded.
        const decimal maximum = 999999999999999999999999.9999m;
        return value >= -maximum && value <= maximum && decimal.Round(value, 4) == value;
    }

    private static (string Code, string Detail)? ValidateReturn(ReturnByPmPayload payload)
    {
        if (string.IsNullOrWhiteSpace(payload.Reason) || payload.Reason != payload.Reason.Trim() ||
            payload.Reason.Length > 1000 || payload.Reason.Contains('\0') ||
            !HasWellFormedUtf16(payload.Reason))
        {
            return (TransferValidationCodes.InvalidPayload,
                "A non-blank, unmodified return reason of at most 1000 characters is required.");
        }

        return null;
    }

    private static (string Code, string Detail)? ValidateOptionalUnicode(string? value, int maximumLength)
    {
        if (value is not null && (value.Length > maximumLength || value != value.Trim() ||
                value.Contains('\0') || !HasWellFormedUtf16(value)))
        {
            return (TransferValidationCodes.InvalidPayload,
                $"Optional text must be passed without trimming and be at most {maximumLength} characters.");
        }

        return null;
    }

    private static bool ValidScopedIdentifier(string? value) =>
        ValidTechnicalUnicodeIdentifier(value, 250);

    private static bool ValidTechnicalUnicodeIdentifier(string? value, int maximumLength) =>
        !string.IsNullOrWhiteSpace(value) && value.Length <= maximumLength &&
        value == value.Trim() && HasWellFormedUtf16(value) &&
        value.IsNormalized(NormalizationForm.FormC) &&
        !value.EnumerateRunes().Any(character =>
            Rune.GetUnicodeCategory(character) is UnicodeCategory.Control or UnicodeCategory.Format);

    private static bool HasWellFormedUtf16(string value)
    {
        for (var index = 0; index < value.Length; index++)
        {
            if (char.IsHighSurrogate(value[index]))
            {
                if (++index >= value.Length || !char.IsLowSurrogate(value[index])) return false;
            }
            else if (char.IsLowSurrogate(value[index]))
            {
                return false;
            }
        }

        return true;
    }

    private static string ComputeCorrelationFingerprint(
        TransferActionDefinition action,
        LosslessAnsiValue documentKey,
        LosslessAnsiValue actor,
        LosslessAnsiValue idempotencyKey,
        TransferAuthoritySnapshot snapshot,
        ITransferActionPayload payload)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        AppendFingerprintField(hash, "transfer-command-v1");
        AppendFingerprintField(hash, action.Id);
        AppendFingerprintField(hash, "action-contract-v1");
        AppendFingerprintField(hash, action.FormId);
        AppendFingerprintField(hash, action.ControlId);
        AppendFingerprintField(hash, action.MenuId);
        AppendFingerprintField(hash,
            ((int)action.Entity).ToString(CultureInfo.InvariantCulture));
        AppendFingerprintField(hash, action.Procedure);
        AppendFingerprintField(hash, action.ProcedureSha256);
        AppendFingerprintField(hash, action.BeforeCheckProcedure);
        AppendFingerprintField(hash,
            action.AllowedSourceStatuses.Count.ToString(CultureInfo.InvariantCulture));
        foreach (var status in action.AllowedSourceStatuses.Order())
        {
            AppendFingerprintField(hash, status.ToString(CultureInfo.InvariantCulture));
        }
        AppendFingerprintField(hash,
            ((int)action.Effect.Kind).ToString(CultureInfo.InvariantCulture));
        AppendFingerprintField(hash,
            action.Effect.AllowedPostStatuses.Count.ToString(CultureInfo.InvariantCulture));
        foreach (var status in action.Effect.AllowedPostStatuses.Order())
        {
            AppendFingerprintField(hash, status.ToString(CultureInfo.InvariantCulture));
        }
        AppendFingerprintField(hash, action.Effect.RequiresAtomicLegacyLog ? "1" : "0");
        AppendFingerprintField(hash, documentKey.Value);
        AppendFingerprintField(hash, idempotencyKey.Value);
        AppendFingerprintField(hash, snapshot.TenantId);
        AppendFingerprintField(hash, snapshot.CompanyId);
        AppendFingerprintField(hash, snapshot.BranchId);
        AppendFingerprintField(hash, actor.Value);
        AppendFingerprintField(hash, snapshot.CurrentStatus.ToString(CultureInfo.InvariantCulture));
        AppendFingerprintField(hash, snapshot.RowVersionToken);
        AppendFingerprintField(hash, snapshot.AuthorityVersion);

        switch (payload)
        {
            case SendToPmPayload send:
                AppendFingerprintField(hash, "send-pm");
                AppendFingerprintField(hash, send.AssignedPm1);
                AppendFingerprintField(hash, send.AssignedPm2);
                AppendFingerprintField(hash, send.Notes);
                break;
            case ConfirmByPmPayload confirm:
                AppendFingerprintField(hash, "confirm-pm");
                AppendFingerprintField(hash, confirm.Lines.Count.ToString(CultureInfo.InvariantCulture));
                foreach (var line in confirm.Lines.OrderBy(
                             line => line.DetailId, StringComparer.OrdinalIgnoreCase))
                {
                    AppendFingerprintField(hash, line.DetailId);
                    AppendFingerprintField(hash,
                        line.RequestedQuantity.ToString("G29", CultureInfo.InvariantCulture));
                    AppendFingerprintField(hash, line.ApprovedQuantity?.ToString(
                        "G29", CultureInfo.InvariantCulture));
                }
                AppendFingerprintField(hash, confirm.Notes);
                break;
            case ReturnByPmPayload returned:
                AppendFingerprintField(hash, "return-pm");
                AppendFingerprintField(hash, returned.Reason);
                break;
            default:
                throw new InvalidOperationException("The admitted payload type is not fingerprintable.");
        }

        return Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
    }

    private static void AppendFingerprintField(IncrementalHash hash, string? value)
    {
        Span<byte> length = stackalloc byte[4];
        if (value is null)
        {
            BinaryPrimitives.WriteInt32BigEndian(length, -1);
            hash.AppendData(length);
            return;
        }

        var bytes = Encoding.UTF8.GetBytes(value);
        BinaryPrimitives.WriteInt32BigEndian(length, bytes.Length);
        hash.AppendData(length);
        hash.AppendData(bytes);
    }

    private static TransferAdmissionResult Reject(string code, string? detail = null) =>
        new(null, code, detail);
}
