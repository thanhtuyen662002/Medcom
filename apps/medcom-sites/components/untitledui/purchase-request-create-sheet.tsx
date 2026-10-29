"use client";

import { ApiError } from "@/lib/erp/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, AlertCircle, Loader2 } from "lucide-react";
import { erpClient } from "@/lib/erp/erp-client";
import type { ErpChoice, ErpDocumentDetail } from "@/lib/erp/erp-screen-contracts";
import { FormSheet } from "@/components/app/form-sheet";
import { FormField, FormSection } from "@/components/app/form-field";
import { AppButton } from "@/components/app/app-button";
import { useIsMobile } from "@/components/app/use-is-mobile";
import { LookupField, choiceLabel, fieldText } from "./lookup-field";
import {MoneyInput} from "@/components/erp/money-input";
import {formatMoney as formatVND, multiplyMoney, sumMoney} from "@/lib/erp/money";

interface PurchaseRequestCreateSheetProps {
  open: boolean;
  onClose: () => void;
  currentBranch: string;
  onCreated?: (documentId: string) => void;
  documentId?: string;
  onSaved?: (documentId: string) => void;
}

interface DraftLine {
  key: string;
  lineId?: string;
  itemId: string;
  itemChoice: ErpChoice | null;
  model: string;
  budget: string;
  timeRequired: string;
  quantity: string;
  unitPrice: string;
}

