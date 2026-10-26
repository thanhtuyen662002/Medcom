import { z } from "zod";
import type { AttachmentModule } from "./proxy-policy";

// Live /api/contracts/openapi.json, checked 2026-10-16: sales-orders attachments.
export const attachmentRowSchema = z.object({
  attachmentId: z.string(), attachmentName: z.string(), slotId: z.number().int().nullable(), slotName: z.string(),
  fileTypeId: z.number().int().nullable(), fileTypeName: z.string(), byteLength: z.number().int().nonnegative(),
  stateToken: z.string(), contentUrl: z.string(), previewUrl: z.string(),
}).strict();
export const attachmentPageSchema = z.object({
  supported: z.boolean(), slots: z.array(z.object({ slotId: z.number().int().nullable(), slotName: z.string() }).strict()),
  canUpload: z.boolean(), canDelete: z.boolean(), documentStateToken: z.string(), rows: z.array(attachmentRowSchema),
  page: z.number().int().positive(), pageSize: z.number().int().positive(), hasMore: z.boolean(),
}).strict();
export const attachmentResultSchema = z.object({
  outcome: z.enum(["Committed", "Replayed", "InvalidInput", "Denied", "Conflict", "QualificationRequired", "Unavailable", "OutcomeUnknown", "Cancelled"]),
  code: z.string().nullable(), receipt: z.object({
    module: z.string(), operation: z.string(), idempotencyKey: z.string(), documentId: z.string(), attachmentId: z.string(),
    attachmentName: z.string(), attachmentStateToken: z.string().nullable(), documentStateToken: z.string(), auditId: z.string(), deleted: z.boolean(),
  }).strict().nullable(),
}).strict();
export type SalesOrderAttachmentPage = z.infer<typeof attachmentPageSchema>;
export type SalesOrderAttachmentRow = z.infer<typeof attachmentRowSchema>;
export type SalesOrderAttachmentUpload = {
  idempotencyKey: string; branchId: string; documentId: string; expectedStateToken: string; file: File;
  /** Defaults to the sales order "Tài liệu đính kèm" slot 2. */
  module?: AttachmentModule; slotId?: number;
};
export type DraftAttachment = {
  key: string; file: File; status: "queued" | "uploading" | "uploaded" | "error"; error?: string;
  previewUrl: string;
  request?: SalesOrderAttachmentUpload;
};

export async function validateAttachmentFile(file: File): Promise<string | null> {
  if (!file.size || file.size > 10 * 1024 * 1024) return "Mỗi ảnh cần có dữ liệu và không quá 10 MB.";
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const png = bytes.length === 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if ((!png || !/\.png$/i.test(file.name)) && (!jpeg || !/\.jpe?g$/i.test(file.name))) return "Chỉ hỗ trợ ảnh JPG/PNG; tên và nội dung ảnh phải đúng định dạng.";
  return null;
}

export function attachmentContentUrl(branchId: string, documentId: string, attachmentId: string, preview = true, module: AttachmentModule = "sales-orders"): string {
  return `/api/erp/api/erp/${module}/attachments/content?${new URLSearchParams({ branchId, documentId, attachmentId, preview: String(preview) })}`;
}
