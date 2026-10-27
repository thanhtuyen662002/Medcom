"use client";

import { useId, useState } from "react";
import { Loader2, Pencil, Plus, Save, Trash2, Undo2, X } from "lucide-react";
import { erpClient, type ErpChoice, type ErpDocumentDetail } from "@/lib/erp/erp-client";
import type { ErpScreenModule } from "@/lib/erp/document-detail/types";
import { editValue, formatVietnamDate, getActionErrorMessage } from "@/lib/erp/document-detail/controllers/erp-detail-rules";
import { formatMoney } from "@/lib/erp/money";
import { LookupField } from "@/components/untitledui/lookup-field";
import { RequestInput } from "./request-presentation";

type CostField = { key: string; label: string; lookupId?: string; nameKey?: string; kind?: "date" | "number"; required?: boolean };

// IV_InboundRequestCTCPFrm T1 GD2 order; Cost, VAT % and VAT amount are computed by the backend (T1 LCK).
const COST_FIELDS: readonly CostField[] = [
  { key: "invoiceNo", label: "Số hóa đơn" },
  { key: "invoiceDate", label: "Ngày hóa đơn", kind: "date" },
  { key: "nCC", label: "Nhà cung cấp dịch vụ", lookupId: "costs.NCC" },
  { key: "objectId", label: "Đối tượng", lookupId: "costs.ObjectID", nameKey: "objectName", required: true },
  { key: "memo", label: "Nội dung" },
  { key: "costType", label: "Loại chi phí", lookupId: "costs.CostType" },
  { key: "currencyId", label: "Loại tiền", lookupId: "costs.CurrencyID", nameKey: "currencyName" },
  { key: "rateExchange", label: "Tỷ giá", kind: "number" },
  { key: "sourceAmount", label: "Số tiền nguyên tệ", kind: "number" },
  { key: "vATId", label: "Thuế GTGT", lookupId: "costs.VATID", nameKey: "vATName" },
  { key: "expenseAccId", label: "Tài khoản chi phí", lookupId: "costs.ExpenseAccID", nameKey: "expenseAccName" },
  { key: "allocateKind", label: "Cách phân bổ", lookupId: "costs.AllocateKind" },
  { key: "notes", label: "Ghi chú" },
];

type Draft = { key: string; lineId: string | null; values: Record<string, string>; names: Record<string, string>; removed: boolean };
const text = (value: unknown) => value === null || value === undefined ? "" : String(value);
const toDraft = (lineId: string, fields: Record<string, unknown>): Draft => ({
  key: lineId, lineId, removed: false,
  values: Object.fromEntries(COST_FIELDS.map(field => [field.key, field.kind === "date" ? text(fields[field.key]).slice(0, 10) : text(fields[field.key])])),
  names: Object.fromEntries(COST_FIELDS.filter(field => field.nameKey).map(field => [field.key, text(fields[field.nameKey!])])),
});

