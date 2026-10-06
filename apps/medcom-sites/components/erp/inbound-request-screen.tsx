"use client";
import {RequestButton,RequestInput,RequestNotice,RequestEmpty,RequestLoading,RequestStatus,requestDate,requestStyles} from "./request-presentation";
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
import {useDirtyGuard, useNavigationGuard} from "./navigation-guard";

export type InboundRequestScreenProps = {
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
  if (!record(value, ["scopeKey", "access", "data"]) || value.scopeKey !== null && !isInboundScope(value.scopeKey)
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
function RetainedInboundHost({loginKey, workspace, onClose, onBack, onDenied, historyOwner = "standalone", api: suppliedApi, list = defaultList}: InboundRequestScreenProps) {
  const defaultApi = useMemo(() => createInboundRequestApi(), []), rawApi = suppliedApi ?? defaultApi;
  const [readObservation] = useState(createReadObservation);
  const [unavailable, setUnavailable] = useState<{binding: ReadFallbackBinding} | null>(null);
  const [readingFallback, setReadingFallback] = useState<ReadFallbackBinding | null>(null);
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
  const acknowledge = useCallback((receipt: InboundDraftReceipt) => {
    const previous = bridge.getSnapshot().receipt;
    bridge.acknowledge(receipt);
    const accepted = bridge.getSnapshot().receipt;
    if (accepted !== previous && accepted?.operationId === receipt.operationId) {
      pendingReceipt.current = accepted; latestAdapterRead.current = null; setReadbackPending(true);
    }
  }, [bridge]);
  const {request: guardNavigation} = useNavigationGuard();
  useLayoutEffect(() => { callbacks.current = {onClose, onBack, onDenied}; }, [onClose, onBack, onDenied]);
  const [selected, setSelected] = useState<string | null>(null), [page, setPage] = useState(1);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [readonlyPage, setReadonlyPage] = useState<{key: string; page: number} | null>(null);
  const [presented, setPresented] = useState<PresentedReadProof | null>(null), [focusFailure, setFocusFailure] = useState<string | null>(null);
  const [search, setSearch] = useState(""), [branch, setBranch] = useState("");
  const [filter, setFilter] = useState({search: "", branch: ""});
  const [retry, setRetry] = useState(0), [guardRevision, setGuardRevision] = useState(0), [notice, setNotice] = useState("");
  const [rows, setRows] = useState<{binding: string; data: DocumentPage | null; failed: boolean; readIdentity: string | null; viewKey: string}>({binding: "", data: null, failed: false, readIdentity: null, viewKey: ""});
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
  const listBinding = JSON.stringify([context, filter, page, retry]), listViewKey = JSON.stringify([filter, page]);
  // An observation counter is not a READ-scope change. Keep the authorized
  // list's geometry while its same-scope background request is outstanding.
  const retainedRows = verifiedReadAuthority && rows.readIdentity === readIdentity && rows.viewKey === listViewKey ? rows.data : null;
  const currentRows = listAllowed && rows.binding === listBinding ? rows.data : retainedRows;
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
  const readonlyFailed = readonlyEligible && readonlyPresented?.binding === fallbackBinding && readonlyPresented.state === "failed";
  const focusOwner = useMemo(() => ({loginKey, api, readIdentity}), [loginKey, api, readIdentity]);
  const {open: focusOpen, close: focusClose, cancel: cancelFocus, row: focusRow, detail: focusDetail, list: focusList} = useRequestSelectionFocus({
    owner: listPresented ? focusOwner : null, selected, listKey: JSON.stringify([filter, page]),
    openReady: readonlyReady || selected !== null && presentedCurrent && presented.state === "ready"
      && contextCurrent && state.access.canRead && state.access.available && !state.needsRefresh && !state.unresolved && !readbackPending,
    openFailed: selected !== null && (readonlyFailed || !readonlyEligible && (focusFailure === selected || presentedCurrent && presented.state === "failed")),
    listReady: currentRows !== null, listFailed: rows.binding === listBinding && rows.failed,
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
  const listGeneration = useRef<object | null>(null);
  useLayoutEffect(() => {
    // Invalidate at commit, before passive-effect cleanup: a superseded list
    // error must never end a newer authority/API/selection/filter context.
    const generation = {}; listGeneration.current = generation;
    return () => { if (listGeneration.current === generation) listGeneration.current = null; };
  }, [listAllowed, listBinding, list, workspace, api, selected]);
  useEffect(() => {
    if (!listAllowed) return;
    const controller = new AbortController(), generation = listGeneration.current;
    const current = () => !controller.signal.aborted && listGeneration.current === generation;
    void list(page, filter.search, filter.branch, controller.signal, readScope ?? undefined).then(data => {
      if (!current()) return;
      if (data.page !== page || data.rows.length > 100 || data.rows.some(row => !isInboundId(row.documentId)
        || !workspace?.branchIds.includes(row.branchId))) throw new Error("invalid_inbound_list");
      setRows({binding: listBinding, data, failed: false, readIdentity: verifiedReadAuthority ? readIdentity : null, viewKey: listViewKey});
    }).catch(error => {
      if (!current()) return;
      setRows({binding: listBinding, data: null, failed: true, readIdentity: null, viewKey: listViewKey});
      if (!(error instanceof ApiError) || ![401, 403, 409].includes(error.status)) return;
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
  }, [bridge, listAllowed, listBinding, list, page, filter, workspace, workspaceContext, api, selected, verifiedReadAuthority, readIdentity, listViewKey, readScope]);

  const navigate = useCallback((action: () => void) => {
    guardNavigation(() => {
      if (lifetime.current === null) return;
      // A dialog can have opened before a command became pending. Do not trust
      // its cached canDiscard flag to retire intent; re-register our blocker
      // after the unchanged provider clears its entries for that old dialog.
      if (bridge.hasUnresolved() || pendingReceipt.current !== null) {
        setGuardRevision(value => value + 1);
        setNotice(pendingReceipt.current
          ? "ERP đã xác nhận thao tác. Cần đọc snapshot khớp xác nhận trước khi rời phiếu; không gửi lại thao tác đã xác nhận."
          : "Kết quả thao tác chưa rõ. Chỉ đối soát yêu cầu gốc; không rời phiếu hoặc gửi lại.");
        return;
      }
      action();
    });
  }, [bridge, guardNavigation]);
  const select = useCallback((documentId: string | null) => {
    // Fence synchronously, including batched A→B→A selection before a commit.
    readObservation.bind(null); setReadonlyPage(null); setUnavailable(null); setReadonlyPresented(null);
    bridge.select(documentId); setSelected(documentId); setSelectionVersion(value => value + 1); setNotice(""); setPresented(null); setFocusFailure(null);
  }, [bridge, readObservation]);
  const requestBack = useCallback(() => navigate(() => { focusClose(); select(null); callbacks.current.onBack?.(); }), [navigate, select, focusClose]);
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
    const back = () => { sentinel(); requestBack(); };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [loginKey, requestBack, historyOwner]);
  const access: InboundDraftAccess = contextCurrent ? state.access : {...state.access, canRead: false, canSave: false, canSend: false, available: false};
  return <section data-testid="inbound-request-host" data-readback-pending={readbackPending} aria-label="Phiếu đề nghị nhập hàng"
    className={requestStyles.stack}>
    <CustodyGuard key={guardRevision} active={state.unresolved} readbackPending={readbackPending}/>
    <header className={requestStyles.actions} hidden={selected===null&&!onBack&&!onClose}>
      <RequestButton type="button" onClick={requestBack}>Quay lại danh sách</RequestButton>
      <RequestButton type="button" onClick={() => navigate(() => { focusClose(); select(null); callbacks.current.onClose?.(); })}>Đóng phiếu nhập hàng</RequestButton>
    </header>
    {loginKey === null || sessionEnded ? <RequestNotice>Đã kết thúc phiên. Đăng nhập lại để tiếp tục.</RequestNotice>
      : authorityDenied ? <RequestNotice>Chưa xác minh được quyền xem phiếu. Yêu cầu đang xử lý vẫn được giữ.</RequestNotice>
      : !contextCurrent ? <RequestNotice>Chưa xác minh được phiên ERP. Dữ liệu tạm ẩn; yêu cầu đang xử lý vẫn được giữ.</RequestNotice> : null}
    {notice && !sessionEnded && <RequestNotice warning>{notice}</RequestNotice>}
    {state.receipt && state.receipt.documentId === selected && contextCurrent && !state.needsRefresh && state.access.scopeKey !== null && state.access.canRead && state.access.available && <p data-testid="inbound-host-receipt">ERP đã xác nhận phiếu {state.receipt.documentId}.
      Mã thao tác {state.receipt.operationId}; xác nhận {state.receipt.auditId}. Lỗi tải lại không có nghĩa là lưu thất bại.</p>}
    {!sessionEnded && workspaceContext !== null && (selected !== null || authorityDenied) && <RequestButton type="button"
      onClick={() => { cancelFocus(); setDeniedContext(null); setRetry(value => value + 1); }}>
      Xác minh lại quyền nhập hàng</RequestButton>}
    {listPresented && <div className={requestStyles.panel}>
      <form aria-label="Lọc phiếu nhập hàng" className={requestStyles.toolbar} onSubmit={event => {
        event.preventDefault(); navigate(() => { cancelFocus(); select(null); setFilter({search, branch}); setPage(1); });
      }}>
        <label className={requestStyles.field}>Tìm phiếu nhập hàng<RequestInput placeholder="Nhập mã phiếu…" value={search} maxLength={100} onChange={event => setSearch(event.target.value)}/></label>
        <label className={requestStyles.field}>Lọc chi nhánh<select className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base font-normal" value={branch} onChange={event => setBranch(event.target.value)}>
          <option value="">Tất cả chi nhánh được cấp</option>{workspace?.branchIds.map(id => <option key={id} value={id}>{id}</option>)}
        </select></label>
        <RequestButton type="submit" variant="secondary">Áp dụng lọc nhập hàng</RequestButton>
      </form>
      <section aria-label="Danh sách phiếu nhập hàng" ref={focusList} tabIndex={-1} className={`${requestStyles.cards} scroll-mt-24`}>
        {!currentRows ? rows.binding === listBinding && rows.failed ? <RequestNotice warning>Chưa tải được danh sách.</RequestNotice> : <RequestLoading label="Đang tải danh sách."/>
          : currentRows.rows.length === 0 ? <RequestEmpty title="Không có phiếu trong trang này.">Thử điều chỉnh mã phiếu hoặc chi nhánh.</RequestEmpty>
          : currentRows.rows.map(row => <button key={row.documentId} ref={element => focusRow(row.documentId, element)} type="button" className={`${requestStyles.card} focus-visible:rounded-lg! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
            aria-label={`Mở phiếu ${row.documentId} · ${row.documentDate} · ${row.branchId} · trạng thái ${row.statusId ?? "NULL"}`}
            aria-pressed={selected === row.documentId} onClick={() => {
              if (selected === row.documentId) {
                // Re-focus does not navigate or discard dirty state/guard registration.
                if (!bridge.hasUnresolved() && pendingReceipt.current === null && contextCurrent
                  && (readonlyEligible && !readonlyFailed || state.access.canRead && state.access.available && !state.needsRefresh
                    && focusFailure !== row.documentId && !(presentedCurrent && presented.state === "failed"))) focusOpen(row.documentId);
              } else navigate(() => { focusOpen(row.documentId); select(row.documentId); });
            }}>
            <span className={requestStyles.cardHeading}><strong>{row.documentId}</strong><RequestStatus value={row.statusId}/></span>
            <span className={requestStyles.values}><span><span className="mb-1 block text-xs text-muted-foreground">Ngày chứng từ</span><strong className="font-medium">{requestDate(row.documentDate)}</strong></span><span><span className="mb-1 block text-xs text-muted-foreground">Chi nhánh</span><strong className="font-medium">{row.branchId}</strong></span></span>
            <span className="border-t border-border pt-3 text-sm font-medium">Xem phiếu</span></button>)}
      </section>
      <nav aria-label="Trang danh sách phiếu" className={requestStyles.footer}>
        <RequestButton type="button" disabled={page === 1} onClick={() => navigate(() => { cancelFocus(); select(null); setPage(value => value - 1); })}>Trang phiếu trước</RequestButton>
        <span>Trang {page}</span>
        <RequestButton type="button" disabled={!currentRows?.hasMore} onClick={() => navigate(() => { cancelFocus(); select(null); setPage(value => value + 1); })}>Trang phiếu tiếp</RequestButton>
      </nav>
    </div>}
    {/* Always mounted, even on close, permission change, list error or transient
        workspace=null. Only loginKey above retires this I18 instance. */}
    <div ref={focusDetail} tabIndex={-1} role="region" aria-label="Phiếu nhập hàng đã chọn" className="scroll-mt-24 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" hidden={selected===null&&!state.unresolved&&!readbackPending}>
      <div hidden={readonlyEligible}><MobileInboundRequest documentId={selected} access={access} adapter={adapter} onConfirmed={acknowledge} onPresentedRead={onPresentedRead}/></div>
      {readonlyEligible && selected !== null && readScope !== null && <InboundRequestReadOnly documentId={selected}
        branchIds={workspace?.branchIds ?? []} scope={readScope} initialPage={readonlyPageNumber} onPageChange={onReadonlyPageChange}
        verifying={readonlyVerifying} readRevision={unavailable}
        onDenied={onReadonlyDenied} onPresented={onReadonlyPresented}/>}
    </div>
    <p className={requestStyles.muted}>Lưu thay đổi và Gửi kho là hai thao tác riêng.</p>
  </section>;
}
