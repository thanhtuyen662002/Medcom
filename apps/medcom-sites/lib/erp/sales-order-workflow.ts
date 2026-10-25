import type { ErpCommandResult, ErpCommandObservation } from "./erp-screen-contracts";

export type SalesOrderModule = "sales-orders" | "sales-order-pm" | "sales-order-sa";
export type SalesCommandModule = SalesOrderModule | "sales-qr";
export const salesWorkflowOperations: Record<SalesOrderModule, readonly string[]> = {
  "sales-orders": ["send-pm", "recall"],
  "sales-order-pm": ["send-sa", "reject"],
  "sales-order-sa": ["send-accounting", "send-tech", "reject", "return-step"],
};
export const salesActionLabels: Record<string, string> = {
  "send-pm": "Gửi PM", recall: "Thu hồi để sửa", "send-sa": "Gửi SA",
  "send-accounting": "Gửi Kế toán", "send-tech": "Gửi Kỹ thuật", reject: "Trả lại", "return-step": "Gửi về bước trước", delete: "Xóa đơn hàng",
};

export interface SalesCommandIntent {
  idempotencyKey: string; branchId: string; documentId: string; expectedStateToken: string;
  [key: string]: unknown;
}
interface Transport {
  send: (operation: string, intent: SalesCommandIntent) => Promise<ErpCommandResult>;
  lookup: (operation: string, intent: SalesCommandIntent) => Promise<ErpCommandObservation>;
}

/** One immutable command remains in custody until its result is known. */
export class SalesCommandSession {
  pending: { operation: string; intent: SalesCommandIntent } | null = null;
  busy = false;
  constructor(private module: SalesCommandModule, private transport: Transport, private scope?: { branchId: string; documentId?: string }) {}
  private accept(result: ErpCommandResult): ErpCommandResult {
    if (!this.pending) return result;
    if (result.outcome === "Committed" || result.outcome === "Replayed") {
      const receipt = result.receipt, { operation, intent } = this.pending;
      if (!receipt || receipt.module !== this.module || receipt.operation !== operation || receipt.documentId !== intent.documentId || receipt.idempotencyKey !== intent.idempotencyKey || receipt.deleted !== (operation === "delete")) {
        return { outcome: "OutcomeUnknown", code: "receipt_mismatch" };
      }
      this.pending = null;
    } else if (!["OutcomeUnknown", "Unavailable"].includes(result.outcome)) this.pending = null;
    return result;
  }
  async submit(operation: string, intent: SalesCommandIntent) {
    if (this.pending || this.busy) throw new Error("sales_command_pending");
    if (this.scope && (intent.branchId !== this.scope.branchId || this.scope.documentId && intent.documentId !== this.scope.documentId)) throw new Error("sales_scope_changed");
    const operations = this.module === "sales-qr" ? ["scan-add", "scan-delete"] : salesWorkflowOperations[this.module];
    if (!operations.includes(operation) && !(this.module === "sales-orders" && ["save", "delete"].includes(operation))) throw new Error("sales_operation_not_allowed");
    this.pending = { operation, intent: structuredClone(intent) };
    return this.retry();
  }
  async retry(): Promise<ErpCommandResult> {
    if (!this.pending || this.busy) throw new Error("sales_command_not_ready");
    this.busy = true;
    try { return this.accept(await this.transport.send(this.pending.operation, structuredClone(this.pending.intent))); }
    catch { return { outcome: "OutcomeUnknown", code: "connection_lost" }; }
    finally { this.busy = false; }
  }
  async recover(): Promise<ErpCommandResult> {
    if (!this.pending || this.busy) throw new Error("sales_command_not_ready");
    this.busy = true;
    try {
      const result = await this.transport.lookup(this.pending.operation, structuredClone(this.pending.intent));
      if (["Committed", "Replayed"].includes(result.outcome)) return this.accept({ outcome: "Replayed", receipt: result.receipt });
      return { outcome: "OutcomeUnknown", code: result.outcome === "Absent" ? "command_absent" : "lookup_unresolved" };
    } catch { return { outcome: "OutcomeUnknown", code: "lookup_unavailable" }; }
    finally { this.busy = false; }
  }
}

export function salesCommandMessage(result: ErpCommandResult): string {
  if (result.message?.trim() && (result.outcome === "Conflict" || result.outcome === "InvalidInput")) return result.message.trim();
  switch (result.outcome) {
    case "Committed": case "Replayed": return "Đã cập nhật đơn hàng thành công.";
    case "Conflict": return "Đơn hàng đã thay đổi. Hãy tải lại dữ liệu trước khi tiếp tục.";
    case "Denied": return "Bạn chưa có quyền hoặc đơn hàng không còn ở bước cho phép thao tác này.";
    case "InvalidInput": return "Thông tin chưa hợp lệ. Kiểm tra các trường bắt buộc và nội dung đã nhập.";
    case "QualificationRequired": return "Thao tác chưa được mở trên hệ thống hiện tại.";
    case "OutcomeUnknown": case "Unavailable": return "Chưa xác nhận được kết quả. Kiểm tra kết quả hoặc gửi lại đúng lần thao tác đang chờ bên dưới.";
    default: return "Thao tác chưa hoàn tất. Dữ liệu chưa được xác nhận cập nhật.";
  }
}
