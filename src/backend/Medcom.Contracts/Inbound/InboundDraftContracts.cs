using System.Text.Json.Serialization;

namespace Medcom.Contracts.Inbound;

[JsonConverter(typeof(JsonStringEnumConverter<InboundDraftAction>))]
public enum InboundDraftAction { Create, Save, SendToWarehouse }

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record InboundDraftCommand(Guid OperationId, InboundDraftAction Action,
    string? DocumentId, string? ExpectedStateEqualityToken, InboundDraftHeader? Header,
    IReadOnlyList<InboundDraftDetailUpsert>? DetailUpserts = null,
    IReadOnlyList<string>? RemovedDetailIds = null,
    IReadOnlyList<InboundDraftCostInput>? CostChanges = null, string? Note = null);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record InboundDraftHeader(DateTime DocumentDate, string OrderNumber, string InvoiceNo,
    string DeparturePoint, string DestinationPoint, string OrderTypeId, string BranchId,
    string? ObjectId = null, string? CurrencyId = null,
    [property: JsonNumberHandling(JsonNumberHandling.AllowReadingFromString | JsonNumberHandling.WriteAsString)]
    decimal? RateExchange = null, string? Notes = null);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record InboundDraftDetailUpsert(string? RowId, Guid? ClientLineId, string ItemId,
    string? LotNumberByDocument = null,
    [property: JsonNumberHandling(JsonNumberHandling.AllowReadingFromString | JsonNumberHandling.WriteAsString)]
    decimal? SetQuantityByDocument = null,
    [property: JsonNumberHandling(JsonNumberHandling.AllowReadingFromString | JsonNumberHandling.WriteAsString)]
    decimal? BarrelQuantityByDocument = null, DateTime? ExpireDateByDocument = null,
    [property: JsonNumberHandling(JsonNumberHandling.AllowReadingFromString | JsonNumberHandling.WriteAsString)]
    decimal? UnitPrice = null);

// Explicitly unsupported until the source calculations are qualified. Never silently discarded.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record InboundDraftCostInput(string? RowId, string ObjectId, string? Ncc = null,
    string? Memo = null, string? CostType = null, string? CurrencyId = null,
    [property: JsonNumberHandling(JsonNumberHandling.AllowReadingFromString | JsonNumberHandling.WriteAsString)]
    decimal? RateExchange = null,
    [property: JsonNumberHandling(JsonNumberHandling.AllowReadingFromString | JsonNumberHandling.WriteAsString)]
    decimal? SourceAmount = null, string? VatId = null, string? ExpenseAccountId = null,
    string? InvoiceNo = null, DateTime? InvoiceDate = null, string? AllocateKind = null,
    string? Notes = null);

[JsonConverter(typeof(JsonStringEnumConverter<InboundDraftOutcome>))]
public enum InboundDraftOutcome
{
    Observed, Committed, Replayed, InvalidInput, Denied, NotFound, Conflict, Rejected,
    UnsupportedCostEdits, NumberingUnavailable, Unavailable, OutcomeUnknown
}

public sealed record InboundDraftReceipt(Guid OperationId, string DocumentId, int StatusId,
    string StateEqualityToken, Guid AuditId, DateTime CommittedAtUtc);
public sealed record InboundDraftResult(InboundDraftOutcome Outcome,
    InboundDraftReceipt? Receipt = null, string? Code = null);
public sealed record InboundDraftView(string DocumentId, int StatusId, InboundDraftHeader Header,
    IReadOnlyList<InboundDraftDetailUpsert> Details, int CostRowCount,
    string StateEqualityToken, bool CostEditingSupported = false);
public sealed record InboundDraftReadResult(InboundDraftOutcome Outcome, InboundDraftView? Document = null);
