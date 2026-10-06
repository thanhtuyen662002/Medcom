"use client";
import {useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties} from "react";
import {getDocuments} from "@/lib/erp/api";
import type {DocumentPage, WorkspaceData} from "@/lib/erp/contracts";
import type {InboundDraftAccess} from "@/lib/erp/inbound-draft";
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
  api?: InboundRequestApi;
  // Existing inbound LIST only. Test seam; never use paginated detail as draft.
  list?: (page: number, search: string, branchId: string, signal: AbortSignal) => Promise<DocumentPage>;
};
const control: CSSProperties = {font: "inherit", boxSizing: "border-box", minHeight: 44, minWidth: 0, maxWidth: "100%",
  padding: 8, border: "1px solid var(--border,#bbb)", borderRadius: 8, overflowWrap: "anywhere"};
const defaultList = (page: number, search: string, branchId: string, signal: AbortSignal) =>
  getDocuments("inbound-requests", page, search, branchId, signal);
function CustodyGuard({active}: {active: boolean}) { useDirtyGuard(active, false); return null; }

/** Mount under the EXISTING NavigationGuardProvider. Keep the host mounted
 * during a workspace fetch/error. Only login retirement resets I18/transport. */
export function InboundRequestScreen(props: InboundRequestScreenProps) {
  return <RetainedInboundHost key={JSON.stringify([props.loginKey])} {...props}/>;
}
function RetainedInboundHost({loginKey, workspace, onClose, onBack, api: suppliedApi, list = defaultList}: InboundRequestScreenProps) {
  const defaultApi = useMemo(() => createInboundRequestApi(), []), api = suppliedApi ?? defaultApi;
  const [bridge] = useState(() => createInboundRequestBridge(api));
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot);
  const guard = useNavigationGuard();
  const [selected, setSelected] = useState<string | null>(null), [page, setPage] = useState(1);
  const [search, setSearch] = useState(""), [branch, setBranch] = useState("");
  const [filter, setFilter] = useState({search: "", branch: ""});
  const [retry, setRetry] = useState(0), [guardRevision, setGuardRevision] = useState(0), [notice, setNotice] = useState("");
  const [rows, setRows] = useState<{binding: string; data: DocumentPage | null; failed: boolean}>({binding: "", data: null, failed: false});
  const [configured, setConfigured] = useState<{key: string | null; api: InboundRequestApi} | null>(null);
  // Revalidation identity ONLY, not a login scope or an editor remount key.
  const context = loginKey !== null && workspace !== null ? JSON.stringify([loginKey, workspace.session.tenantId, workspace.session.companyId, workspace.session.authorityVersion,
    workspace.session.capabilities, workspace.branchIds]) : null;
  const contextCurrent = context !== null && configured?.key === context && configured.api === api;
  const listAllowed = contextCurrent && !!workspace?.session.capabilities.includes("inbound-requests.read");
  const listBinding = JSON.stringify([context, filter, page, retry]);
  const currentRows = listAllowed && rows.binding === listBinding ? rows.data : null;
  const apiRef = useRef(api); apiRef.current = api;
  useLayoutEffect(() => {
    bridge.configure(context, api); setConfigured({key: context, api});
  }, [bridge, context, api]);
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
  useEffect(() => {
    if (!listAllowed) return;
    const controller = new AbortController();
    void list(page, filter.search, filter.branch, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (data.page !== page || data.rows.length > 100 || data.rows.some(row => !isInboundId(row.documentId)
        || !workspace?.branchIds.includes(row.branchId))) throw new Error("invalid_inbound_list");
      setRows({binding: listBinding, data, failed: false});
    }).catch(() => { if (!controller.signal.aborted) setRows({binding: listBinding, data: null, failed: true}); });
    return () => controller.abort();
  }, [listAllowed, listBinding, list, page, filter, workspace]);

  const callbacks = useRef({onClose, onBack}); callbacks.current = {onClose, onBack};
  function navigate(action: () => void) {
    guard.request(() => {
      if (lifetime.current === null) return;
      // A dialog can have opened before a command became pending. Do not trust
      // its cached canDiscard flag to retire intent; re-register our blocker
      // after the unchanged provider clears its entries for that old dialog.
      if (bridge.hasUnresolved()) {
        setGuardRevision(value => value + 1);
        setNotice("Kết quả thao tác chưa rõ. Chỉ đối soát yêu cầu gốc; không rời phiếu hoặc gửi lại.");
        return;
      }
      action();
    });
  }
  function select(documentId: string | null) {
    bridge.select(documentId); setSelected(documentId); setNotice("");
  }
  const requestBack = useRef<() => void>(() => undefined);
  requestBack.current = () => navigate(() => { select(null); callbacks.current.onBack?.(); });
  useEffect(() => {
    if (loginKey === null) return;
    // A same-URL sentinel catches an ordinary browser Back BEFORE a router
    // leaves this screen. The parent still owns cross-screen routing and must
    // route its own navigation through NavigationGuardProvider.request.
    const marker = crypto.randomUUID(), href = window.location.href;
    const sentinel = () => window.history.pushState({...window.history.state, medcomInboundHost: marker}, "", href);
    sentinel();
    const back = () => { sentinel(); requestBack.current(); };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [loginKey]);
  const access: InboundDraftAccess = contextCurrent ? state.access : {...state.access, canRead: false, canSave: false, canSend: false, available: false};
  return <section data-testid="inbound-request-host" aria-label="Phiếu đề nghị nhập hàng"
    style={{maxWidth: 960, width: "100%", minWidth: 0, margin: "0 auto", padding: 12, boxSizing: "border-box", display: "grid", gap: 12, overflowWrap: "anywhere"}}>
    <CustodyGuard key={guardRevision} active={state.unresolved}/>
    <header style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
      <h1 style={{flexBasis: "100%", margin: 0}}>Đề nghị nhập hàng</h1>
      <button type="button" style={control} onClick={() => requestBack.current()}>Quay lại danh sách</button>
      <button type="button" style={control} onClick={() => navigate(() => { select(null); callbacks.current.onClose?.(); })}>Đóng phiếu nhập hàng</button>
    </header>
    {loginKey === null ? <p role="status">Đã kết thúc phiên. Dữ liệu phiên cũ đã được loại bỏ.</p>
      : !contextCurrent ? <p role="status">Workspace tạm không khả dụng. Dữ liệu bị ẩn và thao tác bị khóa; ý định của phiên này vẫn được giữ.</p> : null}
    {notice && <p role="status">{notice}</p>}
    {state.receipt && contextCurrent && <p data-testid="inbound-host-receipt">ERP đã xác nhận phiếu {state.receipt.documentId}.
      Mã thao tác {state.receipt.operationId}; xác nhận {state.receipt.auditId}. Lỗi tải lại không có nghĩa là lưu thất bại.</p>}
    {contextCurrent && selected !== null && <button type="button" style={control} onClick={() => setRetry(value => value + 1)}>
      Xác minh lại quyền nhập hàng</button>}
    {listAllowed && <>
      <form aria-label="Lọc phiếu nhập hàng" style={{display: "grid", gap: 8, minWidth: 0}} onSubmit={event => {
        event.preventDefault(); navigate(() => { select(null); setFilter({search, branch}); setPage(1); });
      }}>
        <label>Tìm phiếu nhập hàng<input style={{...control, width: "100%"}} value={search} maxLength={100} onChange={event => setSearch(event.target.value)}/></label>
        <label>Lọc chi nhánh<select style={{...control, width: "100%"}} value={branch} onChange={event => setBranch(event.target.value)}>
          <option value="">Tất cả chi nhánh được cấp</option>{workspace?.branchIds.map(id => <option key={id} value={id}>{id}</option>)}
        </select></label>
        <button type="submit" style={control}>Áp dụng lọc nhập hàng</button>
      </form>
      <section aria-label="Danh sách phiếu nhập hàng" style={{display: "grid", gap: 8, minWidth: 0}}>
        {!currentRows ? <p role="status">{rows.binding === listBinding && rows.failed ? "Chưa tải được danh sách." : "Đang tải danh sách."}</p>
          : currentRows.rows.length === 0 ? <p>Không có phiếu trong trang này.</p>
          : currentRows.rows.map(row => <button key={row.documentId} type="button" style={{...control, textAlign: "left"}}
            aria-pressed={selected === row.documentId} onClick={() => { if (selected !== row.documentId) navigate(() => select(row.documentId)); }}>
            Mở phiếu {row.documentId} · {row.documentDate} · {row.branchId} · trạng thái {row.statusId ?? "NULL"}</button>)}
      </section>
      <nav aria-label="Trang danh sách phiếu" style={{display: "flex", flexWrap: "wrap", gap: 8}}>
        <button type="button" style={control} disabled={page === 1} onClick={() => navigate(() => { select(null); setPage(value => value - 1); })}>Trang phiếu trước</button>
        <span>Trang {page}</span>
        <button type="button" style={control} disabled={!currentRows?.hasMore} onClick={() => navigate(() => { select(null); setPage(value => value + 1); })}>Trang phiếu tiếp</button>
      </nav>
    </>}
    {/* Always mounted, even on close, permission change, list error or transient
        workspace=null. Only loginKey above retires this I18 instance. */}
    <MobileInboundRequest documentId={selected} access={access} adapter={bridge.adapter} onConfirmed={bridge.acknowledge}/>
    <p>Chọn phiếu hiện hữu rồi đọc đầy đủ. Lưu và Gửi kho là hai thao tác riêng. Tạo mới, sửa chi phí, đổi ngày/chi nhánh và ánh xạ QR chưa được mở.</p>
  </section>;
}
