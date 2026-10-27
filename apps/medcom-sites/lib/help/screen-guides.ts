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
};

export function screenGuideId(screen: string): string | undefined {
  return Object.hasOwn(screenGuideIds, screen) ? screenGuideIds[screen] : undefined;
}
