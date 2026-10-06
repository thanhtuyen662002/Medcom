"use client";
import {RequestButton,RequestInput,RequestNotice,RequestEmpty,RequestLoading,RequestStatus,requestDate,requestStyles} from "./request-presentation";
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore} from "react";
import {ApiError, getDocuments} from "@/lib/erp/api";
import type {DocumentPage, WorkspaceData} from "@/lib/erp/contracts";
import {observedView, snapshotAcknowledges, type InboundDraftAccess, type InboundDraftAdapter, type InboundDraftReceipt} from "@/lib/erp/inbound-draft";
import {createInboundRequestApi, isInboundId, type InboundRequestApi} from "@/lib/erp/inbound-request-api";
import {createInboundRequestBridge} from "@/lib/erp/inbound-request-command-adapter";
import {MobileInboundRequest} from "./mobile-inbound-request";
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
  list?: (page: number, search: string, branchId: string, signal: AbortSignal) => Promise<DocumentPage>;
};
const defaultList = (page: number, search: string, branchId: string, signal: AbortSignal) =>
  getDocuments("inbound-requests", page, search, branchId, signal);
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
  const defaultApi = useMemo(() => createInboundRequestApi(), []), api = suppliedApi ?? defaultApi;
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
  const [search, setSearch] = useState(""), [branch, setBranch] = useState("");
  const [filter, setFilter] = useState({search: "", branch: ""});
  const [retry, setRetry] = useState(0), [guardRevision, setGuardRevision] = useState(0), [notice, setNotice] = useState("");
  const [rows, setRows] = useState<{binding: string; data: DocumentPage | null; failed: boolean}>({binding: "", data: null, failed: false});
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
  const listBinding = JSON.stringify([context, filter, page, retry]);
  const currentRows = listAllowed && rows.binding === listBinding ? rows.data : null;
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
    void bridge.revalidate(controller.signal).catch(() => {
      if (!controller.signal.aborted) setNotice("Chưa xác minh được quyền nhập hàng. Ý định đang giữ không bị bỏ; thử xác minh lại trong đúng phiên.");
    });
    return () => controller.abort();
  }, [bridge, contextCurrent, context, api, selected, retry]);
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
    void list(page, filter.search, filter.branch, controller.signal).then(data => {
      if (!current()) return;
      if (data.page !== page || data.rows.length > 100 || data.rows.some(row => !isInboundId(row.documentId)
        || !workspace?.branchIds.includes(row.branchId))) throw new Error("invalid_inbound_list");
      setRows({binding: listBinding, data, failed: false});
    }).catch(error => {
      if (!current()) return;
      setRows({binding: listBinding, data: null, failed: true});
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
  }, [bridge, listAllowed, listBinding, list, page, filter, workspace, workspaceContext, api, selected]);

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
    bridge.select(documentId); setSelected(documentId); setNotice("");
  }, [bridge]);
  const requestBack = useCallback(() => navigate(() => { select(null); callbacks.current.onBack?.(); }), [navigate, select]);
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
      <RequestButton type="button" onClick={() => navigate(() => { select(null); callbacks.current.onClose?.(); })}>Đóng phiếu nhập hàng</RequestButton>
    </header>
    {loginKey === null || sessionEnded ? <RequestNotice>Đã kết thúc phiên. Đăng nhập lại để tiếp tục.</RequestNotice>
      : authorityDenied ? <RequestNotice>Chưa xác minh được quyền xem phiếu. Yêu cầu đang xử lý vẫn được giữ.</RequestNotice>
      : !contextCurrent ? <RequestNotice>Chưa xác minh được phiên ERP. Dữ liệu tạm ẩn; yêu cầu đang xử lý vẫn được giữ.</RequestNotice> : null}
    {notice && !sessionEnded && <RequestNotice warning>{notice}</RequestNotice>}
    {state.receipt && state.receipt.documentId === selected && contextCurrent && !state.needsRefresh && state.access.scopeKey !== null && state.access.canRead && state.access.available && <p data-testid="inbound-host-receipt">ERP đã xác nhận phiếu {state.receipt.documentId}.
      Mã thao tác {state.receipt.operationId}; xác nhận {state.receipt.auditId}. Lỗi tải lại không có nghĩa là lưu thất bại.</p>}
    {!sessionEnded && workspaceContext !== null && (selected !== null || authorityDenied) && <RequestButton type="button"
      onClick={() => { setDeniedContext(null); setRetry(value => value + 1); }}>
      Xác minh lại quyền nhập hàng</RequestButton>}
    {listAllowed && <div className={requestStyles.panel}>
      <form aria-label="Lọc phiếu nhập hàng" className={requestStyles.toolbar} onSubmit={event => {
        event.preventDefault(); navigate(() => { select(null); setFilter({search, branch}); setPage(1); });
      }}>
        <label className={requestStyles.field}>Tìm phiếu nhập hàng<RequestInput value={search} maxLength={100} onChange={event => setSearch(event.target.value)}/></label>
        <label className={requestStyles.field}>Lọc chi nhánh<select className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base font-normal" value={branch} onChange={event => setBranch(event.target.value)}>
          <option value="">Tất cả chi nhánh được cấp</option>{workspace?.branchIds.map(id => <option key={id} value={id}>{id}</option>)}
        </select></label>
        <RequestButton type="submit" variant="secondary">Áp dụng lọc nhập hàng</RequestButton>
      </form>
      <section aria-label="Danh sách phiếu nhập hàng" className={requestStyles.cards}>
        {!currentRows ? rows.binding === listBinding && rows.failed ? <RequestNotice warning>Chưa tải được danh sách.</RequestNotice> : <RequestLoading label="Đang tải danh sách."/>
          : currentRows.rows.length === 0 ? <RequestEmpty title="Không có phiếu trong trang này.">Thử điều chỉnh mã phiếu hoặc chi nhánh.</RequestEmpty>
          : currentRows.rows.map(row => <button key={row.documentId} type="button" className={requestStyles.card}
            aria-label={`Mở phiếu ${row.documentId} · ${row.documentDate} · ${row.branchId} · trạng thái ${row.statusId ?? "NULL"}`}
            aria-pressed={selected === row.documentId} onClick={() => { if (selected !== row.documentId) navigate(() => select(row.documentId)); }}>
            <span className={requestStyles.cardHeading}><strong>{row.documentId}</strong><RequestStatus value={row.statusId}/></span>
            <span className={requestStyles.values}><span><span className="mb-1 block text-xs text-muted-foreground">Ngày chứng từ</span><strong className="font-medium">{requestDate(row.documentDate)}</strong></span><span><span className="mb-1 block text-xs text-muted-foreground">Chi nhánh</span><strong className="font-medium">{row.branchId}</strong></span></span>
            <span className="border-t border-border pt-3 text-sm font-medium">Xem phiếu</span></button>)}
      </section>
      <nav aria-label="Trang danh sách phiếu" className={requestStyles.footer}>
        <RequestButton type="button" disabled={page === 1} onClick={() => navigate(() => { select(null); setPage(value => value - 1); })}>Trang phiếu trước</RequestButton>
        <span>Trang {page}</span>
        <RequestButton type="button" disabled={!currentRows?.hasMore} onClick={() => navigate(() => { select(null); setPage(value => value + 1); })}>Trang phiếu tiếp</RequestButton>
      </nav>
    </div>}
    {/* Always mounted, even on close, permission change, list error or transient
        workspace=null. Only loginKey above retires this I18 instance. */}
    <MobileInboundRequest documentId={selected} access={access} adapter={adapter} onConfirmed={acknowledge}/>
    <p className={requestStyles.muted}>Lưu thay đổi và Gửi kho là hai thao tác riêng.</p>
  </section>;
}
