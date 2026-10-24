import type { ErpEnumId } from "./enums";

/** Presentation formats supported by document fields and line columns. */
export type FieldFormat =
  | "text" | "multiline" | "date" | "datetime" | "number" | "money"
  | "boolean" | "status" | "url" | "reference" | "enum";

/** Fixed extension points available to document detail layouts. */
export type DetailSlotId = "lines-editor" | "attachments" | "qr-scan" | "contract-info";

/** Module identities come from the existing ERP screen policy. */
export type ErpScreenModule = import("../proxy-policy").ErpScreenModule;

export interface DetailFieldConfig {
  /** Camel-case key returned in detail.header. */
  key: string;
  /** Required Vietnamese field label. */
  label: string;
  /** Value presentation; defaults to text. */
  format?: FieldFormat;
  /** ERP fixed-list identity; required when format is enum. */
  enumId?: ErpEnumId;
  /** Header key whose value is displayed instead of key. */
  displayKey?: string;
  /** Header key displayed as a smaller secondary line. */
  secondaryKey?: string;
  /** Field width within its group. */
  span?: "full" | "half";
  /** Hide empty values in view mode; defaults to true. */
  hideWhenEmpty?: boolean;
  /** Presence allows editing when the save action permits it. */
  edit?: {
    /** Control used to edit the field. */
    input: "date" | "text" | "textarea" | "money" | "lookup";
    /** Lookup identity; required when input is lookup. */
    lookupId?: string;
    /** Lookup parameter names mapped to draft keys, or fixed null values. */
    lookupContext?: Readonly<Record<string, string | null>>;
    /** Additional choice fields displayed by the lookup. */
    secondaryFields?: readonly string[];
    /** Optional lookup prompt retained by a module's existing editor. */
    placeholder?: string;
    /** Whether an edited value is required. */
    required?: boolean;
    /** Whether the control accepts multiple selections. */
    multiple?: boolean;
    /** Maximum length accepted by the control. */
    maxLength?: number;
  };
}

export interface DetailGroupConfig {
  /** Stable group identity. */
  id: string;
  /** Vietnamese group heading. */
  title: string;
  /** Ordered allowlist of fields rendered in the group. */
  fields: readonly DetailFieldConfig[];
  /** Number of field columns. */
  columns?: 1 | 2 | 3;
  /** Group width; defaults to half for the first two groups and full thereafter. */
  width?: "half" | "full";
  /** Compact strip shown instead of a card when all fields are empty. */
  emptyStrip?: string;
  /** Optional titled field subsets within the group. */
  subgroups?: readonly {
    /** Vietnamese subgroup heading. */
    title: string;
    /** Ordered fields in the subgroup. */
    fields: readonly DetailFieldConfig[];
  }[];
}

export interface LineColumnConfig {
  /** Key returned in a line or section row. */
  key: string;
  /** Vietnamese column heading. */
  label: string;
  /** Value presentation; defaults to text. */
  format?: FieldFormat;
  /** ERP fixed-list identity; required when format is enum. */
  enumId?: ErpEnumId;
  /** Horizontal alignment of the column value. */
  align?: "start" | "end";
  /** Visual emphasis assigned to the column. */
  role?: "primary" | "secondary" | "total";
  /** Include in desktop and mobile summaries; defaults to true. Expanded fields remain available. */
  inTable?: boolean;
  /** Optional saved display text and legacy field aliases, in fallback order. */
  displayKey?: string;
  fallbackKeys?: readonly string[];
  /** Exact decimal product used only when neither a raw nor a saved total exists. */
  fallbackCalculation?: { quantityKey: string; priceKey: string };
}

export interface DocumentDetailConfig {
  /** ERP modules sharing this configuration. */
  modules: readonly ErpScreenModule[];
  /** Vietnamese document detail title. */
  title: string;
  /** Accessible label for the close action. */
  closeLabel: string;
  /** Optional wording retained when moving an existing detail presentation. */
  messages?: { heading?: string; editing?: string; loading?: string; empty?: string };
  /** Optional explanatory notice for each module variant. */
  notice?: Partial<Record<ErpScreenModule, {
    /** Vietnamese notice heading. */
    title: string;
    /** Explanatory notice text. */
    body: string;
  }>>;
  /** Ordered groups of visible header fields. */
  groups: readonly DetailGroupConfig[];
  /** Known header keys intentionally hidden, with reasons in evidence. */
  hidden: readonly string[];
  /** Configuration of the document lines tab. */
  lines: {
    /** Noun used by the loaded-row counter; defaults to "dòng". */
    rowNoun?: string;
    /** A derived total column when the response has no total field (for example PO). */
    calculatedTotal?: { label: string; quantityKey: string; priceKey: string };
    /** Sum of the loaded rows, preserving the legacy server-first decimal calculation. */
    footerTotal?: {
      label: string;
      sumKey?: string;
      fallbackSumKeys?: readonly string[];
      fallback?: { quantityKey: string; priceKey: string };
      currencyKey?: string;
    };
    /** Vietnamese lines tab heading. */
    title: string;
    /** Ordered visible line columns. */
    columns: readonly LineColumnConfig[];
    /** Optional groups of fields shown when expanding a line. */
    expandGroups?: readonly {
      /** Vietnamese heading for the expanded group. */
      label: string;
      /** Ordered keys displayed in the expanded group. */
      keys: readonly string[];
      /** Expanded keys that occupy the full width. */
      fullWidth?: readonly string[];
    }[];
    /** Message shown when the document has no lines. */
    emptyText: string;
  };
  /** Optional submission and approval history tab. */
  history?: {
    /** Vietnamese history tab heading. */
    title: string;
  };
  /** Optional canonical QR comparison table retained by a migrated presentation adapter. */
  comparison?: DocumentDetailConfig["lines"];
  /** Additional named sections, such as costs or assets. */
  sections?: Record<string, {
    /** Vietnamese section heading. */
    title: string;
    /** Ordered visible section columns. */
    columns: readonly LineColumnConfig[];
  }>;
  /** Fixed layout extension points enabled for these modules. */
  slots?: readonly DetailSlotId[];
}
