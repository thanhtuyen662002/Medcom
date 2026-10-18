/** Vietnamese money presentation. Decimal strings never pass through Number. */
export function formatMoney(value: unknown, empty = "—"): string {
  if (value == null || value === "") return empty;
  const raw = typeof value === "number" ? expandNumber(value) : String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return raw;
  const integer = match[2].replace(/^0+(?=\d)/, "");
  const fraction = (match[3] || "").replace(/0+$/, "");
  const sign = match[1] === "-" && /[1-9]/.test(integer + fraction) ? "-" : "";
  return sign + integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (fraction ? "," + fraction : "");
}

function expandNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const raw = String(value);
  if (!/[eE]/.test(raw)) return raw;
  const [coefficient, exponent] = raw.toLowerCase().split("e");
  const negative = coefficient.startsWith("-");
  const unsigned = coefficient.replace(/^-/, ""), [integer, fraction = ""] = unsigned.split(".");
  const digits = integer + fraction, position = integer.length + Number(exponent);
  const expanded = position <= 0 ? "0." + "0".repeat(-position) + digits
    : position >= digits.length ? digits + "0".repeat(position - digits.length) : digits.slice(0, position) + "." + digits.slice(position);
  return (negative ? "-" : "") + expanded;
}

const moneyFields = new Set([
  "price", "unitprice", "unitpricev", "amount", "amountlc", "totalamount", "totalprice", "sourceamount",
  "discountamount", "discountamount2", "discountamounttt", "vatamount", "vatvalue", "basetotal", "budget",
  "depositamount", "partsamount", "serviceamount", "customsvalue", "customsgoodsvalue", "importvatbase",
  "importamount", "importamount2", "gtgtamount", "purchasecost", "precustomsfeelc", "warehousefeelc", "phikhac",
]);
export function isMoneyField(field: string): boolean {
  const key = field.split(".").at(-1)!.replace(/Display$/, "").toLowerCase();
  return moneyFields.has(key);
}

/** Input accepts invariant decimals or pasted Vietnamese grouping. Incomplete
 * decimal text stays a draft; callers retain their existing validation rules. */
export function moneyInputToRaw(input: string): string | null {
  const value = input.replace(/\s/g, "");
  if (!value || value === "-") return value;
  if (value.includes(",")) {
    if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d*$/.test(value)) return null;
    return value.replaceAll(".", "").replace(",", ".");
  }
  if ((value.match(/\./g) || []).length > 1) return /^-?\d{1,3}(?:\.\d{3})+$/.test(value) ? value.replaceAll(".", "") : null;
  return /^-?\d*(?:\.\d*)?$/.test(value) ? value : null;
}

/** A copied display such as 1.234 means 1234 in the Vietnamese UI. */
export function moneyPasteToRaw(input: string): string | null {
  const value = input.replace(/\s/g, "");
  return /^-?\d{1,3}(?:\.\d{3})+$/.test(value) ? value.replaceAll(".", "") : moneyInputToRaw(value);
}

type Decimal = { value: bigint; scale: number };
function decimal(value: unknown): Decimal | null {
  if (typeof value !== "string" || value.length > 128 || !/^-?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const [integer, fraction = ""] = value.trim().split(".");
  return {value: BigInt(integer + fraction), scale: fraction.length};
}
function decimalText(value: Decimal): string {
  const negative = value.value < BigInt(0), digits = (negative ? -value.value : value.value).toString().padStart(value.scale + 1, "0");
  const raw = value.scale ? `${digits.slice(0, -value.scale)}.${digits.slice(-value.scale)}`.replace(/\.?0+$/, "") : digits;
  return (negative ? "-" : "") + raw;
}
export function multiplyMoney(left: string, right: string): string | null {
  const a = decimal(left), b = decimal(right);
  return a && b ? decimalText({value: a.value * b.value, scale: a.scale + b.scale}) : null;
}
export function sumMoney(values: Iterable<string | null>): string | null {
  let total: Decimal = {value:BigInt(0),scale:0};
  let found = false;
  for (const text of values) {
    const next = decimal(text);
    if (!next) continue;
    found = true;
    const scale = Math.max(total.scale, next.scale);
    total = {value: total.value * BigInt(10) ** BigInt(scale - total.scale) + next.value * BigInt(10) ** BigInt(scale - next.scale), scale};
  }
  return found ? decimalText(total) : null;
}