const DECIMAL_RE = /^\d+(\.\d+)?$/;
const MODULE = "purchase-requests" as const;
const newLineKey = () => `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const emptyLine = (): DraftLine => ({
  key: newLineKey(),
  itemId: "",
  itemChoice: null,
  model: "",
  budget: "",
  timeRequired: "",
  quantity: "1",
  unitPrice: "",
});

const text = (value: unknown) => value == null ? "" : String(value);
const choice = (id: unknown, label?: unknown, fields: Record<string, unknown> = {}): ErpChoice | null =>
  text(id) ? { id: text(id), name: text(label) || text(id), label: text(label) || text(id), fields } : null;
const multiChoices = (value: unknown): ErpChoice[] => text(value).split(",").map(id => id.trim()).filter(Boolean).map(id => choice(id)!);
const lineValues = (line: DraftLine): Record<string, unknown> => ({
  itemId: line.itemId.trim(), quantity: line.quantity.trim(), unitPrice: line.unitPrice.trim() || null,
  budget: line.budget.trim() || null, timeRequired: line.timeRequired.trim() || null, model: line.model.trim() || null,
});

function lineTotal(line: DraftLine): string | null {
  if (!DECIMAL_RE.test(line.quantity.trim()) || !DECIMAL_RE.test(line.unitPrice.trim())) return null;
  return multiplyMoney(line.quantity, line.unitPrice);
}

/* ---------- Small labeled inputs ---------- */
function TextField({
  label,
  required,
  value,
  onChange,
  placeholder,
  error,
  inputMode,
  money = false,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  inputMode?: "decimal" | "text";
  money?: boolean;
}) {
  return <FormField label={label} required={required} error={error}>
    {control => money ? <MoneyInput {...control} value={value} onValueChange={onChange} placeholder={placeholder} />
      : <input {...control} type="text" inputMode={inputMode || "text"} value={value}
          onChange={event => onChange(event.target.value)} placeholder={placeholder} />}
  </FormField>;
}

/* ================= Main sheet ================= */
export function PurchaseRequestCreateSheet({
  open,
  onClose,
  currentBranch,
  onCreated,
  documentId,
  onSaved,
}: PurchaseRequestCreateSheetProps) {
  const isEditing = !!documentId;
  const [baseline, setBaseline] = useState<ErpDocumentDetail | null>(null);
  const [loadingDocument, setLoadingDocument] = useState(isEditing);
  const [loadError, setLoadError] = useState(false);
  const [readRevision, setReadRevision] = useState(0);
  const saveIntent = useRef<Parameters<typeof erpClient.saveDocument>[1] | null>(null);
  const submitLock = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const isMobile = useIsMobile();

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [personSuggest, setPersonSuggest] = useState("");
  const [personChoices, setPersonChoices] = useState<ErpChoice[]>([]);
  const [department, setDepartment] = useState("");
  const [departmentChoices, setDepartmentChoices] = useState<ErpChoice[]>([]);
  const [purposeId, setPurposeId] = useState("");
  const [purposeDescOrClient, setPurposeDescOrClient] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [currencyId, setCurrencyId] = useState("VND");
  const [currencyChoice, setCurrencyChoice] = useState<ErpChoice | null>(null);
  const [objectId, setObjectId] = useState("");
  // ERP 29/10 hides the request rate; an edited request keeps whatever rate it already has.
  const [rateExchange, setRateExchange] = useState("");

  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitWarning, setSubmitWarning] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0);
      setErrors({});
      setSubmitError(null);
      setSubmitWarning(null);
      setCreating(false);
    }
  }, [open ]);

  useEffect(() => {
    if (!open || !documentId) return;
    let active = true;
    setLoadingDocument(true); setLoadError(false); setBaseline(null);
    void (async () => {
      const first = await erpClient.getErpModuleDetail(MODULE, { branchId: currentBranch, documentId, page: 1, pageSize: 50 });
      if (!active) return;
      if (first.documentId !== documentId || (first.branchId && first.branchId !== currentBranch) || !first.stateToken) throw new Error("Invalid document binding");
      const rows = [...first.lines.rows];
      let page = first.lines;
      while (page.hasMore) {
        if (!active) return;
        if (page.page >= 1000) throw new Error("Incomplete detail");
        const next = await erpClient.getErpModuleDetail(MODULE, { branchId: currentBranch, documentId, page: page.page + 1, pageSize: 50 });
        if (!active) return;
        if (next.documentId !== documentId || next.stateToken !== first.stateToken || next.lines.page !== page.page + 1
          || (next.branchId && next.branchId !== currentBranch)) throw new Error("Document changed during read");
        rows.push(...next.lines.rows); page = next.lines;
      }
      if (!active) return;
      if (rows.some(row => !row.lineId) || new Set(rows.map(row => row.lineId)).size !== rows.length) throw new Error("Invalid line identities");
      const h = first.header || {};
      setPurchaseDate(text(h.purchaseDate).slice(0, 10));
      setPersonSuggest(text(h.personSuggest)); setPersonChoices(multiChoices(h.personSuggest));
      setDepartment(text(h.department)); setDepartmentChoices(multiChoices(h.department));
      setPurposeId(text(h.purposeId));
      setPurposeDescOrClient(text(h.purposeDescOrClient)); setPrice(text(h.price)); setNotes(text(h.notes));
      setCurrencyId(text(h.currencyId)); setCurrencyChoice(choice(h.currencyId, h.currencyName));
      setObjectId(text(h.objectId));
      setRateExchange(text(h.rateExchange));
      setLines(rows.map(row => {
        const f = row.fields || {};
        return { key: row.lineId, lineId: row.lineId, itemId: text(f.itemId), itemChoice: choice(f.itemId, f.itemName, { ItemName: f.itemName, Unit: f.unit }),
          model: text(f.model), budget: text(f.budget), timeRequired: text(f.timeRequired), quantity: text(f.quantity), unitPrice: text(f.unitPrice) };
      }));
      setBaseline({ ...first, lines: { ...page, rows, hasMore: false } });
      setStep(0); setErrors({}); setSubmitError(null); setSubmitWarning(null);
    })().catch(() => { if (active) setLoadError(true); }).finally(() => { if (active) setLoadingDocument(false); });
    return () => { active = false; };
  }, [open, documentId, currentBranch, readRevision]);

  const saveAllowed = !isEditing || !!baseline?.actions.some(action => action.id === "save" && action.visible && action.enabled);
  const formDisabled = creating || loadingDocument || (isEditing && (!baseline || !saveAllowed)) || uncertain;

  const patchLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // ERP leaves the total blank while any line still has no price, never a partial sum.
  const grandTotal = lines.some(line => !line.unitPrice.trim()) ? null : sumMoney(lines.map(lineTotal)) || "0";

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!purchaseDate) next["header.purchaseDate"] = "Chọn ngày đề nghị.";
    if (!personSuggest.trim()) next["header.personSuggest"] = "Chọn người đề nghị.";
    if (!department.trim()) next["header.department"] = "Chọn bộ phận.";
    if (!currencyId.trim()) next["header.currencyId"] = "Chọn loại tiền.";
    if (price.trim() && !DECIMAL_RE.test(price.trim())) next["header.price"] = "Giá bán phải là số.";
    if (lines.length === 0) next["lines"] = "Cần ít nhất 1 chi tiết.";
    if (lines.length > 500) next["lines"] = "Tối đa 500 dòng chi tiết.";
    for (const line of lines) {
      if (!line.itemId.trim()) next[`line.${line.key}.itemId`] = "Chọn mã hàng.";
      if (!DECIMAL_RE.test(line.quantity.trim())) next[`line.${line.key}.quantity`] = "Số lượng phải là số.";
      if (line.unitPrice.trim() && !DECIMAL_RE.test(line.unitPrice.trim())) next[`line.${line.key}.unitPrice`] = "Đơn giá phải là số không âm, hoặc để trống khi chưa có báo giá.";
      if (line.budget.trim() && !DECIMAL_RE.test(line.budget.trim()))
        next[`line.${line.key}.budget`] = "Ngân sách phải là số.";
    }
    return next;
  }

  async function handleSubmit() {
    if (submitLock.current || loadingDocument || !saveAllowed || (isEditing && !baseline)) return;
    const found = saveIntent.current ? {} : validate();
    setErrors(found);
    setSubmitError(null);
    setSubmitWarning(null);
    if (Object.keys(found).length > 0) {
      if (isMobile) setStep(Object.keys(found).some(key => key.startsWith("header.")) ? 0 : 1);
      return;
    }
    submitLock.current = true;
    setCreating(true);
    const idempotencyKey = `${isEditing ? "save" : "crt"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const header: Record<string, unknown> = {
          purchaseDate: purchaseDate ? `${purchaseDate}T00:00:00.000` : null,
          purposeId: purposeId.trim() ? Number(purposeId) : null,
          personSuggest: personSuggest.trim(),
          department: department.trim(),
          purposeDescOrClient: purposeDescOrClient.trim() ? purposeDescOrClient.trim() : null,
          price: price.trim() ? price.trim() : null,
          notes: notes.trim() ? notes.trim() : null,
          currencyId: currencyId.trim(),
          // No supplier picker on the request: an empty ID is refused (invalid_erp_intent), NULL is the ERP value.
          objectId: objectId.trim() || null,
          rateExchange: rateExchange.trim() ? Number(rateExchange) : null,
      };
      if (isEditing && baseline && !saveIntent.current) {
        const originalHeader = baseline.header || {};
        // Preserve the original wall-clock time when only the displayed date is unchanged.
        if (purchaseDate === text(originalHeader.purchaseDate).slice(0, 10)) header.purchaseDate = originalHeader.purchaseDate ?? null;
        if (typeof header.purchaseDate === "string" && /T\d{2}:\d{2}:\d{2}$/.test(header.purchaseDate)) header.purchaseDate += ".000";
        for (const key of ["personSuggest", "department", "purposeDescOrClient", "price", "notes", "currencyId", "objectId"])
          if (text(header[key]) === text(originalHeader[key]).trim()) header[key] = originalHeader[key] ?? null;

        const originals = new Map(baseline.lines.rows.map(row => [row.lineId, row.fields || {}]));
        const kept = new Set<string>();
        const changes: Parameters<typeof erpClient.saveDocument>[1]["lineChanges"] = [];
        for (const line of lines) {
          const values = lineValues(line);
          if (!line.lineId) { changes.push({ kind: "Add", clientLineKey: line.key, values }); continue; }
          const original = originals.get(line.lineId);
          if (!original || kept.has(line.lineId)) throw new Error("Không xác định được dòng chi tiết. Vui lòng mở lại phiếu.");
          kept.add(line.lineId);
          let changed = false;
          for (const key of Object.keys(values)) {
            if (text(values[key]) === text(original[key]).trim()) values[key] = original[key] ?? null;
            else changed = true;
          }
          if (changed) changes.push({ kind: "Update", lineId: line.lineId, values });
        }
        for (const lineId of originals.keys()) if (!kept.has(lineId)) changes.push({ kind: "Remove", lineId });
        if (changes.length > 500) throw new Error("Mỗi lần lưu tối đa 500 dòng thay đổi. Vui lòng chia thành nhiều lần lưu.");
        saveIntent.current = { idempotencyKey, branchId: currentBranch, documentId: baseline.documentId,
          expectedStateToken: baseline.stateToken!, header, lineChanges: changes };
      }
      const res = isEditing
        ? await erpClient.saveDocument(MODULE, saveIntent.current!)
        : await erpClient.createDocument(MODULE, { idempotencyKey, branchId: currentBranch, header,
          lines: lines.map(line => ({ clientLineKey: line.key, values: lineValues(line) })) });
      if (res.outcome === "Committed" || res.outcome === "Replayed") {
        if (isEditing) {
          const receipt = res.receipt, intent = saveIntent.current!;
          if (!receipt || receipt.documentId !== intent.documentId || receipt.module !== MODULE || receipt.idempotencyKey !== intent.idempotencyKey || receipt.deleted) throw new Error("Unconfirmed receipt");
          saveIntent.current = null; setUncertain(false);
          onSaved?.(receipt.documentId);
          return;
        }
        const docId = res.receipt?.documentId;
        if (docId) onCreated?.(docId);
        else onClose();
        return;
      }
      if (isEditing && res.outcome === "OutcomeUnknown") {
        setUncertain(true);
        setSubmitError("Chưa xác nhận được kết quả lưu. Bấm Thử lại lưu để gửi lại đúng yêu cầu gốc.");
        return;
      }
      saveIntent.current = null; setUncertain(false);
      if (res.outcome === "QualificationRequired") {
        setSubmitWarning(
          res.code === "target_acceptance_changed"
            ? "Máy chủ từ chối ghi: cấu hình ERP writes không còn khớp với cơ sở dữ liệu (schema/binding đổi sau khi prepare). Liên hệ vận hành chạy lại prepare và cập nhật SchemaFingerprint."
            : "Hệ thống đang ở chế độ kiểm soát an toàn. Dữ liệu chưa được ghi trực tiếp vào cơ sở dữ liệu."
        );
        return;
      }
      const message =
        res.outcome === "InvalidInput"
          ? "Thông tin chưa hợp lệ hoặc thiếu trường bắt buộc. Vui lòng kiểm tra lại."
          : res.outcome === "Denied"
            ? "Tài khoản hiện tại không có quyền thực hiện thao tác này."
            : res.outcome === "Conflict"
              ? "Chứng từ đã thay đổi bởi người dùng khác. Đóng form và mở lại phiếu để cập nhật dữ liệu."
              : res.outcome === "Cancelled"
                ? "Thao tác đã bị hủy."
                : `Thao tác không thành công${res.code ? ` (${res.code})` : ""}. Vui lòng thử lại.`;
      setSubmitError(message);
    } catch (error) {
      if (isEditing && saveIntent.current) {
        setUncertain(true);
        setSubmitError("Chưa xác nhận được kết quả lưu. Bấm Thử lại lưu để gửi lại đúng yêu cầu gốc.");
      } else if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        // A 4xx refusal wrote nothing; it is not a connection problem.
        setSubmitError(`Hệ thống từ chối dữ liệu của phiếu (${error.code}). Chưa có gì được lưu; kiểm tra lại các trường rồi thử lại.`);
      } else setSubmitError(isEditing ? (error instanceof Error ? error.message : "Không thể lưu chứng từ ERP.") : "Lỗi kết nối khi tạo mới chứng từ ERP.");
    } finally {
      setCreating(false);
      submitLock.current = false;
    }
  }

  /* ----- Section 1: header ----- */
  const headerSection = (
    <FormSection layout="stack" title="Thông tin phiếu" className="rounded-2xl border border-neutral-200/80 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Mã đề xuất</label>
          <p className="p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-base text-neutral-400">
            {documentId || "Tự cấp sau khi tạo"}
          </p>
        </div>
        <FormField label="Ngày đề nghị" type="date" required value={purchaseDate}
          onChange={event => setPurchaseDate(event.target.value)} error={errors["header.purchaseDate"]} />
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Chi nhánh</label>
          <p className="p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-base font-mono font-bold text-neutral-600 dark:text-neutral-300">
            {currentBranch}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <LookupField
          label="Người đề nghị"
          required
          module="purchase-requests"
          lookupId="header.PersonSuggest"
          branchId={currentBranch}
          value={personSuggest}
          choice={null}
          multiple
          selected={personChoices}
          onMultiSelect={(cs) => {
            setPersonChoices(cs);
            setPersonSuggest(cs.map((c) => c.id).join(", "));
          }}
          error={errors["header.personSuggest"]}
          placeholder="Chọn người đề nghị..."
          onSelect={() => undefined}
        />
        <LookupField
          label="Bộ phận"
          required
          module="purchase-requests"
          lookupId="header.Department"
          branchId={currentBranch}
          value={department}
          choice={null}
          multiple
          selected={departmentChoices}
          onMultiSelect={(cs) => {
            setDepartmentChoices(cs);
            setDepartment(cs.map((c) => c.id).join(", "));
          }}
          error={errors["header.department"]}
          placeholder="Chọn bộ phận..."
          onSelect={() => undefined}
        />
      </div>
      {/* Chủ dự án bỏ trường "Mục đích" (19/10/2026). Giá trị purposeId của phiếu
          đã lưu vẫn được giữ nguyên khi lưu lại, chỉ không còn ô nhập. */}
      <TextField
        label="Mục đích / Khách hàng"
        value={purposeDescOrClient}
        onChange={setPurposeDescOrClient}
        placeholder="Diễn giải mục đích..."
      />
      <TextField label="Ghi chú" value={notes} onChange={setNotes} placeholder="Ghi chú nội dung phiếu..." />
    </FormSection>
  );

  /* ----- Section 2: currency & price ----- */
  const counterpartySection = (
    <FormSection layout="stack" title="Tiền tệ & giá bán" className="rounded-2xl border border-neutral-200/80 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      {/* Chủ dự án bỏ ô "Khách hàng" (19/10/2026). Với phiếu đã lưu, giá trị ObjectID
          gốc vẫn được giữ nguyên khi lưu lại; phiếu tạo mới không gửi đối tượng. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <LookupField
          label="Loại tiền"
          required
          module="purchase-requests"
          lookupId="header.CurrencyID"
          branchId={currentBranch}
          value={currencyId}
          choice={currencyChoice}
          error={errors["header.currencyId"]}
          placeholder="VND"
          onSelect={(c) => {
            setCurrencyChoice(c);
            if (c) {
              setCurrencyId(c.id);
            } else setCurrencyId("");
          }}
        />
        <TextField
          label="Giá bán"
          money
          value={price}
          onChange={setPrice}
          inputMode="decimal"
          error={errors["header.price"]}
        />
      </div>
    </FormSection>
  );

  /* ----- Section 3: lines ----- */
  const linesSection = (
    <FormSection layout="stack" title={`Chi tiết (${lines.length})`} className="rounded-2xl border border-neutral-200/80 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
      action={<AppButton onClick={() => setLines((prev) => [...prev, emptyLine()])} disabled={lines.length >= 500}><Plus aria-hidden="true" className="size-4" />Thêm dòng</AppButton>}>
      {errors["lines"] && <p className="text-sm text-red-500">{errors["lines"]}</p>}
      <div className="space-y-3">
        {lines.map((line, idx) => {
          const total = lineTotal(line);
          return (
            <div
              key={line.key}
              className="rounded-xl border border-neutral-200/80 dark:border-neutral-800 p-3 space-y-2.5 bg-neutral-50/50 dark:bg-neutral-950/40"
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-neutral-500">Dòng {idx + 1}</span>
                {lines.length > 1 && (
                  <AppButton
                    variant="ghost"
                    size="icon"
                    aria-label={`Xóa dòng ${idx + 1}`}
                    onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                    className="text-neutral-500 hover:text-red-600 dark:text-neutral-400"
                  >
                    <X className="size-4" />
                  </AppButton>
                )}
              </div>
              <LookupField
                label="Mã hàng"
                required
                module="purchase-requests"
                lookupId="lines.ItemID"
                branchId={currentBranch}
                value={line.itemId}
                choice={line.itemChoice}
                secondaryFields={["ItemName", "Unit", "HangSX", "ItemCode"]}
                error={errors[`line.${line.key}.itemId`]}
                placeholder="Chọn mã hàng..."
                onSelect={(c) =>
                  patchLine(line.key, { itemChoice: c, itemId: c ? c.id : "" })
                }
              />
              {(line.itemChoice || line.itemId) && (
                <div className="space-y-0.5 text-sm text-neutral-900 dark:text-neutral-100">
                  <p>
                    {[
                      fieldText(line.itemChoice?.fields?.["ItemName"]),
                      fieldText(line.itemChoice?.fields?.["Unit"]),
                    ]
                      .filter(Boolean)
                      .join(" · ") || line.itemId}
                  </p>
                  {/* Chủ dự án yêu cầu hiển thị thêm mã hãng sản xuất (19/10/2026). */}
                  <p>
                    <span className="font-medium">Mã hãng SX: </span>
                    {fieldText(line.itemChoice?.fields?.["HangSX"]) ||
                      fieldText(line.itemChoice?.fields?.["ItemCode"]) ||
                      "—"}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TextField label="Model" value={line.model} onChange={(v) => patchLine(line.key, { model: v })} />
                <TextField
                  label="Ngân sách"
                  money
                  value={line.budget}
                  onChange={(v) => patchLine(line.key, { budget: v })}
                  inputMode="decimal"
                  error={errors[`line.${line.key}.budget`]}
                />
                <TextField
                  label="Thời gian yêu cầu"
                  value={line.timeRequired}
                  onChange={(v) => patchLine(line.key, { timeRequired: v })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <TextField
                  label="Số lượng"
                  required
                  value={line.quantity}
                  onChange={(v) => patchLine(line.key, { quantity: v })}
                  inputMode="decimal"
                  error={errors[`line.${line.key}.quantity`]}
                />
                <TextField
                  label="Đơn giá"
                  money
                  placeholder="Để trống nếu chưa có báo giá"
                  value={line.unitPrice}
                  onChange={(v) => patchLine(line.key, { unitPrice: v })}
                  inputMode="decimal"
                  error={errors[`line.${line.key}.unitPrice`]}
                />
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Tổng giá</label>
                  <p className="p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-base font-bold text-neutral-900 dark:text-neutral-100">
                    {total == null ? "—" : formatVND(total)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-base font-bold text-neutral-800 dark:text-neutral-200">
        <span>
          Tổng: {lines.length} dòng
        </span>
        <span className="text-brand-700 dark:text-brand-300">Tổng tiền: {grandTotal == null ? "Chưa đủ đơn giá" : formatVND(grandTotal)}</span>
      </div>
    </FormSection>
  );

  const feedback = (
    <>
      {submitError && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-base text-red-800 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}
      {submitWarning && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-base text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{submitWarning}</span>
        </div>
      )}
    </>
  );

  const steps = ["Thông tin", "Chi tiết", "Xem lại"];
  const reviewLines = lines.filter((l) => l.itemId.trim() !== "");
  const formReady = !isEditing || (!!baseline && !loadingDocument && !loadError);
  const closeForm = () => { if (!submitLock.current && !uncertain) onClose(); };
  const confirmLabel = creating ? (isEditing ? "Đang lưu..." : "Đang tạo...") : uncertain ? "Thử lại lưu" : isEditing ? "Lưu thay đổi" : "Tạo đề nghị mua";
  const advanceStep = () => {
    const found = validate();
    setErrors(found);
    if (step === 0) {
      if (!Object.keys(found).some(key => key.startsWith("header."))) setStep(1);
    } else if (Object.keys(found).length === 0) setStep(2);
  };
  return (
    <FormSheet open={open} onClose={closeForm} title={isEditing ? "Sửa đề nghị mua hàng" : "Tạo đề nghị mua hàng"}
      description={documentId} submitLabel={confirmLabel} onSubmit={() => void handleSubmit()} busy={creating}
      steps={isMobile && formReady ? steps.map(label => ({ id: label, label })) : []} currentStep={step}
      onBack={() => setStep(s => s - 1)} backDisabled={formDisabled} cancelDisabled={creating || uncertain}
      onNext={advanceStep} nextDisabled={formDisabled} submitDisabled={creating || !saveAllowed} hideFooter={!formReady}
      stepDisabled={formDisabled} onStepChange={i => {
        if (i <= step) { setStep(i); return; }
        const found = validate(); setErrors(found);
        if (i === 1 && !Object.keys(found).some(key => key.startsWith("header."))) setStep(1);
        if (i === 2 && Object.keys(found).length === 0) setStep(2);
      }}>
      {loadingDocument ? <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm"><Loader2 className="size-5 animate-spin" />Đang tải đầy đủ chi tiết phiếu...</div>
        : loadError ? <div className="space-y-3 text-sm"><p role="alert">Không tải được đầy đủ phiếu hoặc phiếu đã thay đổi trong lúc tải. Vui lòng thử lại.</p><AppButton variant="secondary" onClick={() => setReadRevision(value => value + 1)}>Thử lại</AppButton></div> : null}
      {formReady && <div className="min-w-0 space-y-5 text-base leading-relaxed">
        <fieldset disabled={formDisabled} className="min-w-0 space-y-3.5 border-0 p-0">
        {(!isMobile || step === 0) && (
          <div className="space-y-3.5">
            {headerSection}
            {counterpartySection}
          </div>
        )}
        {(!isMobile || step === 1) && linesSection}

        {(!isMobile || step === 2) && (
          <section data-purchase-review className="min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-4 sm:px-6 dark:border-neutral-800">
              <div><h4 className="text-lg font-semibold text-neutral-900 dark:text-white">{isMobile ? "Xem lại" : "Tổng hợp"}</h4><p className="mt-1 text-sm text-neutral-900 dark:text-white">Kiểm tra thông tin trước khi {isEditing ? "lưu thay đổi" : "tạo phiếu"}.</p></div>
              <span className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium dark:bg-neutral-800">{reviewLines.length} mặt hàng</span>
            </div>
            <div className="space-y-6 p-4 sm:p-6">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
                {[["Chi nhánh", currentBranch], ["Ngày đề xuất", purchaseDate], ["Loại tiền", currencyId]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-neutral-900 dark:text-white">{label}</dt><dd className="mt-1 break-words text-base font-semibold tabular-nums">{value || "—"}</dd></div>)}
              </dl>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                {[["Người đề nghị", personSuggest], ["Bộ phận", department], ["Giá bán", formatVND(price)], ["Mục đích / Khách hàng", purposeDescOrClient], ["Ghi chú", notes]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-neutral-900 dark:text-white">{label}</dt><dd className="mt-1.5 whitespace-pre-wrap break-words text-base font-medium leading-7">{value || "—"}</dd></div>)}
              </dl>
              <div className="border-t border-neutral-200 pt-5 dark:border-neutral-800">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h5 className="text-base font-semibold">Chi tiết hàng hóa</h5>{baseline && <p className="text-sm text-neutral-900 dark:text-white">Thêm {lines.filter(line => !line.lineId).length} dòng · Xóa {baseline.lines.rows.filter(row => !lines.some(line => line.lineId === row.lineId)).length} dòng so với phiếu đã lưu</p>}</div>
                {reviewLines.length === 0 ? <p className="rounded-xl bg-neutral-50 p-4 text-base dark:bg-neutral-950">Chưa có chi tiết nào.</p> : <>
                  <div className="hidden overflow-x-auto rounded-xl border border-neutral-200 lg:block dark:border-neutral-800">
                    <table data-purchase-review-table className="w-full min-w-[1100px] text-left text-base [&_th]:whitespace-nowrap [&_th]:px-4 [&_th]:py-3 [&_th]:text-sm [&_th]:font-semibold [&_td]:px-4 [&_td]:py-4">
                      <thead className="bg-neutral-50 dark:bg-neutral-950"><tr><th>Mặt hàng</th><th>Model</th><th>Ngân sách</th><th>Thời gian yêu cầu</th><th>Số lượng</th><th>Đơn giá</th><th className="text-right">Thành tiền</th></tr></thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">{reviewLines.map(l => <tr key={l.key}>
                        <td className="min-w-60"><p className="font-semibold">{choiceLabel(l.itemChoice, l.itemId)}</p><p className="mt-1 text-sm">{l.itemId}</p></td><td>{l.model || "—"}</td><td className="tabular-nums">{formatVND(l.budget)}</td><td>{l.timeRequired || "—"}</td><td className="tabular-nums">{l.quantity}</td><td className="tabular-nums">{formatVND(l.unitPrice)}</td><td className="text-right font-semibold tabular-nums">{lineTotal(l) == null ? "—" : formatVND(lineTotal(l)!)}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                  <div className="space-y-4 lg:hidden">{reviewLines.map((l, index) => <article key={l.key} className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
                    <div className="space-y-4 p-4"><div><p className="text-sm">Mặt hàng {index + 1} · {l.itemId}</p><h5 className="mt-1 break-words text-base font-semibold leading-7">{choiceLabel(l.itemChoice, l.itemId)}</h5></div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-4">{[["Model", l.model], ["Ngân sách", formatVND(l.budget)], ["Thời gian yêu cầu", l.timeRequired], ["Số lượng", l.quantity], ["Đơn giá", formatVND(l.unitPrice)]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm">{label}</dt><dd className="mt-1 break-words text-base font-medium tabular-nums">{value || "—"}</dd></div>)}</dl>
                    </div><div className="flex flex-wrap justify-between gap-2 bg-neutral-50 px-4 py-3 dark:bg-neutral-950"><span className="text-sm">Thành tiền</span><strong className="text-base tabular-nums">{lineTotal(l) == null ? "—" : formatVND(lineTotal(l)!)}</strong></div>
                  </article>)}</div>
                </>}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-100 bg-brand-50 px-4 py-5 sm:px-6 dark:border-brand-900 dark:bg-brand-950/40"><div><p className="text-base font-semibold">Tổng thanh toán</p><p className="mt-1 text-sm">{reviewLines.length} mặt hàng · {currencyId || "—"}</p></div><strong className="min-w-0 break-words text-2xl font-semibold tabular-nums text-brand-800 dark:text-brand-200">{grandTotal == null ? "Chưa đủ đơn giá" : `${formatVND(grandTotal)} ${currencyId}`}</strong></div>
          </section>
        )}

        </fieldset>

        {feedback}
        {!saveAllowed && <p role="status" className="text-base text-amber-700 dark:text-amber-300">Phiếu hiện không được phép sửa theo quyền hoặc trạng thái ERP.</p>}
      </div>}
    </FormSheet>
  );
}
