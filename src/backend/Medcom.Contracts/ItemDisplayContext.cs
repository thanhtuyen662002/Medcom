namespace Medcom.Contracts;

// Read-envelope metadata only. Never part of an aggregate, equality token or command.
public sealed record ItemDisplayLine(string LineId, string ItemId, string? ManufacturerItemCode,
    string ManufacturerCodeSource, string? ItemName, string? Unit, string ReferenceState);
public sealed record ItemDisplayContext(string Kind, string DocumentId, string BranchId,
    string? StateToken, int? StatusId, bool? IsLocked, int? Page, int? PageSize,
    IReadOnlyList<ItemDisplayLine> Lines);
