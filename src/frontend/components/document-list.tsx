"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, FileText, LockKeyhole, RefreshCw, Search } from "lucide-react";
import { DocumentDetail } from "@/components/document-detail";
import { Button } from "@/components/ui/button";
import { ApiError, errorMessage, getDocuments } from "@/lib/api";
import { DocumentKind, documentPageSchema, Session } from "@/lib/contracts";
import { z } from "zod";

type Row = z.infer<typeof documentPageSchema>["rows"][number];
export function DocumentList({ kind, session, branches }: { kind: DocumentKind; session: Session; branches: string[] }) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState("");
  const [selected, setSelected] = useState("");
  const [opened, setOpened] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  const open = (id: string, element: HTMLElement) => { opener.current = element; setOpened(id); };
  const close = () => { setOpened(""); if (opener.current?.isConnected) opener.current.focus(); };
  const title = kind === "purchase-orders" ? "Đơn đặt hàng mua" : "Yêu cầu nhập kho";
  const result = useQuery({ queryKey: ["documents", session.tenantId, session.companyId, session.authorityVersion, kind, page, search, branch],
    queryFn: ({ signal }) => getDocuments(kind, page, search, branch, signal) });
  useEffect(() => {
    if (!(result.error instanceof ApiError)) return;
    if (result.error.status === 401) { client.clear(); window.location.replace("/"); }
    if (result.error.status === 403) { void client.invalidateQueries({ queryKey: ["workspace"] }); }
  }, [result.error, client]);
  useEffect(() => { setSelected(""); setOpened(""); }, [page, search, branch]);
  const columns = useMemo<ColumnDef<Row>[]>(() => [
    { accessorKey: "documentId", header: "Số chứng từ", cell: ({ getValue }) => <button type="button" className="document-id document-open" aria-label={`Xem chi tiết ${String(getValue())}`} onClick={event => open(String(getValue()), event.currentTarget)}><FileText size={14}/>{String(getValue())}</button> },
    { accessorKey: "documentDate", header: "Ngày chứng từ", cell: ({ getValue }) => String(getValue()).split("-").reverse().join("/") },
    { accessorKey: "branchId", header: "Chi nhánh" },
    { accessorKey: "statusId", header: "Mã trạng thái", cell: ({ getValue }) => getValue() == null ? "—" : <span className="pill pill-neutral">{String(getValue())}</span> },
    { accessorKey: "isLocked", header: "Khóa chứng từ", cell: ({ getValue }) => getValue() === true ? <span className="lock-state"><LockKeyhole size={13}/> Đã khóa</span> : getValue() === false ? "Chưa khóa" : "—" },
  ], []);
  const table = useReactTable({ data: result.error ? [] : result.data?.rows ?? [], columns, getCoreRowModel: getCoreRowModel(), getRowId: row => row.documentId });
  return <section className="document-page" aria-label={title}>
    <div className="page-heading"><div><p className="eyebrow">{kind === "purchase-orders" ? "MUA HÀNG" : "KHO HÀNG"}</p><h1>{title}</h1><p className="muted">Tra cứu chứng từ trong các chi nhánh được cấp quyền.</p></div><Button variant="outline" onClick={() => void result.refetch()} disabled={result.isFetching}><RefreshCw size={16} className={result.isFetching ? "spin" : ""}/> Làm mới</Button></div>
    <section className="surface document-surface"><div className="document-toolbar"><form onSubmit={event => { event.preventDefault(); setSearch(draft.trim()); setPage(1); }} className="document-search"><label className="sr-only" htmlFor="document-search">Tìm số chứng từ</label><Search size={16}/><input id="document-search" value={draft} maxLength={100} onChange={event => setDraft(event.target.value)} placeholder="Tìm số chứng từ…"/><Button type="submit" variant="outline">Tìm kiếm</Button></form><label className="branch-filter">Chi nhánh<select value={branch} onChange={event => { setBranch(event.target.value); setPage(1); }}><option value="">Tất cả được cấp quyền</option>{branches.map(id => <option key={id} value={id}>{id}</option>)}</select></label><span className="pill pill-neutral">Chỉ xem</span></div>
      {result.error ? <div role="alert" className="document-state error-message">{errorMessage(result.error)}</div> : result.isPending ? <p role="status" className="document-state">Đang tải chứng từ…</p> : <><div className="document-table-scroll" aria-busy={result.isFetching}><table className="document-table"><caption className="sr-only">{title}, trang {page}</caption><thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id} scope="col">{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row, index, rows) => <tr key={row.id} tabIndex={0} aria-selected={selected === row.id} onFocus={() => setSelected(row.id)} onClick={event => event.currentTarget.focus()} onDoubleClick={event => open(row.id, event.currentTarget)} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === "Enter") { event.preventDefault(); open(row.id, event.currentTarget); return; } if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return; event.preventDefault(); const next = Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))); const sibling = event.currentTarget.parentElement?.children[next] as HTMLElement | undefined; sibling?.focus(); }}>{row.getVisibleCells().map(cell => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table></div>{result.data?.rows.length === 0 && <div className="document-empty"><FileText size={27}/><strong>Không có chứng từ phù hợp</strong><p>Thử thay đổi số chứng từ hoặc chi nhánh.</p></div>}</>}
      <div className="document-pagination"><span>{result.data && !result.error ? `${result.data.rows.length} chứng từ trên trang này` : ""}</span><div><Button variant="ghost" aria-label="Trang trước" onClick={() => setPage(value => value - 1)} disabled={page === 1 || result.isFetching}><ChevronLeft size={16}/></Button><span>Trang {page}</span><Button variant="ghost" aria-label="Trang sau" onClick={() => setPage(value => value + 1)} disabled={!result.data?.hasMore || page >= 1000 || result.isFetching || !!result.error}><ChevronRight size={16}/></Button></div></div>
    </section><p className="small-muted">Dùng phím ↑ và ↓ để di chuyển, Enter hoặc chọn số chứng từ để xem chi tiết. Trạng thái hiển thị theo mã chứng từ trong ERP.</p>
    {opened && !result.error && result.data?.rows.some(row => row.documentId === opened) && <DocumentDetail key={`${kind}:${session.authorityVersion}:${opened}`} kind={kind} documentId={opened} session={session} onClose={close}/>}
  </section>;
}
