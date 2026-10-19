"use client";

import { Plus, Trash2 } from "lucide-react";
import { LookupField } from "@/components/untitledui/lookup-field";
import { MoneyInput } from "./money-input";
import {formatMoney, isMoneyField} from "@/lib/erp/money";
import { SALES_ORDER_LINE_COLUMNS, salesOrderLineDisplay, selectSalesOrderLine, type SalesOrderDraftLine } from "@/lib/erp/sales-order-lines";

export function SalesOrderLineEditor({ lines, branchId, contractId, onPatch, onAdd, onRemove }: {
  lines: (SalesOrderDraftLine & { savedLineId?: string })[];
  branchId: string;
  contractId: string;
  onPatch: (key: string, patch: Partial<SalesOrderDraftLine>) => void;
  onAdd: () => string;
  onRemove: (key: string) => void;
}) {
  const columns: Array<{ key: string; label: string; numeric?: boolean; editable?: boolean; formula?: string }> = SALES_ORDER_LINE_COLUMNS;
  const inputClass = "min-h-11 w-full min-w-0 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5 text-base text-black dark:text-white";
  const labelClass = "mb-1.5 block text-sm font-medium text-black dark:text-white";

  return <section aria-label="Thông tin chi tiết đơn hàng" className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-base font-semibold text-black dark:text-white">Hàng hóa ({lines.length})</h4>
      <button type="button" disabled={lines.length >= 500} onClick={() => onAdd()}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
        <Plus className="size-3.5" /> Thêm dòng
      </button>
    </div>
    <div className="space-y-3">
      {lines.map((line, index) => {
        const values = salesOrderLineDisplay(line);
        return <article key={line.key} aria-label={`Chi tiết ${index + 1}`}
          className="min-w-0 space-y-4 rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-950/40 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h5 className="text-base font-semibold text-black dark:text-white">Dòng {index + 1}</h5>
            {lines.length > 1 && <button type="button" aria-label={`Xóa dòng ${index + 1}`}
              onClick={() => onRemove(line.key)} className="inline-flex size-11 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30">
              <Trash2 className="size-4" />
            </button>}
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {columns.map(column => {
              const key = column.key;
              const id = `so-${line.key}-${key}`;
              const span = key === "itemId" ? "sm:col-span-2" : key === "dienGiai" || key === "notes" ? "col-span-full" : "";
              return <div key={key} className={`min-w-0 ${span}`}>
                {key === "itemId" ? <LookupField label="Mã hàng" required module="sales-orders" lookupId="lines.ItemID"
                  branchId={branchId} value={line.itemId} choice={line.choice}
                  context={{ "Master.ContractID": contractId || null, UserAutoID: line.savedLineId || null }}
                  secondaryFields={["ItemCode", "ItemName", "Unit"]} displayValue={line.itemId}
                  onSelect={choice => onPatch(line.key, selectSalesOrderLine(line.key, choice))}
                  placeholder="Chọn mã hàng..." />
                  : column.editable ? <>
                    <label htmlFor={id} className={labelClass}>{column.label}{key === "quantity" && <span className="ml-1 text-red-500">*</span>}</label>
                    {key === "dienGiai" || key === "notes" ? <textarea id={id} aria-label={`${column.label} dòng ${index + 1}`}
                      rows={2} value={values[key]} onChange={event => onPatch(line.key, { [key]: event.target.value })}
                      className={`${inputClass} resize-y`} />
                      : isMoneyField(key) ? <MoneyInput id={id} aria-label={`${column.label} dòng ${index + 1}`} value={values[key]}
                        onValueChange={value => onPatch(line.key, {[key]:value})} className={inputClass} />
                      : <input id={id} aria-label={`${column.label} dòng ${index + 1}`} type="text" inputMode={column.numeric ? "decimal" : "text"}
                        value={values[key]} onChange={event => onPatch(line.key, { [key]: event.target.value })}
                        className={`${inputClass} ${column.numeric ? "tabular-nums" : ""}`} />}
                  </> : <>
                    <span className={labelClass}>{column.label}</span>
                    <p className={`min-h-11 break-words rounded-xl bg-neutral-100 p-2.5 text-base font-medium text-black dark:bg-neutral-800 dark:text-white ${column.numeric ? "tabular-nums" : ""}`}>
                      {isMoneyField(key) ? formatMoney(values[key]) : values[key] || "—"}
                    </p>
                    {column.formula && <span title={`Công thức: ${column.formula}`} className="mt-1 block text-[11px] leading-4 text-neutral-400 dark:text-neutral-500">= {column.formula}</span>}
                  </>}
              </div>;
            })}
          </div>
        </article>;
      })}
    </div>
  </section>;
}
