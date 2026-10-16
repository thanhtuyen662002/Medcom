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
  { key: "unit2", label: "ĐVT2" },
  { key: "unitFactor", label: "Hệ số ĐVT", numeric: true },
  { key: "quantity2", label: "Số lượng 2", numeric: true },
  { key: "unitPrice", label: "Đơn giá", numeric: true, editable: true },
  { key: "amount", label: "Số tiền", numeric: true },
  { key: "discountPercent", label: "% Chiết khấu", numeric: true, editable: true },
  { key: "discountAmount", label: "Tiền CK", numeric: true },
  { key: "vATPercent", label: "% Thuế", numeric: true, editable: true },
  { key: "vATAmount", label: "Tiền thuế", numeric: true },
  { key: "totalAmount", label: "Tổng tiền", numeric: true },
  { key: "soLuongHopDong", label: "Tổng số lượng HĐ", numeric: true },
  { key: "deliveryQuantity", label: "Đã XUẤT hàng", numeric: true },
  { key: "vATQuantity", label: "Số lượng VAT", numeric: true, editable: true },
  { key: "dienGiai", label: "Diễn giải", editable: true },
  { key: "notes", label: "Ghi chú", editable: true },
] satisfies Array<{ key: string; label: string; numeric?: boolean; editable?: boolean }>;

export const SALES_ORDER_LINE_GROUPS = [
  { label: "Thông tin hàng", keys: ["itemId", "itemCode", "unitFactor", "unit", "unit2"], fullWidth: ["itemId"] },
  { label: "Số lượng", keys: ["quantity", "quantity2", "soLuongHopDong", "deliveryQuantity", "vATQuantity"], fullWidth: ["vATQuantity"] },
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
function add(a: Decimal | null, b: Decimal | null): Decimal | null {
  if (!a || !b) return null;
  const scale = Math.max(a.scale, b.scale);
  return { value: a.value * BigInt(10) ** BigInt(scale - a.scale) + b.value * BigInt(10) ** BigInt(scale - b.scale), scale };
}

export function salesOrderLineDisplay(line: SalesOrderDraftLine): Record<string, string> {
  const field = (column: string) => salesOrderField(line.choice, column);
  const amount = multiply(decimal(line.quantity), decimal(line.unitPrice));
  const taxProduct = multiply(amount, decimal(line.vATPercent));
  const tax = taxProduct ? { ...taxProduct, scale: taxProduct.scale + 2 } : null;
  // Same preview expressions as SqlErpScreenEffects.Calculate, sales-orders branch.
  // No client rounding and no invented discount expression; the server confirms saved amounts.
  return { itemId: line.itemId, itemCode: field("ItemCode") || field("manufacturerItemCode"),
    itemName: field("ItemName"), unit: field("Unit"), unit2: field("Unit2"), unitFactor: field("UnitFactor"),
    quantity: line.quantity, quantity2: format(multiply(decimal(line.quantity), decimal(field("UnitFactor")))),
    unitPrice: line.unitPrice, amount: format(amount), discountPercent: line.discountPercent,
    discountAmount: line.discountPercent === field("DiscountPercent") ? field("DiscountAmount") : "",
    vATPercent: line.vATPercent, vATAmount: format(tax), totalAmount: format(add(amount, tax)),
    soLuongHopDong: field("SoLuongHopDong"), deliveryQuantity: field("DeliveryQuantity"),
    vATQuantity: line.vATQuantity, dienGiai: line.dienGiai, notes: line.notes };
}

// Exact ErpSalesOrderLineInput keys only; read-only reference and computed columns never become writes.
export function salesOrderLineInput(line: SalesOrderDraftLine): Record<string, string | null> {
  return { itemId: line.itemId.trim(), quantity: line.quantity.trim(), unitPrice: line.unitPrice.trim() || null,
    discountPercent: line.discountPercent.trim() || null, vATPercent: line.vATPercent.trim() || null,
    vATQuantity: line.vATQuantity.trim() || null, dienGiai: line.dienGiai.trim() || null, notes: line.notes.trim() || null };
}
