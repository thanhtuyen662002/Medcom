import type {InboundDraftAccess, InboundDraftAdapter, InboundDraftCommand, InboundDraftReceipt, InboundDraftResult} from "./inbound-draft";
import {inboundBodyLimit, isInboundScope, record, InboundTransportError, type InboundRequestApi, type InboundReadEnvelope} from "./inbound-request-api";

const receiptFields: readonly (keyof InboundDraftReceipt)[] = ["operationId", "documentId", "statusId", "stateEqualityToken", "auditId", "committedAtUtc"];
const unknown = (): InboundDraftResult => ({outcome: "OutcomeUnknown", receipt: null, code: null});
const closed = (scopeKey: string | null): InboundDraftAccess =>
  ({scopeKey, canRead: false, canSave: false, canSend: false, available: false, maxCommandBytes: inboundBodyLimit});
type Intent = {original: InboundDraftCommand; body: string; scope: string; status: number | null; confirmed: boolean; candidate?: InboundDraftReceipt; candidateEpoch?: number};
export type InboundBridgeState = Readonly<{
  access: InboundDraftAccess; needsRefresh: boolean; unresolved: boolean;
  phase: "idle" | "pending" | "unknown" | "reconciling";
  receipt: InboundDraftReceipt | null;
}>;
export interface InboundRequestBridge {
  adapter: InboundDraftAdapter;
  subscribe(listener: () => void): () => void;
  getSnapshot(): InboundBridgeState;
  configure(contextKey: string | null, api: InboundRequestApi): void;
  select(documentId: string | null): void;
  revalidate(signal: AbortSignal): Promise<void>;
  hasUnresolved(): boolean;
  acknowledge(receipt: InboundDraftReceipt): void;
  dispose(): void;
}
function receiptResult(value: unknown, intent: Intent): InboundDraftResult | null {
  if (!record(value, ["outcome", "receipt", "code"]) || !["Committed", "Replayed"].includes(value.outcome as string)
    || value.code !== null && (typeof value.code !== "string" || value.code.length > 100)
    || !record(value.receipt, receiptFields)) return null;
  const r = value.receipt, command = intent.original;
  const guid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v)
    && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(v);
  if (r.operationId !== command.operationId || r.documentId !== command.documentId || !guid(r.operationId) || !guid(r.auditId)
    || (command.action === "SendToWarehouse" ? r.statusId !== 2 : intent.status === null ? ![0, 1].includes(r.statusId as number) : r.statusId !== intent.status)
    || typeof r.stateEqualityToken !== "string" || !/^[A-F0-9]{64}$/.test(r.stateEqualityToken)
    || typeof r.committedAtUtc !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(r.committedAtUtc)
    || !Number.isFinite(Date.parse(r.committedAtUtc))) return null;
  return {...value, receipt: Object.freeze({...r})} as unknown as InboundDraftResult;
}

/** One controller per REAL login incarnation. Rights, document, workspace-null
 * and transport changes fence requests but never replace this intent store.
 * No localStorage/sessionStorage, automatic retry, or caller-supplied identity. */
