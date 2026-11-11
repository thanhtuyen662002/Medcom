"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Copy, Filter, RotateCcw, Search } from "lucide-react";
import { AppButton, ListState, Pagination, RecordTable, ScreenHeader, StatusBadge, type RecordColumn } from "@/components/app";
import { AppSheet } from "@/components/app/app-sheet";
import { navigationLabel } from "@/components/app/app-navigation";
import { errorMessage } from "@/lib/erp/api";
import { getAuditLogDetail, searchAuditLogs, type AuditFilters, type AuditRow } from "@/lib/erp/audit-api";

interface Load<T> { data?: T; loading: boolean; error: unknown; reload: () => void }

/** Reads while enabled; a newer request cancels the older one. Keeps the last data on error. */
function useLoad<T>(enabled: boolean, key: string, read: (signal: AbortSignal) => Promise<T>): Load<T> {
  const [state, setState] = useState<{ key: string; data?: T; loading: boolean; error: unknown }>({ key: "", loading: enabled, error: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState(previous => ({ key, data: previous.data, loading: true, error: null }));
    read(controller.signal).then(data => { if (!controller.signal.aborted) setState({ key, data, loading: false, error: null }); },
      error => { if (!controller.signal.aborted) setState(previous => ({ key, data: previous.data, loading: false, error })); });
    return () => controller.abort();
    // `read` is recreated each render; `key` names what it reads.
  }, [enabled, key, version]);
  return { data: state.data, loading: state.loading, error: state.error, reload: () => setVersion(v => v + 1) };
}
import { erpScreenModules } from "@/lib/erp/proxy-policy";

const CATEGORY_LABELS: Record<string, string> = {
  auth: "Đăng nhập", command: "Lệnh ERP", import: "Nhập Excel / chọn hàng", read: "Xem dữ liệu",
  file: "File đính kèm", ui: "Thao tác giao diện", audit: "Xem nhật ký",
};

const ACTION_LABELS: Record<string, string> = {
  login: "Đăng nhập", logout: "Đăng xuất", create: "Tạo mới", save: "Lưu", delete: "Xóa", submit: "Gửi duyệt",
  "send-pm": "Gửi PM", "send-sa": "Gửi SA", "send-tech": "Gửi kỹ thuật", "send-accounting": "Gửi kế toán",
  "send-warehouse": "Gửi kho", "send-management": "Gửi quản lý", "send-purchase-order": "Chuyển đặt mua hàng",
  "send-to-warehouse": "Gửi thủ kho", approve: "Duyệt", reject: "Từ chối", "return-step": "Trả lại bước", recall: "Thu hồi",
  "cancel-draft": "Hủy nháp", "pm-confirm": "PM xác nhận", "sync-requests": "Gom đề nghị vào đợt", dispatch: "Xuất kho",
  receive: "Nhận hàng", "save-costs": "Lưu chi phí", "save-assets": "Lưu tài sản", reconcile: "Đối chiếu",
  "scan-add": "Quét QR thêm", "scan-delete": "Quét QR xóa", "notification-read": "Đánh dấu thông báo",
  list: "Mở danh sách", detail: "Xem chứng từ", "contract-info": "Xem thông tin hợp đồng", attachments: "Xem danh sách file",
  "open-notification": "Mở thông báo", download: "Tải file xuống", upload: "Tải file lên", "delete-file": "Xóa file",
  "paste-validate": "Dán dữ liệu từ Excel", selection: "Chọn hàng từ chứng từ nguồn", "view-log": "Tra cứu nhật ký",
  "view-log-detail": "Xem chi tiết nhật ký", navigate: "Chuyển màn hình", click: "Bấm", open: "Mở chứng từ",
  close: "Đóng chứng từ", print: "In", paste: "Dán", "change-branch": "Đổi chi nhánh", error: "Lỗi giao diện",
};

const OUTCOMES: { id: string; label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }[] = [
  { id: "success", label: "Thành công", tone: "success" },
  { id: "observed", label: "Ghi nhận", tone: "neutral" },
  { id: "replayed", label: "Đã ghi trước đó", tone: "info" },
  { id: "rejected", label: "Bị từ chối", tone: "warning" },
  { id: "denied", label: "Không có quyền", tone: "warning" },
  { id: "invalid", label: "Dữ liệu không hợp lệ", tone: "warning" },
  { id: "conflict", label: "Xung đột dữ liệu", tone: "warning" },
  { id: "not-found", label: "Không tìm thấy", tone: "warning" },
  { id: "rate-limited", label: "Quá nhiều yêu cầu", tone: "warning" },
  { id: "unavailable", label: "Hệ thống chưa sẵn sàng", tone: "danger" },
  { id: "unknown", label: "Chưa rõ kết quả", tone: "danger" },
  { id: "failed", label: "Lỗi hệ thống", tone: "danger" },
  { id: "cancelled", label: "Đã hủy", tone: "neutral" },
];

