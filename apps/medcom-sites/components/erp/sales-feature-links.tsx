import { ExternalLink, PackageSearch, ReceiptText } from "lucide-react";

/** Sales steps done in the ERP desktop app: the menu links to their guides, not to a screen. */
export function SalesFeatureLinks() {
  return <>{[
    { id: "sales-goods-status", label: "Xác nhận tình trạng hàng hóa", icon: PackageSearch },
    { id: "sales-dispatch-invoices", label: "Duyệt, PXK và hóa đơn", icon: ReceiptText },
  ].map(({ id, label, icon: Icon }) => <a key={id} href={`/help?guide=${id}`} target="_blank" rel="noopener noreferrer" aria-label={`${label}: mở hướng dẫn trong tab mới`} className="flex min-h-11 w-full items-start gap-2.5 rounded-xl px-3 py-2 text-sm text-black hover:bg-neutral-50 dark:text-white dark:hover:bg-neutral-800">
    <Icon aria-hidden className="mt-0.5 size-5 shrink-0" /><span className="min-w-0 flex-1 leading-5">{label}</span><span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-neutral-200 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">Hướng dẫn<ExternalLink aria-hidden className="size-3" /></span>
  </a>)}</>;
}
