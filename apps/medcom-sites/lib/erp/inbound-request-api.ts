import {bindItemDisplayContext,type ItemDisplayContext} from "./item-display";
import type {InboundDraftAccess, InboundDraftReadResult, InboundDraftResult} from "./inbound-draft";

// Browser paths deliberately pass through the EXISTING same-origin BFF. Mika
// must admit these four exact paths there; this file does not modify its rules.
export const inboundDraftRoutes = Object.freeze({
  read: "/api/erp/api/inbound-requests/draft",
  save: "/api/erp/api/inbound-requests/draft/save",
  send: "/api/erp/api/inbound-requests/draft/send-to-warehouse",
  reconcile: "/api/erp/api/inbound-requests/draft/reconcile",
});
export const inboundBodyLimit = 1_048_576;
const responseLimit = 2_097_152;
export type InboundReadEnvelope = {
  scopeKey: string | null;
  access: Omit<InboundDraftAccess, "scopeKey">;
  data: InboundDraftReadResult;
  itemDisplayContext: ItemDisplayContext | null;
};
export type InboundCommandEnvelope = {scopeKey: string | null; data: InboundDraftResult};
export type InboundPostRoute = "save" | "send" | "reconcile";
export interface InboundRequestApi {
  read(documentId: string, scopeKey: string | null, signal: AbortSignal): Promise<InboundReadEnvelope>;
  command(route: InboundPostRoute, originalBody: string, scopeKey: string, signal: AbortSignal,
    beforeSend: () => void): Promise<InboundCommandEnvelope>;
}
export class InboundTransportError extends Error {
  constructor(readonly status: number, readonly reason: "http" | "invalid" | "scope" = "http") {
    super("inbound_transport_unavailable");
  }
}
export const isInboundScope = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const isInboundId = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 50 && /^[\x20-\x7e]+$/.test(value) && value.trim().length > 0;
export const inboundOutcomes = Object.freeze(["Observed", "Committed", "Replayed", "InvalidInput", "Denied", "NotFound",
  "Conflict", "Rejected", "UnsupportedCostEdits", "NumberingUnavailable", "Unavailable", "OutcomeUnknown"]);
export function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function invalid(): never { throw new InboundTransportError(502, "invalid"); }
function assertLive(signal: AbortSignal) { signal.throwIfAborted(); }

/** Strict JSON before JSON.parse can collapse duplicate names. No coercion,
 * prototype assignments, lone UTF-16 surrogates, comments, or trailing data. */
export function parseInboundJson(text: string): unknown {
  let offset = 0;
  const space = () => { while (/[\x20\t\r\n]/.test(text[offset] ?? "x")) offset++; };
  const string = (): string => {
    const start = offset++;
    while (offset < text.length) {
      const char = text[offset++];
      if (char === "\\") { offset++; continue; }
      if (char !== '"') continue;
      let value: unknown;
      try { value = JSON.parse(text.slice(start, offset)); } catch { return invalid(); }
      if (typeof value !== "string") return invalid();
      for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff) {
          const next = value.charCodeAt(++i);
          if (!(next >= 0xdc00 && next <= 0xdfff)) return invalid();
        } else if (code >= 0xdc00 && code <= 0xdfff) return invalid();
      }
      return value;
    }
    return invalid();
  };
  const value = (depth: number): void => {
    if (depth > 24) return invalid();
    space();
    if (text[offset] === '"') { string(); return; }
    if (text[offset] === "{" || text[offset] === "[") {
      const object = text[offset++] === "{", end = object ? "}" : "]", names = new Set<string>();
      space();
      if (text[offset] === end) { offset++; return; }
      while (offset < text.length) {
        space();
        if (object) {
          if (text[offset] !== '"') return invalid();
          const name = string();
          if (names.has(name)) return invalid();
          names.add(name); space();
          if (text[offset++] !== ":") return invalid();
        }
        value(depth + 1); space();
        if (text[offset] === end) { offset++; return; }
        if (text[offset++] !== ",") return invalid();
      }
      return invalid();
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(offset));
    if (!token) return invalid();
    offset += token[0].length;
  };
  value(0); space();
  if (offset !== text.length) return invalid();
  try { return JSON.parse(text); } catch { return invalid(); }
}
function outcome(value: unknown): boolean { return typeof value === "string" && inboundOutcomes.includes(value); }
function readEnvelope(value: unknown): InboundReadEnvelope {
  if (!record(value, ["scopeKey", "access", "data"]) || value.scopeKey !== null && !isInboundScope(value.scopeKey)
    || !record(value.access, ["canRead", "canSave", "canSend", "available", "maxCommandBytes"])) return invalid();
  const access = value.access;
  if (!["canRead", "canSave", "canSend", "available"].every(key => typeof access[key] === "boolean")
    || !Number.isSafeInteger(access.maxCommandBytes) || (access.maxCommandBytes as number) < 1
    || (access.maxCommandBytes as number) > inboundBodyLimit
    || (access.canSave || access.canSend) && !access.canRead
    || (access.canRead || access.canSave || access.canSend) && (!access.available || value.scopeKey === null)
    || !(record(value.data, ["outcome", "document"]) || record(value.data, ["outcome", "document", "itemDisplayContext"]))
    || !outcome(value.data.outcome)) return invalid();
  let display: ItemDisplayContext | null = null;
  if (value.data.outcome === "Observed") {
    const document = value.data.document;
    if (!access.canRead || !record(document, ["documentId", "statusId", "header", "details", "costRowCount", "stateEqualityToken", "costEditingSupported"])
      || !isInboundId(document.documentId) || !Number.isInteger(document.statusId)
      || typeof document.stateEqualityToken !== "string" || !/^[A-F0-9]{64}$/.test(document.stateEqualityToken)
      || !Array.isArray(document.details) || document.details.length > 500) return invalid();
    // Validate the supplemental relation without changing the exact editable view.
    if (!record(document.header, ["documentDate", "orderNumber", "invoiceNo", "departurePoint", "destinationPoint", "orderTypeId", "branchId", "objectId", "currencyId", "rateExchange", "notes"])
      || typeof document.header.branchId !== "string"
      || document.details.some(line=>!line || typeof line!=="object" || Array.isArray(line)
        || !isInboundId(line.rowId) || !isInboundId(line.itemId))) return invalid();
    try {
      display=bindItemDisplayContext(value.data.itemDisplayContext,
        {kind:"inbound-requests",documentId:document.documentId,branchId:document.header.branchId,
          stateToken:document.stateEqualityToken,statusId:document.statusId as number,isLocked:null,page:null,pageSize:null},
        document.details.map(line=>({lineId:line.rowId as string,itemId:line.itemId as string})));
    } catch { return invalid(); }
    // No projection/transformation. I18 observedView remains the single complete
    // document schema gate before editing; it rejects missing/extra row/header
    // fields, numeric decimals, invalid SQL times and non-server row identities.
  } else if (value.data.document !== null || value.data.itemDisplayContext != null) return invalid();
  // Keep I18's exact two-field read result compatible. The supplement is a
  // sibling on the decoded read envelope, never passed into its strict editor gate.
  return {scopeKey:value.scopeKey as string|null,access:value.access as InboundReadEnvelope["access"],
    data:{outcome:value.data.outcome,document:value.data.document} as InboundDraftReadResult,itemDisplayContext:display};
}
function commandEnvelope(value: unknown): InboundCommandEnvelope {
  if (!record(value, ["scopeKey", "data"]) || value.scopeKey !== null && !isInboundScope(value.scopeKey)
    || !record(value.data, ["outcome", "receipt", "code"]) || !outcome(value.data.outcome)
    || value.data.code !== null && (typeof value.data.code !== "string" || value.data.code.length > 100)) return invalid();
  return value as unknown as InboundCommandEnvelope;
}

