"use client";

import { Moon, Sun, LogOut, User } from "lucide-react";
import { AppButton, ScreenHeader, StatusBadge } from "@/components/app";
import type { LoginResult } from "@/lib/erp/erp-client";

export interface TabSettingsProps {
  currentBranch: string;
  onBranchChange: (branch: string) => void;
  currentUser: NonNullable<LoginResult["user"]>;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
}

export function TabSettings({ currentBranch, currentUser, isDarkMode, onToggleDarkMode, onLogout }: TabSettingsProps) {
  return <div className="min-w-0 space-y-4 pb-8">
    <ScreenHeader title="Cài đặt" subtitle="Tài khoản và giao diện của bạn" />
    <section aria-label="Hồ sơ tài khoản" className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300"><User aria-hidden="true" className="size-6" /></div>
        <div className="min-w-0 space-y-2">
          <h2 className="break-words text-base font-semibold text-neutral-900 dark:text-neutral-100">{currentUser.displayName || currentUser.username}</h2>
          <p className="break-all text-sm text-neutral-500 dark:text-neutral-400">{currentUser.username}</p>
          {currentUser.role && <StatusBadge label={currentUser.role} tone="info" />}
        </div>
      </div>
      <dl className="mt-4 space-y-3 border-t border-neutral-100 pt-4 text-sm dark:border-neutral-800">
        {currentUser.companyName && <div><dt className="text-neutral-500 dark:text-neutral-400">Đơn vị</dt><dd className="mt-1 break-words font-medium text-neutral-900 dark:text-neutral-100">{currentUser.companyName}</dd></div>}
        <div><dt className="text-neutral-500 dark:text-neutral-400">Chi nhánh hiện tại</dt><dd className="mt-1 break-words font-medium text-neutral-900 dark:text-neutral-100">{currentBranch}</dd></div>
      </dl>
    </section>
    <section aria-label="Giao diện" className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">{isDarkMode ? <Moon aria-hidden="true" className="size-5" /> : <Sun aria-hidden="true" className="size-5" />}</div>
          <div><h2 id="settings-dark-mode" className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Chế độ tối</h2><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{isDarkMode ? "Đang bật nền tối" : "Đang dùng nền sáng"}</p></div>
        </div>
        <AppButton role="switch" aria-labelledby="settings-dark-mode" aria-checked={isDarkMode} variant="ghost" onClick={onToggleDarkMode} className="shrink-0 px-1">
          <span aria-hidden="true" className={"flex h-6 w-11 items-center rounded-full p-0.5 transition-colors " + (isDarkMode ? "bg-brand-600" : "bg-neutral-300 dark:bg-neutral-700")}>
            <span className={"size-5 rounded-full bg-white shadow-sm transition-transform " + (isDarkMode ? "translate-x-5" : "translate-x-0")} />
          </span>
        </AppButton>
      </div>
    </section>
    <AppButton variant="danger" className="w-full" onClick={onLogout}><LogOut aria-hidden="true" className="size-5" />Đăng xuất tài khoản</AppButton>
  </div>;
}
