"use client";

import { useRef } from "react";
import { LogOut, Moon, Sun, X } from "lucide-react";
import { AppButton } from "@/components/app/app-button";
import { NavigationList, type NavigationAccess } from "@/components/app/app-navigation";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { NavTabId } from "./bottom-nav";

export interface SidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  userName?: string;
  userRole?: string;
  currentBranch?: string;
  branchName?: string;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  onLogout?: () => void;
  pendingOrdersCount?: number;
  pendingPurchasesCount?: number;
  pendingInboundCount?: number;
  tabAccess?: NavigationAccess | null;
  onRetryTabs?: () => void;
  queueBadges?: Readonly<Record<string, number>>;
}

const footerIconClass = "inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-brand-500 dark:text-neutral-300 dark:hover:bg-neutral-800";

// Who and where on top, modules in the middle; the footer is one row of
// account tools so the module list keeps most of a phone screen.
export function SidebarDrawer({ open, onClose, activeTab, onSelectTab, userName = "", userRole = "", currentBranch = "", branchName,
  isDarkMode = false, onToggleDarkMode, onLogout, tabAccess, onRetryTabs, queueBadges }: SidebarDrawerProps) {
  const opener = useRef<HTMLElement | null>(null);
  const branch = branchName || currentBranch || "MEDCOM ERP";
  return <Sheet open={open} modal onOpenChange={next => { if (!next) onClose(); }}>
    <SheetContent side="left" showCloseButton={false} aria-modal="true"
      onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={event => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } }}
      className="h-dvh max-h-dvh w-[calc(100vw-2rem)] max-w-sm gap-0 overflow-hidden border-neutral-200 bg-white p-0 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-neutral-800">
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-base font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">{userName.charAt(0).toUpperCase() || "M"}</span>
        <div className="min-w-0 flex-1">
          <SheetTitle className="truncate text-base font-semibold" title={userName}>{userName || "Menu phân hệ"}</SheetTitle>
          <SheetDescription className="truncate text-sm text-neutral-500 dark:text-neutral-400" title={[userRole, branch].filter(Boolean).join(" · ")}>
            {[userRole, branch].filter(Boolean).join(" · ")}
          </SheetDescription>
        </div>
        <AppButton variant="ghost" size="icon" aria-label="Đóng menu" onClick={onClose}><X aria-hidden="true" className="size-5" /></AppButton>
      </header>
      <NavigationList key={open ? "open" : "closed"} activeTab={activeTab} onSelect={tab => { onSelectTab(tab); onClose(); }} tabAccess={tabAccess} onRetryTabs={onRetryTabs} badges={queueBadges} />
      <footer className="flex shrink-0 items-center justify-end gap-1 border-t border-neutral-200 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-neutral-800">
        {onToggleDarkMode && <button type="button" className={footerIconClass} onClick={onToggleDarkMode} aria-pressed={isDarkMode}
          aria-label={isDarkMode ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"} title={isDarkMode ? "Giao diện sáng" : "Giao diện tối"}>
          {isDarkMode ? <Sun aria-hidden="true" className="size-5" /> : <Moon aria-hidden="true" className="size-5" />}
        </button>}
        {onLogout && <button type="button" className={`${footerIconClass} text-rose-600 dark:text-rose-400`} aria-label="Đăng xuất" title="Đăng xuất"
          onClick={() => { onClose(); onLogout(); }}><LogOut aria-hidden="true" className="size-5" /></button>}
      </footer>
    </SheetContent>
  </Sheet>;
}
