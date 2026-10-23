"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X, AlertCircle } from "lucide-react";
import { erpClient } from "@/lib/erp/erp-client";
import type { ErpChoice } from "@/lib/erp/erp-screen-contracts";
import { FormSheet } from "@/components/app/form-sheet";
import { FormField, FormSection } from "@/components/app/form-field";
import { AppButton } from "@/components/app/app-button";
import { useIsMobile } from "@/components/app/use-is-mobile";
import { LookupField, choiceLabel, fieldText } from "./lookup-field";
import {MoneyInput} from "@/components/erp/money-input";
import {formatMoney as formatVND, multiplyMoney, sumMoney} from "@/lib/erp/money";

interface PurchaseOrderCreateSheetProps {
  open: boolean;
  onClose: () => void;
  currentBranch: string;
  onCreated?: (documentId: string) => void;
}

interface DraftLine {
  key: string;
  itemId: string;
  itemChoice: ErpChoice | null;
  quantity: string;
  unitPrice: string;
  notes: string;
}

const DECIMAL_RE = /^\d+(\.\d+)?$/;
const MODULE = "purchase-orders" as const;
const newLineKey = () => `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const emptyLine = (): DraftLine => ({
  key: newLineKey(),
  itemId: "",
  itemChoice: null,
  quantity: "1",
  unitPrice: "",
  notes: "",
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
export function PurchaseOrderCreateSheet({
  open,
  onClose,
  currentBranch,
  onCreated,
}: PurchaseOrderCreateSheetProps) {
  const isMobile = useIsMobile();

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [documentDate, setDocumentDate] = useState(today);
  const [deliverDate, setDeliverDate] = useState("");
  const [objectId, setObjectId] = useState("");
  const [objectChoice, setObjectChoice] = useState<ErpChoice | null>(null);
  const [currencyId, setCurrencyId] = useState("VND");
  const [currencyChoice, setCurrencyChoice] = useState<ErpChoice | null>(null);
  const [rateExchange, setRateExchange] = useState("1");
  const [contractId, setContractId] = useState("");
  const [memo, setMemo] = useState("");
  const [notes, setNotes] = useState("");

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

  const patchLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const grandTotal = sumMoney(lines.map(lineTotal)) || "0";

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!documentDate) next["header.documentDate"] = "Chọn ngày lập chứng từ.";
    if (!objectId.trim()) next["header.objectId"] = "Chọn nhà cung cấp / đối tượng.";
    if (!currencyId.trim()) next["header.currencyId"] = "Chọn loại tiền.";
    if (!DECIMAL_RE.test(rateExchange.trim())) next["header.rateExchange"] = "Tỷ giá phải là số.";
    if (lines.length === 0) next["lines"] = "Cần ít nhất 1 chi tiết.";
    for (const line of lines) {
      if (!line.itemId.trim()) next[`line.${line.key}.itemId`] = "Chọn mã hàng.";
      if (!DECIMAL_RE.test(line.quantity.trim())) next[`line.${line.key}.quantity`] = "Số lượng phải là số.";
      if (!DECIMAL_RE.test(line.unitPrice.trim())) next[`line.${line.key}.unitPrice`] = "Đơn giá phải là số.";
    }
    return next;
  }

  const headerValid =
    documentDate !== "" &&
    objectId.trim() !== "" &&
    currencyId.trim() !== "" &&
    DECIMAL_RE.test(rateExchange.trim());
  const linesValid =
    lines.length > 0 &&
    lines.every(
      (l) =>
        l.itemId.trim() !== "" &&
        DECIMAL_RE.test(l.quantity.trim()) &&
        DECIMAL_RE.test(l.unitPrice.trim())
    );

  async function handleSubmit() {
    const found = validate();
    setErrors(found);
    setSubmitError(null);
    setSubmitWarning(null);
    if (Object.keys(found).length > 0) {
      if (isMobile) setStep(headerValid ? 1 : 0);
      return;
    }
    setCreating(true);
    const idempotencyKey = `crt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const res = await erpClient.createDocument(MODULE, {
        idempotencyKey,
        branchId: currentBranch,
        header: {
          documentDate: `${documentDate}T00:00:00.000`,
          objectId: objectId.trim(),
          memo: memo.trim() ? memo.trim() : null,
          notes: notes.trim() ? notes.trim() : null,
          deliverDate: deliverDate ? `${deliverDate}T00:00:00.000` : null,
          currencyId: currencyId.trim(),
          rateExchange: Number(rateExchange),
          searchField: null,
          contractId: contractId.trim() ? contractId.trim() : null,
        },
        lines: lines.map((l) => ({
          clientLineKey: l.key,
          values: {
            itemId: l.itemId.trim(),
            quantity: l.quantity.trim(),
            unitPrice: l.unitPrice.trim(),
            notes: l.notes.trim() ? l.notes.trim() : null,
            quantity2: null,
            property: null,
            property2: null,
          },
        })),
      });
      if (res.outcome === "Committed" || res.outcome === "Replayed") {
        const docId = res.receipt?.documentId;
        if (docId) onCreated?.(docId);
        else onClose();
        return;
      }
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
              ? "Chứng từ đã thay đổi bởi người dùng khác. Vui lòng thử lại."
              : res.outcome === "Cancelled"
                ? "Thao tác đã bị hủy."
                : `Thao tác không thành công${res.code ? ` (${res.code})` : ""}. Vui lòng thử lại.`;
      setSubmitError(message);
    } catch {
      setSubmitError("Lỗi kết nối khi tạo mới đơn đặt mua.");
    } finally {
      setCreating(false);
    }
  }

  /* ----- Section 1: document ----- */
  const documentSection = (
    <FormSection layout="stack" title="Thông tin đơn" className="rounded-2xl border border-neutral-200/80 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Mã đơn</label>
          <p className="p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-sm text-neutral-500 dark:text-neutral-400">
            Tự cấp sau khi tạo
          </p>
        </div>
        <FormField label="Ngày lập" type="date" required value={documentDate}
          onChange={event => setDocumentDate(event.target.value)} error={errors["header.documentDate"]} />
        <FormField label="Ngày giao hàng" type="date" value={deliverDate} onChange={event => setDeliverDate(event.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="sm:col-span-2 md:col-span-1">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Chi nhánh</label>
          <p className="p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-sm font-mono font-bold text-neutral-600 dark:text-neutral-300">
            {currentBranch}
          </p>
        </div>
        <div className="sm:col-span-2 md:col-span-2">
          <TextField
            label="Mã hợp đồng"
            value={contractId}
            onChange={setContractId}
            placeholder="Liên kết hợp đồng (nếu có)..."
          />
        </div>
      </div>
      <TextField label="Nội dung (Memo)" value={memo} onChange={setMemo} placeholder="Diễn giải đơn đặt mua..." />
      <TextField label="Ghi chú" value={notes} onChange={setNotes} placeholder="Ghi chú thêm..." />
    </FormSection>
  );

  /* ----- Section 2: counterparty & currency ----- */
  const counterpartySection = (
    <FormSection layout="stack" title="Đối tượng & tiền tệ" className="rounded-2xl border border-neutral-200/80 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <LookupField
        label="Nhà cung cấp"
        required
        module="purchase-orders"
        lookupId="header.ObjectID"
        branchId={currentBranch}
        value={objectId}
        choice={objectChoice}
        error={errors["header.objectId"]}
        placeholder="Chọn nhà cung cấp..."
        onSelect={(c) => {
          setObjectChoice(c);
          setObjectId(c ? c.id : "");
        }}
      />
      {objectChoice && (fieldText(objectChoice.fields?.["ObjectName"]) || fieldText(objectChoice.fields?.["Address"])) && (
        <p className="text-sm text-neutral-900 dark:text-neutral-100">
          {[fieldText(objectChoice.fields?.["ObjectName"]), fieldText(objectChoice.fields?.["Address"])]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <LookupField
          label="Loại tiền"
          required
          module="purchase-orders"
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
              const rate = c.fields?.["RateExchange"];
              if (typeof rate === "number" && Number.isFinite(rate) && rate > 0)
                setRateExchange(String(rate));
            } else setCurrencyId("");
          }}
        />
        {/* Chủ dự án cho phép sửa tay tỷ giá (19/10/2026) — chọn loại tiền chỉ gợi ý giá trị. */}
        <TextField
          label="Tỷ giá"
          required
          value={rateExchange}
          onChange={setRateExchange}
          inputMode="decimal"
          error={errors["header.rateExchange"]}
          placeholder="1"
        />
      </div>
    </FormSection>
  );

  /* ----- Section 3: lines ----- */
  const linesSection = (
    <FormSection layout="stack" title={`Chi tiết (${lines.length})`} className="rounded-2xl border border-neutral-200/80 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
      action={<AppButton onClick={() => setLines((prev) => [...prev, emptyLine()])}><Plus aria-hidden="true" className="size-4" />Thêm dòng</AppButton>}>
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
                <span className="text-sm font-bold text-neutral-500">Dòng {idx + 1}</span>
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
                module="purchase-orders"
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
                  required
                  value={line.unitPrice}
                  onChange={(v) => patchLine(line.key, { unitPrice: v })}
                  inputMode="decimal"
                  error={errors[`line.${line.key}.unitPrice`]}
                />
                <div className="sm:col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Thành tiền</label>
                  <p className="p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    {total == null ? "—" : formatVND(total)}
                  </p>
                </div>
              </div>
              <TextField
                label="Ghi chú dòng"
                value={line.notes}
                onChange={(v) => patchLine(line.key, { notes: v })}
                placeholder="Ghi chú chi tiết..."
              />
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm font-bold text-neutral-800 dark:text-neutral-200">
        <span>Tổng: {lines.length} dòng</span>
        <span className="text-brand-700 dark:text-brand-300">Tổng tiền: {formatVND(grandTotal)}</span>
      </div>
    </FormSection>
  );

  const feedback = (
    <>
      {submitError && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-sm text-red-800 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}
      {submitWarning && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{submitWarning}</span>
        </div>
      )}
    </>
  );

  const steps = ["Thông tin", "Chi tiết", "Xem lại"];
  const reviewLines = lines.filter((l) => l.itemId.trim() !== "");

  const advanceStep = () => {
    if (step === 0) {
      const found = validate();
      setErrors(found);
      if (!found["header.documentDate"] && !found["header.objectId"] && !found["header.currencyId"] && !found["header.rateExchange"]) setStep(1);
    } else if (linesValid) setStep(2);
    else setErrors(validate());
  };

  return (
    <FormSheet open={open} onClose={onClose} title="Tạo đơn mua" submitLabel={creating ? "Đang tạo..." : "Tạo đơn mua"}
      onSubmit={() => void handleSubmit()} busy={creating} submitDisabled={creating}
      steps={isMobile ? steps.map(label => ({ id: label, label })) : []} currentStep={step}
      onBack={() => setStep(s => s - 1)} onNext={advanceStep} onStepChange={i => {
        if (i === 0) setStep(0);
        if (i === 1 && headerValid) setStep(1);
        if (i === 2 && headerValid && linesValid) setStep(2);
      }}>
      <div className="min-w-0 space-y-5 text-base leading-relaxed">
        {(!isMobile || step === 0) && (
          <div className="space-y-3.5">
            {documentSection}
            {counterpartySection}
          </div>
        )}
        {(!isMobile || step === 1) && linesSection}

        {(!isMobile || step === 2) && (
          <section className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-4 space-y-2">
            <h4 className="text-sm font-bold uppercase tracking-wider text-neutral-400">
              {isMobile ? "Xem lại" : "Tổng hợp"}
            </h4>
            <p className="text-sm text-neutral-900 dark:text-neutral-100">
              {currentBranch} · {documentDate || "—"}
              {deliverDate ? ` · giao ${deliverDate}` : ""} · {currencyId || "—"}
              {rateExchange ? ` (${rateExchange})` : ""}
            </p>
            <p className="text-sm text-neutral-900 dark:text-neutral-100">
              NCC: {choiceLabel(objectChoice, objectId) || "—"}
              {contractId.trim() ? ` · HĐ: ${contractId.trim()}` : ""}
            </p>
            <div className="pt-1 space-y-1">
              {reviewLines.length === 0 ? (
                <p className="text-sm text-neutral-400">Chưa có chi tiết nào.</p>
              ) : (
                reviewLines.map((l) => (
                  <p key={l.key} className="text-sm text-neutral-900 dark:text-neutral-100 flex justify-between gap-2">
                    <span className="truncate">
                      {l.itemId} × {l.quantity}
                    </span>
                    <span className="font-bold shrink-0">
                      {(() => {
                        const t = lineTotal(l);
                        return t == null ? "—" : formatVND(t);
                      })()}
                    </span>
                  </p>
                ))
              )}
            </div>
            <p className="text-sm font-bold text-brand-700 dark:text-brand-300 pt-1">
              Tổng thanh toán: {formatVND(grandTotal)} {currencyId}
            </p>
          </section>
        )}

        {feedback}


      </div>
    </FormSheet>
  );
}
