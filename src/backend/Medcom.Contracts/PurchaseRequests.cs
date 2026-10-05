using System.Text.Json.Serialization;
namespace Medcom.Contracts;

// Fixed mobile DTOs. Decimal strings preserve ERP precision across JavaScript/JSON.
// PurchaseDate is a SQL datetime wall-clock value, without an inferred timezone.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PurchaseRequestHeaderInput(string? PurchaseDate, int? PurposeId,
    string PersonSuggest, string Department, string? PurposeDescOrClient, string? Price,
    string? Notes, string CurrencyId, string ObjectId, double RateExchange);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PurchaseRequestLineValues(string ItemId, string? Budget, string? TimeRequired,
    string Quantity, string UnitPrice, string? TotalPrice, string? Model);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PurchaseRequestNewLine(string ClientLineKey, PurchaseRequestLineValues Values);
[JsonConverter(typeof(JsonStringEnumConverter<PurchaseRequestLineChangeKind>))]
public enum PurchaseRequestLineChangeKind { Add, Update, Remove }
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PurchaseRequestLineChange(PurchaseRequestLineChangeKind Kind,
    string? LineId, string? ClientLineKey, PurchaseRequestLineValues? Values);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreatePurchaseRequestDraft(string IdempotencyKey, string BranchId,
    PurchaseRequestHeaderInput Header, IReadOnlyList<PurchaseRequestNewLine> Lines, bool SubmitAfterCreate = false);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SavePurchaseRequestDraft(string IdempotencyKey, string BranchId, string PurchaseRequestId,
    string ExpectedStateToken, PurchaseRequestHeaderInput Header, IReadOnlyList<PurchaseRequestLineChange> LineChanges);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SubmitPurchaseRequest(string IdempotencyKey, string BranchId,
    string PurchaseRequestId, string ExpectedStateToken);
public sealed record PurchaseRequestPersistedLine(string LineId, PurchaseRequestLineValues Values);
public sealed record PurchaseRequestAggregate(string PurchaseRequestId, string BranchId,
    PurchaseRequestHeaderInput Header, int StatusId, bool? IsLocked,
    IReadOnlyList<PurchaseRequestPersistedLine> Lines);
public sealed record PurchaseRequestAllocatedLine(string ClientLineKey, string LineId);
public sealed record PurchaseRequestCommandReceipt(string ActionId, string IdempotencyKey,
    PurchaseRequestAggregate Document, string StateToken, IReadOnlyList<PurchaseRequestAllocatedLine> AllocatedLines);
public enum PurchaseRequestCommandOutcome
{ Committed, Replayed, InvalidInput, Denied, Conflict, QualificationRequired, Unavailable, OutcomeUnknown, Cancelled }
public sealed record PurchaseRequestCommandResult(PurchaseRequestCommandOutcome Outcome,
    PurchaseRequestCommandReceipt? Receipt = null);
