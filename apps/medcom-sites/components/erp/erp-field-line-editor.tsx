"use client";

import { useId } from "react";
import type { ErpDocumentDetail } from "@/lib/erp/erp-client";
import type { ErpScreenModule, LineColumnConfig } from "@/lib/erp/document-detail/types";
import { BOOLEAN_EDIT_KEYS, saveLineKeys } from "@/lib/erp/document-detail/controllers/erp-detail-rules";
import { RequestInput, RequestSelect } from "./request-presentation";

// Per-field line editor for screens that edit recorded values on existing lines (e.g. the
// warehouse's actual lot/quantity/expiry and spot checks), not item, quantity and price.
export function ErpFieldLineEditor({ module, detail, editLines, patchEditLine, columns }: {
  module: ErpScreenModule;
  detail: ErpDocumentDetail;
  editLines: Record<string, Record<string, string>>;
  patchEditLine(lineId: string, key: string, value: string): void;
  columns: readonly LineColumnConfig[];
}) {
  const baseId = useId();
  const keys = saveLineKeys(module);
  const label = (key: string) => columns.find(column => column.key === key)?.label ?? key;
  return <div className="space-y-4">
    {(detail.lines.rows || []).map((row, index) => {
      const fields = ((row as { fields?: unknown }).fields || row || {}) as Record<string, unknown>;
      const draft = editLines[row.lineId] || {};
      const name = String(fields.itemName ?? fields.itemId ?? "");
      return <fieldset key={row.lineId} className="rounded-xl border border-brand-200 bg-white p-3 dark:border-brand-800/60 dark:bg-neutral-900">
        <legend className="px-1 text-base font-semibold text-neutral-900 dark:text-neutral-100">Dòng {index + 1}{name ? ` · ${name}` : ""}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {keys.map(key => {
            const id = `${baseId}-${index}-${key}`;
            const value = draft[key] ?? "";
            const set = (next: string) => patchEditLine(row.lineId, key, next);
            return <div key={key} className="grid min-w-0 gap-1.5 text-sm font-medium">
              <label htmlFor={id}>{label(key)}</label>
              {BOOLEAN_EDIT_KEYS.has(key)
                ? <RequestSelect id={id} value={value} onChange={event => set(event.target.value)}>
                    <option value="">—</option><option value="true">Có</option><option value="false">Không</option>
                  </RequestSelect>
                : key.toLowerCase().includes("date")
                  ? <RequestInput id={id} type="date" value={value.slice(0, 10)} onChange={event => set(event.target.value)} />
                  : <RequestInput id={id} type="text" inputMode={/quantity/i.test(key) ? "decimal" : undefined} value={value} onChange={event => set(event.target.value)} />}
            </div>;
          })}
        </div>
      </fieldset>;
    })}
  </div>;
}
