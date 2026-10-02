"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText, LockKeyhole, RefreshCw, Search } from "lucide-react";
import { DocumentDetail } from "@/components/document-detail";
import { DataGrid } from "@/components/grid/data-grid";
import { documentScopeKey } from "@/components/grid/grid-state";
import { Button } from "@/components/ui/button";
import { ApiError, errorMessage, getDocuments } from "@/lib/api";
import { DocumentKind, Session } from "@/lib/contracts";

type Props = { kind: DocumentKind; session: Session; branches: string[] };
export function DocumentList(props: Props) {
  // Query isolation alone does not reset an old selection/draft when authority changes.
  return <ScopedDocumentList key={documentScopeKey(props.kind, props.session, props.branches)} {...props}/>;
}
function ScopedDocumentList({ kind, session, branches }: Props) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState("");
  const [opened, setOpened] = useState("");
  const [scopeDenied, setScopeDenied] = useState(false);
  const [focusAfterLoad, setFocusAfterLoad] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const open = (id: string, element: HTMLElement) => { opener.current = element; setOpened(id); };
  const close = () => {
    setOpened("");
    if (opener.current?.isConnected) opener.current.focus();
    else grid.current?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')?.focus();
  };
  const denyScope = () => { setScopeDenied(true); setOpened(""); };
  const title = kind === "purchase-orders" ? "Đơn đặt hàng mua" : "Yêu cầu nhập kho";
  const result = useQuery({ queryKey: ["documents", session.tenantId, session.companyId, session.authorityVersion, kind, page, search, branch],
    queryFn: ({ signal }) => getDocuments(kind, page, search, branch, signal), enabled: !scopeDenied });
  useEffect(() => {
    if (!(result.error instanceof ApiError)) return;
    if (result.error.status === 401) { client.clear(); window.location.replace("/"); }
    if (result.error.status === 403) { setScopeDenied(true); setOpened(""); }
  }, [result.error, client]);
  useEffect(() => {
    if (!scopeDenied) return;
    // Cancel pending reads and remove cached document bodies for the denied scope.
    const filter = { predicate: (query: { queryKey: readonly unknown[] }) =>
      (query.queryKey[0] === "documents" || query.queryKey[0] === "document-detail")
      && query.queryKey[1] === session.tenantId && query.queryKey[2] === session.companyId
      && query.queryKey[3] === session.authorityVersion };
    void client.cancelQueries(filter).then(() => client.removeQueries(filter));
    void client.invalidateQueries({ queryKey: ["workspace"] });
  }, [scopeDenied, client, session.tenantId, session.companyId, session.authorityVersion]);
  useEffect(() => {
    if (!opened || result.isFetching || !result.data || result.error) return;
    if (result.data.rows.some(row => row.documentId === opened)) return;
    setOpened("");
    grid.current?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')?.focus();
  }, [opened, result.isFetching, result.data, result.error]);
  useEffect(() => {
    if (!focusAfterLoad || result.isFetching || result.isPending || result.error || scopeDenied) return;
    const target = grid.current?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]') ?? grid.current;
    target?.focus(); setFocusAfterLoad(false);
  }, [focusAfterLoad, result.isFetching, result.isPending, result.error, scopeDenied]);
  const changePage = (next: number) => { setOpened(""); setPage(next); setFocusAfterLoad(true); };
  const rows = result.error || scopeDenied ? [] : result.data?.rows ?? [];
  return <section className="document-page" aria-label={title}>
    <div className="page-heading"><div><p className="eyebrow">{kind === "purchase-orders" ? "MUA HÀNG" : "KHO HÀNG"}</p><h1>{title}</h1><p className="muted">Tra cứu chứng từ trong các chi nhánh được cấp quyền.</p></div><Button variant="outline" onClick={() => { setScopeDenied(false); void result.refetch(); }} disabled={result.isFetching}><RefreshCw size={16} className={result.isFetching ? "spin" : ""}/> Làm mới</Button></div>
    <section className="surface document-surface"><div className="document-toolbar">
      <form onSubmit={event => { event.preventDefault(); setOpened(""); setSearch(draft.trim()); setPage(1); setFocusAfterLoad(true); }} className="document-search">
        <label className="sr-only" htmlFor="document-search">Tìm số chứng từ</label><Search size={16}/><input id="document-search" value={draft} maxLength={100} onChange={event => setDraft(event.target.value)} placeholder="Tìm số chứng từ…"/>
        <Button type="submit" variant="outline" disabled={result.isFetching || scopeDenied}>Tìm kiếm</Button>
      </form><label className="branch-filter">Chi nhánh<select aria-label="Chi nhánh" value={branch} disabled={result.isFetching || scopeDenied}
        onChange={event => { setOpened(""); setBranch(event.target.value); setPage(1); setFocusAfterLoad(true); }}>
        <option value="">Tất cả được cấp quyền</option>{branches.map(id => <option key={id} value={id}>{id}</option>)}</select></label><span className="pill pill-neutral">Chỉ xem</span>
    </div>
      {scopeDenied ? <div role="alert" className="document-state error-message">Quyền xem chứng từ đã thay đổi. Làm mới để kiểm tra lại quyền truy cập.</div>
        : result.error ? <div role="alert" className="document-state error-message">{errorMessage(result.error)}</div>
        : result.isPending ? <p role="status" className="document-state">Đang tải chứng từ…</p>
        : <div ref={grid} tabIndex={-1} aria-label="Kết quả tra cứu"><DataGrid label={`${title}, trang ${page}`} rows={rows} getRowId={row => row.documentId}
          busy={result.isFetching} emptyMessage="Không có chứng từ phù hợp. Thử thay đổi số chứng từ hoặc chi nhánh."
          onActivate={(row, element) => open(row.documentId, element)} columns={[
            { id: "documentId", label: "Số chứng từ", width: 220, render: row => <button type="button" tabIndex={-1} className="document-id document-open"
              aria-label={`Xem chi tiết ${row.documentId}`} disabled={result.isFetching} onClick={event => open(row.documentId, event.currentTarget)}><FileText size={14}/>{row.documentId}</button> },
            { id: "documentDate", label: "Ngày chứng từ", render: row => row.documentDate.split("-").reverse().join("/") },
            { id: "branchId", label: "Chi nhánh", render: row => row.branchId },
            { id: "statusId", label: "Mã trạng thái", render: row => row.statusId == null ? "—" : <span className="pill pill-neutral">{row.statusId}</span> },
            { id: "isLocked", label: "Khóa chứng từ", render: row => row.isLocked === true ? <span className="lock-state"><LockKeyhole size={13}/> Đã khóa</span> : row.isLocked === false ? "Chưa khóa" : "—" },
          ]}/></div>}
      <div className="document-pagination"><span role="status" aria-live="polite">{!scopeDenied && result.data && !result.error ? `${result.isFetching ? "Đang làm mới · " : ""}${rows.length} chứng từ trên trang ${page}` : ""}</span><div>
        <Button variant="ghost" aria-label="Trang trước" onClick={() => changePage(page - 1)} disabled={page === 1 || result.isFetching || scopeDenied}><ChevronLeft size={16}/></Button>
        <span>Trang {page}</span><Button variant="ghost" aria-label="Trang sau" onClick={() => changePage(page + 1)} disabled={!result.data?.hasMore || page >= 1000 || result.isFetching || !!result.error || scopeDenied}><ChevronRight size={16}/></Button>
      </div></div>
    </section><p className="small-muted">Dùng phím mũi tên để di chuyển ô, Enter để xem chi tiết, Tab để rời bảng. Trạng thái hiển thị theo mã chứng từ trong ERP.</p>
    {opened && !result.error && !scopeDenied && rows.some(row => row.documentId === opened) && <DocumentDetail key={`${kind}:${session.authorityVersion}:${opened}`} kind={kind} documentId={opened} session={session} onClose={close} onScopeDenied={denyScope}/>}
  </section>;
}
