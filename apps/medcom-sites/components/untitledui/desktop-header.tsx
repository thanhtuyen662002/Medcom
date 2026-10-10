"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Building2,
  ChevronDown,
  Check,
  Bell,
  Sun,
  Moon,
  Plus,
  LogOut,
  ShoppingBag,
  FileText,
  PackageCheck,
  QrCode,
  LayoutDashboard,
  Settings2,
  Search,
  Menu,
} from "lucide-react";
import { UntitledBadge } from "./badge";
import { UntitledButton } from "./button";
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
  onOpenQuickCreate: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  pendingOrdersCount?: number;
  pendingPurchasesCount?: number;
  pendingInboundCount?: number;
}

export function DesktopHeader({
  currentBranch,
  onBranchChange,
  branches,
  activeTab,
  onTabChange,
  onOpenMenu,
  userName = "DS. Trần Quang Minh",
  userRole = "Trưởng Ban Dược",
  unreadNotifications = 3,
  onNotificationsClick,
  onOpenQuickCreate,
  isDarkMode,
  onToggleDarkMode,
  onLogout,
  pendingOrdersCount = 0,
  pendingPurchasesCount = 0,
  pendingInboundCount = 0,
}: DesktopHeaderProps) {
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const activeBranch = branches.find((b) => b.id === currentBranch) || branches[0];

  const navItems = [
    {
      id: "home" as NavTabId,
      label: "Tổng quan",
      icon: LayoutDashboard,
      badge: 0,
    },
    {
      id: "orders" as NavTabId,
      label: "Đơn hàng (PO)",
      icon: ShoppingBag,
      badge: pendingOrdersCount,
    },
    {
      id: "purchases" as NavTabId,
      label: "Đề nghị (PR)",
      icon: FileText,
      badge: pendingPurchasesCount,
    },
    {
      id: "inbound" as NavTabId,
      label: "Nhập kho",
      icon: PackageCheck,
      badge: pendingInboundCount,
    },
    {
      id: "scan" as NavTabId,
      label: "Quét mã",
      icon: QrCode,
      badge: 0,
    },
    {
      id: "settings" as NavTabId,
      label: "Cài đặt",
      icon: Settings2,
      badge: 0,
    },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-b border-neutral-200/80 dark:border-neutral-800 transition-colors shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand & Branch Selector */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="size-9 rounded-xl bg-gradient-to-tr from-purple-700 via-purple-600 to-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-sm ring-2 ring-purple-100 dark:ring-purple-950">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold tracking-tight text-neutral-900 dark:text-white">
                    MEDCOM ERP
                  </span>
                  <UntitledBadge variant="purple" size="sm">
                    2026
                  </UntitledBadge>
                </div>
                <span className="text-[10px] text-neutral-400 block leading-tight">
                  Quản lý Dược GSP
                </span>
              </div>
            </div>

            {/* Branch Switcher Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/80 dark:bg-neutral-800/80 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold text-neutral-800 dark:text-neutral-200 transition-all cursor-pointer"
              >
                <Building2 className="size-3.5 text-purple-600" />
                <span className="max-w-[150px] lg:max-w-[200px] truncate">
                  {activeBranch.name}
                </span>
                <ChevronDown
                  className={`size-3 text-neutral-400 transition-transform ${
                    branchDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {branchDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setBranchDropdownOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl p-2 z-40 animate-uui-fade-in">
                    <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800 text-xs">
                      <p className="font-bold text-neutral-900 dark:text-white">
                        Chuyển đổi Chi nhánh
                      </p>
                      <p className="text-[10px] text-neutral-400">
                        Phân quyền và chứng từ theo đơn vị
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
                              setBranchDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-colors ${
                              isSelected
                                ? "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-semibold"
                                : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                            }`}
                          >
                            <span className="truncate">{b.name}</span>
                            {isSelected && (
                              <Check className="size-3.5 text-purple-600 shrink-0 ml-2" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Navigation Links (Desktop) */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  data-tab={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all relative cursor-pointer ${
                    isActive
                      ? "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 shadow-2xs"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  }`}
                >
                  <Icon
                    className={`size-4 ${
                      isActive ? "text-purple-600 dark:text-purple-400" : "text-neutral-400"
                    }`}
                  />
                  <span>{item.label}</span>
                  {item.badge > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        isActive
                          ? "bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-200"
                          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-purple-600 dark:bg-purple-400" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2.5">
            {onOpenMenu && (
              <button
                type="button"
                onClick={onOpenMenu}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer text-purple-700 dark:text-purple-300 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 shadow-2xs"
                title="Mở toàn bộ danh mục phân hệ ERP"
              >
                <Menu className="size-3.5 text-purple-600 dark:text-purple-400" />
                <span>Phân hệ ERP</span>
              </button>
            )}

            {/* Quick Create Action */}
            <UntitledButton
              variant="primary"
              size="sm"
              onClick={onOpenQuickCreate}
              iconLeading={<Plus className="size-3.5" />}
            >
              + Đề nghị mới
            </UntitledButton>

            {/* Notifications */}
            <button
              type="button"
              onClick={onNotificationsClick}
              className="relative p-2 rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title="Thông báo"
            >
              <Bell className="size-4" />
              {unreadNotifications > 0 && (
                <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-purple-600 ring-2 ring-white dark:ring-neutral-900" />
              )}
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="p-2 rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title="Đổi màu giao diện sáng / tối"
            >
              {isDarkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>

            {/* User Profile & Logout */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2 p-1.5 pl-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all cursor-pointer"
              >
                <div className="size-7 rounded-lg bg-gradient-to-tr from-purple-700 to-purple-500 text-white font-bold text-xs flex items-center justify-center">
                  {userName.charAt(0)}
                </div>
                <div className="text-left hidden lg:block">
                  <p className="text-xs font-bold text-neutral-900 dark:text-white leading-tight truncate max-w-[120px]">
                    {userName}
                  </p>
                  <p className="text-[10px] text-neutral-400 leading-tight truncate">
                    {userRole}
                  </p>
                </div>
                <ChevronDown className="size-3 text-neutral-400" />
              </button>

              {profileDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setProfileDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl p-2 z-40 animate-uui-fade-in text-xs">
                    <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
                      <p className="font-bold text-neutral-900 dark:text-white truncate">
                        {userName}
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate">{userRole}</p>
                    </div>

                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          onTabChange("settings");
                          setProfileDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-left transition-colors"
                      >
                        <Settings2 className="size-3.5 text-neutral-400" />
                        <span>Cài đặt & Chẩn đoán ERP</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          onLogout();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-left transition-colors mt-1 font-semibold"
                      >
                        <LogOut className="size-3.5" />
                        <span>Đăng xuất tài khoản</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
