"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Plus, X, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { erpClient } from "@/lib/erp/erp-client";
import type { ErpChoice } from "@/lib/erp/erp-screen-contracts";
import { UntitledBottomSheet } from "./bottom-sheet";
import { LookupField, choiceLabel, fieldText } from "./lookup-field";
import { UntitledButton } from "./button";
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
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-black dark:text-white">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {money ? <MoneyInput value={value} onValueChange={onChange} placeholder={placeholder} aria-invalid={!!error}
        className={error ? "border-red-400 dark:border-red-700" : ""} /> : <input
        type="text"
        inputMode={inputMode || "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full min-h-11 p-2.5 rounded-xl border bg-white dark:bg-neutral-900 text-black dark:text-white text-base ${
          error ? "border-red-400 dark:border-red-700" : "border-neutral-300 dark:border-neutral-700"
        }`}
      />}
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}

/* ================= Main sheet ================= */
export function PurchaseOrderCreateSheet({
  open,
  onClose,
  currentBranch,
  onCreated,
}: PurchaseOrderCreateSheetProps) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

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
    <section className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-4 space-y-3">
      <h4 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Thông tin đơn</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        <div>
          <label className="block text-black dark:text-white mb-1 font-medium">Mã đơn</label>
          <p className="p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-sm text-neutral-400">
            Tự cấp sau khi tạo
          </p>
        </div>
        <div>
          <label className="block text-black dark:text-white mb-1 font-medium">
            Ngày lập <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={documentDate}
            onChange={(e) => setDocumentDate(e.target.value)}
            className={`w-full p-2.5 rounded-xl border bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm ${
              errors["header.documentDate"]
                ? "border-red-400 dark:border-red-700"
                : "border-neutral-300 dark:border-neutral-700"
            }`}
          />
          {errors["header.documentDate"] && (
            <p className="mt-1 text-sm text-red-500">{errors["header.documentDate"]}</p>
          )}
        </div>
        <div>
          <label className="block text-black dark:text-white mb-1 font-medium">Ngày giao hàng</label>
          <input
            type="date"
            value={deliverDate}
            onChange={(e) => setDeliverDate(e.target.value)}
            className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        <div className="col-span-2 md:col-span-1">
          <label className="block text-black dark:text-white mb-1 font-medium">Chi nhánh</label>
          <p className="p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-sm font-mono font-bold text-neutral-600 dark:text-neutral-300">
            {currentBranch}
          </p>
        </div>
        <div className="col-span-2 md:col-span-2">
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
    </section>
  );

  /* ----- Section 2: counterparty & currency ----- */
  const counterpartySection = (
    <section className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-4 space-y-3">
      <h4 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Đối tượng &amp; tiền tệ</h4>
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
        <p className="text-sm text-black dark:text-white">
          {[fieldText(objectChoice.fields?.["ObjectName"]), fieldText(objectChoice.fields?.["Address"])]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-2.5">
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
    </section>
  );

  /* ----- Section 3: lines ----- */
  const linesSection = (
    <section className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold uppercase tracking-wider text-neutral-400">
          Chi tiết ({lines.length})
        </h4>
        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, emptyLine()])}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-sm font-bold bg-brand-600 text-white hover:bg-brand-700"
        >
          <Plus className="size-3.5" /> Thêm dòng
        </button>
      </div>
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
                  <button
                    type="button"
                    aria-label={`Xóa dòng ${idx + 1}`}
                    onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                    className="p-1 rounded-md text-neutral-400 hover:text-red-600"
                  >
                    <X className="size-4" />
                  </button>
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
                <div className="space-y-0.5 text-sm text-black dark:text-white">
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
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
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
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-black dark:text-white mb-1 font-medium">Thành tiền</label>
                  <p className="p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-sm font-bold text-black dark:text-white">
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
      <div className="flex items-center justify-between pt-1 text-sm font-bold text-neutral-800 dark:text-neutral-200">
        <span>Tổng: {lines.length} dòng</span>
        <span className="text-brand-700 dark:text-brand-300">Tổng tiền: {formatVND(grandTotal)}</span>
      </div>
    </section>
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

  return (
    <UntitledBottomSheet open={open} onClose={onClose} title="Tạo đơn đặt mua">
      <div className="space-y-3.5 pb-24 text-sm">
        {isMobile && (
          <ol className="flex items-center gap-1 px-1">
            {steps.map((label, i) => (
              <li key={label} className="flex-1">
                <button
                  type="button"
                  onClick={() => {
                    if (i === 0) setStep(0);
                    if (i === 1 && headerValid) setStep(1);
                    if (i === 2 && headerValid && linesValid) setStep(2);
                  }}
                  className="w-full text-left"
                >
                  <span
                    className={`block h-1 rounded-full ${
                      i <= step ? "bg-brand-600" : "bg-neutral-200 dark:bg-neutral-700"
                    }`}
                  />
                  <span
                    className={`mt-1 block text-sm font-semibold ${
                      i === step ? "text-brand-700 dark:text-brand-300" : "text-neutral-400"
                    }`}
                  >
                    {i + 1}. {label}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}

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
            <p className="text-sm text-black dark:text-white">
              {currentBranch} · {documentDate || "—"}
              {deliverDate ? ` · giao ${deliverDate}` : ""} · {currencyId || "—"}
              {rateExchange ? ` (${rateExchange})` : ""}
            </p>
            <p className="text-sm text-black dark:text-white">
              NCC: {choiceLabel(objectChoice, objectId) || "—"}
              {contractId.trim() ? ` · HĐ: ${contractId.trim()}` : ""}
            </p>
            <div className="pt-1 space-y-1">
              {reviewLines.length === 0 ? (
                <p className="text-sm text-neutral-400">Chưa có chi tiết nào.</p>
              ) : (
                reviewLines.map((l) => (
                  <p key={l.key} className="text-sm text-black dark:text-white flex justify-between gap-2">
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

        {isMobile ? (
          <div className="flex gap-2">
            {step > 0 ? (
              <UntitledButton variant="secondary-gray" size="md" onClick={() => setStep((s) => s - 1)} iconLeading={<ChevronLeft className="size-4" />}>
                Quay lại
              </UntitledButton>
            ) : (
              <UntitledButton variant="secondary-gray" size="md" onClick={onClose}>
                Hủy
              </UntitledButton>
            )}
            {step < 2 ? (
              <UntitledButton
                variant="primary"
                size="md"
                onClick={() => {
                  if (step === 0) {
                    const found = validate();
                    setErrors(found);
                    if (
                      !found["header.documentDate"] &&
                      !found["header.objectId"] &&
                      !found["header.currencyId"] &&
                      !found["header.rateExchange"]
                    )
                      setStep(1);
                  } else if (linesValid) setStep(2);
                  else {
                    setErrors(validate());
                  }
                }}
                iconLeading={<ChevronRight className="size-4" />}
              >
                {step === 0 ? "Tiếp: Chi tiết" : "Xem lại & tạo"}
              </UntitledButton>
            ) : (
              <UntitledButton variant="primary" size="md" onClick={handleSubmit} disabled={creating} iconLeading={creating ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}>
                {creating ? "Đang tạo..." : "Xác nhận tạo đơn"}
              </UntitledButton>
            )}
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <UntitledButton variant="secondary-gray" size="md" onClick={onClose}>
              Hủy
            </UntitledButton>
            <UntitledButton
              variant="primary"
              size="md"
              onClick={handleSubmit}
              disabled={creating}
              iconLeading={creating ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            >
              {creating ? "Đang tạo..." : "Xác nhận tạo chứng từ"}
            </UntitledButton>
          </div>
        )}
      </div>
    </UntitledBottomSheet>
  );
}
