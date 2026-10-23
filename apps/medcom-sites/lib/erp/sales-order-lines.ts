import type { ErpChoice } from "./erp-screen-contracts";
import { salesOrderField } from "./sales-order-lookups";

export interface SalesOrderDraftLine {
  key: string;
  choice: ErpChoice | null;
  itemId: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  vATPercent: string;
  vATQuantity: string;
  dienGiai: string;
  notes: string;
}

export const SALES_ORDER_LINE_COLUMNS = [
  { key: "itemId", label: "Mã hàng" },
  { key: "itemCode", label: "Mã hàng NSX" },
  { key: "unit", label: "ĐVT" },
  { key: "quantity", label: "Số lượng", numeric: true, editable: true },
  { key: "unitPrice", label: "Đơn giá", numeric: true, editable: true },
  { key: "amount", label: "Số tiền", numeric: true, formula: "Số lượng × Đơn giá" },
  { key: "discountPercent", label: "% Chiết khấu", numeric: true, editable: true },
  { key: "discountAmount", label: "Tiền CK", numeric: true, formula: "Số tiền × % Chiết khấu ÷ 100" },
  { key: "vATPercent", label: "% Thuế", numeric: true, editable: true },
  { key: "vATAmount", label: "Tiền thuế", numeric: true, formula: "Số tiền × % Thuế ÷ 100" },
  { key: "totalAmount", label: "Tổng tiền", numeric: true, formula: "Số tiền + Tiền thuế − Tiền CK" },
  { key: "soLuongHopDong", label: "Tổng số lượng HĐ", numeric: true },
  { key: "deliveryQuantity", label: "Đã XUẤT hàng", numeric: true },
  { key: "vATQuantity", label: "Số lượng VAT", numeric: true, editable: true },
  { key: "dienGiai", label: "Diễn giải", editable: true },
  { key: "notes", label: "Ghi chú", editable: true },
] satisfies Array<{ key: string; label: string; numeric?: boolean; editable?: boolean; formula?: string }>;

// Compatibility for the shared detail config: group only the current upstream
// columns. Unit2/UnitFactor/Quantity2 were removed from that column contract.
export const SALES_ORDER_LINE_GROUPS = [
  { label: "Thông tin hàng", keys: ["itemId", "itemCode", "unit"], fullWidth: ["itemId"] },
  { label: "Số lượng", keys: ["quantity", "soLuongHopDong", "deliveryQuantity", "vATQuantity"], fullWidth: ["vATQuantity"] },
  { label: "Giá & thuế", keys: ["unitPrice", "amount", "discountPercent", "discountAmount", "vATPercent", "vATAmount", "totalAmount"], fullWidth: ["totalAmount"] },
  { label: "Nội dung", keys: ["dienGiai", "notes"], fullWidth: ["dienGiai", "notes"] },
];

export function isSalesOrderLineValid(line: SalesOrderDraftLine): boolean {
  const number = /^\d+(\.\d+)?$/;
  return !!line.itemId.trim() && number.test(line.quantity.trim()) &&
    [line.unitPrice, line.discountPercent, line.vATPercent, line.vATQuantity].every(value => !value.trim() || number.test(value.trim()));
}

export function emptySalesOrderLine(key: string): SalesOrderDraftLine {
  return { key, choice: null, itemId: "", quantity: "1", unitPrice: "", discountPercent: "",
    vATPercent: "", vATQuantity: "", dienGiai: "", notes: "" };
}

// Only the selected item's values are copied. Missing values clear the previous item's companions.
// Evidence: inventories/erp/20261010/six-screen-catalog.json#sales-orders.lookups/lines.ItemID.
export function selectSalesOrderLine(key: string, choice: ErpChoice | null): SalesOrderDraftLine {
  const line = emptySalesOrderLine(key);
  if (!choice) return line;
  return { ...line, choice, itemId: choice.id, quantity: salesOrderField(choice, "Quantity") || "1",
    unitPrice: salesOrderField(choice, "UnitPrice"), discountPercent: salesOrderField(choice, "DiscountPercent"),
    vATPercent: salesOrderField(choice, "VATPercent"), vATQuantity: salesOrderField(choice, "VATQuantity"),
    dienGiai: salesOrderField(choice, "DienGiai"), notes: salesOrderField(choice, "Notes") };
}

