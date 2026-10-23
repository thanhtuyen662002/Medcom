import { SALES_ORDER_LINE_COLUMNS, SALES_ORDER_LINE_GROUPS } from "../../sales-order-lines";
import { isMoneyField } from "../../money";
import type { DocumentDetailConfig, LineColumnConfig } from "../types";

const summary: readonly LineColumnConfig[] = [
  { key: "itemName", label: "Hàng hóa", role: "primary" },
  { key: "itemId", label: "Mã hàng", role: "secondary" },
  { key: "unit", label: "ĐVT" },
  { key: "quantity", label: "Số lượng", format: "number", align: "end" },
  { key: "unitPrice", label: "Đơn giá", format: "money", align: "end" },
  { key: "amount", label: "Số tiền", format: "money", align: "end" },
  { key: "totalAmount", label: "Tổng tiền", format: "money", align: "end", role: "total" },
];

const referenceIds = ["documentId", "objectId", "contractId", "employeeId", "managerId", "branchId", "statusId", "agencyId", "currencyId", "linkId", "paymentTermId", "ceoId", "deliveryStatusId", "deliveryEmployeeId", "deliveryEmployeeSubId"];
const visibleNames = new Set(["objectName", "contractName", "employeeName", "managerName", "branchName"]);
const referenceMetadata = referenceIds.flatMap(key => [key.slice(0, -2) + "Name", key.slice(0, -2) + "ReferenceState"])
  .filter(key => !visibleNames.has(key));

