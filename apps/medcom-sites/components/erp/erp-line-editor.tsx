"use client";

import type { ErpDocumentDetail } from "@/lib/erp/erp-client";
import type { ErpScreenModule, LineColumnConfig } from "@/lib/erp/document-detail/types";
import { saveLineKeys } from "@/lib/erp/document-detail/controllers/erp-detail-rules";
import { formatMoney, isMoneyField, multiplyMoney } from "@/lib/erp/money";
import { MoneyInput } from "./money-input";

// Mobile cards and desktop inputs moved from ErpDocumentDetailBody (T-006A).
export function ErpLineEditor({ module, detail, editLines, patchEditLine, columns }: {
  module: ErpScreenModule;
  detail: ErpDocumentDetail;
  editLines: Record<string, Record<string, string>>;
  patchEditLine(lineId: string, key: string, value: string): void;
  columns: readonly LineColumnConfig[];
}) {
  return <>
  {/* Mobile: editable line cards */}
  <div className="space-y-4 lg:hidden">
    {(detail.lines.rows || []).map((row, idx) => {
      const f = ((row as { fields?: unknown }).fields || row || {}) as Record<string, unknown>;
      const d = editLines[row.lineId] || {};
      const set = (k: string, v: string) => patchEditLine(row.lineId, k, v);
      const lineKeys = saveLineKeys(module) as readonly string[];
      const extras = ["model", "budget", "timeRequired", "notes"].filter((k) =>
        lineKeys.includes(k)
      );
      const q = (d.quantity ?? "").trim();
      const p = (d.unitPrice ?? "").trim();
      const live =
        /^\d+(\.\d+)?$/.test(q) && /^\d+(\.\d+)?$/.test(p)
          ? multiplyMoney(q,p)
          : null;
      const inputCls =
        "mt-0.5 min-h-11 px-3 py-2.5 rounded-lg border border-brand-300 dark:border-brand-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 font-semibold text-base focus:outline-none focus:ring-2 focus:ring-brand-500 w-full";
      const itemName = (f.itemName || f.name || "") as string;
      return (
        <div
          key={row.lineId}
          className="rounded-xl border border-brand-200 dark:border-brand-800/60 p-3 bg-white dark:bg-neutral-900 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-bold text-neutral-500">Dòng {idx + 1}</span>
          </div>
          <div>
            <label className="block text-sm text-brand-600 dark:text-brand-400 font-medium">
              Mã hàng <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={d.itemId ?? ""}
              onChange={(e) => set("itemId", e.target.value)}
              className={inputCls}
            />
          </div>
          {itemName && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{itemName}</p>
          )}
          {extras.length > 0 && (
            <div className="grid grid-cols-1 gap-2.5">
              {extras.map((k) => (
                <div key={k}>
                  <label className="block text-sm text-brand-600 dark:text-brand-400 font-medium">
                    {columns.find(column => column.key === k)!.label}
                  </label>
                  {isMoneyField(k) ? <MoneyInput value={d[k] ?? ""} onValueChange={value=>set(k,value)} className={inputCls} /> : <input
                    type="text"
                    inputMode={k === "budget" ? "decimal" : "text"}
                    value={d[k] ?? ""}
                    onChange={(e) => set(k, e.target.value)}
                    className={inputCls}
                  />}
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-sm text-brand-600 dark:text-brand-400 font-medium">
                Số lượng <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={d.quantity ?? ""}
                onChange={(e) => set("quantity", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm text-brand-600 dark:text-brand-400 font-medium">
                Đơn giá <span className="text-red-500">*</span>
              </label>
              <MoneyInput
                value={d.unitPrice ?? ""}
                onValueChange={value => set("unitPrice", value)}
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-base">
            <span className="text-sm text-neutral-400">Tổng giá</span>
            <span className="font-bold text-brand-700 dark:text-brand-300 font-mono">
              {live === null ? "—" : formatMoney(live)}
            </span>
          </div>
        </div>
      );
    })}
  </div>
  {/* Desktop: editable line table */}
  <div className="overflow-x-auto hidden lg:block">
    <table className="w-full min-w-[1200px] text-left text-base leading-6 border-collapse [&_th]:whitespace-nowrap [&_th]:font-semibold [&_th]:py-3" data-document-detail-table>
      <thead>
        <tr className="border-b border-neutral-200 dark:border-neutral-800 text-sm text-neutral-400 uppercase">
          <th className="py-2 px-2.5">Mã hàng *</th>
          <th className="py-2 px-2.5">Tên hàng</th>
          {(saveLineKeys(module) as readonly string[])
            .filter((k) => ["model", "budget", "timeRequired", "notes"].includes(k))
            .map((k) => (
              <th key={k} className="py-2 px-2.5">
                {columns.find(column => column.key === k)!.label}
              </th>
            ))}
          <th className="py-2 px-2.5">Số lượng *</th>
          <th className="py-2 px-2.5">Đơn giá *</th>
          <th className="py-2 px-2.5 text-right">Tổng giá</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {(detail.lines.rows || []).map((row) => {
          const f = ((row as { fields?: unknown }).fields || row || {}) as Record<string, unknown>;
          const d = editLines[row.lineId] || {};
          const set = (k: string, v: string) => patchEditLine(row.lineId, k, v);
          const cellInput =
            "mt-0.5 min-h-11 px-3 py-2.5 rounded-lg border border-brand-300 dark:border-brand-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 font-semibold text-base focus:outline-none focus:ring-2 focus:ring-brand-500 w-full min-w-20";
          const q = (d.quantity ?? "").trim();
          const p = (d.unitPrice ?? "").trim();
          const live =
            /^\d+(\.\d+)?$/.test(q) && /^\d+(\.\d+)?$/.test(p)
              ? multiplyMoney(q,p)
              : null;
          const itemName = (f.itemName || f.name || "") as string;
          const unit = (f.unit || f.unit2 || "") as string;
          return (
            <tr key={row.lineId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 align-top">
              <td className="py-2 px-2.5">
                <input
                  type="text"
                  value={d.itemId ?? ""}
                  onChange={(e) => set("itemId", e.target.value)}
                  className={`${cellInput} font-mono`}
                />
              </td>
              <td className="py-2.5 px-2.5 font-medium text-neutral-800 dark:text-neutral-200">
                <div className="text-base">{itemName || "—"}</div>
                {unit && (
                  <div className="text-sm text-brand-600 dark:text-brand-400 font-medium">
                    ĐVT: {unit}
                  </div>
                )}
              </td>
              {(saveLineKeys(module) as readonly string[])
                .filter((k) => ["model", "budget", "timeRequired", "notes"].includes(k))
                .map((k) => (
                  <td key={k} className="py-2 px-2.5">
                    {isMoneyField(k) ? <MoneyInput value={d[k] ?? ""} onValueChange={value=>set(k,value)} className={cellInput} /> : <input
                      type="text"
                      inputMode={k === "budget" ? "decimal" : "text"}
                      value={d[k] ?? ""}
                      onChange={(e) => set(k, e.target.value)}
                      className={cellInput}
                    />}
                  </td>
                ))}
              <td className="py-2 px-2.5">
                <input
                  type="text"
                  inputMode="decimal"
                  value={d.quantity ?? ""}
                  onChange={(e) => set("quantity", e.target.value)}
                  className={cellInput}
                />
              </td>
              <td className="py-2 px-2.5">
                <MoneyInput
                  value={d.unitPrice ?? ""}
                  onValueChange={value => set("unitPrice", value)}
                  className={cellInput}
                />
              </td>
              <td className="py-2.5 px-2.5 text-right font-bold text-brand-700 dark:text-brand-300 font-mono">
                {live === null ? "—" : formatMoney(live)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
</>;
}