const MODULE_LABELS: Record<string, string> = { notifications: "Thông báo", "audit-log": "Nhật ký thao tác", home: "Tổng quan", scan: "Quét QR", settings: "Cài đặt" };
export const moduleLabel = (id: string | null | undefined) => !id ? "" : navigationLabel(id) ?? MODULE_LABELS[id] ?? id;
export const actionLabel = (id: string) => ACTION_LABELS[id] ?? id;
const outcomeOf = (id: string) => OUTCOMES.find(item => item.id === id) ?? { id, label: id, tone: "neutral" as const };
const dateTime = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const formatTime = (value: string | null | undefined) => { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : dateTime.format(date); };
const localDay = (offsetDays = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

interface FilterDraft { fromDay: string; toDay: string; user: string; category: string; module: string; outcome: string; documentId: string; search: string }
const initialDraft = (): FilterDraft => ({ fromDay: localDay(-6), toDay: localDay(0), user: "", category: "", module: "", outcome: "", documentId: "", search: "" });

/** Local calendar days to the server's UTC instants: [from 00:00, day after "to" 00:00). */
export function auditFilters(draft: FilterDraft): AuditFilters {
  const start = (day: string) => { const d = new Date(`${day}T00:00:00`); return Number.isNaN(d.getTime()) ? undefined : d; };
  const from = draft.fromDay ? start(draft.fromDay) : undefined;
  const toStart = draft.toDay ? start(draft.toDay) : undefined;
  const to = toStart ? new Date(toStart.getTime() + 24 * 3600 * 1000) : undefined;
  return { from: from?.toISOString(), to: to?.toISOString(), user: draft.user, category: draft.category, module: draft.module,
    outcome: draft.outcome, documentId: draft.documentId, search: draft.search };
}

function actionText(row: Pick<AuditRow, "action" | "target" | "category">) {
  const label = actionLabel(row.action);
  return row.target && row.category === "ui" ? `${label}: ${row.target}` : label;
}

function JsonBlock({ title, value }: { title: string; value: string | null }) {
  if (!value) return null;
  let pretty = value;
  try { pretty = JSON.stringify(JSON.parse(value), null, 2); } catch { /* show raw text */ }
  return <section className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">{title}</h3>
      <AppButton variant="ghost" size="md" data-audit="off" onClick={() => void navigator.clipboard?.writeText(pretty)}><Copy aria-hidden="true" className="size-4" />Sao chép</AppButton>
    </div>
    <pre className="max-h-96 overflow-auto rounded-xl bg-neutral-100 p-3 text-xs leading-5 text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">{pretty}</pre>
  </section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return <div className="min-w-0"><dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</dt><dd className="break-words text-sm text-neutral-900 dark:text-neutral-100">{children}</dd></div>;
}

function AuditDetailSheet({ id, onClose, onFilter }: { id: number | null; onClose: () => void; onFilter: (patch: Partial<FilterDraft>) => void }) {
  const detail = useLoad(id !== null, String(id), signal => getAuditLogDetail(id!, signal));
  const row = id !== null && detail.data?.id === id ? detail.data : undefined;
  const outcome = row ? outcomeOf(row.outcome) : null;
  return <AppSheet open={id !== null} onClose={onClose} presentation="form" title={`Chi tiết thao tác #${id ?? ""}`} description="Dữ liệu ghi nhận tại máy chủ">
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      {detail.loading && !row && <ListState state="loading" label="Đang tải chi tiết…" />}
      {Boolean(detail.error) && <ListState state="error" error={errorMessage(detail.error)} onRetry={detail.reload} />}
      {row && <>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Thời gian">{formatTime(row.occurredAt)}</Field>
          <Field label="Kết quả">{outcome && <StatusBadge label={outcome.label} tone={outcome.tone} />}</Field>
          <Field label="Người dùng">{[row.displayName, row.userName && `(${row.userName})`].filter(Boolean).join(" ")}</Field>
          <Field label="Nhóm quyền">{row.roleName}</Field>
          <Field label="Loại">{CATEGORY_LABELS[row.category] ?? row.category}</Field>
          <Field label="Thao tác">{actionText(row)}</Field>
          <Field label="Màn hình">{moduleLabel(row.module) || moduleLabel(row.page)}</Field>
          <Field label="Chứng từ">{row.documentId}</Field>
          <Field label="Chi nhánh">{row.branchId}</Field>
          <Field label="Mã lỗi">{row.errorCode}</Field>
          <Field label="Địa chỉ IP">{row.clientAddress}</Field>
          <Field label="Trình duyệt / thiết bị">{row.userAgent}</Field>
          <Field label="Phiên đăng nhập">{row.sessionRef}</Field>
          <Field label="Mã đối chiếu (correlation)">{row.correlationId}</Field>
          <Field label="Yêu cầu">{row.httpMethod && `${row.httpMethod} ${row.path ?? ""}`}</Field>
          <Field label="Tham số">{row.queryText}</Field>
          <Field label="Mã HTTP / thời gian xử lý">{row.statusCode !== null ? `${row.statusCode}${row.durationMs !== null ? ` · ${row.durationMs} ms` : ""}` : ""}</Field>
          <Field label="Giờ trên máy người dùng">{row.clientTime ? formatTime(row.clientTime) : ""}</Field>
        </dl>
        <div className="flex flex-wrap gap-2">
          {row.userName && <AppButton variant="secondary" onClick={() => { onFilter({ user: row.userName ?? "" }); onClose(); }}>Lọc theo người dùng này</AppButton>}
          {row.documentId && <AppButton variant="secondary" onClick={() => { onFilter({ documentId: row.documentId ?? "", user: "" }); onClose(); }}>Lọc theo chứng từ này</AppButton>}
        </div>
        <JsonBlock title="Dữ liệu gửi lên" value={row.requestData} />
        <JsonBlock title="Kết quả trả về" value={row.resultData} />
      </>}
    </div>
  </AppSheet>;
}

const inputClass = "min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 md:text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:ring-brand-900";

function FilterInput({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-300">{label}{children}</label>;
}

export function TabAuditLog({ isActive }: { isActive: boolean }) {
  const [draft, setDraft] = useState<FilterDraft>(initialDraft);
  const [applied, setApplied] = useState<FilterDraft>(initialDraft);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [openId, setOpenId] = useState<number | null>(null);
  const filters = useMemo(() => auditFilters(applied), [applied]);
  const query = useLoad(isActive, JSON.stringify([filters, page, pageSize]), signal => searchAuditLogs(filters, page, pageSize, signal));
  const rows = query.data?.items ?? [];
  const total = query.data?.totalRows ?? 0;
  const apply = (next: FilterDraft) => { setDraft(next); setApplied(next); setPage(1); };
  const submit = (event: FormEvent) => { event.preventDefault(); apply(draft); };
  const set = (patch: Partial<FilterDraft>) => setDraft(previous => ({ ...previous, ...patch }));

  const columns: RecordColumn<AuditRow>[] = [
    { id: "time", label: "Thời gian", className: "whitespace-nowrap tabular-nums", render: row => formatTime(row.occurredAt) },
    { id: "user", label: "Người dùng", render: row => <div className="min-w-0"><div className="font-medium">{row.displayName ?? row.userName ?? "—"}</div>{row.userName && <div className="text-xs text-neutral-500">{row.userName}</div>}</div> },
    { id: "category", label: "Loại", className: "whitespace-nowrap", render: row => CATEGORY_LABELS[row.category] ?? row.category },
    { id: "action", label: "Thao tác", render: row => <span className="break-words">{actionText(row)}</span> },
    { id: "module", label: "Màn hình", render: row => moduleLabel(row.module) || moduleLabel(row.page) },
    { id: "document", label: "Chứng từ", className: "whitespace-nowrap", render: row => row.documentId ?? "" },
    { id: "branch", label: "CN", className: "whitespace-nowrap", render: row => row.branchId ?? "" },
    { id: "outcome", label: "Kết quả", render: row => { const o = outcomeOf(row.outcome); return <StatusBadge label={o.label} tone={o.tone} title={row.errorCode ?? undefined} />; } },
    { id: "ip", label: "IP", className: "whitespace-nowrap tabular-nums", render: row => row.clientAddress ?? "" },
  ];

  return <div className="space-y-4">
    <ScreenHeader title="Nhật ký thao tác" subtitle="Ai đã làm gì, lúc nào, trên chứng từ nào — dùng để truy vết khi có sự cố dữ liệu" count={query.data ? total : undefined} />
    <form onSubmit={submit} aria-label="Lọc nhật ký" className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterInput label="Từ ngày"><input type="date" className={inputClass} value={draft.fromDay} max={draft.toDay || undefined} onChange={e => set({ fromDay: e.target.value })} /></FilterInput>
        <FilterInput label="Đến ngày"><input type="date" className={inputClass} value={draft.toDay} min={draft.fromDay || undefined} onChange={e => set({ toDay: e.target.value })} /></FilterInput>
        <FilterInput label="Người dùng (tên đăng nhập hoặc họ tên)"><input className={inputClass} value={draft.user} maxLength={100} onChange={e => set({ user: e.target.value })} placeholder="VD: kho01" /></FilterInput>
        <FilterInput label="Số chứng từ"><input className={inputClass} value={draft.documentId} maxLength={100} onChange={e => set({ documentId: e.target.value })} placeholder="VD: DMB0926/0030" /></FilterInput>
        <FilterInput label="Loại">
          <select className={inputClass} value={draft.category} onChange={e => set({ category: e.target.value })}>
            <option value="">Tất cả</option>
            {Object.entries(CATEGORY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </FilterInput>
        <FilterInput label="Màn hình">
          <select className={inputClass} value={draft.module} onChange={e => set({ module: e.target.value })}>
            <option value="">Tất cả</option>
            {erpScreenModules.map(id => <option key={id} value={id}>{moduleLabel(id)}</option>)}
            <option value="notifications">Thông báo</option>
          </select>
        </FilterInput>
        <FilterInput label="Kết quả">
          <select className={inputClass} value={draft.outcome} onChange={e => set({ outcome: e.target.value })}>
            <option value="">Tất cả</option>
            {OUTCOMES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </FilterInput>
        <FilterInput label="Tìm trong nội dung (mã hàng, IP, mã lỗi…)"><input type="search" className={inputClass} value={draft.search} maxLength={200} onChange={e => set({ search: e.target.value })} placeholder="VD: mã hàng, số lượng, IP" /></FilterInput>
      </div>
      <div className="flex flex-wrap gap-2">
        <AppButton type="submit" busy={query.loading}><Search aria-hidden="true" className="size-4" />Tìm</AppButton>
        <AppButton variant="secondary" onClick={() => apply(initialDraft())}><RotateCcw aria-hidden="true" className="size-4" />Xóa lọc</AppButton>
        <span className="inline-flex items-center gap-1 self-center text-xs text-neutral-500 dark:text-neutral-400"><Filter aria-hidden="true" className="size-3.5" />Mặc định 7 ngày gần nhất. Nhật ký được giữ 12 tháng.</span>
      </div>
    </form>

    {query.error ? <ListState state="error" error={typeof query.error === "object" && "status" in query.error && (query.error as { status: number }).status === 503
      ? "Nhật ký chưa sẵn sàng trên máy chủ (bảng nhật ký chưa được cài)." : errorMessage(query.error)} onRetry={query.reload} />
      : query.loading && !query.data ? <ListState state="loading" label="Đang tải nhật ký…" columnCount={6} />
      : rows.length === 0 ? <ListState state="empty" empty={{ message: "Không có thao tác nào khớp bộ lọc." }} />
      : <>
        <RecordTable label="Nhật ký thao tác" rows={rows} columns={columns} rowId={row => String(row.id)} onOpen={row => setOpenId(row.id)}
          loading={false} rowOffset={(page - 1) * pageSize} />
        <ul className="space-y-2 lg:hidden" aria-label="Nhật ký thao tác">
          {rows.map(row => { const o = outcomeOf(row.outcome); return <li key={row.id}>
            <button type="button" onClick={() => setOpenId(row.id)} className="w-full space-y-1 rounded-2xl border border-neutral-200 bg-white p-4 text-left dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-start justify-between gap-2"><span className="font-semibold">{actionText(row)}</span><StatusBadge label={o.label} tone={o.tone} /></div>
              <div className="text-sm text-neutral-600 dark:text-neutral-300">{row.displayName ?? row.userName} · {formatTime(row.occurredAt)}</div>
              <div className="text-sm text-neutral-500">{[moduleLabel(row.module) || moduleLabel(row.page), row.documentId, row.branchId].filter(Boolean).join(" · ")}</div>
            </button>
          </li>; })}
        </ul>
      </>}
    {rows.length > 0 && <Pagination page={page} pageSize={pageSize} rowCount={rows.length} hasMore={page * pageSize < total} busy={query.loading}
      onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />}
    <AuditDetailSheet id={openId} onClose={() => setOpenId(null)} onFilter={patch => apply({ ...applied, ...patch })} />
  </div>;
}