type Decimal = { value: bigint; scale: number };
function decimal(text: string): Decimal | null {
  if (text.length > 128 || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  const [integer, fraction = ""] = text.split(".");
  return { value: BigInt(integer + fraction), scale: fraction.length };
}
function format(value: Decimal | null): string {
  if (!value) return "";
  const negative = value.value < BigInt(0);
  const digits = (negative ? -value.value : value.value).toString().padStart(value.scale + 1, "0");
  const text = value.scale ? `${digits.slice(0, -value.scale)}.${digits.slice(-value.scale)}`.replace(/\.?0+$/, "") : digits;
  return (negative ? "-" : "") + text;
}
function multiply(a: Decimal | null, b: Decimal | null): Decimal | null {
  return a && b ? { value: a.value * b.value, scale: a.scale + b.scale } : null;
}
/** Amount + VAT - Discount, treating a missing addend/subtrahend as zero. */
function adjust(base: Decimal | null, plus: Decimal | null, minus: Decimal | null): Decimal | null {
  if (!base) return null;
  const scale = Math.max(base.scale, plus?.scale ?? 0, minus?.scale ?? 0);
  const scaled = (value: Decimal | null) => value ? value.value * BigInt(10) ** BigInt(scale - value.scale) : BigInt(0);
  return { value: scaled(base) + scaled(plus) - scaled(minus), scale };
}

export function salesOrderLineDisplay(line: SalesOrderDraftLine): Record<string, string> {
  const field = (column: string) => salesOrderField(line.choice, column);
  const amount = multiply(decimal(line.quantity), decimal(line.unitPrice));
  // Owner-supplied ERP line-effect expressions (backend remains authoritative):
  //   Amount         = Quantity * UnitPrice
  //   VATAmount      = Amount * VATPercent / 100
  //   DiscountAmount = Amount * DiscountPercent / 100
  //   TotalAmount    = Amount + VATAmount - DiscountAmount
  // Percentages are divided by 100 by scaling two decimal places; a blank percentage
  // contributes zero so the auto-filled cells stay populated. Preview only - the
  // server recalculates and confirms every saved amount.
  const percentOf = (base: Decimal | null, text: string): Decimal | null => {
    if (!base) return null;
    const percent = decimal(text) ?? { value: BigInt(0), scale: 0 };
    return { value: base.value * percent.value, scale: base.scale + percent.scale + 2 };
  };
  const tax = percentOf(amount, line.vATPercent);
  const discount = percentOf(amount, line.discountPercent);
  return { itemId: line.itemId, itemCode: field("ItemCode") || field("manufacturerItemCode"),
    itemName: field("ItemName"), unit: field("Unit"),
    quantity: line.quantity,
    unitPrice: line.unitPrice, amount: format(amount), discountPercent: line.discountPercent,
    discountAmount: format(discount),
    vATPercent: line.vATPercent, vATAmount: format(tax), totalAmount: format(adjust(amount, tax, discount)),
    soLuongHopDong: field("SoLuongHopDong"), deliveryQuantity: field("DeliveryQuantity"),
    vATQuantity: line.vATQuantity, dienGiai: line.dienGiai, notes: line.notes };
}

// Exact ErpSalesOrderLineInput keys only; read-only reference and computed columns never become writes.
export function salesOrderLineInput(line: SalesOrderDraftLine): Record<string, string | null> {
  return { itemId: line.itemId.trim(), quantity: line.quantity.trim(), unitPrice: line.unitPrice.trim() || null,
    discountPercent: line.discountPercent.trim() || null, vATPercent: line.vATPercent.trim() || null,
    vATQuantity: line.vATQuantity.trim() || null, dienGiai: line.dienGiai.trim() || null, notes: line.notes.trim() || null };
}