export function createInboundRequestApi(fetcher: typeof fetch = globalThis.fetch): InboundRequestApi {
  async function json(url: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
    assertLive(signal);
    const controller = new AbortController(), abort = () => controller.abort();
    signal.addEventListener("abort", abort, {once: true});
    // A stalled/lost ACK must become reconcilable, not leave I18 pending forever.
    // Timeout is never rollback evidence and never triggers a retry or new key.
    const timeout = setTimeout(abort, 30_000);
    try { return await fetchJson(url, init, controller.signal); }
    finally { clearTimeout(timeout); signal.removeEventListener("abort", abort); }
  }
  async function fetchJson(url: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
    assertLive(signal);
    const response = await fetcher(url, {...init, signal, credentials: "same-origin", cache: "no-store", redirect: "error"});
    assertLive(signal);
    if (!response.ok) throw new InboundTransportError(response.status);
    if (!(response.headers.get("cache-control") ?? "").split(",").some(v => v.trim().toLowerCase() === "no-store")
      || !(response.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return invalid();
    const length = response.headers.get("content-length");
    if (length && (!/^[0-9]+$/.test(length) || Number(length) > responseLimit)) return invalid();
    const reader = response.body?.getReader();
    if (!reader) return invalid();
    const chunks: Uint8Array[] = []; let total = 0;
    try {
      while (true) {
        const next = await reader.read(); assertLive(signal);
        if (next.done) break;
        total += next.value.byteLength;
        if (total > responseLimit) return invalid();
        chunks.push(next.value);
      }
    } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(total); let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
    let text: string;
    try { text = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(bytes); } catch { return invalid(); }
    assertLive(signal);
    return parseInboundJson(text);
  }
  return Object.freeze({
    async read(documentId: string, scopeKey: string | null, signal: AbortSignal) {
      if (!isInboundId(documentId) || scopeKey !== null && !isInboundScope(scopeKey)) return invalid();
      const headers: Record<string, string> = {Accept: "application/json"};
      if (scopeKey !== null) headers["X-Inbound-Scope"] = scopeKey;
      const result = readEnvelope(await json(`${inboundDraftRoutes.read}?${new URLSearchParams({documentId})}`, {headers}, signal));
      if (scopeKey !== null && result.scopeKey !== null && result.scopeKey !== scopeKey)
        throw new InboundTransportError(409, "scope");
      if (result.data.document && result.data.document.documentId !== documentId) return invalid();
      return result;
    },
    async command(route: InboundPostRoute, originalBody: string, scopeKey: string, signal: AbortSignal, beforeSend: () => void) {
      if (!["save", "send", "reconcile"].includes(route) || !isInboundScope(scopeKey)
        || new TextEncoder().encode(originalBody).byteLength > inboundBodyLimit) return invalid();
      // No automatic CSRF refresh/retry after a POST or a lost response.
      const csrf = await json("/api/erp/api/auth/csrf", {headers: {Accept: "application/json"}}, signal);
      if (!record(csrf, ["token"]) || typeof csrf.token !== "string" || !/^[\x21-\x7e]{1,8192}$/.test(csrf.token)) return invalid();
      assertLive(signal); beforeSend(); assertLive(signal);
      const result = commandEnvelope(await json(inboundDraftRoutes[route], {method: "POST", headers: {
        Accept: "application/json", "Content-Type": "application/json; charset=utf-8", "X-CSRF-TOKEN": csrf.token,
        "X-Inbound-Scope": scopeKey,
      }, body: originalBody}, signal));
      if (result.scopeKey !== scopeKey) throw new InboundTransportError(409, "scope");
      return result;
    },
  });
}
