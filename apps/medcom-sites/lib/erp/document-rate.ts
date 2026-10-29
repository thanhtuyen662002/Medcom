/** CF_Document_ExchangeRateValidationFnc (ERP 29/10): a saved PO rate is positive, and VND is exactly 1. */
export function validDocumentRate(currency: unknown, rate: unknown): boolean {
  const value = typeof rate === "number" ? rate : typeof rate === "string" && rate.trim() !== "" ? Number(rate.trim()) : NaN;
  if (!Number.isFinite(value) || value <= 0) return false;
  return String(currency ?? "").trim().toUpperCase() !== "VND" || value === 1;
}
