"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCw, X } from "lucide-react";
import { DataGrid } from "@/components/grid/data-grid";
import { Button } from "@/components/ui/button";
import { ApiError, errorMessage, getDocumentDetail } from "@/lib/api";
import { DocumentKind, Session, documentDetailSchema } from "@/lib/contracts";
import type { z } from "zod";

type Detail = z.infer<typeof documentDetailSchema>;
type Line = Detail["purchaseOrderLines"][number] | Detail["inboundRequestLines"][number];
export function DocumentDetail({ kind, documentId, session, onClose, onScopeDenied }: {
  kind: DocumentKind; documentId: string; session: Session; onClose: () => void; onScopeDenied: () => void;
}) {
  const client = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [focusAfterLoad, setFocusAfterLoad] = useState(false);
  const result = useQuery({ queryKey: ["document-detail", session.tenantId, session.companyId,
    session.authorityVersion, kind, documentId, page],
    queryFn: ({ signal }) => getDocumentDetail(kind, documentId, page, signal) });
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (!(result.error instanceof ApiError)) return;
    if (result.error.status === 401) { client.clear(); window.location.replace("/"); }
    if (result.error.status === 403) onScopeDenied();
  }, [result.error, client, onScopeDenied]);
  useEffect(() => {
    if (!focusAfterLoad || result.isFetching || result.isPending || result.error) return;
    (grid.current?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]') ?? heading.current)?.focus();
    setFocusAfterLoad(false);
  }, [focusAfterLoad, result.isFetching, result.isPending, result.error]);
  const detail = result.error ? undefined : result.data;
  const purchase = kind === "purchase-orders";
  const rows: Line[] = detail ? purchase ? detail.purchaseOrderLines : detail.inboundRequestLines : [];
  const quantities = (row: Line) => "quantity" in row ? [row.quantity, row.quantity2]
    : [row.setQuantityByDocument, row.barrelQuantityByDocument, row.setQuantityByReal, row.barrelQuantityByReal];
  const labels = purchase ? ["Số lượng", "Số lượng 2"] : ["Số bộ theo chứng từ", "Số thùng theo chứng từ", "Số bộ thực tế", "Số thùng thực tế"];
  const changePage = (next: number) => { setPage(next); setFocusAfterLoad(true); };
  return <section className="surface document-surface document-detail" aria-labelledby="document-detail-title"
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <div className="document-detail-heading"><div><h2 id="document-detail-title" ref={heading} tabIndex={-1}>Chi tiết hàng hóa · {detail?.document.documentId ?? documentId}</h2>
      <p className="muted">{detail ? `Chi nhánh ${detail.document.branchId} · ${detail.document.documentDate.split("-").reverse().join("/")}` : "Đang kiểm tra quyền xem chứng từ"}</p></div>
      <div><Button variant="ghost" onClick={() => void result.refetch()} disabled={result.isFetching} aria-label="Làm mới chi tiết"><RefreshCw size={16}/></Button>
        <Button variant="ghost" onClick={onClose} aria-label="Đóng chi tiết"><X size={18}/></Button></div></div>
    {result.error ? <p role="alert" className="document-state error-message">{errorMessage(result.error)}</p>
      : result.isPending ? <p role="status" className="document-state">Đang tải dòng hàng…</p>
      : <div ref={grid}><DataGrid<Line> label={`Dòng hàng chứng từ ${documentId}, trang ${page}`} rows={rows} getRowId={row => row.lineId}
        busy={result.isFetching} emptyMessage="Không có dòng hàng trên trang này." columns={[
          { id: "itemId", label: "Mã hàng", width: 220, render: row => row.itemId },
          ...labels.map((label, index) => ({ id: `quantity${index}`, label, width: 260, numeric: true,
            render: (row: Line) => quantities(row)[index] ?? "—" })),
        ]}/></div>}
    <div className="document-pagination"><span role="status" aria-live="polite">{detail ? `${result.isFetching ? "Đang làm mới · " : ""}${rows.length} dòng hàng trên trang ${page}` : ""}</span><div>
      <Button variant="ghost" aria-label="Trang dòng hàng trước" onClick={() => changePage(page - 1)} disabled={page === 1 || result.isFetching}><ChevronLeft size={16}/></Button>
      <span>Trang {page}</span><Button variant="ghost" aria-label="Trang dòng hàng sau" onClick={() => changePage(page + 1)} disabled={!detail?.hasMore || page >= 1000 || result.isFetching}><ChevronRight size={16}/></Button>
    </div></div>
  </section>;
}