// Header evidence: inventories/source/20261010/catalog-columns.json#dbo.AR_OrderTbl.
// JSON naming: src/backend/Medcom.Infrastructure/Erp/SqlErpScreenEffects.cs#NativeJsonName.
// Reference/display companions: src/backend/Medcom.Api/FeDisplayProjection.cs#NameField/StateField/Apply.
// Existing labels, notices and allowlist: components/erp/sales-order-form.tsx before T-004.
export const salesOrderDetailConfig: DocumentDetailConfig = {
  modules: ["sales-orders", "sales-order-pm", "sales-order-sa"],
  title: "Chi tiết đơn hàng",
  closeLabel: "Đóng chi tiết đơn hàng",
  messages: { heading: "Đơn hàng", editing: "Đang chỉnh sửa đơn hàng", loading: "Đang tải đơn hàng...", empty: "Chưa có thông tin đơn hàng." },
  notice: {
    "sales-order-pm": { title: "Xác nhận đơn hàng · PM", body: "Kiểm tra khách hàng, hợp đồng, hàng hóa và lịch sử trước khi gửi SA hoặc trả lại." },
    "sales-order-sa": { title: "Duyệt đơn hàng · SA", body: "Kiểm tra nội dung đã xác nhận; chuyển Kế toán, Kỹ thuật hoặc gửi về bước phù hợp." },
  },
  groups: [
    { id: "order", title: "Thông tin đơn hàng", width: "half", columns: 3, fields: [
      { key: "documentDate", label: "Ngày chứng từ", format: "date", hideWhenEmpty: false, edit: { input: "date", required: true } },
      { key: "deliverDate", label: "Ngày giao", format: "date", hideWhenEmpty: false, edit: { input: "date" } },
      { key: "branchId", label: "Chi nhánh", displayKey: "branchName", hideWhenEmpty: false },
      { key: "currencyId", label: "Đơn vị tiền" },
    ], subgroups: [{ title: "Người phụ trách", fields: [
      { key: "employeeId", label: "Nhân viên", displayKey: "employeeName", hideWhenEmpty: false,
        edit: { input: "lookup", lookupId: "header.EmployeeID", required: true, placeholder: "Chọn nhân viên..." } },
      { key: "managerId", label: "Quản lý", displayKey: "managerName", hideWhenEmpty: false,
        edit: { input: "lookup", lookupId: "header.ManagerID", placeholder: "Chọn quản lý..." } },
    ] }] },
    { id: "customer", title: "Khách hàng & hợp đồng", width: "half", fields: [
      { key: "objectId", label: "Khách hàng", displayKey: "objectName", secondaryKey: "objectId", span: "full", hideWhenEmpty: false,
        edit: { input: "lookup", lookupId: "header.ObjectID", required: true, lookupContext: { ContractID: null }, secondaryFields: ["ObjectName", "Address"], placeholder: "Chọn khách hàng..." } },
      { key: "address", label: "Địa chỉ khách hàng", format: "multiline", hideWhenEmpty: false },
      { key: "contractId", label: "Hợp đồng", displayKey: "contractName", secondaryKey: "contractId", hideWhenEmpty: false,
        edit: { input: "lookup", lookupId: "header.ContractID", lookupContext: { ObjectID: "objectId" }, secondaryFields: ["ContractName", "ObjectName"], placeholder: "Chọn hợp đồng..." } },
    ] },
    { id: "notes", title: "Nội dung & ghi chú", width: "full", emptyStrip: "Chưa có diễn giải hoặc ghi chú.", fields: [
      { key: "memo", label: "Diễn giải", format: "multiline", hideWhenEmpty: false, edit: { input: "textarea" } },
      { key: "ghiChuDonHang", label: "Ghi chú đơn hàng", format: "multiline", hideWhenEmpty: false, edit: { input: "textarea", maxLength: 250 } },
    ] },
  ],
  // Intentionally omitted from the overview: workflow/technical metadata,
  // fields absent from the previous form, and linkId handled by attachments.
  hidden: [
    "documentId", "baseTotal", "statusId", "phone", "taxCode", "notes", "depositAmount", "isLock",
    "agencyId", "isVAT", "isOrder", "rateExchange", "linkId", "userCreate", "userUpdate", "dateUpdate", "dateCreate",
    "paymentTermId", "ceoId", "thamGiaHopDongBan", "sendTo", "bBKCUrl", "beforeOutStockUrl", "bBBGUrl", "documentUrl",
    "handoverLocation", "representedByA", "positionA", "addressA", "representedByB", "positionB", "addressB", "conclude",
    "minutesNumber", "partyAKeep", "partyBKeep", "deliveryStatusId", "deliveryEmployeeId", "deliveryEmployeeSubId", "vehicle",
    "soPhieu", "soHoaDon", "ngayPhieu", "ngayHoaDon", "statusName", "isLocked",
    ...referenceMetadata, "statusForeColor", "statusBackColor", "deliveryStatusForeColor", "deliveryStatusBackColor",
    "documentDateDisplay", "deliverDateDisplay", "dateUpdateDisplay", "dateCreateDisplay", "ngayPhieuDisplay", "ngayHoaDonDisplay",
    "baseTotalDisplay", "depositAmountDisplay",
  ],
  lines: {
    rowNoun: "dòng hàng",
    title: "Chi tiết hàng hóa", emptyText: "Chưa có hàng hóa",
    columns: ([
      ...summary,
      ...SALES_ORDER_LINE_COLUMNS.filter(column => !summary.some(visible => visible.key === column.key)).map(column => ({
        key: column.key, label: column.label, inTable: false,
        format: isMoneyField(column.key) ? "money" as const : "numeric" in column && column.numeric ? "number" as const : "text" as const,
        align: "numeric" in column && column.numeric ? "end" as const : "start" as const,
      })),
    ] satisfies LineColumnConfig[]).map(column => ({ ...column, displayKey: column.key + "Display",
      fallbackKeys: [column.key[0].toUpperCase() + column.key.slice(1),
        ...(column.key === "itemCode" ? ["manufacturerItemCode", "mfgItemId", "manufacturerItemId"]
          : column.key === "itemName" ? ["itemDisplay", "name"] : column.key === "unit" ? ["unit1"] : [])] })),
    expandGroups: SALES_ORDER_LINE_GROUPS,
  },
  history: { title: "Lịch sử gửi / duyệt" },
  slots: ["lines-editor", "attachments", "contract-info"],
};
