"use client";

import React, { useState } from "react";
import { Building2, Bell, ChevronDown, Check, ShieldCheck, Wifi, Sparkles } from "lucide-react";

export interface BranchOption {
  id: string;
  name: string;
  code: string;
  address?: string;
}

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

const defaultBranches: BranchOption[] = [
  { id: "CN-01", name: "Chi nhánh 1 (Trung tâm)", code: "CN01", address: "Hai Bà Trưng, Hà Nội" },
  { id: "CN-02", name: "Chi nhánh 2 (Kho Dược)", code: "CN02", address: "Tân Bình, TP.HCM" },
  { id: "CN-03", name: "Chi nhánh 3 (Bệnh viện)", code: "CN03", address: "Hải Châu, Đà Nẵng" },
];

export function UntitledMobileHeader({
  currentBranch,
  onBranchChange,
  branches = defaultBranches,
  userName = "Dược sĩ Minh",
  userRole = "Trưởng phòng Mua sắm",
  onNotificationsClick,
  unreadNotifications = 3,
  onProfileClick,
}: UntitledMobileHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const activeBranch = branches.find((b) => b.id === currentBranch) || branches[0];

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-b border-neutral-200/80 dark:border-neutral-800 transition-colors">
      <div className="px-4 py-2.5 flex items-center justify-between gap-3">
        {/* Brand & Branch Selector */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-9 rounded-xl bg-gradient-to-tr from-purple-700 to-purple-500 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0 ring-2 ring-purple-100 dark:ring-purple-950">
            M
          </div>

          <div className="relative min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                MEDCOM ERP
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-medium bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-600/20">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>

            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="group flex items-center gap-1 text-xs font-semibold text-neutral-800 dark:text-neutral-100 hover:text-purple-600 dark:hover:text-purple-400 transition-colors truncate text-left"
            >
              <span className="truncate max-w-[170px] sm:max-w-[240px]">
                {activeBranch.name}
              </span>
              <ChevronDown
                className={`size-3.5 text-neutral-400 group-hover:text-purple-500 transition-transform ${
                  dropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Notifications */}
          <button
            type="button"
            onClick={onNotificationsClick}
            className="relative p-2 rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-all"
            aria-label="Thông báo"
          >
            <Bell className="size-5" />
            {unreadNotifications > 0 && (
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-purple-600 ring-2 ring-white dark:ring-neutral-900" />
            )}
          </button>

          {/* User Profile Avatar */}
          <button
            type="button"
            onClick={onProfileClick}
            className="relative flex items-center gap-1.5 p-1 pl-1.5 pr-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-all border border-neutral-200/80 dark:border-neutral-800"
            aria-label="Hồ sơ tài khoản"
          >
            <div className="size-6 rounded-lg bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-semibold text-xs flex items-center justify-center">
              {userName.charAt(0)}
            </div>
            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200 hidden xs:inline max-w-[80px] truncate">
              {userName.split(" ").slice(-1)[0]}
            </span>
          </button>
        </div>
      </div>

      {/* Branch Dropdown Popover */}
      {dropdownOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-2xs"
            onClick={() => setDropdownOpen(false)}
          />
          <div className="absolute top-full left-4 right-4 sm:left-4 sm:right-auto sm:w-80 z-50 mt-1 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl p-2 animate-uui-fade-in">
            <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
              <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                Chọn chi nhánh làm việc
              </p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Dữ liệu và quyền thao tác sẽ áp dụng theo chi nhánh
              </p>
            </div>
            <div className="py-1 space-y-0.5">
              {branches.map((b) => {
                const isSelected = b.id === activeBranch.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      onBranchChange(b.id);
                      setDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-colors ${
                      isSelected
                        ? "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-semibold"
                        : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected
                            ? "bg-purple-600 text-white"
                            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                        }`}
                      >
                        <Building2 className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{b.name}</p>
                        {b.address && (
                          <p className="text-[10px] text-neutral-400 truncate">
                            {b.address}
                          </p>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="size-4 text-purple-600 shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </header>
  );
}
