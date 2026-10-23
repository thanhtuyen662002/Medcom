import type { ReactNode } from "react";
import type { ErpChoice } from "../erp-screen-contracts";
import type { StatusColorStyle } from "../status-colors";

export interface DetailRow { lineId: string; fields: Record<string, unknown> }
export interface DetailPage { rows: readonly DetailRow[]; hasMore: boolean }

export interface DetailAction {
  id: string;
  label: string;
  placement: "primary" | "menu";
  tone?: "default" | "outline" | "danger";
  visible: boolean;
  enabled: boolean;
  reason?: string;
  busy?: boolean;
  /** Optional presentation supplied by the controller. */
  icon?: ReactNode;
  title?: string;
  /** Preserve a migrated confirmation handler; the native button stays disabled. */
  allowDisabledClick?: boolean;
  /** Let a migrated handler control the menu (including two-step deletion). */
  keepMenuOpen?: boolean;
  /** Existing editors may keep cancel/input actions available during a command. */
  disableWhileBusy?: boolean;
  showReason?: boolean;
}

export interface DetailFeedback { type: "success" | "warning" | "error"; message: string }

/** Controller-owned data and state; the layout only presents and forwards events. */
export interface DocumentDetailModel {
  documentId: string | null;
  header: Record<string, unknown>;
  lines: DetailPage;
  history?: DetailPage;
  comparison?: DetailPage;
  sections?: Record<string, DetailPage>;
  /** Server totals cover the whole document, independently of the loaded page. */
  summary?: unknown;
  status: { label: string | null; locked: boolean | null; style?: StatusColorStyle;
    badges?: readonly { id: string; label: string; title: string; style?: StatusColorStyle }[] };
  loading: boolean;
  error: string | null;
  editing: boolean;
  dirty: boolean;
  busy: boolean;
  draft: Record<string, string>;
  choices?: Record<string, ErpChoice | null>;
  /** Optional presentation of inherited lookup selections, without changing draft values. */
  lookupFields?: Record<string, { branchId: string; choice: ErpChoice | null; displayValue?: string;
    selected?: ErpChoice[]; compact?: boolean }>;
  fieldHints?: Record<string, string>;
  fieldBusy?: boolean;
  busyMessage?: string;
  /** An editing permission may be denied independently of network activity. */
  editDisabled?: boolean;
  /** Optional paging-specific busy state for migrated pagination controls. */
  paginationBusy?: boolean;
  paginationDisabled?: boolean;
  feedback: DetailFeedback | null;
  pending?: { title: string; body: string; actions: readonly DetailAction[] };
  actions: readonly DetailAction[];
}

export interface DocumentDetailHandlers {
  onAction(id: string): void;
  onFieldChange(key: string, value: string): void;
  onLookupSelect?(key: string, choice: ErpChoice | null): void;
  onLookupMultiSelect?(key: string, choices: ErpChoice[]): void;
  onLoadMore(section: "lines" | "history" | string): void;
  onRetry(): void;
}
