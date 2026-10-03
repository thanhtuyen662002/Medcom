import { z } from "zod";
import { healthSchema, workspaceSchema, sessionSchema, documentPageSchema, documentDetailSchema } from "./contracts.ts";

export class ApiError extends Error {
  public status: number;
  public code: string;
  public correlationId?: string;
  constructor(status: number, code: string, correlationId?: string) {
    super(code); this.name = "ApiError";
    this.status = status; this.code = code; this.correlationId = correlationId;
  }
}
export function safeReturnPath(value: string | null): string {
  return value === "/workspace/" ? value : "/workspace/";
}
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Không thể kết nối. Kiểm tra mạng rồi thử lại.";
  if (error.code === "identity_unavailable") return "Dịch vụ đăng nhập ERP chưa sẵn sàng. Vui lòng liên hệ quản trị viên.";
  if (error.status === 429) return "Có nhiều yêu cầu đăng nhập. Vui lòng thử lại sau một phút.";
  if (error.code === "csrf_invalid") return "Phiên trang đã thay đổi. Tải lại trang rồi thử lại.";
  if (error.status === 401) return "Đăng nhập không được chấp nhận hoặc phiên đã hết hạn.";
  if (error.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (error.status === 404) return "Chứng từ không còn khả dụng trong phạm vi được cấp quyền.";
  return "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
}
async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store", redirect: "error" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = z.object({ code: z.string().optional() }).passthrough().safeParse(body);
    throw new ApiError(response.status, problem.success ? (problem.data.code ?? "request_failed") : "request_failed",
      response.headers.get("X-Correlation-ID") ?? undefined);
  }
  return schema.parse(body);
}
export const getWorkspace = (signal?: AbortSignal) => request("/api/workspace", workspaceSchema, { signal });
export const getSession = (signal?: AbortSignal) => request("/api/auth/session", sessionSchema, { signal });
export async function getHealth(signal?: AbortSignal) {
  const response = await fetch("/health/ready", { signal, credentials: "same-origin", cache: "no-store" });
  if (response.status !== 503) throw new ApiError(response.status, "unexpected_readiness");
  return healthSchema.parse(await response.json());
}
async function csrf() {
  return (await request("/api/auth/csrf", z.object({ token: z.string().min(1) }).strict())).token;
}
export async function login(username: string, password: string) {
  const token = await csrf();
  return request("/api/auth/login", sessionSchema, { method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": token },
    body: JSON.stringify({ username, password }) });
}
export async function continueSession() {
  return request("/api/auth/session/continue", sessionSchema,
    { method: "POST", headers: { "X-CSRF-TOKEN": await csrf() } });
}
export async function logout() {
  const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "X-CSRF-TOKEN": await csrf() } });
  if (!response.ok && response.status !== 401) throw new ApiError(response.status, "logout_failed");
}

export const getDocuments = (kind: "purchase-orders" | "inbound-requests", page: number, search: string,
  branchId: string, signal?: AbortSignal) => request(`/api/documents/${kind}?${new URLSearchParams({
    page: String(page), pageSize: "50", search, branchId,
  })}`, documentPageSchema, { signal });

export const getDocumentDetail = (kind: "purchase-orders" | "inbound-requests", documentId: string,
  page: number, signal?: AbortSignal) => request(`/api/documents/${kind}/detail?${new URLSearchParams({
    documentId, page: String(page), pageSize: "50",
  })}`, documentDetailSchema, { signal });
