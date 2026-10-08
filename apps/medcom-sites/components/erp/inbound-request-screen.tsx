"use client";
import {RequestDetailDialog,useRequestDetailNavigation,useDetailPresentationProof,type RegisterRequestDetailNavigation} from "./request-detail-dialog";
import {useListControls} from "./list-view-state";
import {RequestListComposition,RequestListPanel,RequestListContent,RequestListHeader,RequestSearch,RequestBranch,RequestListTable,RequestListToolbar,RequestPagination} from "./request-list-shell";
import {RequestButton,RequestNotice,RequestEmpty,RequestLoading,RequestStatus,requestDate,requestStyles} from "./request-presentation";
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore} from "react";
import {ApiError, getDocuments, type ReadScope} from "@/lib/erp/api";
import type {DocumentPage, WorkspaceData} from "@/lib/erp/contracts";
import {observedView, snapshotAcknowledges, type InboundDraftAccess, type InboundDraftAdapter, type InboundDraftReceipt} from "@/lib/erp/inbound-draft";
import {createInboundRequestApi, isInboundId, isInboundScope, record, inboundBodyLimit, type InboundRequestApi} from "@/lib/erp/inbound-request-api";
import {createInboundRequestBridge} from "@/lib/erp/inbound-request-command-adapter";
import {MobileInboundRequest, type InboundPresentedRead} from "./mobile-inbound-request";
import {InboundRequestReadOnly} from "./inbound-request-readonly";
import {useRequestSelectionFocus} from "./request-selection-focus";
import {workspaceReadViewScope} from "@/lib/erp/navigation";
import {useDirtyGuard, useNavigationGuard, type NavigationGuardValidationPhase} from "./navigation-guard";

export type InboundRequestScreenProps = {
  compact?:boolean;
  setCompact?:(value:boolean)=>void;
  presentationAllowed?: boolean;
  registerDetailNavigation?: RegisterRequestDetailNavigation;
  // A non-secret AUTH login incarnation supplied by the parent. Null means
  // actual logout, NEVER a failed workspace fetch. Do not derive this from
  // document/token/capabilities/authorityVersion or use a cookie as this prop.
  loginKey: string | null;
  workspace: WorkspaceData | null;
  onClose?: () => void;
  onBack?: () => void;
  // Only explicit composed mode suppresses the standalone history sentinel.
  historyOwner?: "standalone" | "workspace";
  // Confirmed current-generation session denial. The parent owns the real login boundary.
  onDenied?: (error: ApiError) => void;
  api?: InboundRequestApi;
  // Existing inbound LIST only. Test seam; never use paginated detail as draft.
  list?: (page: number, search: string, branchId: string, signal: AbortSignal, expectedScope?: ReadScope) => Promise<DocumentPage>;
};
type PresentedReadProof = InboundPresentedRead & {context: string; api: InboundRequestApi; access: InboundDraftAccess};
type ReadFallbackBinding = {context: string | null; documentId: string | null; scope: ReadScope | null; api: InboundRequestApi; readIdentity: string | null; selectionVersion: number};
// The bridge publishes a fresh access object for custody-only phase/receipt
// changes too. Compare the entire read grant within its separately fenced
// binding; reference churn is neither revoked authority nor a fresh read.
function sameReadAccess(left: InboundDraftAccess, right: InboundDraftAccess): boolean {
  return left.scopeKey === right.scopeKey && left.canRead === right.canRead && left.canSave === right.canSave
    && left.canSend === right.canSend && left.available === right.available && left.maxCommandBytes === right.maxCommandBytes;
}

// Per-mounted-host presentation observation; no authority or command storage.
function createReadObservation() {
  let binding: ReadFallbackBinding | null = null, unavailable: ReadFallbackBinding | null = null;
  return {
    getBinding: () => binding,
    getUnavailable: () => unavailable,
    bind(next: ReadFallbackBinding | null) { binding = next; unavailable = null; },
    markUnavailable(next: ReadFallbackBinding | null) { unavailable = next; },
  };
}
/** Eligibility only. The independent scoped READ must still authorize its data. */
function commandReadUnavailable(value: unknown): boolean {
  if (!(record(value, ["scopeKey", "access", "data"]) || record(value, ["scopeKey", "access", "data", "itemDisplayContext"]) && value.itemDisplayContext === null) || value.scopeKey !== null && !isInboundScope(value.scopeKey)
    || !record(value.access, ["canRead", "canSave", "canSend", "available", "maxCommandBytes"])
    || !record(value.data, ["outcome", "document"])) return false;
  const access = value.access;
  return value.data.outcome === "Unavailable" && value.data.document === null
    && access.canRead === false && access.canSave === false && access.canSend === false
    && access.available === false && Number.isSafeInteger(access.maxCommandBytes)
    && (access.maxCommandBytes as number) > 0 && (access.maxCommandBytes as number) <= inboundBodyLimit;
}
const defaultList = (page: number, search: string, branchId: string, signal: AbortSignal, expectedScope?: ReadScope) =>
  expectedScope ? getDocuments("inbound-requests", page, search, branchId, signal, expectedScope)
    : Promise.reject(new ApiError(502, "invalid_read_scope"));
