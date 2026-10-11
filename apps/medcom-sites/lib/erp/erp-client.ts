/**
 * Medcom ERP Client Service
 * Connects directly to real backend API (/api/erp/...) without mock data.
 */

import {
  type DocumentKind,
  type DocumentPage,
  type DocumentDetail,
  type WorkspaceData,
  type Session,
} from "./contracts";
import {
  login as apiLogin,
  getSession as apiGetSession,
  continueSession as apiContinueSession,
  getWorkspace as apiGetWorkspace,
  getDocuments as apiGetDocuments,
  getDetail as apiGetDetail,
  logout as apiLogout,
  ApiError,
} from "./api";
import {
  getPurchaseWorkspace,
  getPurchaseList,
  getPurchaseDetail,
  type PurchaseReadback,
  type PurchasePage,
} from "./purchase-request-api";
import { type ErpScreenModule } from "./proxy-policy";
import {
  getErpScreen,
  getErpList,
  getErpDetail,
  getErpActions,
  getErpContractInfo,
  getErpOptions,
  getErpPmOptions,
  getErpActionOptions,
  saveErpSection,
  getErpItemPrice,
  createErpDocument,
  saveErpDocument,
  deleteErpDocument,
  executeErpAction,
  scanErpQr,
  selectErpDraft,
  validateErpPaste,
} from "./erp-screen-api";
import {
  getNotificationsList,
  getNotificationDetail,
  getNotificationTarget,
  markNotificationRead,
} from "./notifications-api";

export interface BranchItem {
  id: string;
  name: string;
  code: string;
  address?: string;
}

// Fallback initial branches if offline before backend responds
export const REAL_BRANCHES: BranchItem[] = [
  { id: "CN01", name: "Chi nhánh 1", code: "CN01" },
];

export interface LoginResult {
  success: boolean;
  user: {
    displayName: string;
    username: string;
    role: string;
    branchId: string;
    companyName: string;
  } | null;
  error?: string;
}

export class ErpClientService {
  private static instance: ErpClientService;
  private currentSession: Session | null = null;
  private currentWorkspace: WorkspaceData | null = null;

  public static getInstance(): ErpClientService {
    if (!ErpClientService.instance) {
      ErpClientService.instance = new ErpClientService();
    }
    return ErpClientService.instance;
  }

