"use client";
import {RecordSection} from "./record-dialog";
import {RequestButton,RequestInput,RequestEmpty,requestStyles} from "./request-presentation";

import {useId} from "react";
import {RemoteLookup} from "./lookup";
import type {LookupAdapter} from "@/lib/erp/presentation";
import type {ItemDisplayPresentation} from "@/lib/erp/item-display";
import {ItemIdentity} from "./item-identity";

/** Local keys identify input/errors only. They are never ERP numbering. */
export type PurchaseRequestLine = {
  localKey: string;
  lineId: string | null;
  itemId: string;
  itemLabel?: string;
  quantity: string;
  unitPrice: string;
  budget: string;
  timeRequired: string;
  model: string;
};

export const requestInputStyle = {
  width: "100%", minHeight: 44, padding: "10px 12px", border: "1px solid var(--border)",
  borderRadius: 8, background: "var(--background, white)", color: "inherit", fontSize: 16,
  boxSizing: "border-box" as const,
};

/** Exact source decimal(18,0); do not use Number/parseFloat or infer positivity. */
export function isRequestInteger(value: string) {
  return /^-?\d+$/.test(value) && value.replace(/^-/, "").replace(/^0+/, "").length <= 18;
}

export function MobileRequestLines({lines, disabled, canAdd = true, canRemove = true, lockItem = false, readOnly = false, itemDisplay, presentationAllowed = true, errors, lookupAdapter, itemLookupId, onChange, onAdd, onRemove}: {
  lines: readonly PurchaseRequestLine[];
  disabled: boolean;
  canAdd?: boolean;
  canRemove?: boolean;
  lockItem?: boolean;
  readOnly?: boolean;
  itemDisplay?: ItemDisplayPresentation;
  presentationAllowed?: boolean;
  errors: Record<string, string>;
  lookupAdapter: LookupAdapter;
  itemLookupId: string;
  onChange: (key: string, patch: Partial<PurchaseRequestLine>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  const prefix = useId();
  return <RecordSection title="Dòng hàng" aria-label={`Hàng đề nghị (${lines.length})`} description={`${lines.length} dòng hàng`}>
    {errors.lines && <p role="alert">{errors.lines}</p>}
    {!lines.length && <RequestEmpty title="Chưa có dòng hàng">Các dòng hàng sẽ hiển thị tại đây.</RequestEmpty>}
    {lines.map((line, index) => <article className={requestStyles.line} key={line.localKey} aria-label={`Dòng hàng ${index + 1}`} >
      <h3 className={requestStyles.title}>Dòng {index + 1}</h3>
      {itemDisplay&&presentationAllowed&&<ItemIdentity {...itemDisplay} line={{lineId:line.lineId??"",itemId:line.itemId}}/>}
      {readOnly || lockItem ? !itemDisplay&&<p><strong>{line.itemLabel || line.itemId || "Chưa chọn hàng"}</strong></p> : <RemoteLookup id={itemLookupId} label={`Mặt hàng dòng ${index + 1}`} value={line.itemId ? {id: line.itemId, label: line.itemLabel || line.itemId} : null} adapter={lookupAdapter} disabled={disabled} error={errors[`lines.${line.localKey}.itemId`]} onChange={item => onChange(line.localKey, {itemId: item?.id ?? "", itemLabel: item?.label})}/>}
      {errors[`lines.${line.localKey}.itemId`] && <p role="alert">{errors[`lines.${line.localKey}.itemId`]}</p>}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">{([
        ["quantity", "Số lượng", 40], ["unitPrice", "Đơn giá", 40], ["budget", "Ngân sách", 40],
        ["timeRequired", "Thời gian cần", 200], ["model", "Model", 50],
      ] as const).map(([field, label, maxLength]) => {
        const id = `${prefix}-${index}-${field}`;
        const error = errors[`lines.${line.localKey}.${field}`];
        return <div key={field} className={requestStyles.field}>
          <label htmlFor={id}>{label}{field === "quantity" || field === "unitPrice" ? " *" : ""}</label>
          {readOnly ? <strong>{line[field] || "—"}</strong> : <RequestInput id={id} name={`lines.${line.localKey}.${field}`} value={line[field]} inputMode={["quantity", "unitPrice", "budget"].includes(field) ? "numeric" : undefined} maxLength={maxLength} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} style={requestInputStyle} onChange={event => onChange(line.localKey, {[field]: event.target.value})}/>}
          {error && <p id={`${id}-error`} role="alert">{error}</p>}
        </div>;
      })}</div>
      {!readOnly && canRemove && <RequestButton type="button" disabled={disabled} onClick={() => onRemove(line.localKey)}>Bỏ dòng {index + 1}</RequestButton>}
    </article>)}
    {!readOnly && <RequestButton type="button" disabled={disabled || !canAdd} onClick={onAdd}>Thêm dòng hàng</RequestButton>}
  </RecordSection>;
}
