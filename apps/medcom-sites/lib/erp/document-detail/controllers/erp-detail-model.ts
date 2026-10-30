import { isMoneyField } from "@/lib/erp/money";
import type { DetailFieldConfig, DocumentDetailConfig, ErpScreenModule } from "../types";
import { BOOLEAN_EDIT_KEYS, editableHeaderKeys, editLookupId, LEGACY_EDIT_LABELS, requiredEditKeys } from "./erp-detail-rules";

/** Project the existing editor rules onto the module's allowlist, without mutating it. */
export function editableDetailConfig(config: DocumentDetailConfig, module: ErpScreenModule, editing: boolean): DocumentDetailConfig {
  const keys = editableHeaderKeys(module);
  const field = (definition: DetailFieldConfig): DetailFieldConfig => {
    if (!editing || !keys.includes(definition.key)) return definition;
    // A field may declare its own lookup (e.g. the batch's Kho nguồn with its branch parameter); keep it.
    const declared = definition.edit;
    const lookupId = declared?.lookupId ?? editLookupId(module, definition.key);
    return { ...definition, edit: {
      ...(declared?.lookupContext ? { lookupContext: declared.lookupContext } : {}),
      ...(declared?.placeholder ? { placeholder: declared.placeholder } : {}),
      input: lookupId ? "lookup" : BOOLEAN_EDIT_KEYS.has(definition.key) ? "boolean"
        : definition.key.toLowerCase().includes("date") ? "date"
        : isMoneyField(definition.key) ? "money" : "text",
      lookupId, required: requiredEditKeys(module).includes(definition.key),
      multiple: lookupId && (definition.key === "personSuggest" || definition.key === "department") ? true : undefined,
    } };
  };
  const configuredKeys = new Set(config.groups.flatMap(group => [
    ...group.fields, ...(group.subgroups ?? []).flatMap(subgroup => subgroup.fields),
  ]).map(definition => definition.key));
  const legacyFields: DetailFieldConfig[] = editing ? keys.flatMap(key => {
    const label = LEGACY_EDIT_LABELS[key];
    if (configuredKeys.has(key) || !label) return [];
    return [field({ key, label, format: key.toLowerCase().includes("date") ? "date"
      : key === "memo" || key === "notes" ? "multiline" : "text" })];
  }) : [];
  return { ...config,
    // Former QR comparison JSX columns, kept separate from API detail.sections.
    comparison: { title: "Dòng đối chiếu hàng cần quét", emptyText: "Chưa có dòng đối chiếu.", columns: [
      { key: "itemId", label: "Mã VT", fallbackKeys: ["itemCode"], format: "text" },
      { key: "lot", label: "Lô SX", format: "text" },
      { key: "expireDate", label: "Hạn dùng", format: "date" },
      { key: "storeHouseId", label: "Kho", format: "text" },
      { key: "quantity", label: "Số lượng", format: "number" },
    ] },
    groups: [...config.groups.map(group => ({ ...group,
      // The inherited currency editor presents its read-only rate directly below the lookup.
      fields: group.fields.filter(field => !(editing && field.key === "rateExchange" && keys.includes("currencyId"))).map(field),
      subgroups: group.subgroups?.map(subgroup => ({ ...subgroup, fields: subgroup.fields.map(field) })),
    })), ...(legacyFields.length ? [{ id: "legacy-edit", title: "Trường sửa kế thừa", fields: legacyFields }] : [])],
  };
}
