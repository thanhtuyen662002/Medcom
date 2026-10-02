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

public sealed record PmApprovalLine(decimal RequestedQuantity, decimal? ApprovedQuantity);

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
    private const string SendPmAction = "IV_InternalTransferRequestFrm:ExecSQLWithParaButtonCtl";
    private const string ConfirmPmAction = "IV_InternalTransferPMFrm:ExecSQLWithParaButtonCtl";
    private const string ReturnPmAction = "IV_InternalTransferPMFrm:ExecSQLWithParaButtonCtl_1";

    public static TransferAdmissionResult Prepare(
        TransferCommandRequest request,
        TransferAuthoritySnapshot snapshot)
    {
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
            !string.Equals(snapshot.ActionId, request.ActionId, StringComparison.Ordinal))
        {
            return Reject(TransferValidationCodes.UntrustedSnapshot);
        }

        if (!snapshot.MenuGranted || !snapshot.CapabilityGranted || !snapshot.BranchGranted ||
            !snapshot.AssignmentGranted || string.IsNullOrWhiteSpace(snapshot.TenantId) ||
            string.IsNullOrWhiteSpace(snapshot.CompanyId) || string.IsNullOrWhiteSpace(snapshot.BranchId))
        {
            return Reject(TransferValidationCodes.ScopeDenied);
        }

        if (!action.AllowedSourceStatuses.Contains(snapshot.CurrentStatus))
        {
            return Reject(TransferValidationCodes.StatusChanged);
        }

        if (string.IsNullOrWhiteSpace(snapshot.RowVersionToken) ||
            string.IsNullOrWhiteSpace(snapshot.AuthorityVersion))
        {
            return Reject(TransferValidationCodes.MissingConcurrencyEvidence);
        }

        var payloadError = ValidatePayload(action.Id, request.Payload);
        if (payloadError is not null)
        {
            return Reject(payloadError.Value.Code, payloadError.Value.Detail);
        }

        return new TransferAdmissionResult(new PreparedTransferCommand(
            action, documentKey, actor, idempotencyKey, snapshot.TenantId, snapshot.CompanyId,
            snapshot.BranchId, snapshot.CurrentStatus, snapshot.RowVersionToken,
            snapshot.AuthorityVersion, request.Payload));
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
            string.Equals(payload.AssignedPm1, payload.AssignedPm2, StringComparison.Ordinal))
        {
            return (TransferValidationCodes.InvalidPayload,
                "Two distinct lossless legacy PM identifiers are required.");
        }

        return ValidateOptionalUnicode(payload.Notes, 1000);
    }

    private static (string Code, string Detail)? ValidateConfirm(ConfirmByPmPayload payload)
    {
        if (payload.Lines.Count == 0 || payload.Lines.Any(line =>
                line.RequestedQuantity <= 0 || !FitsDecimal28Scale4(line.RequestedQuantity) ||
                line.ApprovedQuantity is null ||
                !FitsDecimal28Scale4(line.ApprovedQuantity.Value) ||
                line.ApprovedQuantity < 0 || line.ApprovedQuantity > line.RequestedQuantity) ||
            !payload.Lines.Any(line => line.ApprovedQuantity > 0))
        {
            return (TransferValidationCodes.InvalidPayload,
                "Every approval must be between zero and the requested quantity, with one positive line.");
        }

        return ValidateOptionalUnicode(payload.Notes, 1000);
    }

    private static bool FitsDecimal28Scale4(decimal value)
    {
        var scale = (decimal.GetBits(value)[3] >> 16) & 0x7f;
        return scale <= 4 && decimal.Abs(value) <= 999999999999999999999999.9999m;
    }

    private static (string Code, string Detail)? ValidateReturn(ReturnByPmPayload payload)
    {
        if (string.IsNullOrWhiteSpace(payload.Reason) || payload.Reason != payload.Reason.Trim() ||
            payload.Reason.Length > 1000)
        {
            return (TransferValidationCodes.InvalidPayload,
                "A non-blank, unmodified return reason of at most 1000 characters is required.");
        }

        return null;
    }

    private static (string Code, string Detail)? ValidateOptionalUnicode(string? value, int maximumLength)
    {
        if (value is not null && (value.Length > maximumLength || value != value.Trim()))
        {
            return (TransferValidationCodes.InvalidPayload,
                $"Optional text must be passed without trimming and be at most {maximumLength} characters.");
        }

        return null;
    }

    private static TransferAdmissionResult Reject(string code, string? detail = null) =>
        new(null, code, detail);
}
