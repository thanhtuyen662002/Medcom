"use client";

import React, { useState } from "react";
import {
  User,
  Building2,
  Moon,
  Sun,
  Smartphone,
  Monitor,
  Server,
  ShieldCheck,
  LogOut,
  ChevronRight,
  RefreshCw,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { UntitledBadge } from "./badge";
import { UntitledButton } from "./button";

export interface TabSettingsProps {
  currentBranch: string;
  onBranchChange: (branch: string) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
}

export function TabSettings({
  currentBranch,
  onBranchChange,
  isDarkMode,
  onToggleDarkMode,
  onLogout,
}: TabSettingsProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleTestConnection = () => {
    setSyncing(true);
    setSyncMessage(null);
    setTimeout(() => {
      setSyncing(false);
      setSyncMessage("Kết nối máy chủ ERP .NET 10 hoàn tất · Độ trễ: 12ms");
    }, 800);
  };

  return (
    <div className="space-y-4 pb-24 animate-uui-fade-in">
      {/* Profile Card */}
      <div className="rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-5 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="size-14 rounded-2xl bg-gradient-to-tr from-purple-700 to-purple-500 text-white font-extrabold text-xl flex items-center justify-center shadow-md ring-4 ring-purple-50 dark:ring-purple-950/60">
            M
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white truncate">
                DS. Trần Quang Minh
              </h3>
              <UntitledBadge variant="brand" size="sm">
                Trưởng Ban Dược
              </UntitledBadge>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              minh.tq@medcom.vn · Mã NV: MC-0842
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Đang trực ca · Quyền duyệt cấp 1</span>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Section: Display & Interface */}
      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
          <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Giao diện & Trải nghiệm
          </h4>
        </div>

        <div className="divide-y divide-neutral-100 dark:divide-neutral-800/80 text-xs">
          {/* Dark Mode Toggle */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                {isDarkMode ? <Moon className="size-4" /> : <Sun className="size-4" />}
              </div>
              <div>
                <p className="font-semibold text-neutral-900 dark:text-white">
                  Chế độ tối (Dark Mode)
                </p>
                <p className="text-[11px] text-neutral-400">
                  {isDarkMode ? "Đang bật nền tối" : "Đang dùng nền sáng"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleDarkMode}
              className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none p-0.5 ${
                isDarkMode ? "bg-purple-600" : "bg-neutral-300 dark:bg-neutral-700"
              }`}
            >
              <div
                className={`size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  isDarkMode ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Settings Section: ERP Connection & Diagnostics */}
      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-purple-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
              Kết nối Máy chủ ERP .NET 10
            </h4>
          </div>
          <UntitledBadge variant="success" size="sm" dot>
            Hoạt động
          </UntitledBadge>
        </div>

        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-700/60 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-neutral-400">Hạ tầng:</span>
            <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">
              Next.js 16 + ASP.NET Core 10
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Phiên bản UI:</span>
            <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">
              Untitled UI Mobile · 2026.10
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Bảo mật phiên:</span>
            <span className="font-mono text-emerald-600 font-semibold">
              AES-GCM · X-Medcom-Scope Verified
            </span>
          </div>
        </div>

        {syncMessage && (
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span>{syncMessage}</span>
          </div>
        )}

        <UntitledButton
          variant="secondary-gray"
          size="sm"
          fullWidth
          loading={syncing}
          onClick={handleTestConnection}
          iconLeading={<RefreshCw className="size-3.5" />}
        >
          Kiểm tra kết nối và Đồng bộ dữ liệu
        </UntitledButton>
      </div>

      {/* Logout Button */}
      <div className="pt-2">
        <UntitledButton
          variant="destructive"
          size="md"
          fullWidth
          onClick={onLogout}
          iconLeading={<LogOut className="size-4" />}
        >
          Đăng xuất tài khoản
        </UntitledButton>
      </div>
    </div>
  );
}
