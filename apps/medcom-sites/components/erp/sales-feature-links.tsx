import { PackageSearch, ReceiptText } from "lucide-react";

export function SalesFeatureLinks() {
  return <>{[
    { id: "sales-goods-status", label: "Xác nhận tình trạng hàng hóa", icon: PackageSearch },
    { id: "sales-dispatch-invoices", label: "Duyệt, PXK và hóa đơn", icon: ReceiptText },
  ].map(({ id, label, icon: Icon }) => <a key={id} href={`/help?guide=${id}`} target="_blank" rel="noopener noreferrer" className="flex min-h-11 w-full items-start gap-2.5 rounded-xl px-3 py-2 text-sm text-black hover:bg-neutral-50 dark:text-white dark:hover:bg-neutral-800">
    <Icon aria-hidden className="mt-0.5 size-5 shrink-0" /><span className="min-w-0 flex-1 leading-5">{label}</span><span className="shrink-0 rounded-md border border-violet-200 px-1.5 py-0.5 text-xs font-medium text-violet-700 dark:border-violet-800 dark:text-violet-300">Feature</span>
  </a>)}</>;
}
