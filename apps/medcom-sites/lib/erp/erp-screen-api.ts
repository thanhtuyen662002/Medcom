import { z } from "zod";
import { ApiError } from "./api";
import { type ErpScreenModule } from "./proxy-policy";
import {
  erpScreenDescriptionSchema,
  erpDocumentPageSchema,
  erpDocumentDetailSchema,
  erpActionStateSchema,
  erpChoicePageSchema,
  erpDraftSelectionSchema,
  erpCommandResultSchema,
  erpContractInfoSchema,
  erpCommandObservationSchema,
  type ErpScreenDescription,
  type ErpDocumentPage,
  type ErpDocumentDetail,
  type ErpActionState,
  type ErpChoicePage,
  type ErpDraftSelection,
  type ErpCommandResult,
  type ErpContractInfo,
  type ErpCommandObservation,
} from "./erp-screen-contracts";

let activeReadScope: string | null = null;

export function getActiveReadScope(): string | null {
  return activeReadScope;
}

export function setActiveReadScope(scope: string | null): void {
  activeReadScope = scope;
}

async function getCsrfToken(): Promise<string> {
  const r = await fetch("/api/erp/api/auth/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!r.ok) throw new ApiError(r.status, "csrf_failed");
  const data = (await r.json()) as { token: string | null };
  if (!data.token) throw new ApiError(502, "csrf_missing");
  return data.token;
}

async function erpGet<T>(
  path: string,
  schema: z.ZodType<T>,
  params?: Record<string, string | number | undefined | null>,
  signal?: AbortSignal
): Promise<T> {
  const query = new URLSearchParams();
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== "") {
        query.set(key, String(val));
      }
    }
  }
  const queryString = query.toString();
  const url = `/api/erp/${path}${queryString ? `?${queryString}` : ""}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (activeReadScope) {
    headers["X-Medcom-Read-Scope"] = activeReadScope;
  }
  const response = await fetch(url, {
    method: "GET",
    credentials: "same-origin",
    headers,
    cache: "no-store",
    signal,
  });

  const body = (await response.json().catch(() => null)) as unknown;
  const headerScope = response.headers.get("X-Medcom-Read-Scope");
  if (headerScope && /^[a-f0-9]{64}$/.test(headerScope)) {
    activeReadScope = headerScope;
  }

  if (!response.ok) {
    const errorParsed = z.object({ code: z.string().optional() }).safeParse(body);
    throw new ApiError(
      response.status,
      errorParsed.success ? (errorParsed.data.code ?? "erp_read_failed") : "erp_read_failed",
      response.headers.get("x-correlation-id") ?? undefined
    );
  }

  const bodyEnvelope = z.object({
    readScope: z.string(),
    data: z.unknown(),
  }).safeParse(body);
  if (!bodyEnvelope.success) {
    throw new ApiError(502, "invalid_api_response");
  }
  activeReadScope = bodyEnvelope.data.readScope;
  const parsed = schema.safeParse(bodyEnvelope.data.data);
  if (!parsed.success) {
    throw new ApiError(502, "invalid_api_response");
  }
  return parsed.data;
}

async function erpPost<T>(
  path: string,
  schema: z.ZodType<T>,
  payload: unknown,
  signal?: AbortSignal
): Promise<T> {
  const csrf = await getCsrfToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-CSRF-TOKEN": csrf,
  };
  if (activeReadScope) {
    headers["X-Medcom-Read-Scope"] = activeReadScope;
  }

  const response = await fetch(`/api/erp/${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
    signal,
  });

  const headerScope = response.headers.get("X-Medcom-Read-Scope");
  if (headerScope && /^[a-f0-9]{64}$/.test(headerScope)) {
    activeReadScope = headerScope;
  }

  const body = (await response.json().catch(() => null)) as unknown;

  // For command endpoints returning ErpCommandResult directly
  if (schema === (erpCommandResultSchema as unknown)) {
    const commandParsed = erpCommandResultSchema.safeParse(body);
    if (commandParsed.success) {
      return commandParsed.data as unknown as T;
    }
  }

  if (!response.ok) {
    const errorParsed = z.object({ code: z.string().optional() }).safeParse(body);
    throw new ApiError(
      response.status,
      errorParsed.success ? (errorParsed.data.code ?? "erp_command_failed") : "erp_command_failed",
      response.headers.get("x-correlation-id") ?? undefined
    );
  }

  const envelopeParsed = z.object({
    readScope: z.string(),
    data: z.unknown(),
  }).safeParse(body);
  if (envelopeParsed.success) {
    activeReadScope = envelopeParsed.data.readScope;
    const innerParsed = schema.safeParse(envelopeParsed.data.data);
    if (innerParsed.success) {
      return innerParsed.data;
    }
  }

  const directParsed = schema.safeParse(body);
  if (!directParsed.success) {
    throw new ApiError(502, "invalid_api_response");
  }
  return directParsed.data;
}

/** 1. Read Form & Metadata */
export async function getErpScreen(
  module: ErpScreenModule,
  signal?: AbortSignal
): Promise<ErpScreenDescription> {
  return erpGet(`api/erp/${module}/screen`, erpScreenDescriptionSchema, undefined, signal);
}

/** 2. Paged Document List with full headers */
export async function getErpList(
  module: ErpScreenModule,
  params: {
    branchId: string;
    page?: number;
    pageSize?: number;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    statusId?: number | null;
  },
  signal?: AbortSignal
): Promise<ErpDocumentPage> {
  return erpGet(`api/erp/${module}`, erpDocumentPageSchema, params, signal);
}