export function createInboundRequestBridge(initialApi: InboundRequestApi): InboundRequestBridge {
  let api = initialApi, context: string | null = null, selected: string | null = null, epoch = 0, disposed = false;
  let scope: string | null = null, busy: object | null = null;
  let state: InboundBridgeState = {access: closed(null), needsRefresh: true, unresolved: false, phase: "idle", receipt: null};
  const listeners = new Set<() => void>(), requests = new Set<AbortController>(), intents = new Map<string, Intent>();
  const views = new Map<string, {token: string; status: number}>();
  let readSequence = 0;
  const currentRead = new Map<string, number>();
  const hasUnresolved = () => [...intents.values()].some(intent => !intent.confirmed);
  function emit(next: InboundBridgeState) {
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = Object.freeze({...next, access: Object.freeze({...next.access})});
    for (const listener of listeners) listener();
  }
  function fence() {
    epoch++; for (const request of requests) request.abort(); requests.clear(); busy = null; views.clear(); currentRead.clear();
    emit({...state, access: closed(scope), needsRefresh: true, unresolved: hasUnresolved(), phase: hasUnresolved() ? "unknown" : "idle"});
  }
  function start(external: AbortSignal) {
    external.throwIfAborted();
    if (disposed || context === null) throw new Error("inbound_context_unavailable");
    const controller = new AbortController(), sequence = epoch;
    const abort = () => controller.abort(); external.addEventListener("abort", abort, {once: true});
    requests.add(controller);
    return {signal: controller.signal, current: () => !disposed && context !== null && sequence === epoch && !controller.signal.aborted,
      assert() { if (!this.current()) throw new Error("inbound_context_retired"); },
      finish() { requests.delete(controller); external.removeEventListener("abort", abort); }};
  }
  function accessFrom(envelope: InboundReadEnvelope, documentId: string) {
    if (envelope.scopeKey !== null) {
      if (!isInboundScope(envelope.scopeKey) || scope !== null && scope !== envelope.scopeKey) throw new Error("inbound_scope_changed");
      scope = envelope.scopeKey;
    }
    const access = envelope.scopeKey === null ? closed(scope) : {...envelope.access, scopeKey: scope};
    if (documentId === selected) emit({...state, access, needsRefresh: !access.available || !access.canRead});
    if (envelope.data.outcome === "Observed" && envelope.data.document) {
      views.set(documentId, {token: envelope.data.document.stateEqualityToken, status: envelope.data.document.statusId});
    }
  }
  async function read(documentId: string, external: AbortSignal, bootstrap = false) {
    if (!bootstrap && (state.needsRefresh || !state.access.canRead || !state.access.available)) throw new Error("inbound_access_unavailable");
    const request = start(external), transport = api, sequence = ++readSequence;
    currentRead.set(documentId, sequence);
    try {
      const envelope = await transport.read(documentId, scope, request.signal); request.assert();
      if (currentRead.get(documentId) !== sequence) throw new Error("inbound_read_superseded");
      accessFrom(envelope, documentId);
      return envelope.data; // exact full DTO; I18 performs its unchanged validation
    } catch (error) {
      // A failed readback must not erase a previously acknowledged receipt or
      // the I18 barrier. Ordinary read errors are surfaced to I18, not commits.
      if ((bootstrap || error instanceof InboundTransportError && [401, 403, 409].includes(error.status)) && request.current() && currentRead.get(documentId) === sequence) emit({...state, access: closed(scope), needsRefresh: true});
      throw error;
    } finally { request.finish(); }
  }
  async function perform(intent: Intent, reconcile: boolean, external: AbortSignal): Promise<InboundDraftResult> {
    if (busy || intent.confirmed || state.needsRefresh || !state.access.canRead || !state.access.available
      || scope !== intent.scope) return unknown();
    let request: ReturnType<typeof start>;
    try { request = start(external); } catch { emit({...state, unresolved: true, phase: "unknown"}); return unknown(); }
    const latch = {}, transport = api;
    busy = latch;
    emit({...state, unresolved: true, phase: reconcile ? "reconciling" : "pending"});
    try {
      const envelope = await transport.command(reconcile ? "reconcile" : intent.original.action === "Save" ? "save" : "send",
        intent.body, intent.scope, request.signal, () => {
          request.assert();
          if (state.needsRefresh || scope !== intent.scope || !state.access.canRead || !state.access.available
            || !reconcile && (intent.original.action === "Save" ? !state.access.canSave : !state.access.canSend))
            throw new Error("inbound_authority_unavailable");
        });
      request.assert();
      if (envelope.scopeKey !== intent.scope) throw new InboundTransportError(409, "scope");
      const result = receiptResult(envelope.data, intent);
      if (!result?.receipt) return unknown(); // EVERY no-receipt outcome keeps original custody
      // Do not release custody merely because this transport-level check passed.
      // Unchanged I18 commandResult is the final receipt validator and invokes
      // acknowledge through its onConfirmed callback. A late/invalid receipt
      // rejected by I18 must still be reconcilable with the same original bytes.
      intent.candidate = result.receipt; intent.candidateEpoch = epoch;
      return result;
    } catch (error) {
      if (request.current() && error instanceof InboundTransportError && [401, 403, 409].includes(error.status))
        emit({...state, access: closed(scope), needsRefresh: true});
      return unknown();
    }
    finally {
      request.finish();
      if (busy === latch) {
        busy = null;
        if (!intent.confirmed) emit({...state, unresolved: true, phase: "unknown"});
      }
    }
  }
  const adapter: InboundDraftAdapter = Object.freeze({
    read: (documentId: string, signal: AbortSignal) => read(documentId, signal),
    async execute(original: InboundDraftCommand, signal: AbortSignal) {
      // No second execute, including the same object, key or double tap. A
      // different object/key cannot replace an unresolved original either.
      if (intents.has(original.operationId) || hasUnresolved() || original.action === "Create") return unknown();
      if (!scope || !["Save", "SendToWarehouse"].includes(original.action)) return unknown();
      const before = original.documentId === null ? undefined : views.get(original.documentId);
      const body = JSON.stringify(original); // ONCE, before CSRF/network await
      const intent: Intent = {original, body, scope, status: before?.token === original.expectedStateEqualityToken ? before.status : null, confirmed: false};
      intents.set(original.operationId, intent);
      emit({...state, unresolved: true, phase: "unknown"});
      // Register even a command racing a lost authority/read proof, so I18 can
      // retain/reconcile it. Missing proof NEVER grants an execute opportunity.
      if (state.needsRefresh || !state.access.canRead || !state.access.available
        || (original.action === "Save" ? !state.access.canSave : !state.access.canSend)
        || !before || ![0, 1].includes(before.status) || before.token !== original.expectedStateEqualityToken
        || original.documentId !== selected || new TextEncoder().encode(body).byteLength > state.access.maxCommandBytes) return unknown();
      // A local preflight failure also stays conservative. Only reconcile can
      // resolve it; never invent proof of non-dispatch or a replacement key.
      return perform(intent, false, signal);
    },
    async reconcile(original: InboundDraftCommand, signal: AbortSignal) {
      const intent = intents.get(original.operationId);
      if (!intent || intent.original !== original) return unknown();
      // Use the stored body; DO NOT stringify the current editor or this object.
      return perform(intent, true, signal);
    },
  });
  return {
    adapter,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    hasUnresolved,
    acknowledge(receipt) {
      const intent = intents.get(receipt.operationId);
      if (disposed || context === null || !intent?.candidate || intent.candidateEpoch !== epoch || !record(receipt, receiptFields)
        || receiptFields.some(field => intent.candidate![field] !== receipt[field])) return;
      intent.confirmed = true;
      emit({...state, unresolved: hasUnresolved(), phase: "idle", receipt: Object.freeze({...receipt})});
    },
    configure(nextContext, nextApi) {
      if (disposed || context === nextContext && api === nextApi) return;
      context = nextContext; api = nextApi; fence();
    },
    select(documentId) {
      if (selected === documentId) return;
      if (hasUnresolved()) throw new Error("inbound_original_unresolved");
      selected = documentId; fence();
    },
    async revalidate(signal) {
      if (selected === null) return;
      await read(selected, signal, true);
    },
    dispose() {
      // Only real login retirement/unmount; never call for workspace=null.
      disposed = true; fence(); intents.clear(); scope = null;
      state = {...state, access: closed(null), receipt: null, unresolved: false}; listeners.clear();
    },
  };
}