/** "Chứng từ chi phí" of an inbound request: read on every inbound screen that has it, edited where save-costs is enabled. */
export function InboundCostsPanel({ module, detail, branchId, onSaved }: {
  module: ErpScreenModule; detail: ErpDocumentDetail; branchId: string; onSaved: () => void;
}) {
  const baseId = useId();
  const page = detail.sections?.costs;
  const rows = (page?.rows ?? []).map(row => ({ lineId: row.lineId, fields: ((row as { fields?: unknown }).fields ?? row) as Record<string, unknown> }));
  const action = detail.actions?.find(item => item.id === "save-costs");
  const canEdit = !!action?.visible && !!action.enabled && !page?.hasMore;
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (key: string, change: (draft: Draft) => Draft) => setDrafts(current => current?.map(draft => draft.key === key ? change(draft) : draft) ?? null);
  const start = () => { setError(null); setDrafts(rows.map(row => toDraft(row.lineId, row.fields))); };
  const add = () => setDrafts(current => [...(current ?? []), { key: `new-${crypto.randomUUID()}`, lineId: null, removed: false, names: {},
    values: Object.fromEntries(COST_FIELDS.map(field => [field.key, ""])) }]);

  const save = async () => {
    if (!drafts) return;
    const live = drafts.filter(draft => !draft.removed);
    if (live.some(draft => !draft.values.objectId?.trim())) { setError("Mỗi chứng từ chi phí cần có Đối tượng."); return; }
    const values = (draft: Draft) => Object.fromEntries(COST_FIELDS.map(field => [field.key, editValue(field.key, draft.values[field.key] ?? "")]));
    const original = new Map(rows.map(row => [row.lineId, toDraft(row.lineId, row.fields)]));
    type Change = { kind: "Add" | "Update" | "Remove"; lineId: string | null; clientLineKey: string | null; values: Record<string, unknown> | null };
    const lineChanges = drafts.flatMap((draft): Change[] => {
      if (!draft.lineId) return draft.removed ? [] : [{ kind: "Add", lineId: null, clientLineKey: draft.key.slice(0, 64), values: values(draft) }];
      if (draft.removed) return [{ kind: "Remove", lineId: draft.lineId, clientLineKey: null, values: null }];
      const before = original.get(draft.lineId);
      const changed = !before || COST_FIELDS.some(field => (before.values[field.key] ?? "") !== (draft.values[field.key] ?? ""));
      return changed ? [{ kind: "Update", lineId: draft.lineId, clientLineKey: null, values: values(draft) }] : [];
    });
    if (!lineChanges.length) { setDrafts(null); return; }
    setBusy(true); setError(null);
    try {
      const result = await erpClient.saveSection(module, "costs", { idempotencyKey: `costs-${crypto.randomUUID()}`, branchId,
        documentId: detail.documentId, expectedStateToken: detail.stateToken, lineChanges });
      if (result.outcome === "Committed" || result.outcome === "Replayed") { setDrafts(null); onSaved(); }
      else setError(getActionErrorMessage(result.outcome, result.code, result.message));
    } catch { setError("Lỗi kết nối khi lưu chứng từ chi phí."); }
    finally { setBusy(false); }
  };

  const baseButton = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold disabled:opacity-50";
  const buttonClass = `${baseButton} border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800`;
  const primaryButtonClass = `${baseButton} border-transparent bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600`;
  const value = (fields: Record<string, unknown>, field: CostField) => {
    const raw = fields[field.key];
    if (field.kind === "date") return formatVietnamDate(raw) || "—";
    if (field.kind === "number") return raw === null || raw === undefined || raw === "" ? "—" : formatMoney(raw);
    const name = field.nameKey ? text(fields[field.nameKey]) : "";
    return name && name !== text(raw) ? `${text(raw)} · ${name}` : text(raw) || "—";
  };
  return <section aria-label="Chứng từ chi phí" className="min-w-0 space-y-3 rounded-2xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-base font-semibold text-black dark:text-white">Chứng từ chi phí {rows.length > 0 && `(${rows.length})`}</h4>
      {drafts ? <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => { setDrafts(null); setError(null); }} className={buttonClass}><X aria-hidden className="size-4" />Hủy</button>
        <button type="button" disabled={busy} onClick={() => void save()} className={primaryButtonClass}>
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Save aria-hidden className="size-4" />}Lưu chi phí</button>
      </div> : canEdit && <button type="button" onClick={start} className={buttonClass}><Pencil aria-hidden className="size-4" />Sửa chi phí</button>}
    </div>
    {error && <p role="alert" className="break-words text-sm text-red-600 dark:text-red-400">{error}</p>}
    {!drafts ? (rows.length === 0 ? <p className="text-sm text-neutral-500 dark:text-neutral-400">Chưa có chứng từ chi phí.</p>
      : <ul className="grid min-w-0 gap-3 lg:grid-cols-2">{rows.map((row, index) => <li key={row.lineId} className="min-w-0 rounded-xl border border-border p-3">
        <p className="mb-2 text-sm font-semibold text-black dark:text-white">Chứng từ {index + 1}</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          {[...COST_FIELDS, { key: "cost", label: "Thành tiền (VND)", kind: "number" } as CostField, { key: "vATAmount", label: "Tiền thuế", kind: "number" } as CostField]
            .map(field => <div key={field.key} className="min-w-0"><dt className="text-neutral-500 dark:text-neutral-400">{field.label}</dt>
              <dd className="break-words font-medium text-black dark:text-white">{value(row.fields, field)}</dd></div>)}
        </dl>
      </li>)}</ul>)
      : <div className="space-y-3">
        {drafts.map((draft, index) => <fieldset key={draft.key} disabled={busy} className={`rounded-xl border p-3 ${draft.removed ? "border-red-200 opacity-60 dark:border-red-900" : "border-brand-200 dark:border-brand-800/60"}`}>
          <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-black dark:text-white">
            {draft.lineId ? `Chứng từ ${index + 1}` : "Chứng từ mới"}{draft.removed && " · sẽ xóa"}
            <button type="button" aria-label={draft.removed ? "Giữ chứng từ" : "Xóa chứng từ"} onClick={() => draft.lineId ? patch(draft.key, d => ({ ...d, removed: !d.removed })) : setDrafts(current => current?.filter(d => d.key !== draft.key) ?? null)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-neutral-500 hover:text-red-600">{draft.removed ? <Undo2 aria-hidden className="size-4" /> : <Trash2 aria-hidden className="size-4" />}</button>
          </legend>
          {!draft.removed && <div className="grid gap-3 sm:grid-cols-2">{COST_FIELDS.map(field => {
            const id = `${baseId}-${draft.key}-${field.key}`, current = draft.values[field.key] ?? "";
            const set = (next: string, name?: string) => patch(draft.key, d => ({ ...d, values: { ...d.values, [field.key]: next }, names: name === undefined ? d.names : { ...d.names, [field.key]: name } }));
            if (field.lookupId) {
              const display = draft.names[field.key] || current;
              return <LookupField key={field.key} label={field.label} required={field.required} module={module} lookupId={field.lookupId} branchId={branchId} value={current}
                choice={current ? { id: current, name: display, label: display, fields: {} } as ErpChoice : null} displayValue={display}
                onSelect={choice => set(choice?.id ?? "", choice ? String(choice.label || choice.name || choice.id) : "")} />;
            }
            return <div key={field.key} className="grid min-w-0 gap-1.5 text-sm font-medium"><label htmlFor={id}>{field.label}</label>
              <RequestInput id={id} type={field.kind === "date" ? "date" : "text"} inputMode={field.kind === "number" ? "decimal" : undefined} value={current} onChange={event => set(event.target.value)} /></div>;
          })}</div>}
        </fieldset>)}
        <button type="button" disabled={busy} onClick={add} className={buttonClass}><Plus aria-hidden className="size-4" />Thêm chứng từ chi phí</button>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Thành tiền, % thuế và tiền thuế do hệ thống tính lại khi lưu (theo tỷ giá và mã thuế).</p>
      </div>}
    {page?.hasMore && <p className="text-sm text-neutral-500 dark:text-neutral-400">Phiếu có nhiều chứng từ chi phí hơn số đang hiện; sửa trên ERP.</p>}
  </section>;
}
