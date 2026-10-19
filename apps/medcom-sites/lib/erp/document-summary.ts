// Đọc `data.summary` của chi tiết chứng từ (bàn giao BE 19/10/2026).
// Số thập phân do BE trả dạng chuỗi để giữ độ chính xác; không chuyển qua Number.
// Tổng lấy toàn bộ dòng của chứng từ đang được xem, không phụ thuộc trang.
import { formatMoney } from "./money";

export interface SummaryEntry {
  key: string;
  label: string;
  display: string;
  /** `display` lấy từ trường `...Display` của BE (đã kèm tiền tệ) hay do FE định dạng. */
  fromServer: boolean;
  money: boolean;
}

export interface DocumentSummaryView {
  rowCount: number | null;
  entries: SummaryEntry[];
  /** `totalAmount` nếu có, ngược lại `amount`; null khi chứng từ không có tổng tiền. */
  total: SummaryEntry | null;
}

const DECIMAL = /^-?\d+(?:\.\d+)?$/;

// Thứ tự hiển thị theo nhóm số liệu ERP. `amount` đứng sau công/vật tư vì với
// phiếu sửa chữa thì amount là tổng của hai khoản đó.
const FIELDS: ReadonlyArray<{ key: string; label: string; money: boolean }> = [
  { key: "quantity", label: "Tổng số lượng", money: false },
  { key: "laborAmount", label: "Tiền công", money: true },
  { key: "partsAmount", label: "Tiền vật tư", money: true },
  { key: "amount", label: "Số tiền", money: true },
  { key: "vATAmount", label: "Tiền thuế", money: true },
  { key: "totalAmount", label: "Tổng tiền", money: true },
];

function decimal(value: unknown): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return DECIMAL.test(trimmed) ? trimmed : null;
}

function serverText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Trả null khi không có tổng nào đọc được để giao diện dùng cách tính tại chỗ. */
export function readDocumentSummary(summary: unknown): DocumentSummaryView | null {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return null;
  const source = summary as Record<string, unknown>;
  const rowCount =
    typeof source.rowCount === "number" && Number.isSafeInteger(source.rowCount) && source.rowCount >= 0
      ? source.rowCount
      : null;
  const entries: SummaryEntry[] = [];
  for (const field of FIELDS) {
    const raw = decimal(source[field.key]);
    if (raw === null) continue;
    const fromServer = serverText(source[`${field.key}Display`]);
    entries.push({
      key: field.key,
      label: field.label,
      money: field.money,
      fromServer: fromServer !== null,
      display: fromServer ?? formatMoney(raw),
    });
  }
  if (rowCount === null && entries.length === 0) return null;
  const total =
    entries.find((entry) => entry.key === "totalAmount") ??
    entries.find((entry) => entry.key === "amount") ??
    null;
  // Tổng đã hiển thị riêng ở dòng "Tổng cộng"; không lặp lại trong lưới số liệu.
  return { rowCount, entries: entries.filter((entry) => entry.key !== total?.key), total };
}

/** Nối tiền tệ chứng từ vào số do FE định dạng; số của BE đã kèm tiền tệ. */
export function summaryDisplay(entry: SummaryEntry, currencyId?: string | null): string {
  if (entry.fromServer || !entry.money || !currencyId) return entry.display;
  return `${entry.display} ${currencyId}`;
}
