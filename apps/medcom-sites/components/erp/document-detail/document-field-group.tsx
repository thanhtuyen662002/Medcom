"use client";

import { useId } from "react";
import { FileText, Link2 } from "lucide-react";
import { formatDetailValue, isEmptyDetailValue, isHttpUrl } from "@/lib/erp/document-detail/format";
import type { DocumentDetailHandlers, DocumentDetailModel } from "@/lib/erp/document-detail/model";
import type { DetailFieldConfig, DetailGroupConfig, ErpScreenModule } from "@/lib/erp/document-detail/types";
import { LookupField } from "@/components/untitledui/lookup-field";
import { MoneyInput } from "../money-input";
import { RequestInput, RequestSelect, RequestTextarea } from "../request-presentation";
import { DetailSection, detailStyles } from "./presentation";

function fieldValue(field: DetailFieldConfig, header: Record<string, unknown>): unknown {
  const display = field.displayKey ? header[field.displayKey] : undefined;
  return isEmptyDetailValue(display) ? header[field.key] : display;
}

function hasValue(field: DetailFieldConfig, header: Record<string, unknown>): boolean {
  return !isEmptyDetailValue(fieldValue(field, header)) || (!!field.secondaryKey && !isEmptyDetailValue(header[field.secondaryKey]));
}

function FieldValue({ field, header }: { field: DetailFieldConfig; header: Record<string, unknown> }) {
  const value = fieldValue(field, header);
  const secondary = field.secondaryKey ? header[field.secondaryKey] : undefined;
  const formattedValue = formatDetailValue(field.format === "status" ? header[field.key] : value, field.format, { statusName: field.displayKey ? header[field.displayKey] : undefined, enumId: field.enumId });
  const formattedSecondary = formatDetailValue(secondary);
  const showSecondary = !isEmptyDetailValue(secondary) && formattedSecondary.trim().toLowerCase() !== formattedValue.trim().toLowerCase();
  return <>
    {field.format === "url" && isHttpUrl(value)
      ? <a className="inline-flex min-h-11 max-w-full items-center gap-2 text-primary underline underline-offset-4" href={String(value).trim()} target="_blank" rel="noopener noreferrer"><Link2 aria-hidden="true" className="size-4 shrink-0" />Mở tài liệu</a>
      : formattedValue}
    {showSecondary && <span className="mt-0.5 block text-sm font-normal leading-5 text-neutral-500 dark:text-neutral-400">{formattedSecondary}</span>}
  </>;
}

function FieldEditor({ field, model, module, onChange, onLookupSelect, onLookupMultiSelect }: {
  field: DetailFieldConfig; model: DocumentDetailModel; module: ErpScreenModule; onChange(key: string, value: string): void;
  onLookupSelect?: DocumentDetailHandlers["onLookupSelect"];
  onLookupMultiSelect?: DocumentDetailHandlers["onLookupMultiSelect"];
}) {
  const id = useId();
  const edit = field.edit;
  if (!edit) return null;
  const value = model.draft[field.key] ?? "";
  const disabled = (model.fieldBusy ?? model.busy) || !!model.editDisabled;
  const change = (next: string) => { if (!disabled) onChange(field.key, next); };
  if (edit.input === "lookup") {
    const presentation = model.lookupFields?.[field.key];
    const branchId = model.draft.branchId ?? (typeof model.header.branchId === "string" ? model.header.branchId : "");
    const display = value === String(model.header[field.key] ?? "") ? formatDetailValue(fieldValue(field, model.header), field.format) : value;
    // Match the existing editor's comma-separated multi-selection draft contract.
    const selected = value.split(",").map(part => part.trim()).filter(Boolean).map(id => ({ id, name: id, label: id, fields: {} }));
    const context = edit.lookupContext ? Object.fromEntries(Object.entries(edit.lookupContext).map(([parameter, draftKey]) =>
      [parameter, draftKey === null ? null : model.draft[draftKey] || null])) : undefined;
    return <><LookupField label={field.label} module={module} lookupId={edit.lookupId ?? ""} branchId={presentation?.branchId ?? branchId}
      required={edit.required} multiple={edit.multiple} value={value} choice={presentation ? presentation.choice : model.choices?.[field.key] ?? (value ? { id: value, name: display, label: display, fields: {} } : null)}
      displayValue={presentation ? presentation.displayValue : display} selected={presentation ? presentation.selected : selected} compact={presentation?.compact} context={context} secondaryFields={edit.secondaryFields} placeholder={edit.placeholder}
      onSelect={choice => { if (!disabled) { if (onLookupSelect) onLookupSelect(field.key, choice); else change(choice?.id ?? ""); } }}
      onMultiSelect={choices => { if (!disabled) { if (onLookupMultiSelect) onLookupMultiSelect(field.key, choices); else change(choices.map(choice => choice.id).join(", ")); } }} />
      {model.fieldHints?.[field.key] && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{model.fieldHints[field.key]}</p>}</>;
  }
  const common = { id, value, required: edit.required, maxLength: edit.maxLength, disabled };
  return <div className={detailStyles.field}>
    <label htmlFor={id}>{field.label}{edit.required ? " *" : ""}</label>
    {edit.input === "boolean" ? <RequestSelect id={id} value={value} disabled={disabled} onChange={event => change(event.target.value)}>
        <option value="">—</option><option value="true">Có</option><option value="false">Không</option>
      </RequestSelect>
      : edit.input === "textarea" ? <RequestTextarea {...common} rows={3} onChange={event => change(event.target.value)} />
      : edit.input === "money" ? <MoneyInput {...common} onValueChange={change} />
      : <RequestInput {...common} type={edit.input === "date" ? "date" : "text"} onChange={event => change(event.target.value)} />}
  </div>;
}

