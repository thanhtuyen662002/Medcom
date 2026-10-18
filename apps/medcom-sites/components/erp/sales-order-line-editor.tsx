"use client";

import { Plus, Trash2 } from "lucide-react";
import { LookupField } from "@/components/untitledui/lookup-field";
import { SALES_ORDER_LINE_COLUMNS, SALES_ORDER_LINE_GROUPS, salesOrderLineDisplay, selectSalesOrderLine, type SalesOrderDraftLine } from "@/lib/erp/sales-order-lines";

export function SalesOrderLineEditor({ lines, branchId, contractId, onPatch, onAdd, onRemove }: {
  lines: SalesOrderDraftLine[];
  branchId: string;
  contractId: string;
  onPatch: (key: string, patch: Partial<SalesOrderDraftLine>) => void;
  onAdd: () => string;
  onRemove: (key: string) => void;
}) {
  const columns: Array<{ key: string; label: string; numeric?: boolean; editable?: boolean }> = SALES_ORDER_LINE_COLUMNS;
  const inputClass = "w-full min-w-0 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5 text-xs text-neutral-900 dark:text-white";
  const labelClass = "mb-1 block text-[11px] font-medium text-neutral-500 dark:text-neutral-400";

  return <section aria-label="Thông tin chi tiết đơn hàng" className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Thông tin chi tiết ({lines.length})</h4>
      <button type="button" onClick={() => onAdd()}
        className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-2.5 py-2 text-xs font-bold text-white hover:bg-brand-700">
        <Plus className="size-3.5" /> Thêm dòng
      </button>
    </div>
    <div className="space-y-3">
      {lines.map((line, index) => {
        const values = salesOrderLineDisplay(line);
        return <article key={line.key} aria-label={`Chi tiết ${index + 1}`}
          className="min-w-0 space-y-4 rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-950/40 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h5 className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Dòng {index + 1}</h5>
            {lines.length > 1 && <button type="button" aria-label={`Xóa dòng ${index + 1}`}
              onClick={() => onRemove(line.key)} className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30">
              <Trash2 className="size-4" />
            </button>}
          </div>
          {SALES_ORDER_LINE_GROUPS.map(group => <fieldset key={group.label} className="min-w-0 space-y-2.5 border-0 p-0">
            <legend className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">{group.label}</legend>
            <div className="grid min-w-0 grid-cols-2 gap-2.5">
              {group.keys.map(key => {
                const column = columns.find(item => item.key === key)!;
                const id = `so-${line.key}-${key}`;
                const fullWidth = group.fullWidth.includes(key);
                return <div key={key} className={`min-w-0 ${fullWidth ? "col-span-full" : ""}`}>
                  {key === "itemId" ? <LookupField label="Mã hàng" required module="sales-orders" lookupId="lines.ItemID"
                    branchId={branchId} value={line.itemId} choice={line.choice}
                    context={{ "Master.ContractID": contractId || null, UserAutoID: null }}
                    secondaryFields={["ItemCode", "ItemName", "Unit"]} displayValue={line.itemId}
                    onSelect={choice => onPatch(line.key, selectSalesOrderLine(line.key, choice))}
                    placeholder="Chọn mã hàng..." />
                    : column.editable ? <>
                      <label htmlFor={id} className={labelClass}>{column.label}{key === "quantity" && <span className="ml-1 text-red-500">*</span>}</label>
                      {key === "dienGiai" || key === "notes" ? <textarea id={id} aria-label={`${column.label} dòng ${index + 1}`}
                        rows={2} value={values[key]} onChange={event => onPatch(line.key, { [key]: event.target.value })}
                        className={`${inputClass} resize-y`} />
                        : <input id={id} aria-label={`${column.label} dòng ${index + 1}`} type="text" inputMode={column.numeric ? "decimal" : "text"}
                          value={values[key]} onChange={event => onPatch(line.key, { [key]: event.target.value })}
                          className={`${inputClass} ${column.numeric ? "tabular-nums" : ""}`} />}
                    </> : <>
                      <span className={labelClass}>{column.label}</span>
                      <p className={`min-h-10 break-words rounded-xl bg-neutral-100 p-2.5 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 ${column.numeric ? "tabular-nums" : ""}`}>
                        {values[key] || "—"}
                      </p>
                    </>}
                </div>;
              })}
            </div>
          </fieldset>)}
        </article>;
      })}
    </div>
    <p className="text-[11px] leading-relaxed text-neutral-500">Số tiền, tiền thuế, tổng tiền và số lượng 2 là tạm tính; ERP xác nhận khi lưu. Tiền CK hiển thị theo dữ liệu ERP cung cấp.</p>
  </section>;
}
