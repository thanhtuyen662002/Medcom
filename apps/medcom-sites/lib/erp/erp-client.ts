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

// Real branches configured in Medcom ERP database
export const REAL_BRANCHES = [
  { id: "CN01", name: "Chi nhánh 1 (Trung tâm - Hà Nội)", address: "Hai Bà Trưng, Hà Nội" },
  { id: "CN02", name: "Chi nhánh 2 (Kho Dược BV - TP.HCM)", address: "Tân Bình, TP.HCM" },
  { id: "CN03", name: "Chi nhánh 3 (Bệnh viện Đa khoa - Đà Nẵng)", address: "Hải Châu, Đà Nẵng" },
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
   * Real ERP Login:
   * Authenticates against the live backend HTTP endpoint `/api/erp/api/auth/login`.
   */
  public async login(
    username: string,
    password: string,
    branchId: string = "CN01"
  ): Promise<LoginResult> {
    if (!username.trim() || !password) {
      return { success: false, user: null, error: "Vui lòng nhập tên đăng nhập và mật khẩu." };
    }

    try {
      const session = await apiLogin(username.trim(), password);
      this.currentSession = session;

      let effectiveBranch = branchId;
      try {
        const ws = await apiGetWorkspace();
        this.currentWorkspace = ws;
        if (ws.branchIds && ws.branchIds.length > 0 && !ws.branchIds.includes(branchId)) {
          effectiveBranch = ws.branchIds[0];
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
   */
  public async getDocumentsList(
    kind: DocumentKind,
    page: number = 1,
    search: string = "",
    branchId: string = ""
  ): Promise<DocumentPage> {
    try {
      const remote = await apiGetDocuments(kind, page, search, branchId);
      return remote;
    } catch {
      return {
        rows: [],
        page,
        pageSize: 20,
        hasMore: false,
      };
    }
  }

  /**
   * Fetch Document Details (PO or Inbound)
   */
  public async getDocumentDetail(
    kind: DocumentKind,
    documentId: string
  ): Promise<DocumentDetail | null> {
    try {
      const remote = await apiGetDetail(kind, documentId, 1);
      return remote;
    } catch {
      return null;
    }
  }

  /**
   * Fetch Purchase Requests (PR) list from backend
   */
  public async getPurchaseRequestsList(
    page: number = 1,
    search: string = "",
    branchId: string = ""
  ): Promise<{ list: PurchasePage; scopeKey: string } | null> {
    try {
      const ws = await getPurchaseWorkspace();
      const list = await getPurchaseList(ws.scopeKey, page, search, branchId);
      return { list, scopeKey: ws.scopeKey };
    } catch {
      return null;
    }
  }

  /**
   * Fetch Purchase Request Detail with full items and header
   */
  public async getPurchaseRequestDetail(
    scopeKey: string,
    documentId: string
  ): Promise<PurchaseReadback | null> {
    try {
      const detail = await getPurchaseDetail(scopeKey, documentId);
      return detail;
    } catch {
      return null;
    }
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
}

export const erpClient = ErpClientService.getInstance();