  /**
   * Fetch Real Branches from API (`/api/erp/api/lookups/branches`)
   * Guaranteed by backend contract in PR 139.
   */
  public async getBranchesList(
    search = "",
    page = 1,
    pageSize = 50
  ): Promise<{ items: BranchItem[]; hasMore: boolean }> {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/erp/api/lookups/branches?${params.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 401 && typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
        try { window.dispatchEvent(new CustomEvent("medcom:unauthorized")); } catch {}
        return { items: [], hasMore: false };
      }
      if (!res.ok) {
        if (this.currentWorkspace?.branchIds && this.currentWorkspace.branchIds.length > 0) {
          return {
            items: this.currentWorkspace.branchIds.map((id) => ({
              id,
              name: `Chi nhánh ${id}`,
              code: id,
            })),
            hasMore: false,
          };
        }
        return { items: [], hasMore: false };
      }
      const json = await res.json();
      const data = json?.data || json;
      const items = Array.isArray(data?.items)
        ? data.items.map((b: { branchId?: string; branchName?: string | null }) => ({
            id: b.branchId || "",
            name: b.branchName || b.branchId || "Chi nhánh",
            code: b.branchId || "",
          }))
        : [];
      return { items, hasMore: Boolean(data?.hasMore) };
    } catch {
      if (this.currentWorkspace?.branchIds && this.currentWorkspace.branchIds.length > 0) {
        return {
          items: this.currentWorkspace.branchIds.map((id) => ({
            id,
            name: `Chi nhánh ${id}`,
            code: id,
          })),
          hasMore: false,
        };
      }
      return { items: [], hasMore: false };
    }
  }

  public async getSession(): Promise<Session> {
    const s = await apiGetSession();
    this.currentSession = s;
    return s;
  }

  public async continueSession(): Promise<Session> {
    const s = await apiContinueSession();
    this.currentSession = s;
    return s;
  }

  public async getWorkspace(): Promise<WorkspaceData> {
    const ws = await apiGetWorkspace();
    this.currentWorkspace = ws;
    return ws;
  }

  /**
   * Real ERP Login:
   * Authenticates against the live backend HTTP endpoint `/api/erp/api/auth/login`.
   * Branch selection is eliminated from login screen and fetched dynamically from backend.
   */
  public async login(
    username: string,
    password: string,
    initialBranch?: string
  ): Promise<LoginResult> {
    if (!username.trim() || !password) {
      return { success: false, user: null, error: "Vui lòng nhập tên đăng nhập và mật khẩu." };
    }

    try {
      const session = await apiLogin(username.trim(), password);
      this.currentSession = session;

      let effectiveBranch = initialBranch || "";
      try {
        const ws = await apiGetWorkspace();
        this.currentWorkspace = ws;
        if (ws.branchIds && ws.branchIds.length > 0) {
          if (!effectiveBranch || !ws.branchIds.includes(effectiveBranch)) {
            effectiveBranch = ws.branchIds[0];
          }
        }
      } catch {}

      return {
        success: true,
        user: {
          displayName: session.displayName || username.trim(),
          username: username.trim(),
          role: "Dược sĩ / Quản lý",
          branchId: effectiveBranch,
          companyName: session.companyName || "Công ty Cổ phần Dược phẩm Medcom",
        },
      };
    } catch (err: unknown) {
      if (err instanceof ApiError && (err.code === "invalid_credentials" || err.status === 401)) {
        return {
          success: false,
          user: null,
          error: "Tên đăng nhập hoặc mật khẩu không chính xác trên hệ thống ERP Medcom.",
        };
      }

      return {
        success: false,
        user: null,
        error: "Không thể kết nối đến máy chủ xác thực ERP Medcom. Vui lòng kiểm tra lại đường truyền mạng.",
      };
    }
  }

  /**
   * Fetch Document list (Purchase Orders or Inbound Requests)
   * Throws ApiError on non-200 or invalid responses so caller can distinguish
   * errors from valid empty lists.
   */
  public async getDocumentsList(
    kind: DocumentKind,
    page: number = 1,
    search: string = "",
    branchId: string = ""
  ): Promise<DocumentPage> {
    return await apiGetDocuments(kind, page, search, branchId);
  }

  /**
   * Fetch Document Details (PO or Inbound)
   */
  public async getDocumentDetail(
    kind: DocumentKind,
    documentId: string
  ): Promise<DocumentDetail> {
    return await apiGetDetail(kind, documentId, 1);
  }

  /**
   * Fetch Purchase Requests (PR) list from backend
   */
  public async getPurchaseRequestsList(
    page: number = 1,
    search: string = "",
    branchId: string = ""
  ): Promise<{ list: PurchasePage; scopeKey: string }> {
    const ws = await getPurchaseWorkspace();
    const list = await getPurchaseList(ws.scopeKey, page, search, branchId);
    return { list, scopeKey: ws.scopeKey };
  }

  /**
   * Fetch Purchase Request Detail with full items and header
   */
  public async getPurchaseRequestDetail(
    scopeKey: string,
    documentId: string
  ): Promise<PurchaseReadback> {
    return await getPurchaseDetail(scopeKey, documentId);
  }

  /**
   * Logout from backend
   */
  public async logout(): Promise<void> {
    try {
      await apiLogout();
    } catch {}
    this.currentSession = null;
    this.currentWorkspace = null;
  }

  // --- 6-Group 7-Screen ERP CUD, Action, and Lookup APIs ---

  public async getScreenMetadata(module: ErpScreenModule) {
    return await getErpScreen(module);
  }

  public async getErpModuleList(
    module: ErpScreenModule,
    params: {
      branchId: string;
      page?: number;
      pageSize?: number;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      statusId?: number | null;
    }
  ) {
    return await getErpList(module, params);
  }

  public async getErpModuleDetail(
    module: ErpScreenModule,
    params: { branchId: string; documentId: string; page?: number; pageSize?: number }
  ) {
    return await getErpDetail(module, params);
  }

  public async getErpModuleActions(
    module: ErpScreenModule,
    params: { branchId: string; documentId?: string }
  ) {
    return await getErpActions(module, params);
  }

  public async getErpContract(
    module: "sales-orders" | "sales-qr" | "sales-order-pm" | "sales-order-sa" | ErpScreenModule,
    params: { branchId: string; documentId: string }
  ) {
    return await getErpContractInfo(module, params);
  }

  public async getLookupOptions(
    module: ErpScreenModule,
    query: {
      branchId: string;
      lookupId: string;
      page?: number;
      pageSize?: number;
      search?: string | null;
      context?: Record<string, string | null> | null;
    }
  ) {
    return await getErpOptions(module, query);
  }

  public async getPmOptions(
    module: "sales-orders" | "internal-transfer-requests",
    query: {
      branchId: string;
      role?: "primary" | "supporting";
      page?: number;
      pageSize?: number;
      search?: string | null;
    }
  ) {
    return await getErpPmOptions(module, query);
  }

  public async createDocument(
    module: ErpScreenModule,
    request: {
      idempotencyKey: string;
      branchId: string;
      header: Record<string, unknown>;
      lines: Array<{ clientLineKey: string; values: Record<string, unknown> }>;
    }
  ) {
    return await createErpDocument(module, request);
  }

  public async saveDocument(
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
    }
  ) {
    return await saveErpDocument(module, request);
  }

  public async deleteDocument(
    module: ErpScreenModule,
    request: {
      idempotencyKey: string;
      branchId: string;
      documentId: string;
      expectedStateToken: string;
    }
  ) {
    return await deleteErpDocument(module, request);
  }

  public async executeWorkflowAction(
    module: ErpScreenModule,
    operation: string,
    request: {
      idempotencyKey: string;
      branchId: string;
      documentId: string;
      expectedStateToken: string;
      payload: Record<string, unknown>;
    }
  ) {
    return await executeErpAction(module, operation, request);
  }

  public async saveSection(
    module: ErpScreenModule,
    section: string,
    request: {
      idempotencyKey: string;
      branchId: string;
      documentId: string;
      expectedStateToken: string;
      lineChanges: Array<{
        kind: "Add" | "Update" | "Remove";
        lineId?: string | null;
        clientLineKey?: string | null;
        values?: Record<string, unknown> | null;
      }>;
    }
  ) {
    return await saveErpSection(module, section, request);
  }

  public async getItemPrice(request: {
    branchId: string;
    objectId: string;
    documentDate: string;
    itemId: string;
    currencyId?: string | null;
  }) {
    return await getErpItemPrice(request);
  }

  public async getActionOptions(
    module: ErpScreenModule,
    action: string,
    query: {
      branchId: string;
      role?: "primary" | "supporting";
      page?: number;
      pageSize?: number;
      search?: string | null;
    }
  ) {
    return await getErpActionOptions(module, action, query);
  }

  public async scanQr(
    module: "warehouse-qr" | "sales-qr",
    action: "add" | "delete",
    request: {
      idempotencyKey: string;
      branchId: string;
      documentId: string;
      expectedStateToken: string;
      barcode: string;
    }
  ) {
    return await scanErpQr(module, action, request);
  }

  public async selectDraft(
    module: ErpScreenModule,
    request: {
      branchId: string;
      sourceId: "items" | "contract-items" | "machines";
      selectedKeys: string[];
      context?: Record<string, string | null> | null;
    }
  ) {
    return await selectErpDraft(module, request);
  }

  public async validatePaste(
    module: ErpScreenModule,
    request: { branchId: string; rows: Array<Record<string, unknown>> }
  ) {
    return await validateErpPaste(module, request);
  }

  // --- ERP Notifications (I76) ---
  public async getNotifications(params?: {
    page?: number;
    pageSize?: number;
    unreadOnly?: boolean;
  }) {
    return await getNotificationsList(params);
  }

  public async getNotificationDetail(id: number) {
    return await getNotificationDetail(id);
  }

  public async getNotificationTarget(id: number) {
    return await getNotificationTarget(id);
  }

  public async markNotificationRead(id: number, isView: boolean) {
    return await markNotificationRead(id, isView);
  }
}

export const erpClient = ErpClientService.getInstance();
export * from "./erp-screen-contracts";
export * from "./erp-screen-api";
export * from "./notifications-contracts";
export * from "./notifications-api";
export type { ErpScreenModule } from "./proxy-policy";
