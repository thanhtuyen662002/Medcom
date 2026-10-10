using System.Text.Json;
using System.Text.Json.Serialization;
namespace Medcom.Contracts;

// The seven route identifiers are a finite server catalog; callers never select SQL objects or field mappings.
public sealed record ErpFieldDefinition(string Name, string Column, string SqlType, string? TypeArguments,
    bool Nullable, int Ordinal, bool HasDefault, bool Writable);
public sealed record ErpLookupDefinition(string Id, string? Grid, string Field, string ValueField,
    string DisplayField, string? LinkedFields, string? Parameters, string? RequiredParameters, bool MultiSelect, bool Disabled,
    string SourceHash);
public sealed record ErpActionDefinition(string Id, string Caption, string Control, string Operation,
    string? LockExpression, bool NativeVisible, bool RequiresSavedDocument, string Evidence);
public sealed record ErpActionState(string Id, string Caption, bool Visible, bool Enabled,
    string? Reason, bool RequiresSavedDocument, string? Route);
public sealed record ErpScreenDescription(string Id, string Caption, string MenuId, string FormId,
    IReadOnlyDictionary<string, IReadOnlyList<ErpFieldDefinition>> Fields,
    IReadOnlyList<ErpActionDefinition> Actions, IReadOnlyList<ErpLookupDefinition> Lookups, string Evidence);
public sealed record ErpPageQuery(string BranchId, int Page = 1, int PageSize = 20,
    string? Search = null, string? DateFrom = null, string? DateTo = null, int? StatusId = null);
public sealed record ErpDocumentRow(string DocumentId, IReadOnlyDictionary<string, object?> Header);
public sealed record ErpDocumentPage(IReadOnlyList<ErpDocumentRow> Rows, int Page, int PageSize, bool HasMore);
public sealed record ErpLineRow(string LineId, IReadOnlyDictionary<string, object?> Fields);
public sealed record ErpLinePage(IReadOnlyList<ErpLineRow> Rows, int Page, int PageSize, bool HasMore);
public sealed record ErpDocumentDetail(string DocumentId, string BranchId, string StateToken,
    IReadOnlyDictionary<string, object?> Header, ErpLinePage Lines,
    ErpLinePage? History, ErpLinePage? Comparison, IReadOnlyList<ErpActionState> Actions);
public sealed record ErpChoice(string Id, string? Label, IReadOnlyDictionary<string, object?> Fields);
public sealed record ErpChoicePage(IReadOnlyList<ErpChoice> Items, int Page, int PageSize, bool HasMore,
    IReadOnlyList<string> RequiredParameters);
public sealed record ErpLookupQuery(string BranchId, string LookupId, int Page = 1, int PageSize = 20,
    string? Search = null, IReadOnlyDictionary<string, string?>? Context = null);
public sealed record ErpPmLookupQuery(string BranchId, string Role = "primary", int Page = 1, int PageSize = 20, string? Search = null);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpNewLine(string ClientLineKey, JsonElement Values);
[JsonConverter(typeof(JsonStringEnumConverter<ErpLineChangeKind>))]
public enum ErpLineChangeKind { Add, Update, Remove }
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpLineChange(ErpLineChangeKind Kind, string? LineId,
    string? ClientLineKey, JsonElement? Values);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpCreateRequest(string IdempotencyKey, string BranchId, JsonElement Header,
    IReadOnlyList<ErpNewLine> Lines);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpSaveRequest(string IdempotencyKey, string BranchId, string DocumentId,
    string ExpectedStateToken, JsonElement Header, IReadOnlyList<ErpLineChange> LineChanges);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpDeleteRequest(string IdempotencyKey, string BranchId,
    string DocumentId, string ExpectedStateToken);
// Action-specific payload is decoded against the action's fixed input type before dispatch.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpActionRequest(string IdempotencyKey, string BranchId, string DocumentId,
    string ExpectedStateToken, JsonElement Payload);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpSendOrderPm(string PmId, string? Notes);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpSendTransferPm(string PrimaryPmId, string SupportingPmId, string? Notes);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpScanRequest(string IdempotencyKey, string BranchId, string DocumentId,
    string ExpectedStateToken, string Barcode);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpPasteRequest(string BranchId, IReadOnlyList<JsonElement> Rows);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpSelectionRequest(string BranchId, string SourceId, IReadOnlyList<string> SelectedKeys,
    IReadOnlyDictionary<string, string?>? Context = null);
public sealed record ErpDraftSelection(IReadOnlyList<ErpNewLine> Lines,
    IReadOnlyDictionary<string, object?> HeaderPatch, string SourceEvidence, bool RevalidatedOnSave);
public sealed record ErpAllocatedLine(string ClientLineKey, string LineId);
public sealed record ErpCommandReceipt(string Module, string Operation, string IdempotencyKey,
    string DocumentId, string? StateToken, string AuditId, bool Deleted,
    IReadOnlyList<ErpAllocatedLine> AllocatedLines);
[JsonConverter(typeof(JsonStringEnumConverter<ErpCommandOutcome>))]
public enum ErpCommandOutcome
{ Committed, Replayed, InvalidInput, Denied, Conflict, QualificationRequired, Unavailable, OutcomeUnknown, Cancelled }
public sealed record ErpCommandResult(ErpCommandOutcome Outcome, string? Code = null,
    ErpCommandReceipt? Receipt = null);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpCommandLookupRequest(string Operation, JsonElement OriginalIntent);
public sealed record ErpCommandObservation(string Outcome, ErpCommandReceipt? Receipt = null);
public sealed record ErpScopedResponse<T>(string ReadScope, T Data);
