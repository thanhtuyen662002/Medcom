/**
 * Screen → guide it embeds. Help opens from the screen itself, so a user only reaches the guides of
 * screens their ERP rights show; there is no catalog of every guide. Kept apart from the guide text so
 * the menu bundle does not carry it; tests check each id is a ready guide.
 */
export const screenGuideIds: Readonly<Record<string, string>> = {
  "purchase-requests": "purchase-requests",
  "purchase-approvals": "purchase-approvals",
  "purchase-orders": "purchase-orders",
  "sales-orders": "sales-orders",
  "sales-order-pm": "sales-order-pm",
  "sales-order-sa": "sales-order-sa",
  "sales-qr": "sales-qr",
  "inbound-requests": "inbound-requests",
  "inbound-costs": "warehouse-cost-documents",
  "inbound-warehouse": "warehouse-arrival-status",
  "inbound-sa": "warehouse-goods-information",
  "inbound-tech": "warehouse-goods-status",
  "inbound-pm": "warehouse-quality-confirmation",
  "inbound-bld": "warehouse-goods-plan-approval",
  "warehouse-qr": "warehouse-qr",
  "internal-transfer-requests": "internal-transfer-requests",
  "internal-transfer-pm": "internal-transfer-pm",
  "internal-transfer-batches": "internal-transfer-batches",
  "internal-transfer-tech": "internal-transfer-tech",
  "internal-transfer-sa": "internal-transfer-sa",
  "internal-transfer-accounting": "internal-transfer-accounting",
  "internal-transfer-warehouse-out": "internal-transfer-warehouse-out",
  "internal-transfer-warehouse-in": "internal-transfer-warehouse-in",
  "machine-movements": "machine-movements",
  "machine-repairs": "machine-repairs",
};

export function screenGuideId(screen: string): string | undefined {
  return Object.hasOwn(screenGuideIds, screen) ? screenGuideIds[screen] : undefined;
}
