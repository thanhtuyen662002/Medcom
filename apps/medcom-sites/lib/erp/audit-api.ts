import { z } from "zod";
import { request } from "./api";

/** Nhật ký thao tác web: search and detail reads (server requires audit.read). */
const text = z.string().nullable();
const count = z.number().int().nullable();

export const auditRowSchema = z.object({
  id: z.number().int().positive(),
  occurredAt: z.string(),
  source: z.string(),
  category: z.string(),
  action: z.string(),
  outcome: z.string(),
  userName: text, displayName: text, roleName: text, sessionRef: text, branchId: text,
  module: text, documentId: text, httpMethod: text, path: text,
  statusCode: count, durationMs: count, correlationId: text, clientAddress: text,
  page: text, target: text, errorCode: text,
  hasRequestData: z.boolean(), hasResultData: z.boolean(),
});
export const auditPageSchema = z.object({
  items: z.array(auditRowSchema).max(200),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalRows: z.number().int().nonnegative(),
});
export const auditDetailSchema = auditRowSchema.omit({ hasRequestData: true, hasResultData: true }).extend({
  queryText: text, peerAddress: text, userAgent: text, clientEventId: text, clientTime: text,
  requestData: text, resultData: text,
});

export type AuditRow = z.infer<typeof auditRowSchema>;
export type AuditPage = z.infer<typeof auditPageSchema>;
export type AuditDetail = z.infer<typeof auditDetailSchema>;

export interface AuditFilters {
  from?: string; to?: string; user?: string; module?: string; category?: string; action?: string;
  outcome?: string; documentId?: string; branchId?: string; search?: string;
}

export const AUDIT_CAPABILITY = "audit.read";

// Capabilities of the last session the server returned (login/session/continue).
// Display only: the server checks audit.read again on every log request.
let sessionCapabilities: readonly string[] = [];
export function rememberSessionCapabilities(capabilities: readonly string[] | null | undefined) {
  sessionCapabilities = Array.isArray(capabilities) ? [...capabilities] : [];
}
export function sessionHasCapability(capability: string): boolean {
  return sessionCapabilities.includes(capability);
}

export function auditQuery(filters: AuditFilters, page: number, pageSize: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) params.set(key, trimmed);
  }
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return params.toString();
}

export function searchAuditLogs(filters: AuditFilters, page: number, pageSize: number, signal?: AbortSignal) {
  return request(`api/audit/logs?${auditQuery(filters, page, pageSize)}`, auditPageSchema, { signal });
}

export function getAuditLogDetail(id: number, signal?: AbortSignal) {
  return request(`api/audit/logs/detail?${new URLSearchParams({ id: String(id) })}`, auditDetailSchema, { signal });
}
