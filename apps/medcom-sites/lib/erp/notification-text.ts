import { formatMoney } from "./money";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ERP message rows sometimes carry an internal GUID where a document number belongs. */
export function isGuid(value: string): boolean {
  return GUID.test(value.trim());
}

/** ERP message text writes raw decimals ("1200000.00 VND"); show them as money. */
export function readableNotificationText(text: string): string {
  return text.replace(/\b(\d{4,}(?:\.\d+)?)\s?(VND|USD|EUR)\b/g, (_match, amount: string, currency: string) => `${formatMoney(amount)} ${currency}`);
}
