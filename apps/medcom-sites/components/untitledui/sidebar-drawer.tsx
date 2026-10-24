"use client";

import { useRef } from "react";
import { BookOpen, LogOut, Moon, Sun, X } from "lucide-react";
import { AppButton } from "@/components/app/app-button";
import { NavigationList, navigationItemClassName, type NavigationAccess } from "@/components/app/app-navigation";
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

export function SidebarDrawer({ open, onClose, activeTab, onSelectTab, userName = "", userRole = "", currentBranch = "", branchName,
  isDarkMode = false, onToggleDarkMode, onLogout, tabAccess, onRetryTabs, queueBadges }: SidebarDrawerProps) {
  const opener = useRef<HTMLElement | null>(null);
  return <Sheet open={open} modal onOpenChange={next => { if (!next) onClose(); }}>
    <SheetContent side="left" showCloseButton={false} aria-modal="true"
      onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={event => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } }}
      className="h-dvh max-h-dvh w-[calc(100vw-2rem)] max-w-sm gap-0 overflow-hidden border-neutral-200 bg-white p-0 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-neutral-800">
        <div className="min-w-0">
          <SheetTitle className="truncate text-lg font-semibold">Menu phân hệ</SheetTitle>
          <SheetDescription className="truncate text-sm text-neutral-500 dark:text-neutral-400" title={branchName || currentBranch}>{branchName || currentBranch || "MEDCOM ERP"}</SheetDescription>
        </div>
        <AppButton variant="ghost" size="icon" aria-label="Đóng menu" onClick={onClose}><X aria-hidden="true" className="size-5" /></AppButton>
      </header>
      <NavigationList key={open ? "open" : "closed"} activeTab={activeTab} onSelect={tab => { onSelectTab(tab); onClose(); }} tabAccess={tabAccess} onRetryTabs={onRetryTabs} badges={queueBadges} />
      <footer className="shrink-0 space-y-1 border-t border-neutral-200 bg-neutral-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center gap-3 px-3 pb-2">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">{userName.charAt(0).toUpperCase()}</span>
          <div className="min-w-0"><p className="truncate text-sm font-semibold" title={userName}>{userName}</p><p className="truncate text-sm text-neutral-500 dark:text-neutral-400" title={userRole}>{userRole}</p></div>
        </div>
        <a href="/help" target="_blank" rel="noopener noreferrer" className={navigationItemClassName(false)}><BookOpen aria-hidden="true" className="size-5 shrink-0" /><span>Hướng dẫn sử dụng</span></a>
        <div className="flex gap-2">
          {onToggleDarkMode && <AppButton variant="secondary" className="min-w-0 flex-1 px-3" onClick={onToggleDarkMode} aria-label="Giao diện tối" aria-pressed={isDarkMode}>
            {isDarkMode ? <Moon aria-hidden="true" className="size-5 shrink-0" /> : <Sun aria-hidden="true" className="size-5 shrink-0" />}<span>{isDarkMode ? "Giao diện tối" : "Giao diện sáng"}</span>
          </AppButton>}
          {onLogout && <AppButton variant="ghost" size="icon" aria-label="Đăng xuất" onClick={() => { onClose(); onLogout(); }}><LogOut aria-hidden="true" className="size-5" /></AppButton>}
        </div>
      </footer>
    </SheetContent>
  </Sheet>;
}
