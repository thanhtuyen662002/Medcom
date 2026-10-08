namespace Medcom.Contracts;

/// <summary>Offline syntax projections only. None are command DTOs or evidence of ERP acceptance.</summary>
public abstract record WarehouseQrCandidate
{
    public abstract string Kind { get; }
}

public sealed record OrdinaryWarehouseQrCandidate(string ItemId, string ItemCode, string Lot)
    : WarehouseQrCandidate
{
    public override string Kind => "ordinary";
    public int UnitQuantity => 1;
}

/// <summary>No content, quantity or active-state value exists until an independently qualified lookup.</summary>
public sealed record PackageWarehouseQrCandidate(string PackageId) : WarehouseQrCandidate
{
    public override string Kind => "package";
    public bool NeedsLookup => true;
}

public sealed record WarehouseQrParseResult(
    string Status, string? Reason, string NormalizedBarcode, WarehouseQrCandidate? Candidate)
{
    public string RuntimeEquivalence => "UNKNOWN";
}

/// <summary>Proposed guardrail, narrower than legacy syntax. Supported never grants execution rights.</summary>
public sealed record WarehouseQrProfileResult(string ProfileId, IReadOnlyList<string> Issues)
{
    public bool Supported => Issues.Count == 0;
}

public sealed record WarehouseQrDocumentProfileResult(
    string NormalizedDocumentId, WarehouseQrProfileResult Profile);
