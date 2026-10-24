"use client";

import { useState } from "react";
import { Bell, BookOpen, ChevronDown, FileText, LayoutDashboard, LogOut, Moon, PackageCheck, PanelLeft, Settings2, Sun } from "lucide-react";
import { MedcomLogo } from "@/components/brand/medcom-logo";
import { AppButton } from "@/components/app/app-button";
import { BranchSwitcher } from "@/components/app/branch-switcher";
import { NavigationMenu, type NavigationAccess } from "@/components/app/app-navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NavTabId } from "./bottom-nav";
import type { BranchOption } from "./mobile-header";

export interface DesktopHeaderProps {
  currentBranch: string;
  onBranchChange: (branchId: string) => void;
  branches: BranchOption[];
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
  onOpenMenu?: () => void;
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

export function DesktopHeader({ currentBranch, onBranchChange, branches, activeTab, onTabChange, userName = "", userRole = "", unreadNotifications = 0,
  onNotificationsClick, isDarkMode, onToggleDarkMode, onLogout, onToggleLayoutMode, tabAccess, onRetryTabs }: DesktopHeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  return <header className="sticky top-0 z-40 w-full border-b border-neutral-200 bg-white/95 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/95">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 lg:flex-nowrap lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3 lg:flex-none">
        <MedcomLogo alt="MEDCOMTECH" width={144} height={52} className="h-10 w-20 shrink-0 object-contain" priority />
        <BranchSwitcher branches={branches} currentBranch={currentBranch} onBranchChange={onBranchChange} />
      </div>
      <nav aria-label="Điều hướng chính" className="order-last flex w-full min-w-0 items-center gap-2 lg:order-none lg:w-auto lg:flex-1">
        {/* Same destinations as the mobile bottom bar, so desktop reaches the PR and inbound tabs directly. */}
        {([["home", "Tổng quan", LayoutDashboard], ["purchases", "Đề nghị PR", FileText], ["inbound", "Nhập kho", PackageCheck]] as const).map(([tab, label, Icon]) =>
          <AppButton key={tab} variant={activeTab === tab ? "secondary" : "ghost"} className="shrink-0" aria-current={activeTab === tab ? "page" : undefined} onClick={() => onTabChange(tab)}>
            <Icon aria-hidden="true" className="size-5" /><span>{label}</span>
          </AppButton>)}
        <NavigationMenu activeTab={activeTab} onSelect={onTabChange} tabAccess={tabAccess} onRetryTabs={onRetryTabs} />
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <a href="/help" target="_blank" rel="noopener noreferrer" aria-label="Hướng dẫn sử dụng (mở tab mới)" className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-brand-500 dark:text-neutral-300 dark:hover:bg-neutral-800"><BookOpen aria-hidden="true" className="size-5" /></a>
        {onToggleLayoutMode && <AppButton variant="ghost" size="icon" aria-label="Dùng thanh điều hướng dọc" onClick={onToggleLayoutMode}><PanelLeft aria-hidden="true" className="size-5" /></AppButton>}
        <AppButton variant="ghost" size="icon" aria-label="Thông báo" onClick={onNotificationsClick} className="relative"><Bell aria-hidden="true" className="size-5" />
          {unreadNotifications > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-brand-600 dark:bg-brand-400" />}
        </AppButton>
        <AppButton variant="ghost" size="icon" aria-label="Giao diện tối" aria-pressed={isDarkMode} onClick={onToggleDarkMode}>{isDarkMode ? <Sun aria-hidden="true" className="size-5" /> : <Moon aria-hidden="true" className="size-5" />}</AppButton>
        <Popover open={profileOpen} onOpenChange={setProfileOpen}>
          <PopoverTrigger asChild><AppButton variant="secondary" className="min-w-11 gap-2 px-2" aria-label="Hồ sơ tài khoản">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">{userName.charAt(0).toUpperCase()}</span>
            <span className="hidden min-w-0 max-w-28 text-left xl:block"><span className="block truncate text-sm">{userName}</span><span className="block truncate text-xs font-normal text-neutral-500 dark:text-neutral-400">{userRole}</span></span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
          </AppButton></PopoverTrigger>
          <PopoverContent align="end" aria-label="Tài khoản" className="w-72 rounded-2xl border-neutral-200 bg-white p-2 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
            <div className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-800"><p className="truncate text-sm font-semibold" title={userName}>{userName}</p><p className="truncate text-sm text-neutral-500 dark:text-neutral-400" title={userRole}>{userRole}</p></div>
            <AppButton variant="ghost" className="mt-1 w-full justify-start px-3" onClick={() => { onTabChange("settings"); setProfileOpen(false); }}><Settings2 aria-hidden="true" className="size-5" />Cài đặt hệ thống</AppButton>
            <AppButton variant="ghost" className="w-full justify-start px-3" onClick={() => { setProfileOpen(false); onLogout(); }}><LogOut aria-hidden="true" className="size-5" />Đăng xuất</AppButton>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  </header>;
}
