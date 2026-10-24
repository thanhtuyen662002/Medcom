"use client";

import { useId, useState, type ComponentType } from "react";
import { ArrowRightLeft, Boxes, CheckCircle2, ClipboardList, FileText, LayoutDashboard, Layers, PackageCheck, PackagePlus, QrCode, Search, Settings2, ShoppingBag, Truck, UserCheck, Wrench, X, ChevronDown } from "lucide-react";
import type { NavTabId } from "@/components/untitledui/bottom-nav";
import { SalesFeatureLinks } from "@/components/erp/sales-feature-links";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AppButton } from "./app-button";

export interface NavigationAccess { loading: boolean; error: boolean; allowed: readonly string[] | null }
interface NavigationItem { id: NavTabId; label: string; icon: ComponentType<{ className?: string }> }
interface NavigationSection { title: string; items: readonly NavigationItem[] }

// One catalog and permission filter for the drawer, sidebar and desktop menu.
export const navigationSections: readonly NavigationSection[] = [
  { title: "Mua hàng", items: [
    { id: "purchase-requests", label: "Đề nghị mua hàng (PR)", icon: FileText },
    { id: "purchase-approvals", label: "Duyệt đề nghị mua", icon: CheckCircle2 },
    { id: "purchase-orders", label: "Đặt mua hàng", icon: ShoppingBag },
  ] },
  { title: "Bán hàng", items: [
    { id: "sales-orders", label: "Quản lý đơn hàng", icon: ShoppingBag },
    { id: "sales-order-pm", label: "PM xử lý đơn hàng", icon: UserCheck },
    { id: "sales-order-sa", label: "SA xử lý đơn hàng", icon: ClipboardList },
    { id: "sales-qr", label: "Xuất hàng theo PXK", icon: PackageCheck },
  ] },
  { title: "Quản lý kho", items: [
    { id: "inbound-requests", label: "Đề nghị nhập hàng", icon: PackagePlus },
  ] },
  { title: "Điều chuyển nội bộ", items: [
    { id: "internal-transfer-requests", label: "Đề nghị điều chuyển", icon: ArrowRightLeft },
    { id: "internal-transfer-pm", label: "PM duyệt điều chuyển", icon: UserCheck },
    { id: "internal-transfer-batches", label: "Đợt điều chuyển", icon: Boxes },
    { id: "internal-transfer-tech", label: "Kỹ thuật điều chuyển", icon: Wrench },
    { id: "internal-transfer-sa", label: "SA duyệt điều chuyển", icon: ClipboardList },
    { id: "internal-transfer-accounting", label: "Kế toán điều chuyển", icon: FileText },
    { id: "internal-transfer-warehouse-out", label: "Kho xuất điều chuyển", icon: Truck },
    { id: "internal-transfer-warehouse-in", label: "Kho nhận điều chuyển", icon: PackageCheck },
  ] },
  { title: "Mã vạch & Quét QR", items: [
    { id: "warehouse-qr", label: "Quét QR xuất kho", icon: QrCode },
  ] },
  { title: "Thiết bị & Bảo hành", items: [
    { id: "machine-movements", label: "Bàn giao di chuyển máy", icon: Truck },
    { id: "machine-repairs", label: "Sửa chữa bảo hành máy", icon: Wrench },
  ] },
];

// Keep four spacious bottom destinations at 375px; QR is first in the menu.
const quickItems: readonly NavigationItem[] = [
  { id: "scan", label: "Quét QR", icon: QrCode },
  { id: "home", label: "Tổng quan", icon: LayoutDashboard },
];
const settingsItem: NavigationItem = { id: "settings", label: "Cài đặt hệ thống", icon: Settings2 };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi").trim();

/** The menu label a user clicked to reach a screen; screens reuse it as their title. */
export function navigationLabel(id: string): string | undefined {
  return navigationSections.flatMap(section => section.items).find(item => item.id === id)?.label;
}

export function navigationItemClassName(active: boolean) {
  return `flex min-h-11 min-w-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-base md:text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${active
    ? "bg-brand-50 font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 dark:bg-brand-950/60 dark:text-brand-300 dark:ring-brand-800"
    : "font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"}`;
}

