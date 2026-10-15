// Tab nào của app tương ứng 1-1 với navigation id mà backend đã lọc theo
// capability (/api/workspace). Tab không có trong danh sách này giữ nguyên
// như cũ cho tới khi backend công bố navigation cho nó.
export const NAV_GATED_ERP_TABS = [
  "purchase-orders",
  "purchase-requests",
  "purchase-approvals",
  "inbound-requests",
] as const;

// navIds null = chưa tải được quyền: hiện hết để không khóa oan, BE vẫn
// chặn đọc/ghi bằng 403 và cờ enabled trên từng action.
export function isErpTabAllowed(tabId: string, navIds: readonly string[] | null): boolean {
  if (navIds === null) return true;
  if ((NAV_GATED_ERP_TABS as readonly string[]).includes(tabId)) return navIds.includes(tabId);
  return true;
}

export function navIdsFromWorkspace(
  navigation: Array<{ id: string }> | null | undefined,
): string[] | null {
  if (!navigation) return null;
  return navigation.map((item) => item.id);
}
