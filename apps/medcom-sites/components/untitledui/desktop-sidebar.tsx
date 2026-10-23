"use client";

import { Bell, BookOpen, LogOut, Moon, PanelLeftClose, Sun } from "lucide-react";
import { MedcomLogo } from "@/components/brand/medcom-logo";
import { AppButton } from "@/components/app/app-button";
import { BranchSwitcher } from "@/components/app/branch-switcher";
import { NavigationList, navigationItemClassName, type NavigationAccess } from "@/components/app/app-navigation";
import type { NavTabId } from "./bottom-nav";
import type { BranchOption } from "./mobile-header";

export interface DesktopSidebarProps {
  currentBranch: string;
  onBranchChange: (branchId: string) => void;
  branches: BranchOption[];
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
  userName?: string;
  userRole?: string;
  unreadNotifications?: number;
  onNotificationsClick: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  onToggleLayoutMode?: () => void;
  tabAccess?: NavigationAccess | null;
  onRetryTabs?: () => void;
}

export function DesktopSidebar({ currentBranch, onBranchChange, branches, activeTab, onTabChange, userName = "", userRole = "", unreadNotifications = 0,
  onNotificationsClick, isDarkMode, onToggleDarkMode, onLogout, onToggleLayoutMode, tabAccess, onRetryTabs }: DesktopSidebarProps) {
  return <aside aria-label="Điều hướng ứng dụng" className="sticky top-0 z-30 flex h-dvh w-72 shrink-0 flex-col border-r border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
    <header className="shrink-0 space-y-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-3">
        <MedcomLogo alt="MEDCOMTECH" width={144} height={52} className="h-10 w-28 object-contain" priority />
        {onToggleLayoutMode && <AppButton variant="ghost" size="icon" aria-label="Dùng thanh điều hướng ngang" onClick={onToggleLayoutMode}><PanelLeftClose aria-hidden="true" className="size-5" /></AppButton>}
      </div>
      <BranchSwitcher branches={branches} currentBranch={currentBranch} onBranchChange={onBranchChange} />
    </header>
    <NavigationList activeTab={activeTab} onSelect={onTabChange} tabAccess={tabAccess} onRetryTabs={onRetryTabs} />
    <footer className="shrink-0 space-y-2 border-t border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <a href="/help" target="_blank" rel="noopener noreferrer" className={navigationItemClassName(false)}><BookOpen aria-hidden="true" className="size-5 shrink-0" /><span>Hướng dẫn sử dụng</span></a>
      <div className="flex items-center gap-1">
        <AppButton variant="ghost" size="icon" aria-label="Thông báo" onClick={onNotificationsClick} className="relative"><Bell aria-hidden="true" className="size-5" />
          {unreadNotifications > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-brand-600 dark:bg-brand-400" />}
        </AppButton>
        <AppButton variant="ghost" size="icon" aria-label="Giao diện tối" aria-pressed={isDarkMode} onClick={onToggleDarkMode}>{isDarkMode ? <Sun aria-hidden="true" className="size-5" /> : <Moon aria-hidden="true" className="size-5" />}</AppButton>
        <AppButton variant="ghost" size="icon" className="ml-auto" aria-label="Đăng xuất" onClick={onLogout}><LogOut aria-hidden="true" className="size-5" /></AppButton>
      </div>
      <div className="flex items-center gap-3 px-3 py-2">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">{userName.charAt(0).toUpperCase()}</span>
        <div className="min-w-0"><p className="truncate text-sm font-semibold" title={userName}>{userName}</p><p className="truncate text-sm text-neutral-500 dark:text-neutral-400" title={userRole}>{userRole}</p></div>
      </div>
    </footer>
  </aside>;
}
