/**
 * Nhật ký thao tác web — browser side.
 *
 * Records what the signed-in user does on screen (screen changes, button/menu clicks,
 * opened documents, print, paste, branch changes, script errors) and sends it in
 * small batches to POST /api/audit/events. The server stamps the user, session, IP
 * and time; nothing here can claim another identity.
 *
 * Never sent: typed field values, passwords, clipboard contents. Saved data is
 * recorded by the server from the actual ERP command it receives.
 */

export type AuditEventType =
  | "navigate" | "click" | "open" | "close" | "print" | "paste" | "change-branch" | "error" | "logout";

export interface AuditContext { page?: string; module?: string; documentId?: string; branchId?: string }

interface AuditEvent extends AuditContext {
  id: string;
  at: string;
  type: AuditEventType;
  target?: string;
  detail?: Record<string, string | number | boolean | null>;
}

const ENDPOINT = "/api/erp/api/audit/events";
const FLUSH_MS = 5000;
const BATCH = 50;
const QUEUE_LIMIT = 500;
const ERROR_LIMIT = 20;
const CLICKABLE = "button,a[href],[role=button],[role=menuitem],[role=menuitemcheckbox],[role=tab],[role=option],[role=switch],[role=checkbox],[role=radio],summary,input[type=checkbox],input[type=radio],input[type=submit],input[type=button],select";

