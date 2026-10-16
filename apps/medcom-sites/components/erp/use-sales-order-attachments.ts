"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/erp/api";
import { getSalesOrderAttachments, uploadSalesOrderAttachment } from "@/lib/erp/erp-screen-api";
import { validateAttachmentFile, type DraftAttachment } from "@/lib/erp/sales-order-attachments";

export function useSalesOrderAttachments() {
  const [files, setFiles] = useState<DraftAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [validating, setValidating] = useState(false);
  const current = useRef<DraftAttachment[]>([]);
  const generation = useRef(0);
  const busy = useRef(false);
  const validationBusy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const publish = useCallback((change: (rows: DraftAttachment[]) => DraftAttachment[]) => {
    current.current = change(current.current); setFiles(current.current);
  }, []);
  const reset = useCallback(() => {
    generation.current++; controller.current?.abort(); controller.current = null;
    current.current.forEach(row => URL.revokeObjectURL(row.previewUrl));
    publish(() => []); busy.current = false; validationBusy.current = false;
    setUploading(false); setValidating(false); setError(null);
  }, [publish]);
  useEffect(() => () => {
    generation.current++; controller.current?.abort();
    current.current.forEach(row => URL.revokeObjectURL(row.previewUrl));
  }, []);

  const addFiles = async (selected: File[]) => {
    if (busy.current || validationBusy.current || !selected.length) return;
    const run = generation.current;
    validationBusy.current = true; setValidating(true); setError(null);
    try {
      const problems = await Promise.all(selected.map(async file => {
        const problem = await validateAttachmentFile(file); return problem ? `${file.name}: ${problem}` : null;
      }));
      if (run !== generation.current) return;
      if (problems.some(Boolean)) { setError(problems.filter(Boolean).join(" ")); return; }
      const added: DraftAttachment[] = selected.map(file => ({ key: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), status: "queued" }));
      publish(rows => [...rows, ...added]);
    } catch {
      if (run === generation.current) setError("Không đọc được ảnh đã chọn. Vui lòng chọn lại.");
    } finally {
      if (run === generation.current) { validationBusy.current = false; setValidating(false); }
    }
  };
  const removeFile = (key: string) => {
    if (busy.current || validationBusy.current) return;
    const file = current.current.find(row => row.key === key);
    if (!file || file.status === "uploaded" || file.request) return;
    URL.revokeObjectURL(file.previewUrl); publish(rows => rows.filter(row => row.key !== key)); setError(null);
  };

  const uploadAll = async (branchId: string, documentId: string): Promise<boolean> => {
    if (busy.current || validationBusy.current) return false;
    const run = generation.current;
    const abort = new AbortController(); controller.current = abort;
    busy.current = true; setUploading(true); setError(null);
    const patch = (key: string, change: Partial<DraftAttachment>) => {
      if (run === generation.current) publish(rows => rows.map(row => row.key === key ? { ...row, ...change } : row));
    };
    try {
      for (const row of current.current.filter(file => file.status !== "uploaded")) {
        if (run !== generation.current) return false;
        let request = row.request;
        patch(row.key, { status: "uploading", error: undefined });
        try {
          if (!request) {
            const page = await getSalesOrderAttachments(branchId, documentId, 1, abort.signal);
            if (run !== generation.current) return false;
            if (!page.supported || !page.canUpload || !page.slots.some(slot => slot.slotId === 2))
              throw new Error("Đơn đã tạo nhưng hiện chưa được phép tải ảnh đính kèm.");
            if (!page.documentStateToken || page.documentStateToken.length > 64) throw new Error("Chưa đọc được trạng thái đơn hàng để tải ảnh.");
            request = { idempotencyKey: `upload-${crypto.randomUUID()}`, branchId, documentId, expectedStateToken: page.documentStateToken, file: row.file };
            patch(row.key, { request });
          }
          const result = await uploadSalesOrderAttachment(request, abort.signal);
          if (run !== generation.current) return false;
          if (result.outcome !== "Committed" && result.outcome !== "Replayed") {
            const message = result.outcome === "OutcomeUnknown" ? "Chưa xác định ảnh đã lưu. Thử lại để kiểm tra đúng lần tải này."
              : result.outcome === "Conflict" ? "Trạng thái đơn đã thay đổi. Thử lại để tải với trạng thái mới."
              : result.outcome === "Denied" ? "Tài khoản chưa được phép tải ảnh cho đơn hàng này."
              : result.outcome === "InvalidInput" ? "Ảnh hoặc thông tin đính kèm không được ERP chấp nhận."
              : "Chưa hoàn tất tải ảnh. Bạn có thể thử lại phần đính kèm.";
            const rejected = ["InvalidInput", "Denied", "Conflict", "QualificationRequired", "Cancelled"].includes(result.outcome);
            patch(row.key, { status: "error", error: message, request: rejected ? undefined : request });
            setError(message); return false;
          }
          patch(row.key, { status: "uploaded", error: undefined });
        } catch (failure) {
          if (run !== generation.current) return false;
          const message = failure instanceof ApiError && failure.status === 413 ? "Ảnh vượt giới hạn tải lên."
            : failure instanceof ApiError && failure.status === 401 ? "Phiên đăng nhập đã hết hạn."
            : failure instanceof ApiError && failure.status === 403 ? "Tài khoản chưa được phép tải ảnh cho đơn hàng này."
            : failure instanceof Error && !(failure instanceof ApiError) && !request ? failure.message
            : "Chưa xác nhận được kết quả tải ảnh. Thử lại để tiếp tục đúng lần tải này.";
          const rejected = failure instanceof ApiError && failure.status >= 400 && failure.status < 500;
          patch(row.key, { status: "error", error: message, request: rejected ? undefined : request });
          setError(message); return false;
        }
      }
      return true;
    } finally {
      if (run === generation.current) { busy.current = false; setUploading(false); controller.current = null; }
    }
  };
  return { files, error, uploading, validating, addFiles, removeFile, uploadAll, reset };
}