export function DocumentFieldGroup({ group, model, handlers, module }: {
  group: DetailGroupConfig; model: DocumentDetailModel; handlers: DocumentDetailHandlers; module: ErpScreenModule;
}) {
  const allFields = [...group.fields, ...(group.subgroups ?? []).flatMap(group => group.fields)];
  const editable = model.editing && allFields.some(field => field.edit);
  if (!editable && allFields.every(field => !hasValue(field, model.header)) && group.emptyStrip) {
    return <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <span className="inline-flex items-center gap-2 font-semibold"><FileText aria-hidden="true" className="size-4 shrink-0" />{group.title}</span>
      <span>{group.emptyStrip}</span>
    </div>;
  }
  const visible = (field: DetailFieldConfig) => (model.editing && !!field.edit) || field.hideWhenEmpty === false || hasValue(field, model.header);
  if (!allFields.some(visible)) return null;
  const columns = group.columns === 1 ? "grid-cols-1!" : group.columns === 3 ? "sm:grid-cols-3" : "";
  const fields = (items: readonly DetailFieldConfig[]) => {
    const shown = items.filter(visible);
    if (shown.length === 0) return null;
    const value = (field: DetailFieldConfig) => <><dt>{field.label}</dt><dd className={field.format === "multiline" ? "whitespace-pre-wrap font-normal!" : undefined}><FieldValue field={field} header={model.header} /></dd></>;
    return model.editing ? <fieldset disabled={(model.fieldBusy ?? model.busy) || !!model.editDisabled} className={`grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2 ${columns}`}>
      {shown.map(field => <div key={field.key} className={field.span === "full" ? "col-span-full" : "min-w-0"}>
        {field.edit ? <FieldEditor field={field} model={model} module={module} onChange={handlers.onFieldChange} onLookupSelect={handlers.onLookupSelect} onLookupMultiSelect={handlers.onLookupMultiSelect} /> : <dl className={detailStyles.values}><div className="col-span-full">{value(field)}</div></dl>}
      </div>)}
    </fieldset> : <dl className={`${detailStyles.values} ${columns}`}>
      {shown.map(field => <div key={field.key} className={field.span === "full" ? "col-span-full" : "min-w-0"}>{value(field)}</div>)}
    </dl>;
  };
  return <DetailSection title={group.title} className="h-full">
    {fields(group.fields)}
    {group.subgroups?.filter(group => group.fields.some(visible)).map(subgroup => <div key={subgroup.title} className="space-y-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
      <h4 className="text-sm font-semibold">{subgroup.title}</h4>{fields(subgroup.fields)}
    </div>)}
  </DetailSection>;
}
