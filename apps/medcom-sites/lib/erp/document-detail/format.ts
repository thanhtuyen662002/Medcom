import { documentStatusLabel } from "../document-status";
import { formatMoney, multiplyMoney, sumMoney } from "../money";
import type { DetailRow } from "./model";
import type { DocumentDetailConfig, FieldFormat } from "./types";

export const EMPTY_VALUE = "—";

export function calculateDetailMoney(
  fields: Readonly<Record<string, unknown>>,
  calculation: { quantityKey: string; priceKey: string },
): string | null {
  return multiplyMoney(String(fields[calculation.quantityKey] ?? ""), String(fields[calculation.priceKey] ?? ""));
}

/** 536701c sumLineTotals: nullish server precedence, then a decimal product.
 * An invalid/empty supplied amount does not silently become a calculated amount. */
export function sumDetailLineTotals(
  rows: readonly DetailRow[],
  total: NonNullable<DocumentDetailConfig["lines"]["footerTotal"]>,
): string | null {
  const keys = [...(total.sumKey ? [total.sumKey] : []), ...(total.fallbackSumKeys ?? [])];
  return sumMoney(rows.map(({ fields }) => {
    const server = keys.map(key => fields[key]).find(value => value != null);
    return server != null ? String(server) : total.fallback ? calculateDetailMoney(fields, total.fallback) : null;
  }));
}

export function isEmptyDetailValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

export function formatBoolean(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
  if (normalized === true || normalized === 1 || normalized === "1" || normalized === "true") return "Có";
  if (normalized === false || normalized === 0 || normalized === "0" || normalized === "false") return "Không";
  return EMPTY_VALUE;
}

function formatDateValue(value: unknown, includeTime: boolean): string {
  if (isEmptyDetailValue(value)) return EMPTY_VALUE;
  if (typeof value !== "string") return String(value);
  // Preserve the prefix parsing and midnight behavior of tab-erp-screen.tsx:254–261.
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return String(value);
  const [, y, m, d, hh, mm, ss] = match;
  if (includeTime && hh && mm && !(hh === "00" && mm === "00" && (!ss || ss === "00")))
    return `${d}/${m}/${y} ${hh}:${mm}`;
  return `${d}/${m}/${y}`;
}

export function formatDate(value: unknown): string {
  return formatDateValue(value, false);
}

export function formatDateTime(value: unknown): string {
  return formatDateValue(value, true);
}

export function formatNumber(value: unknown): string {
  if (isEmptyDetailValue(value)) return EMPTY_VALUE;
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat("vi-VN").format(num);
}

export function formatDetailValue(
  value: unknown,
  format?: FieldFormat,
  options?: { statusName?: unknown },
): string {
  if (isEmptyDetailValue(value) || typeof value === "object") return EMPTY_VALUE;
  switch (format) {
    case "money":
      return formatMoney(value);
    case "status":
      return documentStatusLabel(
        typeof value === "number" ? value : null,
        typeof options?.statusName === "string" ? options.statusName : undefined,
      );
    case "boolean":
      return formatBoolean(value);
    case "date":
      return formatDate(value);
    case "datetime":
      return formatDateTime(value);
    case "number":
      return formatNumber(value);
    default:
      return String(value);
  }
}

export function isHttpUrl(value: unknown): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}
