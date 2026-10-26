import type { DocumentDetailConfig } from "../types";

export const inboundRequestDetailConfig = {
  modules: ["inbound-requests"],
  title: "Chi tiết đề nghị nhập kho",
  closeLabel: "Đóng chi tiết đề nghị nhập kho",
  slots: ["costs", "attachments"],
  groups: [
    {
      id: "document-info",
      title: "Thông tin chứng từ",
      columns: 2,
      fields: [
        { key: "documentDate", label: "Ngày chứng từ", format: "date" },
        { key: "orderNumber", label: "Số đơn hàng" },
        { key: "invoiceNo", label: "Số hóa đơn" },
        { key: "declarationNumber", label: "Số tờ khai" },
        { key: "branchId", label: "Chi nhánh", displayKey: "branchName" },
        { key: "objectId", label: "Đối tượng", displayKey: "objectName" },
        { key: "orderTypeId", label: "Loại đơn hàng", displayKey: "orderTypeName" },
        { key: "currencyId", label: "Loại tiền", displayKey: "currencyName" },
        { key: "rateExchange", label: "Tỷ giá", format: "number" },
      ],
    },
    {
      id: "transport",
      title: "Vận chuyển",
      width: "half",
      columns: 2,
      fields: [
        { key: "departurePoint", label: "Điểm đi" },
        { key: "destinationPoint", label: "Điểm đến" },
        { key: "isRain", label: "Thời tiết mưa", format: "boolean" },
      ],
    },
    {
      id: "packages",
      title: "Kiện hàng",
      columns: 2,
      fields: [
        { key: "totalPalletQuantityByDocument", label: "Tổng pallet theo chứng từ", format: "number" },
        { key: "totalBarrelQuantityByDocument", label: "Tổng thùng theo chứng từ", format: "number" },
        { key: "damagedPackageQuantity", label: "Số kiện hỏng", format: "number" },
        { key: "packageTypeId", label: "Loại bao bì", displayKey: "packageTypeName" },
      ],
    },
    {
      id: "inspection",
      title: "Kiểm tra & kết quả",
      columns: 2,
      fields: [
        { key: "notes", label: "Ghi chú chung", span: "full" },
      ],
    },
    {
      id: "attachments",
      title: "Tài liệu",
      width: "half",
      columns: 2,
      fields: [
        { key: "imageURL", label: "Hình ảnh đính kèm", format: "url" },
        { key: "bBKCUrl", label: "Biên bản kiểm nghiệm", format: "url" },
      ],
    },
  ],
  hidden: [
    "documentId",
    "documentDateDisplay",
    "branchReferenceState",
    "objectReferenceState",
    "orderTypeReferenceState",
    "currencyReferenceState",
    "packageTypeReferenceState",
    "statusId",
    "statusName",
    "statusReferenceState",
    "statusForeColor",
    "statusBackColor",
    "sendTo",
    "qrPrintType",
    "linkId",
    "linkName",
    "linkReferenceState",
    "detailSaveToken",
  ],
  lines: {
    title: "Chi tiết nhập kho",
    emptyText: "Không có dòng hàng nào.",
    footerTotal: { label: "Tổng cộng", sumKey: "amount", currencyKey: "currencyId" },
    columns: [
      { key: "itemId", label: "Mã hàng" },
      { key: "itemCode", label: "Mã hàng hiển thị", fallbackKeys: ["manufacturerItemCode", "itemId"], role: "secondary" },
      { key: "itemName", label: "Tên hàng", role: "primary" },
      { key: "unit", label: "ĐVT", fallbackKeys: ["unit2"] },
      { key: "hangSX", label: "Hãng sản xuất" },
      { key: "lotNumberByDocument", label: "Số lô theo CT" },
      { key: "expireDateByDocument", label: "Hạn dùng theo CT", format: "date" },
      { key: "lotNumberByReal", label: "Số lô thực tế" },
      { key: "expireDateByReal", label: "Hạn dùng thực tế", format: "date" },
      { key: "setQuantityByDocument", label: "Số bộ theo CT", format: "number", align: "end" },
      { key: "barrelQuantityByDocument", label: "Số thùng theo CT", format: "number", align: "end" },
      { key: "setQuantityByReal", label: "Số bộ thực tế", format: "number", align: "end" },
      { key: "barrelQuantityByReal", label: "Số thùng thực tế", format: "number", align: "end" },
      { key: "randomTestQuantity", label: "Số lượng kiểm nghiệm", format: "number", align: "end", inTable: false },
      { key: "testStatus", label: "Tình trạng kiểm nghiệm", inTable: false },
      { key: "checkerNote", label: "Ghi chú kiểm nghiệm", inTable: false },
      { key: "noPalletNote", label: "Ghi chú kiện không pallet", inTable: false },
      { key: "palletNote", label: "Ghi chú kiện có pallet", inTable: false },
      { key: "unit2", label: "Đơn vị quy đổi", inTable: false },
      { key: "unitFactor", label: "Hệ số quy đổi", format: "number", align: "end", inTable: false },
      { key: "additional", label: "Hàng phát sinh bổ sung", format: "boolean", inTable: false },
      { key: "contractId", label: "Hợp đồng liên quan", inTable: false },
      { key: "unitPrice", label: "Đơn giá", displayKey: "unitPriceDisplay", format: "money", align: "end", inTable: false },
      { key: "amount", label: "Thành tiền", displayKey: "amountDisplay", format: "money", align: "end", inTable: false },
    ],
    expandGroups: [
      {
        label: "Kiểm tra chất lượng",
        keys: ["randomTestQuantity", "testStatus", "checkerNote"],
      },
      {
        label: "Ghi chú pallet",
        keys: ["noPalletNote", "palletNote"],
      },
      {
        label: "Đơn vị & quy cách",
        keys: ["unit2", "unitFactor", "additional"],
      },
      {
        label: "Hợp đồng & giá trị",
        keys: ["contractId", "unitPrice", "amount"],
      },
    ],
  },
} as const satisfies DocumentDetailConfig;

