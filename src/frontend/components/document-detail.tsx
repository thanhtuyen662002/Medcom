"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError, errorMessage, getDocumentDetail } from "@/lib/api";
import { DocumentKind, Session } from "@/lib/contracts";

export function DocumentDetail({ kind, documentId, session, onClose }: {
  kind: DocumentKind; documentId: string; session: Session; onClose: () => void;
}) {
  const client = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  const [page, setPage] = useState(1);
  const result = useQuery({ queryKey: ["document-detail", session.tenantId, session.companyId,
    session.authorityVersion, kind, documentId, page],
    queryFn: ({ signal }) => getDocumentDetail(kind, documentId, page, signal) });
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (!(result.error instanceof ApiError)) return;
    if (result.error.status === 401) { client.clear(); window.location.replace("/"); }
    if (result.error.status === 403) void client.invalidateQueries({ queryKey: ["workspace"] });
  }, [result.error, client]);
  const detail = result.error ? undefined : result.data;
  const purchase = kind === "purchase-orders";
  const rows = detail ? purchase ? detail.purchaseOrderLines : detail.inboundRequestLines : [];
  return <section className="surface document-surface document-detail" aria-labelledby="document-detail-title"
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <div className="document-detail-heading"><div><h2 id="document-detail-title" ref={heading} tabIndex={-1}>Chi tiết hàng hóa · {detail?.document.documentId ?? documentId}</h2>
      <p className="muted">{detail ? `Chi nhánh ${detail.document.branchId} · ${detail.document.documentDate.split("-").reverse().join("/")}` : "Đang kiểm tra quyền xem chứng từ"}</p></div>
      <div><Button variant="ghost" onClick={() => void result.refetch()} disabled={result.isFetching} aria-label="Làm mới chi tiết"><RefreshCw size={16}/></Button>
        <Button variant="ghost" onClick={onClose} aria-label="Đóng chi tiết"><X size={18}/></Button></div></div>
    {result.error ? <p role="alert" className="document-state error-message">{errorMessage(result.error)}</p>
      : result.isPending ? <p role="status" className="document-state">Đang tải dòng hàng…</p>
      : <div className="document-table-scroll" aria-busy={result.isFetching}><table className="document-table detail-table">
        <caption className="sr-only">Dòng hàng chứng từ {documentId}, trang {page}</caption>
        <thead><tr><th scope="col">Mã hàng</th>{(purchase ? ["Số lượng", "Số lượng 2"] : ["Số bộ theo chứng từ", "Số thùng theo chứng từ", "Số bộ thực tế", "Số thùng thực tế"]).map(label => <th scope="col" key={label} className="quantity-cell">{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.lineId}><td>{row.itemId}</td>{("quantity" in row
          ? [row.quantity, row.quantity2] : [row.setQuantityByDocument, row.barrelQuantityByDocument, row.setQuantityByReal, row.barrelQuantityByReal])
          .map((value, index) => <td key={index} className="quantity-cell">{value ?? "—"}</td>)}</tr>)}</tbody>
      </table>{rows.length === 0 && <p className="document-state">Không có dòng hàng trên trang này.</p>}</div>}
    <div className="document-pagination"><span>{detail ? `${rows.length} dòng hàng trên trang này` : ""}</span><div>
      <Button variant="ghost" aria-label="Trang dòng hàng trước" onClick={() => setPage(value => value - 1)} disabled={page === 1 || result.isFetching}><ChevronLeft size={16}/></Button>
      <span>Trang {page}</span><Button variant="ghost" aria-label="Trang dòng hàng sau" onClick={() => setPage(value => value + 1)} disabled={!detail?.hasMore || page >= 1000 || result.isFetching}><ChevronRight size={16}/></Button>
    </div></div>
  </section>;
}