export function auditText(value: string | null | undefined, max = 120): string | undefined {
  if (!value) return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Accessible name of the element the user clicked, without reading typed values. */
export function auditLabel(element: Element): string | undefined {
  const explicit = element.getAttribute("data-audit-label") ?? element.getAttribute("aria-label");
  if (explicit) return auditText(explicit);
  if (element instanceof HTMLInputElement) {
    const label = element.labels?.[0]?.textContent ?? element.getAttribute("name") ?? element.type;
    return auditText(`${label}${element.type === "checkbox" || element.type === "radio" ? element.checked ? " (bật)" : " (tắt)" : ""}`);
  }
  if (element instanceof HTMLSelectElement) return auditText(element.labels?.[0]?.textContent ?? element.getAttribute("name") ?? "Chọn");
  return auditText(element.textContent) ?? auditText(element.getAttribute("title")) ?? auditText(element.getAttribute("data-tab"));
}

function dialogName(element: Element): string | undefined {
  const dialog = element.closest("[role=dialog],[role=alertdialog]");
  if (!dialog) return undefined;
  const labelled = dialog.getAttribute("aria-labelledby");
  const title = labelled ? document.getElementById(labelled)?.textContent : dialog.getAttribute("aria-label");
  return auditText(title ?? dialog.querySelector("h1,h2,h3")?.textContent, 120);
}

export class AuditTracker {
  private queue: AuditEvent[] = [];
  private context: AuditContext = {};
  // Open document per screen; events on a screen carry the document shown there.
  private readonly documents = new Map<string, string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private csrf: string | null = null;
  private sending: Promise<void> | null = null;
  private errors = 0;
  private active = false;
  private readonly cleanup: (() => void)[] = [];

  constructor(private readonly transport: typeof fetch = (...args) => fetch(...args)) {}

  get running() { return this.active; }
  get pending() { return this.queue.length; }

  start() {
    // Real browsers only (server rendering and test renderers have no event targets).
    if (this.active || typeof window === "undefined" || typeof document === "undefined"
      || typeof window.addEventListener !== "function" || typeof document.addEventListener !== "function") return;
    this.active = true;
    this.errors = 0;
    const on = <K extends keyof WindowEventMap>(target: Window | Document, name: K | string, handler: (event: Event) => void, capture = false) => {
      target.addEventListener(name, handler, capture);
      this.cleanup.push(() => target.removeEventListener(name, handler, capture));
    };
    on(document, "click", event => this.onClick(event), true);
    on(document, "paste", event => this.onPaste(event as ClipboardEvent), true);
    on(window, "beforeprint", () => this.track("print"));
    on(window, "error", event => this.onError((event as ErrorEvent).message, (event as ErrorEvent).filename));
    on(window, "unhandledrejection", event => {
      const reason = (event as PromiseRejectionEvent).reason;
      this.onError(reason instanceof Error ? reason.message : String(reason ?? ""), undefined);
    });
    on(document, "visibilitychange", () => { if (document.visibilityState === "hidden") void this.flush(true); });
    on(window, "pagehide", () => void this.flush(true));
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
  }

  /** Sends what is queued, then stops listening (sign-out or session end). */
  async stop(flush = true) {
    if (!this.active) return;
    this.active = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const remove of this.cleanup.splice(0)) remove();
    if (flush) await this.flush(true);
    this.queue = [];
    this.csrf = null;
    this.context = {};
    this.documents.clear();
  }

  setDocument(module: string, documentId: string | undefined) {
    if (documentId) this.documents.set(module, documentId); else this.documents.delete(module);
  }

  setContext(next: AuditContext) {
    this.context = { ...this.context, ...next };
    for (const key of Object.keys(next) as (keyof AuditContext)[]) if (next[key] === undefined) delete this.context[key];
  }

  track(type: AuditEventType, fields: Omit<Partial<AuditEvent>, "id" | "at" | "type"> = {}) {
    if (!this.active) return;
    const documentId = this.context.module ? this.documents.get(this.context.module) : undefined;
    const event: AuditEvent = { id: newId(), at: new Date().toISOString(), type, ...this.context, documentId, ...fields };
    for (const key of Object.keys(event) as (keyof AuditEvent)[]) if (event[key] === undefined) delete event[key];
    this.queue.push(event);
    if (this.queue.length > QUEUE_LIMIT) this.queue.splice(0, this.queue.length - QUEUE_LIMIT);
    if (this.queue.length >= BATCH) void this.flush();
  }

  async flush(keepalive = false): Promise<void> {
    if (this.sending) { await this.sending; if (!keepalive) return; }
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, BATCH);
    let delivered = false;
    const send = this.send(batch, keepalive).then(done => {
      delivered = done;
      if (!done) this.queue.unshift(...batch.slice(0, Math.max(0, QUEUE_LIMIT - this.queue.length)));
    }).finally(() => { this.sending = null; });
    this.sending = send;
    await send;
    // Page is closing: send the rest now, but stop at the first failure (retried later).
    if (keepalive && delivered && this.queue.length > 0) await this.flush(true);
  }

  private async send(events: AuditEvent[], keepalive: boolean): Promise<boolean> {
    try {
      const token = this.csrf ?? await this.token();
      if (!token) return false;
      const response = await this.transport(ENDPOINT, {
        method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", keepalive,
        headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json", "X-CSRF-TOKEN": token },
        body: JSON.stringify({ sentAt: new Date().toISOString(), events }),
      });
      if (response.ok) return true;
      if (response.status === 403) this.csrf = null; // token rotated: fetch a fresh one next time
      // true = finished with these events. Retry on 403/429/5xx; drop on 401 (signed out) or 400 (invalid).
      return !(response.status === 403 || response.status === 429 || response.status >= 500);
    } catch {
      return false;
    }
  }

  private async token(): Promise<string | null> {
    try {
      const response = await this.transport("/api/erp/api/auth/csrf", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) return null;
      const body = await response.json() as { token?: unknown };
      this.csrf = typeof body.token === "string" && body.token.length > 0 ? body.token : null;
      return this.csrf;
    } catch {
      return null;
    }
  }

  private onClick(event: Event) {
    const source = event.target instanceof Element ? event.target : null;
    const element = source?.closest(CLICKABLE);
    if (!element || element.closest("[data-audit=off]")) return;
    const detail: AuditEvent["detail"] = {};
    const dialog = dialogName(element);
    if (dialog) detail.dialog = dialog;
    const tab = element.getAttribute("data-tab");
    if (tab) detail.tab = tab;
    if (element instanceof HTMLAnchorElement && element.href) detail.href = auditText(element.getAttribute("href"), 200) ?? null;
    if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") detail.disabled = true;
    this.track("click", { target: auditLabel(element) ?? element.tagName.toLowerCase(), detail: Object.keys(detail).length ? detail : undefined });
  }

  private onPaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    const field = event.target instanceof Element ? event.target.closest("input,textarea,[contenteditable],[role=grid],table") : null;
    const label = field ? (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
      ? auditText(field.labels?.[0]?.textContent ?? field.getAttribute("aria-label") ?? field.getAttribute("placeholder") ?? field.getAttribute("name"))
      : auditText(field.getAttribute("aria-label"))) : undefined;
    // Size only: pasted rows that are actually used reach the server and are recorded there.
    this.track("paste", { target: label, detail: { characters: text.length, lines: text ? text.split(/\r?\n/).filter(Boolean).length : 0 } });
  }

  private onError(message: string, file: string | undefined) {
    if (this.errors >= ERROR_LIMIT) return;
    this.errors++;
    this.track("error", { target: auditText(message, 300), detail: file ? { file: auditText(file.split("/").pop() ?? file, 120) ?? null } : undefined });
  }
}

export const auditTracker = new AuditTracker();