// Thủ kho — "Xác nhận tình trạng hàng về" (ERP IV_IncomingShipmentStatusFrm). Layout follows the
// form's LYT1/LYT2/LYT3 groups and T1CS column sets; editable keys are in erp-detail-rules.
export const inboundWarehouseDetailConfig = {
  modules: ["inbound-warehouse"],
  title: "Xác nhận tình trạng hàng về",
  closeLabel: "Đóng xác nhận tình trạng hàng về",
  slots: ["lines-editor", "attachments"],
  groups: [
    {
      id: "document-info",
      title: "Thông tin chứng từ",
      columns: 2,
      fields: [
        { key: "documentDate", label: "Ngày chứng từ", format: "date" },
        { key: "orderNumber", label: "Số đơn hàng" },
        { key: "invoiceNo", label: "Số hóa đơn" },
        { key: "objectId", label: "Nhà cung cấp", displayKey: "objectName" },
        { key: "orderTypeId", label: "Loại đơn hàng", displayKey: "orderTypeName" },
        { key: "packageTypeId", label: "Loại bao bì", displayKey: "packageTypeName" },
        { key: "departurePoint", label: "Điểm đi" },
        { key: "destinationPoint", label: "Điểm đến" },
        { key: "isRain", label: "Thời tiết mưa", format: "boolean" },
      ],
    },
    {
      id: "packages",
      title: "Kiện hàng",
      columns: 2,
      fields: [
        { key: "totalPalletQuantityByDocument", label: "Tổng pallet theo chứng từ", format: "number" },
        { key: "totalBarrelQuantityByDocument", label: "Tổng thùng theo chứng từ", format: "number" },
        { key: "totalPalletQuantityByReal", label: "Tổng pallet thực tế", format: "number", hideWhenEmpty: false },
        { key: "totalBarrelQuantityByReal", label: "Tổng thùng thực tế", format: "number", hideWhenEmpty: false },
        { key: "excessPackageQuantity", label: "Số kiện thừa", format: "number", hideWhenEmpty: false },
        { key: "lackOfPackageQuantity", label: "Số kiện thiếu", format: "number", hideWhenEmpty: false },
        { key: "damagedPackageQuantity", label: "Số kiện hỏng", format: "number", hideWhenEmpty: false },
      ],
    },
    {
      id: "damage",
      title: "Thông tin hư hỏng",
      columns: 2,
      fields: [
        { key: "isDamageOutsidePackage", label: "Hư hỏng bên ngoài kiện", format: "boolean", hideWhenEmpty: false },
        { key: "damageInsideStatusId", label: "Tình trạng hư hỏng bên trong", displayKey: "damageInsideStatusName", hideWhenEmpty: false },
        { key: "damageDescription", label: "Mô tả hư hỏng", format: "multiline", span: "full", hideWhenEmpty: false },
        { key: "locationDamageDetectedId", label: "Vị trí phát hiện hư hỏng", displayKey: "locationDamageDetectedName", hideWhenEmpty: false },
        { key: "locationDamageDescription", label: "Mô tả vị trí hư hỏng", format: "multiline", span: "full", hideWhenEmpty: false },
        { key: "imageURL", label: "Link ảnh", format: "url", hideWhenEmpty: false },
      ],
    },
    {
      id: "result",
      title: "Đánh giá và kết luận",
      columns: 2,
      fields: [
        { key: "resultDesciption", label: "Đánh giá", format: "multiline", span: "full", hideWhenEmpty: false },
        { key: "totalQuantityInboundResult", label: "Tổng số lượng nhập", format: "number", hideWhenEmpty: false },
        { key: "goodAwaitingInboundResult", label: "Hàng chờ nhập", format: "number", hideWhenEmpty: false },
        { key: "resultNote", label: "Ghi chú kết luận", format: "multiline", span: "full", hideWhenEmpty: false },
        { key: "datetimeRecorded", label: "Thời điểm ghi nhận", format: "date", hideWhenEmpty: false },
        { key: "notes", label: "Ghi chú", format: "multiline", span: "full", hideWhenEmpty: false },
      ],
    },
  ],
  hidden: [...inboundRequestDetailConfig.hidden, "currencyId", "currencyName", "currencyReferenceState", "rateExchange",
    "declarationNumber", "bBKCUrl", "branchId", "branchName"],
  lines: {
    title: "Hàng hóa",
    emptyText: "Không có dòng hàng nào.",
    columns: [
      { key: "itemId", label: "Mã hàng" },
      { key: "itemCode", label: "Mã hàng hiển thị", fallbackKeys: ["manufacturerItemCode", "itemId"], role: "secondary" },
      { key: "itemName", label: "Tên hàng", role: "primary" },
      { key: "unit", label: "ĐVT", fallbackKeys: ["unit2"] },
      { key: "lotNumberByDocument", label: "Số lô theo CT" },
      { key: "expireDateByDocument", label: "Hạn dùng theo CT", format: "date" },
      { key: "setQuantityByDocument", label: "Số bộ theo CT", format: "number", align: "end" },
      { key: "lotNumberByReal", label: "Số lô thực tế" },
      { key: "expireDateByReal", label: "Hạn dùng thực tế", format: "date" },
      { key: "setQuantityByReal", label: "Số bộ thực tế", format: "number", align: "end" },
      { key: "barrelQuantityByReal", label: "Số thùng thực tế", format: "number", align: "end" },
      { key: "barrelQuantityByDocument", label: "Số thùng theo CT", format: "number", align: "end", inTable: false },
      { key: "hangSX", label: "Hãng sản xuất", inTable: false },
      { key: "randomTestQuantity", label: "Số lượng kiểm xác suất", format: "number", align: "end", inTable: false },
      { key: "testStatus", label: "Tình trạng kiểm", inTable: false },
      { key: "checkerNote", label: "Ghi chú người kiểm", inTable: false },
      { key: "noPalletNote", label: "Ghi chú kiện không pallet", inTable: false },
      { key: "palletNote", label: "Ghi chú kiện có pallet", inTable: false },
      { key: "additional", label: "Hàng phát sinh bổ sung", format: "boolean", inTable: false },
    ],
    expandGroups: [
      { label: "Trên chứng từ", keys: ["barrelQuantityByDocument", "hangSX"] },
      { label: "Kiểm tra xác suất", keys: ["randomTestQuantity", "testStatus", "noPalletNote", "palletNote", "checkerNote"] },
      { label: "Khác", keys: ["additional"] },
    ],
  },
} as const satisfies DocumentDetailConfig;