function CustodyGuard({active, readbackPending}: {active: boolean; readbackPending: boolean}) {
  useDirtyGuard(active, false);
  const {register} = useNavigationGuard(), key = useRef(Symbol("inbound-receipt-readback"));
  useLayoutEffect(() => {
    const current = key.current;
    register(current, readbackPending ? {canDiscard: false,
      message: "ERP đã xác nhận thao tác. Cần đọc đầy đủ snapshot khớp xác nhận trước khi rời phiếu; không gửi lại thao tác đã xác nhận."} : null);
    return () => register(current, null);
  }, [readbackPending, register]);
  return null;
}

/** Mount under the EXISTING NavigationGuardProvider. Keep the host mounted
 * during a workspace fetch/error. Only login retirement resets I18/transport. */
export function InboundRequestScreen(props: InboundRequestScreenProps) {
  return <RetainedInboundHost key={JSON.stringify([props.loginKey])} {...props}/>;
}
function RetainedInboundHost({compact=false,setCompact,presentationAllowed = true, registerDetailNavigation, loginKey, workspace, onClose, onBack, onDenied, historyOwner = "standalone", api: suppliedApi, list = defaultList}: InboundRequestScreenProps) {
  const defaultApi = useMemo(() => createInboundRequestApi(), []), rawApi = suppliedApi ?? defaultApi;
  const [readObservation] = useState(createReadObservation);
  const [unavailable, setUnavailable] = useState<{binding: ReadFallbackBinding} | null>(null);
  const [readingFallback, setReadingFallback] = useState<ReadFallbackBinding | null>(null);
  const [presentationReadProof, setPresentationReadProof] = useState<{binding: ReadFallbackBinding; access: InboundDraftAccess} | null>(null);
  const [readonlyPresented, setReadonlyPresented] = useState<{binding: ReadFallbackBinding; state: "pending" | "ready" | "failed"} | null>(null);
  // Observe exact returned envelopes without transforming the draft API. This
  // wrapper never grants command rights and delegates every original argument.
  const api = useMemo<InboundRequestApi>(() => {
    let latest = 0;
    return {
      async read(documentId, scopeKey, signal) {
        const binding = readObservation.getBinding(), sequence = ++latest;
        const current = () => !signal.aborted && latest === sequence && binding !== null
          && readObservation.getBinding() === binding && binding.documentId === documentId;
        if (current()) { readObservation.markUnavailable(null); setReadingFallback(binding); setReadonlyPresented(null); }
        try {
          const result = await rawApi.read(documentId, scopeKey, signal);
          if (current()) {
            if ((scopeKey === null || result.scopeKey === null || result.scopeKey === scopeKey) && commandReadUnavailable(result)) {
              readObservation.markUnavailable(binding); setUnavailable({binding: binding!});
            } else setUnavailable(null);
          }
          return result;
        } catch (error) {
          if (current()) setUnavailable(null);
          throw error;
        } finally { if (current()) setReadingFallback(null); }
      },
      command: (route, body, scopeKey, signal, beforeSend) => rawApi.command(route, body, scopeKey, signal, beforeSend),
    };
  }, [rawApi, readObservation]);
  const callbacks = useRef({onClose, onBack, onDenied});
  const [sessionEnded, setSessionEnded] = useState(false), [deniedContext, setDeniedContext] = useState<string | null>(null);
  const [bridge] = useState(() => createInboundRequestBridge(api));
  // Install the notification after commit. Constructing the bridge must not
  // expose callback refs to a factory invoked during React render.
  useLayoutEffect(() => {
    bridge.setSessionDeniedHandler(() => {
      setSessionEnded(true); callbacks.current.onDenied?.(new ApiError(401, "authentication_required"));
    });
    return () => bridge.setSessionDeniedHandler(null);
  }, [bridge]);
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot);
  const pendingReceipt = useRef<InboundDraftReceipt | null>(null), [readbackPending, setReadbackPending] = useState(false);
  const readProofGeneration = useRef<object | null>(null), latestAdapterRead = useRef<object | null>(null);
  const adapter = useMemo<InboundDraftAdapter>(() => ({...bridge.adapter, async read(documentId, signal) {
    const generation = readProofGeneration.current, ticket = {}, receipt = pendingReceipt.current;
    const accessBeforeRead = bridge.getSnapshot().access;
    latestAdapterRead.current = ticket;
    const result = await bridge.adapter.read(documentId, signal), proof = bridge.getSnapshot();
    // A read can itself change I18's rights binding. That returned DTO is not
    // proof that the old I18 consumer accepted it; await its new bound read.
    if (receipt && !signal.aborted && proof.access === accessBeforeRead) {
      // Use I18's complete DTO and matching-receipt rules. A bootstrap, partial,
      // failed or mismatched read never releases this separate navigation gate.
      const view = observedView(result, documentId);
      if (view && snapshotAcknowledges(view, receipt)) setTimeout(() => {
        // Let I18 consume this same result first. Its successful readback
        // cleanup aborts the old signal too, so check committed proof identities
        // here rather than mistake that normal cleanup for failed validation.
        const current = bridge.getSnapshot();
        if (readProofGeneration.current !== generation || latestAdapterRead.current !== ticket
          || pendingReceipt.current !== receipt || current.contextKey !== proof.contextKey
          || current.access !== proof.access || current.needsRefresh) return;
        pendingReceipt.current = null; setReadbackPending(false);
      }, 0);
    }
    return result;
  }}), [bridge]);
  const {request: guardNavigation} = useNavigationGuard();
  const openAuthority = useRef<{scope: string; rows: ReadonlySet<string>} | null>(null);
  useLayoutEffect(() => () => { openAuthority.current = null; }, []);
  const acknowledge = useCallback((receipt: InboundDraftReceipt) => {
    const previous = bridge.getSnapshot().receipt;
    bridge.acknowledge(receipt);
    const accepted = bridge.getSnapshot().receipt;
    if (accepted !== previous && accepted?.operationId === receipt.operationId) {
      pendingReceipt.current = accepted; latestAdapterRead.current = null; setReadbackPending(true);
    }
  }, [bridge]);
  useLayoutEffect(() => { callbacks.current = {onClose, onBack, onDenied}; }, [onClose, onBack, onDenied]);
  const {value:controlValue,field:controlField,set:setControls,attachRoot,captureScroll,restoreScroll,setActive}=useListControls("inbound-requests");
  const {draftSearch:search,draftBranch:branch,page}=controlValue;
  const [filterRevision,setFilterRevision]=useState(0);
  const filter=useMemo(()=>({search:controlValue.appliedSearch,branch:controlValue.appliedBranch}),[controlValue.appliedSearch,controlValue.appliedBranch]);
  const setSearch=controlField("draftSearch"),setBranch=controlField("draftBranch"),setPage=controlField("page");
  const setFilter=(next:{search:string;branch:string})=>{setControls(previous=>({...previous,appliedSearch:next.search,appliedBranch:next.branch}));setFilterRevision(value=>value+1);};
  const [selected, setSelected] = useState<string | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [readonlyPage, setReadonlyPage] = useState<{key: string; page: number} | null>(null);
  const [presented, setPresented] = useState<PresentedReadProof | null>(null), [focusFailure, setFocusFailure] = useState<string | null>(null);
  const [retry, setRetry] = useState(0), [guardRevision, setGuardRevision] = useState(0), [notice, setNotice] = useState("");
  const [rows, setRows] = useState<{view: object | null; binding: string; data: DocumentPage | null; failed: boolean; readIdentity: string | null; viewKey: string}>({view: null, binding: "", data: null, failed: false, readIdentity: null, viewKey: ""});
  // Revalidation identity ONLY, not a login scope or an editor remount key.
  const workspaceContext = loginKey !== null && workspace !== null ? JSON.stringify([loginKey, workspace.session.tenantId, workspace.session.companyId, workspace.session.authorityVersion,
    workspace.session.capabilities, workspace.branchIds]) : null;
  // A current 401 is terminal for this loginKey, even if the parent has not yet
  // cleared its stale workspace prop. A 403/409 may be explicitly revalidated.
  const authorityDenied = workspaceContext !== null && deniedContext === workspaceContext;
  const context = sessionEnded || authorityDenied ? null : workspaceContext;
  useLayoutEffect(() => {
    const generation = {}; readProofGeneration.current = generation;
    return () => { if (readProofGeneration.current === generation) readProofGeneration.current = null; };
  }, [context, api, selected]);
  const contextCurrent = context !== null && state.contextKey === context;
  const listAllowed = contextCurrent && !!workspace?.session.capabilities.includes("inbound-requests.read");
  const readIdentity = workspace ? JSON.stringify([workspaceReadViewScope(workspace), workspace.session.tenantId,
    workspace.session.companyId, [...workspace.session.capabilities].sort(), [...workspace.branchIds].sort()]) : null;
  const verifiedReadAuthority = context !== null && !!workspace?.session.capabilities.includes("inbound-requests.read")
    && isInboundScope(workspace.sessionScope) && isInboundScope(workspace.readScope);
  const listBinding = JSON.stringify([context, readIdentity, filter, page, retry, filterRevision]), listViewKey = JSON.stringify([filter, page, filterRevision]);
  // Equal values after an intervening loss/scope/filter/page change are a new
  // presentation, not permission to revive an earlier positive snapshot. Keep
  // this identity across detail selection and healthy same-scope observations.
  const listAuthorityPresent = context !== null;
  const listView = useMemo(() => ({readIdentity, listViewKey, listAuthorityPresent}), [readIdentity, listViewKey, listAuthorityPresent]);
  // An observation counter is not a READ-scope change. Keep the authorized
  // list's geometry while its same-scope background request is outstanding.
  const retainedRows = rows.view === listView && verifiedReadAuthority && rows.readIdentity === readIdentity && rows.viewKey === listViewKey ? rows.data : null;
  const currentRows = rows.view === listView && listAllowed && rows.binding === listBinding ? rows.data : retainedRows;
  const listPresented = listAllowed || retainedRows !== null;
  const presentedCurrent = presented !== null && presented.context === context && presented.api === api && presented.access === state.access
    && presented.documentId === selected && presented.scopeKey === state.access.scopeKey;
  const sessionScope = workspace?.sessionScope, readScopeMarker = workspace?.readScope;
  const readScope = useMemo<ReadScope | null>(() => isInboundScope(sessionScope) && isInboundScope(readScopeMarker)
    ? {sessionScope, readScope: readScopeMarker} : null, [sessionScope, readScopeMarker]);
  // Retain only this non-authoritative control across a temporarily unverified
  // observation. A fresh scoped GET still supplies all redisplayed data.
  const readonlyPageKey = selected !== null && readScope ? JSON.stringify([selected, readScope.sessionScope, readScope.readScope]) : null;
  const readonlyPageNumber = readonlyPageKey !== null && readonlyPage?.key === readonlyPageKey ? readonlyPage.page : 1;
  if (readonlyPageKey !== null && readonlyPage?.key !== readonlyPageKey) setReadonlyPage({key: readonlyPageKey, page: 1});
  const fallbackBinding = useMemo<ReadFallbackBinding>(() => ({context, documentId: selected, scope: readScope, api, readIdentity, selectionVersion}), [context, selected, readScope, api, readIdentity, selectionVersion]);
  useLayoutEffect(() => {
    readObservation.bind(fallbackBinding);
    return () => { if (readObservation.getBinding() === fallbackBinding) { readObservation.bind(null); } };
  }, [fallbackBinding, readObservation]);
  // Healthy same-READ-scope observations retain existing READ presentation.
  // Actual loss, scope/API/selection boundaries and current negative outcomes
  // retire eligibility; an old positive result can never revive after those.
  if (unavailable && (context === null || unavailable.binding.readIdentity !== readIdentity || unavailable.binding.api !== api
    || unavailable.binding.documentId !== selected)) setUnavailable(null);
  const readonlyEligible = unavailable !== null && unavailable.binding.readIdentity === readIdentity && unavailable.binding.api === api
    && unavailable.binding.documentId === selected && readScope !== null && selected !== null && verifiedReadAuthority
    && !state.unresolved && !readbackPending;
  const readonlyVerifying = readonlyEligible && (unavailable.binding !== fallbackBinding || readingFallback === fallbackBinding);
  const readonlyReady = readonlyEligible && !readonlyVerifying && readonlyPresented?.binding === fallbackBinding && readonlyPresented.state === "ready";
  const currentPresentationProof = presentationReadProof?.binding === fallbackBinding && contextCurrent
    && sameReadAccess(presentationReadProof.access, state.access) && state.access.canRead && state.access.available && !state.needsRefresh ? presentationReadProof : null;
  // A real grant/binding loss retires this proof. Returning to equal values is
  // not permission to reuse a snapshot from before that observed boundary.
  if (presentationReadProof !== null && currentPresentationProof === null) setPresentationReadProof(null);
  const presentationReady = useDetailPresentationProof(presentationAllowed, readonlyReady ? readonlyPresented : currentPresentationProof, () => setRetry(value => value + 1));
  const readonlyFailed = readonlyEligible && readonlyPresented?.binding === fallbackBinding && readonlyPresented.state === "failed";
  const focusOwner = useMemo(() => ({loginKey, api, readIdentity}), [loginKey, api, readIdentity]);
  const {open: focusOpen, close: focusClose, cancel: cancelFocus, row: focusRow, detail: focusDetail, list: focusList} = useRequestSelectionFocus({
    owner: listPresented ? focusOwner : null, selected, listKey: JSON.stringify([filter, page]),
    openReady: readonlyReady || selected !== null && presentedCurrent && presented.state === "ready"
      && contextCurrent && state.access.canRead && state.access.available && !state.needsRefresh && !state.unresolved && !readbackPending,
    openFailed: selected !== null && (readonlyFailed || !readonlyEligible && (focusFailure === selected || presentedCurrent && presented.state === "failed")),
    listReady: currentRows !== null, listFailed: rows.view === listView && rows.binding === listBinding && rows.failed,
  });
  // Automatic authority observations and ACKs never complete an earlier focus request.
  useLayoutEffect(() => { cancelFocus(); }, [workspace, cancelFocus]);
  useLayoutEffect(() => { if (state.receipt) cancelFocus(); }, [state.receipt, cancelFocus]);
  const focusAccess = useRef({selected, canRead: state.access.canRead});
  useLayoutEffect(() => {
    const previous = focusAccess.current; focusAccess.current = {selected, canRead: state.access.canRead};
    // A new selection normally starts closed; a same-selection loss retires its ticket.
    if (previous.selected === selected && previous.canRead && !state.access.canRead) cancelFocus();
  }, [selected, state.access.canRead, cancelFocus]);
  const onPresentedRead = useCallback((event: InboundPresentedRead) => {
    if (context === null || !contextCurrent || event.documentId !== selected || event.scopeKey !== state.access.scopeKey) return;
    // A new child read invalidates an already ready view before transport work.
    // A later explicit Open may then wait for that new validated commit.
    if (event.state === "pending" && presentedCurrent && presented.state === "ready") cancelFocus();
    setPresented({...event, context, api, access: state.access});
    if (event.state === "ready") setFocusFailure(previous => previous === event.documentId ? null : previous);
  }, [context, contextCurrent, selected, api, state.access, presentedCurrent, presented, cancelFocus]);
  const onReadonlyPresented = useCallback((next: "pending" | "ready" | "failed") => {
    if (!readonlyEligible || readObservation.getBinding() !== fallbackBinding) return;
    if (next === "pending" && readonlyReady) cancelFocus();
    setReadonlyPresented({binding: fallbackBinding, state: next});
    if (next === "ready") setFocusFailure(previous => previous === selected ? null : previous);
  }, [readonlyEligible, fallbackBinding, readonlyReady, selected, cancelFocus, readObservation]);
  const onReadonlyPageChange = useCallback((page: number) => {
    if (readonlyEligible && readonlyPageKey !== null && readObservation.getBinding() === fallbackBinding
      && Number.isInteger(page) && page >= 1 && page <= 1000) setReadonlyPage({key: readonlyPageKey, page});
  }, [readonlyEligible, readonlyPageKey, readObservation, fallbackBinding]);
  const onReadonlyDenied = useCallback((error: ApiError) => {
    if (!readonlyEligible || readObservation.getBinding() !== fallbackBinding) return;
    readObservation.bind(null); setUnavailable(null); setReadonlyPresented(null); cancelFocus(); bridge.configure(null, api);
    if (error.status === 401) { setSessionEnded(true); callbacks.current.onDenied?.(error); }
    else if (error.status === 403 || error.status === 409) setDeniedContext(workspaceContext);
  }, [readonlyEligible, fallbackBinding, cancelFocus, bridge, api, workspaceContext, readObservation]);
  const apiRef = useRef(api);
  useLayoutEffect(() => { apiRef.current = api; }, [api]);
  useLayoutEffect(() => { bridge.configure(context, api); }, [bridge, context, api]);
  const lifetime = useRef<object | null>(null);
  useLayoutEffect(() => {
    const lease = {}; lifetime.current = lease;
    return () => {
      // Fence immediately; defer destruction across React StrictMode's paired
      // effect cleanup/setup so it is not mistaken for a new login.
      bridge.configure(null, apiRef.current);
      queueMicrotask(() => { if (lifetime.current === lease) { lifetime.current = null; bridge.dispose(); } });
    };
  }, [bridge]);
  useEffect(() => {
    if (!contextCurrent || selected === null) return;
    const controller = new AbortController();
    void bridge.revalidate(controller.signal).then(() => {
      const proof = bridge.getSnapshot();
      // A current successful full bootstrap also permits the editor's original
      // intent/recovery UI while it is unresolved. It does not acknowledge a
      // receipt or release the separate matching-readback navigation guard.
      if (!controller.signal.aborted && proof.contextKey === context && !proof.needsRefresh && proof.access.canRead && proof.access.available)
        setPresentationReadProof({binding: fallbackBinding, access: proof.access});
      if (!controller.signal.aborted && bridge.getSnapshot().needsRefresh
        && readObservation.getUnavailable() !== fallbackBinding) setFocusFailure(selected);
    }).catch(() => {
      if (!controller.signal.aborted) {
        setFocusFailure(selected);
        setNotice("Chưa xác minh được quyền nhập hàng. Ý định đang giữ không bị bỏ; thử xác minh lại trong đúng phiên.");
      }
    });
    return () => controller.abort();
  }, [bridge, contextCurrent, context, api, selected, retry, fallbackBinding, readObservation]);
  // List data belongs to authority/filter/page, not the selected detail. A
  // separate synchronous ticket retires denial callbacks on every selection,
  // including batched A→B→A, without aborting/refetching an authorized list.
  const selectionDenialGeneration = useRef<object>({});
  const branchIdsKey = JSON.stringify(workspace?.branchIds ?? []);
  const authorizedBranches = useMemo<string[]>(() => JSON.parse(branchIdsKey), [branchIdsKey]);
  const listGeneration = useRef<object | null>(null);
  useLayoutEffect(() => {
    // Invalidate at commit, before passive-effect cleanup: a superseded list
    // error must never end a newer authority/API/scope/filter context.
    const generation = {}; listGeneration.current = generation;
    return () => { if (listGeneration.current === generation) listGeneration.current = null; };
  }, [listAllowed, listBinding, list, api, readScope, readIdentity, verifiedReadAuthority, authorizedBranches, listView]);
  useEffect(() => {
    if (!listAllowed) return;
    const controller = new AbortController(), generation = listGeneration.current, selectionTicket = selectionDenialGeneration.current;
    const current = () => !controller.signal.aborted && listGeneration.current === generation;
    void list(page, filter.search, filter.branch, controller.signal, readScope ?? undefined).then(data => {
      if (!current()) return;
      if (data.page !== page || data.rows.length > 100 || data.rows.some(row => !isInboundId(row.documentId)
        || !authorizedBranches.includes(row.branchId))) throw new Error("invalid_inbound_list");
      setRows({view: listView, binding: listBinding, data, failed: false, readIdentity: verifiedReadAuthority ? readIdentity : null, viewKey: listViewKey});
    }).catch(error => {
      if (!current()) return;
      const denied = error instanceof ApiError && [401, 403, 409].includes(error.status);
      // A denial issued for an older detail selection is not current proof.
      // Ignore it before changing rows, bridge authority or session state.
      if (denied && selectionDenialGeneration.current !== selectionTicket) return;
      setRows({view: listView, binding: listBinding, data: null, failed: true, readIdentity: null, viewKey: listViewKey});
      if (!denied) return;
      // Fence synchronously, before React or the parent can rerender. In-flight
      // command/receipt callbacks cannot confirm after this positive denial.
      listGeneration.current = null;
      bridge.configure(null, api);
      if (error.status === 401) {
        setSessionEnded(true);
        callbacks.current.onDenied?.(error);
      } else setDeniedContext(workspaceContext);
    });
    return () => controller.abort();
  }, [bridge, listAllowed, listBinding, list, page, filter, workspaceContext, api, verifiedReadAuthority, readIdentity, listViewKey, readScope, authorizedBranches, listView]);

  useLayoutEffect(() => {
    openAuthority.current = presentationAllowed && loginKey !== null && !sessionEnded && contextCurrent && listAllowed && currentRows
      ? {scope: JSON.stringify([loginKey, readIdentity, state.access.scopeKey]), rows: new Set(currentRows.rows.map(row => row.documentId))} : null;
  });
  const navigate = useCallback((action: () => void, admit: () => boolean = () => true) => {
    // Validate live target/custody before the provider clears dirty blockers.
    const eligible = (phase: NavigationGuardValidationPhase = "accept") => lifetime.current !== null && admit()
      && (phase === "request" || !bridge.hasUnresolved() && pendingReceipt.current === null);
    guardNavigation(() => {
      if (lifetime.current === null) return;
      // A dialog can have opened before a command became pending. Do not trust
      // its cached canDiscard flag to retire intent; retain the acceptance-time
      // check even though the root also runs eligible before clearing blockers.
      if (bridge.hasUnresolved() || pendingReceipt.current !== null) {
        setGuardRevision(value => value + 1);
        setNotice(pendingReceipt.current
          ? "ERP đã xác nhận thao tác. Cần đọc snapshot khớp xác nhận trước khi rời phiếu; không gửi lại thao tác đã xác nhận."
          : "Kết quả thao tác chưa rõ. Chỉ đối soát yêu cầu gốc; không rời phiếu hoặc gửi lại.");
        return;
      }
      if (!admit()) {
        setNotice("Phiếu muốn mở không còn hợp lệ trong danh sách/quyền hiện tại. Phiếu đang sửa vẫn được giữ.");
        return;
      }
      action();
    }, eligible);
  }, [bridge, guardNavigation]);
  const selectedRef = useRef(selected);
  useLayoutEffect(() => { selectedRef.current = selected; }, [selected]);
  const select = useCallback((documentId: string | null) => {
    selectedRef.current = documentId;
    // Fence synchronously, including batched A→B→A selection before a commit.
    selectionDenialGeneration.current = {};
    readObservation.bind(null); setReadonlyPage(null); setUnavailable(null); setReadonlyPresented(null);
    bridge.select(documentId); setSelected(documentId); setSelectionVersion(value => value + 1); setNotice(""); setPresented(null); setFocusFailure(null);
  }, [bridge, readObservation]);
  const requestBack = useCallback(() => {
    if (selectedRef.current === null) return;
    navigate(() => {
      if (selectedRef.current === null) return;
      selectedRef.current = null; focusClose(); select(null); callbacks.current.onBack?.();
    });
  }, [navigate, select, focusClose]);
  function requestOpen(documentId: string) {
    const queuedAuthority = openAuthority.current;
    if (!queuedAuthority?.rows.has(documentId)) return;
    if (selectedRef.current === documentId) {
      if (!bridge.hasUnresolved() && pendingReceipt.current === null && contextCurrent
        && (readonlyEligible && !readonlyFailed || state.access.canRead && state.access.available && !state.needsRefresh
          && focusFailure !== documentId && !(presentedCurrent && presented.state === "failed"))) focusOpen(documentId);
      return;
    }
    navigate(() => { focusOpen(documentId); select(documentId); }, () => {
      const current = openAuthority.current;
      return current !== null && current.scope === queuedAuthority.scope && current.rows.has(documentId);
    });
  }
  useRequestDetailNavigation(registerDetailNavigation, {selectedId: selected, getSelectedId: () => selectedRef.current, requestClose: requestBack, requestOpen});
  // Preserve standalone Back at the list level, including the host callback.
  // The detail seam itself is idempotent when the selection is already closed.
  const standaloneBack = useCallback(() => navigate(() => {
    if (selectedRef.current !== null) { selectedRef.current = null; focusClose(); select(null); }
    callbacks.current.onBack?.();
  }), [navigate, focusClose, select]);
  const historyMarker = useRef<string | null>(null);
  useEffect(() => {
    if (loginKey === null || historyOwner === "workspace") return;
    // A same-URL sentinel catches an ordinary browser Back BEFORE a router
    // leaves this screen. The parent still owns cross-screen routing and must
    // route its own navigation through NavigationGuardProvider.request.
    const marker = historyMarker.current ?? crypto.randomUUID(), href = window.location.href;
    historyMarker.current = marker;
    const sentinel = () => window.history.pushState({...window.history.state, medcomInboundHost: marker}, "", href);
    // The stable guard request and committed callback refs avoid resubscribing
    // on dialogs or parent callback identity changes. StrictMode also reuses it.
    if (window.history.state?.medcomInboundHost !== marker) sentinel();
    const back = () => { sentinel(); standaloneBack(); };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [loginKey, standaloneBack, historyOwner]);
  const statusRow=currentRows?.rows.find(row=>row.documentId===selected);
  const access: InboundDraftAccess = contextCurrent ? state.access : {...state.access, canRead: false, canSave: false, canSend: false, available: false};
  useLayoutEffect(()=>{setActive(presentationAllowed&&contextCurrent&&verifiedReadAuthority);restoreScroll(presentationAllowed&&contextCurrent&&!!currentRows);});
  return <section ref={attachRoot} onScrollCapture={event=>{if(event.target instanceof HTMLElement)captureScroll(event.target);}} hidden={!presentationAllowed} inert={!presentationAllowed} data-testid="inbound-request-host" data-readback-pending={readbackPending} aria-label="Phiếu đề nghị nhập hàng"
    className={requestStyles.stack}>
    <CustodyGuard key={guardRevision} active={state.unresolved} readbackPending={readbackPending}/>
    {loginKey === null || sessionEnded ? <RequestNotice>Đã kết thúc phiên. Đăng nhập lại để tiếp tục.</RequestNotice>
      : authorityDenied ? <RequestNotice>Chưa xác minh được quyền xem phiếu. Yêu cầu đang xử lý vẫn được giữ.</RequestNotice>
      : !contextCurrent ? <RequestNotice>Chưa xác minh được phiên ERP. Dữ liệu tạm ẩn; yêu cầu đang xử lý vẫn được giữ.</RequestNotice> : null}
    {notice && !sessionEnded && <RequestNotice warning>{notice}</RequestNotice>}
    {presentationReady && state.receipt && state.receipt.documentId === selected && contextCurrent && !state.needsRefresh && state.access.scopeKey !== null && state.access.canRead && state.access.available && <p data-testid="inbound-host-receipt">ERP đã xác nhận phiếu {state.receipt.documentId}.
      Mã thao tác {state.receipt.operationId}; xác nhận {state.receipt.auditId}. Lỗi tải lại không có nghĩa là lưu thất bại.</p>}
    {!sessionEnded && workspaceContext !== null && (selected !== null || authorityDenied) && <RequestButton type="button"
      onClick={() => { cancelFocus(); setDeniedContext(null); setRetry(value => value + 1); }}>
      Xác minh lại quyền nhập hàng</RequestButton>}
    {listPresented && <RequestListComposition><RequestListPanel>
      <RequestListHeader title="Danh sách phiếu nhập hàng"/>
      <RequestListToolbar aria-label="Lọc phiếu nhập hàng" onSubmit={event => {
        event.preventDefault(); navigate(() => { cancelFocus(); select(null); setFilter({search, branch}); setPage(1); });
      }}>
        <RequestSearch label="Tìm phiếu nhập hàng" placeholder="Tìm mã phiếu…" value={search} onChange={setSearch}/>
        <RequestBranch label="Lọc chi nhánh" value={branch} branches={workspace?.branchIds??[]} onChange={setBranch}/>
        <RequestButton className="request-list-refresh" type="button" disabled={!contextCurrent||!currentRows} onClick={()=>navigate(()=>{cancelFocus();setRetry(value=>value+1);})}>Làm mới</RequestButton>
      </RequestListToolbar>
      <RequestListContent aria-label="Danh sách phiếu nhập hàng" ref={focusList} tabIndex={-1} className="scroll-mt-24">
        {!currentRows ? rows.view === listView && rows.binding === listBinding && rows.failed ? <RequestNotice warning>Chưa tải được danh sách.</RequestNotice> : <RequestLoading label="Đang tải danh sách."/>
          : currentRows.rows.length === 0 ? <RequestEmpty title="Không có phiếu trong trang này.">Thử điều chỉnh mã phiếu hoặc chi nhánh.</RequestEmpty>
          : <RequestListTable compact={compact} setCompact={setCompact} presentationAllowed={presentationAllowed&&verifiedReadAuthority&&contextCurrent&&!!currentRows} isPresentationAllowed={()=>openAuthority.current!==null} label="Phiếu nhập hàng" columns={[{id:"id",label:"Mã phiếu"},{id:"date",label:"Ngày chứng từ"},{id:"branch",label:"Chi nhánh"},{id:"status",label:"Trạng thái"}]} rows={currentRows.rows.map(row=>({id:row.documentId,cells:[row.documentId,requestDate(row.documentDate),row.branchId,<RequestStatus key="status" value={row.statusId} statusName={row.statusName}/>],action:"Mở phiếu",actionLabel:`Mở phiếu ${row.documentId} · ${row.documentDate} · ${row.branchId} · trạng thái ${row.statusId ?? "NULL"}`,selected:selected===row.documentId,buttonRef:element=>focusRow(row.documentId,element),onOpen:() => requestOpen(row.documentId)}))}/>}
      </RequestListContent>
      <RequestPagination label="Trang danh sách phiếu" page={page} previousDisabled={page === 1} nextDisabled={!currentRows?.hasMore}
        onPrevious={() => navigate(() => { cancelFocus(); select(null); setPage(value => value - 1); })}
        onNext={() => navigate(() => { cancelFocus(); select(null); setPage(value => value + 1); })}/>
    </RequestListPanel></RequestListComposition>}
    {!listPresented&&!sessionEnded&&<RequestLoading label="Đang xác minh phạm vi và quyền ERP…"/>}
    {/* Always mounted, even on close, permission change, list error or transient
        workspace=null. Only loginKey above retires this I18 instance. */}
    <RequestDetailDialog open={selected!==null||state.unresolved||readbackPending} presentationAllowed={presentationAllowed&&workspace!==null}
      title="Phiếu nhập hàng đã chọn" documentNumber={presentationReady&&contextCurrent?selected:null} closeLabel="Quay lại danh sách" onRequestClose={requestBack}>
    <RequestButton type="button" onClick={() => navigate(() => {
      if (selectedRef.current === null) return;
      selectedRef.current = null; focusClose(); select(null); callbacks.current.onClose?.();
    })}>Đóng phiếu nhập hàng</RequestButton>
    {notice && <RequestNotice warning>{notice}</RequestNotice>}
    {!contextCurrent && <RequestNotice>Dữ liệu tạm ẩn. Xác minh lại phiên ERP để tiếp tục.</RequestNotice>}
    {!sessionEnded && workspaceContext !== null && <RequestButton type="button" onClick={() => { cancelFocus(); setDeniedContext(null); setRetry(value => value + 1); }}>Xác minh lại quyền nhập hàng</RequestButton>}
    <div ref={focusDetail} tabIndex={-1} role="region" aria-label="Phiếu nhập hàng đã chọn" className="scroll-mt-24 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" hidden={!presentationReady||selected===null&&!state.unresolved&&!readbackPending}>
      <div hidden={readonlyEligible}><MobileInboundRequest presentationAllowed={presentationAllowed&&workspace!==null&&contextCurrent&&presentationReady&&!readonlyEligible&&(selected!==null||state.unresolved||readbackPending)} statusPresentation={statusRow?{documentId:statusRow.documentId,id:statusRow.statusId,name:statusRow.statusName}:undefined} documentId={selected} access={access} adapter={adapter} onConfirmed={acknowledge} onPresentedRead={onPresentedRead}/></div>
      {readonlyEligible && selected !== null && readScope !== null && <InboundRequestReadOnly documentId={selected}
        branchIds={workspace?.branchIds ?? []} scope={readScope} initialPage={readonlyPageNumber} onPageChange={onReadonlyPageChange}
        verifying={readonlyVerifying} readRevision={unavailable}
        onDenied={onReadonlyDenied} onPresented={onReadonlyPresented}/>}
    </div>
    </RequestDetailDialog>
    <p className={requestStyles.muted}>Lưu thay đổi và Gửi kho là hai thao tác riêng.</p>
  </section>;
}
