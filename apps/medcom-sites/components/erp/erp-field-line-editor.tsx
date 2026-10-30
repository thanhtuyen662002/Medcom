"use client";

import { useId, useState } from "react";
import type { ErpDocumentDetail } from "@/lib/erp/erp-client";
import type { ErpScreenModule, LineColumnConfig } from "@/lib/erp/document-detail/types";
import { BOOLEAN_EDIT_KEYS, lineEditLookup, passthroughLineKey, saveLineKeys } from "@/lib/erp/document-detail/controllers/erp-detail-rules";
import { LookupField } from "@/components/untitledui/lookup-field";
import { RequestInput, RequestSelect } from "./request-presentation";

// Per-field line editor for screens that edit recorded values on existing lines (e.g. the
// warehouse's actual lot/quantity/expiry and spot checks), not item, quantity and price.
export function ErpFieldLineEditor({ module, detail, branchId, editLines, patchEditLine, columns }: {
  module: ErpScreenModule;
  branchId: string;
  detail: ErpDocumentDetail;
  editLines: Record<string, Record<string, string>>;
  patchEditLine(lineId: string, key: string, value: string): void;
  columns: readonly LineColumnConfig[];
}) {
  const baseId = useId();
  // Name of a value picked in this edit, keyed by line and field, so the picker shows it instead of the code.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const keys = saveLineKeys(module).filter(key => !passthroughLineKey(module, key));
  // A reference column is configured by its display key (objectId shows as objectName).
  const label = (key: string) => columns.find(column => column.key === key || column.key === lineEditLookup(module, key)?.nameKey)?.label ?? key;
  return <div className="space-y-4">
    {(detail.lines.rows || []).map((row, index) => {
      const fields = ((row as { fields?: unknown }).fields || row || {}) as Record<string, unknown>;
      const draft = editLines[row.lineId] || {};
      const name = String(fields.itemName ?? fields.assetName ?? fields.itemId ?? fields.assetId ?? "");
      return <fieldset key={row.lineId} className="rounded-xl border border-brand-200 bg-white p-3 dark:border-brand-800/60 dark:bg-neutral-900">
        <legend className="px-1 text-base font-semibold text-neutral-900 dark:text-neutral-100">Dòng {index + 1}{name ? ` · ${name}` : ""}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {keys.map(key => {
            const id = `${baseId}-${index}-${key}`;
            const value = draft[key] ?? "";
            const set = (next: string) => patchEditLine(row.lineId, key, next);
            const lookup = lineEditLookup(module, key);
            if (lookup) return <div key={key} className="min-w-0">
              <LookupField label={label(key)} module={module} lookupId={lookup.lookupId} branchId={branchId} value={value} choice={null}
                displayValue={!value ? value : picked[`${row.lineId}:${key}`] ?? (value === String(fields[key] ?? "") ? String(fields[lookup.nameKey] ?? value) : value)}
                onSelect={choice => {
                  setPicked(current => ({ ...current, [`${row.lineId}:${key}`]: String(choice?.label ?? choice?.name ?? choice?.id ?? "") }));
                  set(choice?.id ?? "");
                  for (const [source, target] of Object.entries(lookup.links ?? {}))
                    patchEditLine(row.lineId, target, choice?.fields?.[source] == null ? "" : String(choice.fields[source]));
                }} placeholder="Chọn..." />
            </div>;
            return <div key={key} className="grid min-w-0 gap-1.5 text-sm font-medium">
              <label htmlFor={id}>{label(key)}</label>
              {BOOLEAN_EDIT_KEYS.has(key)
                ? <RequestSelect id={id} value={value} onChange={event => set(event.target.value)}>
                    <option value="">—</option><option value="true">Có</option><option value="false">Không</option>
                  </RequestSelect>
                : key.toLowerCase().includes("date")
                  ? <RequestInput id={id} type="date" value={value.slice(0, 10)} onChange={event => set(event.target.value)} />
                  : <RequestInput id={id} type="text" inputMode={/quantity|qty|amount/i.test(key) ? "decimal" : undefined} value={value} onChange={event => set(event.target.value)} />}
            </div>;
          })}
        </div>
      </fieldset>;
    })}
  </div>;
}