// TP SA (IV_GoodsInfoControlFrm), Kỹ thuật (IV_GoodsStatusConfirmFrm), PM (IV_GoodsQualityControlConfirmFrm):
// the same LYT1/LYT2/LYT3 groups as Thủ kho; lines are locked on all three (T1 LCK).
const { slots: _warehouseSlots, ...inboundStepLayout } = inboundWarehouseDetailConfig;
void _warehouseSlots;
export const inboundSaDetailConfig = {
  ...inboundStepLayout,
  modules: ["inbound-sa"],
  title: "Kiểm soát thông tin hàng hóa",
  slots: ["attachments"],
  closeLabel: "Đóng kiểm soát thông tin hàng hóa",
} as const satisfies DocumentDetailConfig;
export const inboundTechDetailConfig = {
  ...inboundStepLayout,
  modules: ["inbound-tech"],
  title: "Xác nhận tình trạng hàng hóa",
  slots: ["attachments"],
  closeLabel: "Đóng xác nhận tình trạng hàng hóa",
  groups: inboundStepLayout.groups.map(group => group.id !== "damage" ? group
    : { ...group, fields: [...group.fields, { key: "bBKCUrl", label: "Link BBKC", format: "url", hideWhenEmpty: false } as const] }),
  hidden: inboundStepLayout.hidden.filter(key => key !== "bBKCUrl"),
} as const satisfies DocumentDetailConfig;
export const inboundPmDetailConfig = {
  ...inboundStepLayout,
  modules: ["inbound-pm"],
  title: "Kiểm soát và xác nhận chất lượng hàng hóa",
  slots: ["attachments"],
  closeLabel: "Đóng kiểm soát và xác nhận chất lượng hàng hóa",
} as const satisfies DocumentDetailConfig;

// BLĐ (IV_CargoHandlingPlanApprovalFrm): same groups, read-only (HBE), status 10 only.
export const inboundBldDetailConfig = {
  ...inboundStepLayout,
  modules: ["inbound-bld"],
  title: "Phê duyệt phương án hàng hóa",
  slots: ["attachments"],
  closeLabel: "Đóng phê duyệt phương án hàng hóa",
} as const satisfies DocumentDetailConfig;

// Chứng từ chi phí (IV_InboundRequestCTCPFrm): the request as TM sees it, read-only, with its cost documents editable.
export const inboundCostsDetailConfig = {
  ...inboundRequestDetailConfig,
  modules: ["inbound-costs"],
  title: "Chứng từ chi phí",
  closeLabel: "Đóng chứng từ chi phí",
  slots: ["costs", "attachments"],
} as const satisfies DocumentDetailConfig;