interface NavigationListProps {
  activeTab: NavTabId;
  onSelect: (tab: NavTabId) => void;
  tabAccess?: NavigationAccess | null;
  onRetryTabs?: () => void;
}

export function NavigationList({ activeTab, onSelect, tabAccess, onRetryTabs }: NavigationListProps) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const term = normalize(query);
  const matches = (item: NavigationItem, title = "") => normalize(`${item.label} ${title}`).includes(term);
  const sections = navigationSections.map(section => ({ ...section,
    items: section.items.filter(item => tabAccess?.allowed?.includes(item.id) && matches(item, section.title)),
  })).filter(section => section.items.length > 0);
  const quick = quickItems.filter(item => matches(item));
  const showSettings = matches(settingsItem);
  const renderItem = (item: NavigationItem) => {
    const active = activeTab === item.id;
    const Icon = item.icon;
    return <button key={item.id} type="button" data-tab={item.id} aria-current={active ? "page" : undefined}
      onClick={() => onSelect(item.id)} className={navigationItemClassName(active)}>
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{item.label}</span>
    </button>;
  };

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="shrink-0 px-3 pb-3 pt-3">
      <label htmlFor={searchId} className="sr-only">Tìm phân hệ</label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-5 text-neutral-400" />
        <input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm phân hệ…"
          className="min-h-11 min-w-11 w-full rounded-xl border border-neutral-300 bg-white pl-10 pr-12 text-base text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:ring-brand-900 [&::-webkit-search-cancel-button]:appearance-none" />
        {query && <AppButton variant="ghost" size="icon" className="absolute right-0 top-0" aria-label="Xóa tìm phân hệ" onClick={() => setQuery("")}><X aria-hidden="true" className="size-4" /></AppButton>}
      </div>
    </div>
    <nav aria-label="Danh mục phân hệ" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 pb-4">
      {quick.length > 0 && <section aria-label="Truy cập nhanh" className="space-y-1">
        <h2 className="px-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Truy cập nhanh</h2>
        {quick.map(item => renderItem(item))}
      </section>}
      {tabAccess?.allowed == null && <div role="status" className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
        {tabAccess?.error ? <><p>Không tải được quyền phân hệ.</p><AppButton variant="secondary" className="mt-2 w-full" onClick={onRetryTabs} disabled={!onRetryTabs}>Thử lại</AppButton></>
          : "Đang tải quyền màn hình…"}
      </div>}
      {sections.map(section => <section key={section.title} aria-label={section.title} className="space-y-1">
        <h2 className="px-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{section.title}</h2>
        {section.items.map(item => renderItem(item))}
        {section.title === "Bán hàng" && !term && <SalesFeatureLinks />}
      </section>)}
      {showSettings && <section aria-label="Hệ thống" className="border-t border-neutral-200 pt-3 dark:border-neutral-800">{renderItem(settingsItem)}</section>}
      {term && quick.length === 0 && sections.length === 0 && !showSettings && <p role="status" className="px-3 py-4 text-sm text-neutral-500 dark:text-neutral-400">Không tìm thấy phân hệ phù hợp.</p>}
    </nav>
  </div>;
}

export function NavigationMenu(props: NavigationListProps) {
  const [open, setOpen] = useState(false);
  const active = navigationSections.flatMap(section => section.items).find(item => item.id === props.activeTab);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><AppButton variant="secondary" aria-label="Mở danh mục phân hệ" className="min-w-0 max-w-64">
      <Layers aria-hidden="true" className="size-5 shrink-0" /><span className="truncate">{active?.label ?? "Phân hệ"}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0" />
    </AppButton></PopoverTrigger>
    <PopoverContent align="start" aria-label="Chọn phân hệ" className="flex h-[min(36rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border-neutral-200 bg-white p-0 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
      <NavigationList {...props} onSelect={tab => { props.onSelect(tab); setOpen(false); }} />
    </PopoverContent>
  </Popover>;
}
