/** ERP fixed-list dropdowns (SY_FrmDrdwTbl sources, read 2026-10-24); labels are verbatim ERP text. */
export const ERP_ENUMS = {
  transportMethod: [
    { value: "ROAD", label: "Đường bộ" },
    { value: "AIR", label: "Đường air" },
    { value: "OTHER", label: "Khác" },
  ],
  serviceStatus: [
    { value: "OPEN", label: "Mở" },
    { value: "IN_PROGRESS", label: "Đang xử lý" },
    { value: "COMPLETED", label: "Hoàn thành" },
    { value: "CANCELLED", label: "Hủy" },
  ],
} as const;

export type ErpEnumId = keyof typeof ERP_ENUMS;

/** ERP label for a fixed-list code, matched trimmed and case-insensitively; null when unknown. */
export function erpEnumLabel(enumId: ErpEnumId, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return ERP_ENUMS[enumId].find(entry => entry.value.toLowerCase() === normalized)?.label ?? null;
}
