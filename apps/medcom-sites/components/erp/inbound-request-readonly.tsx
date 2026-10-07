"use client";

import {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {ApiError, getDetail, type ReadScope} from "@/lib/erp/api";
import {detailSchema, rowSchema, type DocumentDetail} from "@/lib/erp/contracts";
import {cn} from "@/lib/utils";
import {RequestButton, RequestEmpty, RequestError, RequestLoading, RequestNotice, RequestStatus, requestDate, requestStyles} from "./request-presentation";

export type InboundRequestReadOnlyProps = {
  documentId: string;
  branchIds: readonly string[];
  scope: ReadScope;
  // Non-authoritative control retained by the host while the panel is masked.
  initialPage: number;
  verifying: boolean;
  readRevision: unknown;
  onPageChange: (page: number) => void;
  onDenied: (error: ApiError) => void;
  onPresented: (state: "pending" | "ready" | "failed") => void;
};
type Binding = {selection: string; selectionIdentity: object; page: number; retry: number; readRevision: unknown; verifying: boolean};
type Result = {binding: Binding} & (
  | {phase: "ready"; detail: DocumentDetail}
  | {phase: "failed"; error: unknown}
);
const quantities = [
  ["setQuantityByDocument", "Số bộ theo chứng từ"],
  ["barrelQuantityByDocument", "Số thùng theo chứng từ"],
  ["setQuantityByReal", "Số bộ thực tế"],
  ["barrelQuantityByReal", "Số thùng thực tế"],
] as const;
const denied = (error: unknown): error is ApiError => error instanceof ApiError && [401, 403, 409].includes(error.status);

/** Command Unavailable is only eligibility. This separate GET must prove READ
 * scope and validate its projection; it is never a complete draft snapshot. */
export function InboundRequestReadOnly({documentId, branchIds, scope, initialPage, verifying, readRevision, onPageChange, onDenied, onPresented}: InboundRequestReadOnlyProps) {
  const {sessionScope, readScope} = scope;
  const branches = JSON.stringify([...new Set(branchIds)].sort());
  const selection = JSON.stringify([documentId, sessionScope, readScope, branches]);
  const [previousSelection, setPreviousSelection] = useState(selection);
  const [page, setPage] = useState(() => Number.isInteger(initialPage) && initialPage >= 1 && initialPage <= 1000 ? initialPage : 1), [retry, setRetry] = useState(0);
  // Reset page before committing a different selection, without relying on a
  // keyed remount. The memo identity also prevents A -> B -> A data resurfacing.
  if (previousSelection !== selection) {
    setPreviousSelection(selection);
    setPage(1);
  }
  // A committed A→B→A prop sequence must not reuse A's earlier cache. This
  // identity stays stable for healthy verification/read revisions of one view.
  const selectionIdentity = useMemo(() => ({selection}), [selection]);
  const binding = useMemo<Binding>(() => ({selection, selectionIdentity, page, retry, readRevision, verifying}), [selection, selectionIdentity, page, retry, readRevision, verifying]);
  const [result, setResult] = useState<Result | null>(null);
  const active = useRef<{binding: Binding; controller: AbortController} | null>(null);
  const callbacks = useRef({onDenied, onPresented, onPageChange});
  useLayoutEffect(() => { callbacks.current = {onDenied, onPresented, onPageChange}; }, [onDenied, onPresented, onPageChange]);
  useLayoutEffect(() => {
    const generation = {binding, controller: new AbortController()};
    active.current = generation;
    return () => {
      if (active.current === generation) active.current = null;
      generation.controller.abort();
    };
  }, [binding]);

  const currentResult = result?.binding === binding ? result : null;
  const phase = verifying ? "pending" : currentResult?.phase ?? "pending";
  const retainedDetail = result?.phase === "ready" && result.binding.selectionIdentity === selectionIdentity && result.binding.page === page ? result.detail : null;
  // Notify only after the corresponding current UI has committed. Observers
  // cannot turn a successful read into failure or cause another request.
  useLayoutEffect(() => {
    if (active.current?.binding !== binding) return;
    try { void Promise.resolve(callbacks.current.onPresented(phase)).catch(() => undefined); } catch {}
  }, [binding, phase]);

  useEffect(() => {
    const generation = active.current;
    if (!generation || generation.binding !== binding || verifying) return;
    const {controller} = generation;
    const current = () => active.current === generation && !controller.signal.aborted;
    void (async () => {
      try {
        const allowedBranches: readonly string[] = JSON.parse(branches);
        if (!rowSchema.shape.documentId.safeParse(documentId).success
          || !/^[a-f0-9]{64}$/.test(sessionScope) || !/^[a-f0-9]{64}$/.test(readScope)
          || !allowedBranches.length || allowedBranches.some(id => typeof id !== "string" || !id)) {
          throw new ApiError(502, "invalid_read_scope");
        }
        const response = await getDetail("inbound-requests", documentId, page, controller.signal, {sessionScope, readScope});
        if (!current()) return;
        const parsed = detailSchema.safeParse(response);
        if (!parsed.success || parsed.data.document.documentId !== documentId || parsed.data.page !== page || parsed.data.pageSize !== 50
          || !allowedBranches.includes(parsed.data.document.branchId) || parsed.data.purchaseOrderLines.length !== 0
          || parsed.data.inboundRequestLines.length > parsed.data.pageSize) {
          throw new ApiError(502, "invalid_api_response");
        }
        setResult({binding, phase: "ready", detail: parsed.data});
      } catch (error) {
        if (!current()) return;
        setResult({binding, phase: "failed", error});
        if (denied(error)) {
          try { void Promise.resolve(callbacks.current.onDenied(error)).catch(() => undefined); } catch {}
        }
      }
    })();
    // Layout cleanup above fences late success AND denial before passive cleanup.
    return () => controller.abort();
  }, [binding, branches, documentId, page, sessionScope, readScope, verifying]);

  function navigate(nextPage: number) {
    const generation = active.current;
    if (verifying || !generation || generation.binding !== binding || generation.controller.signal.aborted
      || !currentResult || currentResult.phase !== "ready" || !Number.isInteger(nextPage)
      || nextPage < 1 || nextPage > 1000 || (nextPage > page && !currentResult.detail.hasMore)) return;
    active.current = null; generation.controller.abort();
    setPage(nextPage);
    try { void Promise.resolve(callbacks.current.onPageChange(nextPage)).catch(() => undefined); } catch {}
  }
  function retryRead() {
    const generation = active.current;
    if (verifying || !generation || generation.binding !== binding || generation.controller.signal.aborted
      || !currentResult || currentResult.phase !== "failed" || denied(currentResult.error)) return;
    active.current = null; generation.controller.abort();
    setRetry(value => value + 1);
  }

  const detail = currentResult?.phase === "ready" ? currentResult.detail : currentResult?.phase === "failed" ? null : retainedDetail;
  return <section data-testid="inbound-request-readonly" data-phase={phase} aria-label="Phiếu nhập hàng chỉ đọc"
    aria-busy={phase === "pending"} className={requestStyles.editor}>
    <h2 className={requestStyles.title}>Yêu cầu nhập kho</h2>
    <RequestNotice title="Chế độ chỉ đọc">
      <p>Chỉ hiển thị thông tin chứng từ và trang dòng hàng do dịch vụ đọc cung cấp. Không bao gồm toàn bộ dữ liệu phiếu nháp hoặc các dòng chi phí.</p>
    </RequestNotice>
    <p role="status" className={`${requestStyles.muted} min-h-6`}>{phase === "pending" ? "Đang cập nhật bản chỉ đọc…" : detail ? "Bản chỉ đọc đã được cập nhật." : "Chưa tải được bản chỉ đọc."}</p>
    {phase === "pending" && !detail && <RequestLoading label="Đang tải bản chỉ đọc…"/>}
    {currentResult?.phase === "failed" && <RequestError error={currentResult.error}
      retry={verifying || denied(currentResult.error) ? undefined : retryRead}/>}
    {detail && <>
      <header className={requestStyles.section}>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <h3 className="min-w-0 whitespace-pre-wrap text-base font-semibold [overflow-wrap:anywhere]">{detail.document.documentId}</h3>
          <RequestStatus value={detail.document.statusId} statusName={detail.document.statusName}/>
        </div>
        <dl className={cn(requestStyles.values, "grid-cols-1 sm:grid-cols-2")}>
          <div><dt>Ngày chứng từ</dt><dd><time dateTime={detail.document.documentDate}>{requestDate(detail.document.documentDate)}</time></dd></div>
          <div><dt>Chi nhánh</dt><dd className="whitespace-pre-wrap">{detail.document.branchId}</dd></div>
          <div><dt>Khóa chứng từ</dt><dd>{detail.document.isLocked === null ? "NULL" : detail.document.isLocked ? "Đã khóa" : "Không khóa"}</dd></div>
        </dl>
      </header>
      <section aria-label="Dòng yêu cầu nhập kho chỉ đọc" className={requestStyles.stack}>
        <h3 className={requestStyles.title}>Dòng hàng</h3>
        <p className={requestStyles.muted}>{detail.inboundRequestLines.length} dòng trên trang {detail.page}. Số lượng được giữ nguyên từ ERP; NULL là chưa có giá trị.</p>
        {detail.inboundRequestLines.length === 0
          ? <RequestEmpty title="Trang này không có dòng hàng">Dịch vụ đọc không trả về dòng hàng cho trang này.</RequestEmpty>
          : detail.inboundRequestLines.map((line, index) => <article key={`${index}:${line.lineId}`} className={requestStyles.line}>
            <h4 className="text-sm font-semibold">Dòng {(detail.page - 1) * detail.pageSize + index + 1}</h4>
            <dl className={cn(requestStyles.values, "grid-cols-1 sm:grid-cols-2")}>
              <div><dt>Mã dòng</dt><dd className="whitespace-pre-wrap">{line.lineId}</dd></div>
              <div><dt>Mã hàng</dt><dd className="whitespace-pre-wrap">{line.itemId}</dd></div>
              {quantities.map(([field, label]) => <div key={field}><dt>{label}</dt><dd className="whitespace-pre-wrap tabular-nums">{line[field] ?? "NULL"}</dd></div>)}
            </dl>
          </article>)}
        <nav aria-label="Trang dòng hàng chỉ đọc" className={requestStyles.footer}>
          <span>Trang {detail.page}{detail.hasMore ? " · Còn dòng ở trang sau" : " · Trang cuối"}</span>
          <div className={requestStyles.actions}>
            <RequestButton type="button" disabled={phase !== "ready" || page === 1} onClick={() => navigate(page - 1)}>Dòng trước</RequestButton>
            <RequestButton type="button" disabled={phase !== "ready" || !detail.hasMore || page >= 1000} onClick={() => navigate(page + 1)}>Dòng tiếp</RequestButton>
          </div>
          {page >= 1000 && detail.hasMore && <p className={requestStyles.muted}>Đã tới giới hạn 1.000 trang của dịch vụ; vẫn còn dòng chưa được hiển thị.</p>}
        </nav>
      </section>
    </>}
  </section>;
}
