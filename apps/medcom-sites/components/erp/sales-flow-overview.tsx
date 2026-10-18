"use client";

import { BookOpen, FileText, PackageCheck, ReceiptText, ShieldCheck, UserCheck } from "lucide-react";

const stages = [
  { id: "sales-orders", label: "Lập đơn hàng", icon: FileText },
  { id: "sales-order-pm", label: "Xác nhận · PM", icon: UserCheck },
  { id: "sales-order-sa", label: "Duyệt · SA", icon: ShieldCheck },
  { id: "sales-goods-status", label: "Tình trạng hàng hóa", icon: PackageCheck, feature: true },
  { id: "sales-dispatch-invoices", label: "PXK & hóa đơn", icon: ReceiptText, feature: true },
  { id: "sales-qr", label: "Xuất theo PXK", icon: PackageCheck },
];

export function SalesFlowOverview({ module }: { module: string }) {
  return <section aria-label="Các màn hình Bán hàng" className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 text-black shadow-xs dark:border-neutral-800 dark:bg-neutral-900 dark:text-white">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Quy trình Bán hàng</h3><a href={`/help?guide=${module}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950"><BookOpen aria-hidden className="size-4" />Hướng dẫn sử dụng</a></div>
    <ol className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{stages.map(({ id, label, icon: Icon, feature }, index) => <li key={id} aria-current={module === id ? "step" : undefined} className={`relative min-w-0 rounded-xl border p-3 ${module === id ? "border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-950" : "border-neutral-200 dark:border-neutral-800"}`}>
      <div className="mb-2 flex items-center justify-between gap-2"><Icon aria-hidden className={`size-5 ${module === id ? "text-brand-700 dark:text-brand-300" : ""}`} /><span className="text-sm tabular-nums">{String(index + 1).padStart(2, "0")}</span></div>
      <p className="break-words text-sm font-semibold leading-5">{label}</p>{feature && <span className="mt-2 inline-flex rounded-md border border-violet-200 px-1.5 py-0.5 text-xs font-medium text-violet-700 dark:border-violet-800 dark:text-violet-300">Feature</span>}
    </li>)}</ol>
    <p className="mt-3 text-sm leading-6">Thao tác được mở theo quyền và trạng thái đơn hàng. Các bước có nhãn Feature đang được bổ sung.</p>
  </section>;
}
