// Generated from inventories/erp/20261011/cud-workflow-catalog.json.
using System.Text.Json.Serialization;
namespace Medcom.Contracts;

public static class ErpWorkflowInputs
{
    public static Type? Type(string module, string section) => (module, section) switch
    {
        ("purchase-orders","header") => typeof(ErpPurchaseOrdersHeaderInput),
        ("purchase-orders","lines") => typeof(ErpPurchaseOrdersLinesInput),
        ("inbound-requests","header") => typeof(ErpInboundRequestsHeaderInput),
        ("inbound-requests","lines") => typeof(ErpInboundRequestsLinesInput),
        ("inbound-requests","costs") => typeof(ErpInboundRequestsCostsInput),
        ("purchase-approvals","header") => typeof(ErpPurchaseApprovalsHeaderInput),
        ("purchase-approvals","lines") => typeof(ErpPurchaseApprovalsLinesInput),
        ("sales-order-pm","header") => typeof(ErpSalesOrderPmHeaderInput),
        ("sales-order-pm","lines") => typeof(ErpSalesOrderPmLinesInput),
        ("sales-order-sa","header") => typeof(ErpSalesOrderSaHeaderInput),
        ("sales-order-sa","lines") => typeof(ErpSalesOrderSaLinesInput),
        ("internal-transfer-pm","header") => typeof(ErpInternalTransferPmHeaderInput),
        ("internal-transfer-pm","lines") => typeof(ErpInternalTransferPmLinesInput),
        ("internal-transfer-batches","header") => typeof(ErpInternalTransferBatchesHeaderInput),
        ("internal-transfer-batches","lines") => typeof(ErpInternalTransferBatchesLinesInput),
        ("internal-transfer-batches","details") => typeof(ErpInternalTransferBatchesDetailsInput),
        ("internal-transfer-batches","assets") => typeof(ErpInternalTransferBatchesAssetsInput),
        ("internal-transfer-tech","header") => typeof(ErpInternalTransferTechHeaderInput),
        ("internal-transfer-tech","lines") => typeof(ErpInternalTransferTechLinesInput),
        ("internal-transfer-tech","assets") => typeof(ErpInternalTransferTechAssetsInput),
        ("internal-transfer-sa","header") => typeof(ErpInternalTransferSaHeaderInput),
        ("internal-transfer-sa","lines") => typeof(ErpInternalTransferSaLinesInput),
        ("internal-transfer-sa","assets") => typeof(ErpInternalTransferSaAssetsInput),
        ("internal-transfer-accounting","header") => typeof(ErpInternalTransferAccountingHeaderInput),
        ("internal-transfer-accounting","lines") => typeof(ErpInternalTransferAccountingLinesInput),
        ("internal-transfer-accounting","assets") => typeof(ErpInternalTransferAccountingAssetsInput),
        ("internal-transfer-warehouse-out","header") => typeof(ErpInternalTransferWarehouseOutHeaderInput),
        ("internal-transfer-warehouse-out","lines") => typeof(ErpInternalTransferWarehouseOutLinesInput),
        ("internal-transfer-warehouse-out","assets") => typeof(ErpInternalTransferWarehouseOutAssetsInput),
        ("internal-transfer-warehouse-in","header") => typeof(ErpInternalTransferWarehouseInHeaderInput),
        ("internal-transfer-warehouse-in","lines") => typeof(ErpInternalTransferWarehouseInLinesInput),
        ("internal-transfer-warehouse-in","assets") => typeof(ErpInternalTransferWarehouseInAssetsInput),
        ("inbound-warehouse","header") => typeof(ErpInboundWarehouseHeaderInput),
        ("inbound-warehouse","lines") => typeof(ErpInboundWarehouseLinesInput),
        ("inbound-sa","header") => typeof(ErpInboundSaHeaderInput),
        ("inbound-sa","lines") => typeof(ErpInboundSaLinesInput),
        ("inbound-tech","header") => typeof(ErpInboundTechHeaderInput),
        ("inbound-tech","lines") => typeof(ErpInboundTechLinesInput),
        ("inbound-pm","header") => typeof(ErpInboundPmHeaderInput),
        ("inbound-pm","lines") => typeof(ErpInboundPmLinesInput),
        _ => null
    };
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpPurchaseOrdersHeaderInput
{
    [JsonPropertyName("documentDate")]
    public required string DocumentDate { get; init; }
    [JsonPropertyName("objectId")]
    public string? ObjectId { get; init; }
    [JsonPropertyName("memo")]
    public string? Memo { get; init; }
    [JsonPropertyName("notes")]
    public string? Notes { get; init; }
    [JsonPropertyName("deliverDate")]
    public string? DeliverDate { get; init; }
    [JsonPropertyName("currencyId")]
    public required string CurrencyId { get; init; }
    [JsonPropertyName("rateExchange")]
    public required double RateExchange { get; init; }
    [JsonPropertyName("searchField")]
    public string? SearchField { get; init; }
    [JsonPropertyName("contractId")]
    public string? ContractId { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpPurchaseOrdersLinesInput
{
    [JsonPropertyName("itemId")]
    public required string ItemId { get; init; }
    [JsonPropertyName("quantity")]
    public string? Quantity { get; init; }
    [JsonPropertyName("unitPrice")]
    public string? UnitPrice { get; init; }
    [JsonPropertyName("notes")]
    public string? Notes { get; init; }
    [JsonPropertyName("quantity2")]
    public string? Quantity2 { get; init; }
    [JsonPropertyName("property")]
    public string? Property { get; init; }
    [JsonPropertyName("property2")]
    public string? Property2 { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInboundRequestsHeaderInput
{
    [JsonPropertyName("documentDate")]
    public required string DocumentDate { get; init; }
    [JsonPropertyName("orderNumber")]
    public required string OrderNumber { get; init; }
    [JsonPropertyName("invoiceNo")]
    public required string InvoiceNo { get; init; }
    [JsonPropertyName("declarationNumber")]
    public string? DeclarationNumber { get; init; }
    [JsonPropertyName("departurePoint")]
    public required string DeparturePoint { get; init; }
    [JsonPropertyName("destinationPoint")]
    public required string DestinationPoint { get; init; }
    [JsonPropertyName("isRain")]
    public bool? IsRain { get; init; }
    [JsonPropertyName("orderTypeId")]
    public required string OrderTypeId { get; init; }
    [JsonPropertyName("objectId")]
    public string? ObjectId { get; init; }
    [JsonPropertyName("totalPalletQuantityByDocument")]
    public string? TotalPalletQuantityByDocument { get; init; }
    [JsonPropertyName("totalBarrelQuantityByDocument")]
    public string? TotalBarrelQuantityByDocument { get; init; }
    [JsonPropertyName("totalPalletQuantityByReal")]
    public string? TotalPalletQuantityByReal { get; init; }
    [JsonPropertyName("totalBarrelQuantityByReal")]
    public string? TotalBarrelQuantityByReal { get; init; }
    [JsonPropertyName("excessPackageQuantity")]
    public string? ExcessPackageQuantity { get; init; }
    [JsonPropertyName("lackOfPackageQuantity")]
    public string? LackOfPackageQuantity { get; init; }
    [JsonPropertyName("damagedPackageQuantity")]
    public string? DamagedPackageQuantity { get; init; }
    [JsonPropertyName("packageTypeId")]
    public string? PackageTypeId { get; init; }
    [JsonPropertyName("isDamageOutsidePackage")]
    public bool? IsDamageOutsidePackage { get; init; }
    [JsonPropertyName("damageDescription")]
    public string? DamageDescription { get; init; }
    [JsonPropertyName("damageInsideStatusId")]
    public string? DamageInsideStatusId { get; init; }
    [JsonPropertyName("locationDamageDetectedId")]
    public string? LocationDamageDetectedId { get; init; }
    [JsonPropertyName("locationDamageDescription")]
    public string? LocationDamageDescription { get; init; }
    [JsonPropertyName("resultDesciption")]
    public string? ResultDesciption { get; init; }
    [JsonPropertyName("totalQuantityInboundResult")]
    public string? TotalQuantityInboundResult { get; init; }
    [JsonPropertyName("goodAwaitingInboundResult")]
    public string? GoodAwaitingInboundResult { get; init; }
    [JsonPropertyName("resultNote")]
    public string? ResultNote { get; init; }
    [JsonPropertyName("datetimeRecorded")]
    public string? DatetimeRecorded { get; init; }
    [JsonPropertyName("currencyId")]
    public string? CurrencyId { get; init; }
    [JsonPropertyName("rateExchange")]
    public string? RateExchange { get; init; }
    [JsonPropertyName("imageURL")]
    public string? ImageURL { get; init; }
    [JsonPropertyName("bBKCUrl")]
    public string? BBKCUrl { get; init; }
    [JsonPropertyName("notes")]
    public string? Notes { get; init; }
    [JsonPropertyName("qrPrintType")]
    public required string QrPrintType { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInboundRequestsLinesInput
{
    [JsonPropertyName("contractId")]
    public string? ContractId { get; init; }
    [JsonPropertyName("itemId")]
    public required string ItemId { get; init; }
    [JsonPropertyName("unit2")]
    public string? Unit2 { get; init; }
    [JsonPropertyName("additional")]
    public bool? Additional { get; init; }
    [JsonPropertyName("lotNumberByDocument")]
    public string? LotNumberByDocument { get; init; }
    [JsonPropertyName("setQuantityByDocument")]
    public string? SetQuantityByDocument { get; init; }
    [JsonPropertyName("barrelQuantityByDocument")]
    public string? BarrelQuantityByDocument { get; init; }
    [JsonPropertyName("expireDateByDocument")]
    public string? ExpireDateByDocument { get; init; }
    [JsonPropertyName("sourceAmount")]
    public string? SourceAmount { get; init; }
    [JsonPropertyName("unitPrice")]
    public string? UnitPrice { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInboundRequestsCostsInput
{
    [JsonPropertyName("objectId")]
    public required string ObjectId { get; init; }
    [JsonPropertyName("nCC")]
    public string? NCC { get; init; }
    [JsonPropertyName("memo")]
    public string? Memo { get; init; }
    [JsonPropertyName("notes")]
    public string? Notes { get; init; }
    [JsonPropertyName("costType")]
    public string? CostType { get; init; }
    [JsonPropertyName("currencyId")]
    public string? CurrencyId { get; init; }
    [JsonPropertyName("rateExchange")]
    public string? RateExchange { get; init; }
    [JsonPropertyName("sourceAmount")]
    public string? SourceAmount { get; init; }
    [JsonPropertyName("vATId")]
    public string? VATId { get; init; }
    [JsonPropertyName("expenseAccId")]
    public string? ExpenseAccId { get; init; }
    [JsonPropertyName("invoiceNo")]
    public string? InvoiceNo { get; init; }
    [JsonPropertyName("invoiceDate")]
    public string? InvoiceDate { get; init; }
    [JsonPropertyName("allocateKind")]
    public string? AllocateKind { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpPurchaseApprovalsHeaderInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpPurchaseApprovalsLinesInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpSalesOrderPmHeaderInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpSalesOrderPmLinesInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpSalesOrderSaHeaderInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpSalesOrderSaLinesInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferPmHeaderInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferPmLinesInput
{
    [JsonPropertyName("pMApprovedQty")]
    public string? PMApprovedQty { get; init; }
    [JsonPropertyName("pMNote")]
    public string? PMNote { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferBatchesHeaderInput
{
    [JsonPropertyName("batchDate")]
    public required string BatchDate { get; init; }
    [JsonPropertyName("fromBranchId")]
    public required string FromBranchId { get; init; }
    [JsonPropertyName("toBranchId")]
    public required string ToBranchId { get; init; }
    [JsonPropertyName("fromStoreHouseId")]
    public string? FromStoreHouseId { get; init; }
    [JsonPropertyName("toStoreHouseId")]
    public string? ToStoreHouseId { get; init; }
    [JsonPropertyName("plannedTransferDate")]
    public string? PlannedTransferDate { get; init; }
    [JsonPropertyName("assignedPM")]
    public string? AssignedPM { get; init; }
    [JsonPropertyName("assignedTechnician")]
    public string? AssignedTechnician { get; init; }
    [JsonPropertyName("assignedSA")]
    public string? AssignedSA { get; init; }
    [JsonPropertyName("transportMethod")]
    public string? TransportMethod { get; init; }
    [JsonPropertyName("carrierName")]
    public string? CarrierName { get; init; }
    [JsonPropertyName("carrierPhone")]
    public string? CarrierPhone { get; init; }
    [JsonPropertyName("vehicleNo")]
    public string? VehicleNo { get; init; }
    [JsonPropertyName("outputDocumentId")]
    public string? OutputDocumentId { get; init; }
    [JsonPropertyName("inputDocumentId")]
    public string? InputDocumentId { get; init; }
    [JsonPropertyName("notes")]
    public string? Notes { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferBatchesLinesInput
{
    [JsonPropertyName("requestId")]
    public required string RequestId { get; init; }
    [JsonPropertyName("notes")]
    public string? Notes { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferBatchesDetailsInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferBatchesAssetsInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferTechHeaderInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferTechLinesInput
{
    [JsonPropertyName("techStatus")]
    public string? TechStatus { get; init; }
    [JsonPropertyName("techNotes")]
    public string? TechNotes { get; init; }
    [JsonPropertyName("bBKCUrl")]
    public string? BBKCUrl { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferTechAssetsInput
{
    [JsonPropertyName("assetCondition")]
    public string? AssetCondition { get; init; }
    [JsonPropertyName("techStatus")]
    public string? TechStatus { get; init; }
    [JsonPropertyName("bBKCUrl")]
    public string? BBKCUrl { get; init; }
    [JsonPropertyName("techNotes")]
    public string? TechNotes { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferSaHeaderInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferSaLinesInput
{
    [JsonPropertyName("approvedQty")]
    public required string ApprovedQty { get; init; }
    [JsonPropertyName("notes")]
    public string? Notes { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferSaAssetsInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferAccountingHeaderInput
{
    [JsonPropertyName("outputDocumentId")]
    public string? OutputDocumentId { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferAccountingLinesInput
{
    [JsonPropertyName("lot")]
    public string? Lot { get; init; }
    [JsonPropertyName("expireDate")]
    public string? ExpireDate { get; init; }
    [JsonPropertyName("accountingNote")]
    public string? AccountingNote { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferAccountingAssetsInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferWarehouseOutHeaderInput
{
    [JsonPropertyName("transportMethod")]
    public string? TransportMethod { get; init; }
    [JsonPropertyName("carrierName")]
    public string? CarrierName { get; init; }
    [JsonPropertyName("carrierPhone")]
    public string? CarrierPhone { get; init; }
    [JsonPropertyName("vehicleNo")]
    public string? VehicleNo { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferWarehouseOutLinesInput
{
    [JsonPropertyName("actualIssueQty")]
    public string? ActualIssueQty { get; init; }
    [JsonPropertyName("warehouseNote")]
    public string? WarehouseNote { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferWarehouseOutAssetsInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferWarehouseInHeaderInput
{
    [JsonPropertyName("inputDocumentId")]
    public string? InputDocumentId { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferWarehouseInLinesInput
{
    [JsonPropertyName("actualReceiveQty")]
    public string? ActualReceiveQty { get; init; }
    [JsonPropertyName("receiveNote")]
    public string? ReceiveNote { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInternalTransferWarehouseInAssetsInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInboundWarehouseHeaderInput
{
    [JsonPropertyName("totalPalletQuantityByReal")]
    public string? TotalPalletQuantityByReal { get; init; }
    [JsonPropertyName("totalBarrelQuantityByReal")]
    public string? TotalBarrelQuantityByReal { get; init; }
    [JsonPropertyName("excessPackageQuantity")]
    public string? ExcessPackageQuantity { get; init; }
    [JsonPropertyName("lackOfPackageQuantity")]
    public string? LackOfPackageQuantity { get; init; }
    [JsonPropertyName("damagedPackageQuantity")]
    public string? DamagedPackageQuantity { get; init; }
    [JsonPropertyName("isDamageOutsidePackage")]
    public bool? IsDamageOutsidePackage { get; init; }
    [JsonPropertyName("damageDescription")]
    public string? DamageDescription { get; init; }
    [JsonPropertyName("damageInsideStatusId")]
    public string? DamageInsideStatusId { get; init; }
    [JsonPropertyName("locationDamageDetectedId")]
    public string? LocationDamageDetectedId { get; init; }
    [JsonPropertyName("locationDamageDescription")]
    public string? LocationDamageDescription { get; init; }
    [JsonPropertyName("resultDesciption")]
    public string? ResultDesciption { get; init; }
    [JsonPropertyName("totalQuantityInboundResult")]
    public string? TotalQuantityInboundResult { get; init; }
    [JsonPropertyName("goodAwaitingInboundResult")]
    public string? GoodAwaitingInboundResult { get; init; }
    [JsonPropertyName("resultNote")]
    public string? ResultNote { get; init; }
    [JsonPropertyName("datetimeRecorded")]
    public string? DatetimeRecorded { get; init; }
    [JsonPropertyName("imageURL")]
    public string? ImageURL { get; init; }
    [JsonPropertyName("notes")]
    public string? Notes { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInboundWarehouseLinesInput
{
    [JsonPropertyName("additional")]
    public bool? Additional { get; init; }
    [JsonPropertyName("lotNumberByReal")]
    public string? LotNumberByReal { get; init; }
    [JsonPropertyName("setQuantityByReal")]
    public string? SetQuantityByReal { get; init; }
    [JsonPropertyName("barrelQuantityByReal")]
    public string? BarrelQuantityByReal { get; init; }
    [JsonPropertyName("expireDateByReal")]
    public string? ExpireDateByReal { get; init; }
    [JsonPropertyName("randomTestQuantity")]
    public string? RandomTestQuantity { get; init; }
    [JsonPropertyName("testStatus")]
    public string? TestStatus { get; init; }
    [JsonPropertyName("noPalletNote")]
    public string? NoPalletNote { get; init; }
    [JsonPropertyName("palletNote")]
    public string? PalletNote { get; init; }
    [JsonPropertyName("checkerNote")]
    public string? CheckerNote { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInboundSaHeaderInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInboundSaLinesInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInboundTechHeaderInput
{
    [JsonPropertyName("damagedPackageQuantity")]
    public string? DamagedPackageQuantity { get; init; }
    [JsonPropertyName("imageURL")]
    public string? ImageURL { get; init; }
    [JsonPropertyName("bBKCUrl")]
    public string? BBKCUrl { get; init; }
    [JsonPropertyName("notes")]
    public string? Notes { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInboundTechLinesInput
{
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInboundPmHeaderInput
{
    [JsonPropertyName("damagedPackageQuantity")]
    public string? DamagedPackageQuantity { get; init; }
    [JsonPropertyName("imageURL")]
    public string? ImageURL { get; init; }
    [JsonPropertyName("notes")]
    public string? Notes { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpInboundPmLinesInput
{
}