/** 3. Document Detail with lines, actions, and stateToken */
export async function getErpDetail(
  module: ErpScreenModule,
  params: {
    branchId: string;
    documentId: string;
    page?: number;
    pageSize?: number;
  },
  signal?: AbortSignal
): Promise<ErpDocumentDetail> {
  return erpGet(`api/erp/${module}/detail`, erpDocumentDetailSchema, params, signal);
}

/** 4. Permitted Action Buttons and their states */
export async function getErpActions(
  module: ErpScreenModule,
  params: { branchId: string; documentId?: string },
  signal?: AbortSignal
): Promise<ErpActionState[]> {
  return erpGet(`api/erp/${module}/actions`, z.array(erpActionStateSchema), params, signal);
}

/** 5. Contract Info (Sales Orders & Sales QR) */
export async function getErpContractInfo(
  module: "sales-orders" | "sales-qr",
  params: { branchId: string; documentId: string },
  signal?: AbortSignal
): Promise<ErpContractInfo> {
  return erpGet(`api/erp/${module}/contract-info`, erpContractInfoSchema, params, signal);
}

/** 6. Dropdown / Dropselect Options */
export async function getErpOptions(
  module: ErpScreenModule,
  query: {
    branchId: string;
    lookupId: string;
    page?: number;
    pageSize?: number;
    search?: string | null;
    context?: Record<string, string | null> | null;
  },
  signal?: AbortSignal
): Promise<ErpChoicePage> {
  return erpPost(`api/erp/${module}/options`, erpChoicePageSchema, query, signal);
}

/** 7. PM Popup Options (Sales Orders & Internal Transfer Requests) */
export async function getErpPmOptions(
  module: "sales-orders" | "internal-transfer-requests",
  query: {
    branchId: string;
    role?: "primary" | "supporting";
    page?: number;
    pageSize?: number;
    search?: string | null;
  },
  signal?: AbortSignal
): Promise<ErpChoicePage> {
  return erpPost(`api/erp/${module}/actions/send-pm/options`, erpChoicePageSchema, query, signal);
}

/** 8. Create Document Command */
export async function createErpDocument(
  module: ErpScreenModule,
  request: {
    idempotencyKey: string;
    branchId: string;
    header: Record<string, unknown>;
    lines: Array<{ clientLineKey: string; values: Record<string, unknown> }>;
  },
  signal?: AbortSignal
): Promise<ErpCommandResult> {
  return erpPost(`api/erp/${module}/create`, erpCommandResultSchema, request, signal);
}

/** 9. Save Document Command */
export async function saveErpDocument(
  module: ErpScreenModule,
  request: {
    idempotencyKey: string;
    branchId: string;
    documentId: string;
    expectedStateToken: string;
    header: Record<string, unknown>;
    lineChanges: Array<{
      kind: "Add" | "Update" | "Remove";
      lineId?: string | null;
      clientLineKey?: string | null;
      values?: Record<string, unknown> | null;
    }>;
  },
  signal?: AbortSignal
): Promise<ErpCommandResult> {
  return erpPost(`api/erp/${module}/save`, erpCommandResultSchema, request, signal);
}

/** 10. Delete Document Command */
export async function deleteErpDocument(
  module: ErpScreenModule,
  request: {
    idempotencyKey: string;
    branchId: string;
    documentId: string;
    expectedStateToken: string;
  },
  signal?: AbortSignal
): Promise<ErpCommandResult> {
  return erpPost(`api/erp/${module}/delete`, erpCommandResultSchema, request, signal);
}

/** 11. Workflow Action Commands (submit, send-purchase-order, send-pm, recall) */
export async function executeErpAction(
  module: ErpScreenModule,
  operation: "submit" | "send-purchase-order" | "send-pm" | "recall",
  request: {
    idempotencyKey: string;
    branchId: string;
    documentId: string;
    expectedStateToken: string;
    payload: Record<string, unknown>;
  },
  signal?: AbortSignal
): Promise<ErpCommandResult> {
  return erpPost(`api/erp/${module}/actions/${operation}`, erpCommandResultSchema, request, signal);
}

/** 12. QR Code Scan Add / Delete Commands */
export async function scanErpQr(
  module: "warehouse-qr" | "sales-qr",
  action: "add" | "delete",
  request: {
    idempotencyKey: string;
    branchId: string;
    documentId: string;
    expectedStateToken: string;
    barcode: string;
  },
  signal?: AbortSignal
): Promise<ErpCommandResult> {
  return erpPost(`api/erp/${module}/qr/${action}`, erpCommandResultSchema, request, signal);
}

/** 13. Draft Selection (items, contract-items, machines) */
export async function selectErpDraft(
  module: ErpScreenModule,
  request: {
    branchId: string;
    sourceId: "items" | "contract-items" | "machines";
    selectedKeys: string[];
    context?: Record<string, string | null> | null;
  },
  signal?: AbortSignal
): Promise<ErpDraftSelection> {
  return erpPost(`api/erp/${module}/selection`, erpDraftSelectionSchema, request, signal);
}

/** 14. Paste Validation */
export async function validateErpPaste(
  module: ErpScreenModule,
  request: {
    branchId: string;
    rows: Array<Record<string, unknown>>;
  },
  signal?: AbortSignal
): Promise<ErpDraftSelection> {
  return erpPost(`api/erp/${module}/paste/validate`, erpDraftSelectionSchema, request, signal);
}

/** 15. Command Lookup Receipt Observation */
export async function lookupErpCommand(
  module: ErpScreenModule,
  request: {
    operation: string;
    originalIntent: unknown;
  },
  signal?: AbortSignal
): Promise<ErpCommandObservation> {
  return erpPost(`api/erp/${module}/commands/lookup`, erpCommandObservationSchema, request, signal);
}
