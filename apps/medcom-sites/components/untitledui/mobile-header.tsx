"use client";

import { Bell } from "lucide-react";
import { MedcomLogo } from "@/components/brand/medcom-logo";
import { AppButton } from "@/components/app/app-button";
import { BranchSwitcher } from "@/components/app/branch-switcher";

export interface BranchOption { id: string; name: string; code: string; address?: string }
export interface UntitledMobileHeaderProps {
  currentBranch: string;
  onBranchChange: (branchId: string) => void;
  branches?: BranchOption[];
  userName?: string;
  userRole?: string;
  onNotificationsClick?: () => void;
  unreadNotifications?: number;
  onProfileClick?: () => void;
}

export function UntitledMobileHeader({ currentBranch, onBranchChange, branches = [], userName = "", userRole = "",
  onNotificationsClick, unreadNotifications = 0, onProfileClick }: UntitledMobileHeaderProps) {
  return <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/95 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/95">
    <div className="flex min-h-16 items-center gap-2 px-3 py-2">
      <div className="h-10 w-28 shrink-0"><MedcomLogo alt="MEDCOMTECH" width={144} height={52} className="h-full w-full object-contain object-left" priority /></div>
      <BranchSwitcher compact branches={branches} currentBranch={currentBranch} onBranchChange={onBranchChange} />
      <div className="flex shrink-0 items-center gap-1">
        <AppButton variant="ghost" size="icon" onClick={onNotificationsClick} disabled={!onNotificationsClick} className="relative" aria-label="Thông báo">
          <Bell aria-hidden="true" className="size-5" />
          {unreadNotifications > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-brand-600 ring-2 ring-white dark:bg-brand-400 dark:ring-neutral-900" />}
        </AppButton>
        <AppButton variant="secondary" size="icon" onClick={onProfileClick} disabled={!onProfileClick} aria-label="Hồ sơ tài khoản" title={[userName, userRole].filter(Boolean).join(" · ")}>
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">{userName.charAt(0).toUpperCase()}</span>
        </AppButton>
      </div>
    </div>
  </header>;
}
