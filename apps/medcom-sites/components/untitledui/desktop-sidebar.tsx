"use client";

import React, { useState } from "react";
import { MedcomLogo } from "@/components/brand/medcom-logo";
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
  Layers,
  ArrowRightLeft,
  Truck,
  Wrench,
  PanelLeftClose,
  PanelLeft,
  CheckCircle2,
  UserCheck,
  ClipboardList,
  Boxes,
  BookOpen,
} from "lucide-react";
import { UntitledBadge } from "./badge";
import { UntitledButton } from "./button";
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
  onOpenQuickCreate: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  onToggleLayoutMode?: () => void;
  pendingOrdersCount?: number;
  pendingPurchasesCount?: number;
  pendingInboundCount?: number;
  /** Quyền màn hình từ /api/erp/permissions; allowed null = chưa có quyền. */
  tabAccess?: { loading: boolean; error: boolean; allowed: readonly string[] | null } | null;
  onRetryTabs?: () => void;
}

export function DesktopSidebar({
  currentBranch,
  onBranchChange,
  branches,
  activeTab,
  onTabChange,
  userName = "Administrator",
  userRole = "Dược sĩ / Quản lý",
  unreadNotifications = 0,
  onNotificationsClick,
  onOpenQuickCreate,
  isDarkMode,
  onToggleDarkMode,
  onLogout,
  onToggleLayoutMode,
  tabAccess = null,
  onRetryTabs,
}: DesktopSidebarProps) {
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

  const activeBranch = branches.find((b) => b.id === currentBranch) || branches[0] || {
    id: currentBranch,
    name: `Chi nhánh ${currentBranch}`,
    code: currentBranch,
  };

  const mainNavItems = [
    {
      id: "home" as NavTabId,
      label: "Tổng quan",
      icon: LayoutDashboard,
      badge: 0,
    },
  ];

  const erpSections = [
    {
      title: "Mua hàng",
      items: [
        { id: "purchase-requests" as NavTabId, label: "Đề nghị mua hàng (PR)", icon: FileText },
        { id: "purchase-approvals" as NavTabId, label: "Duyệt đề nghị mua", icon: CheckCircle2 },
        { id: "purchase-orders" as NavTabId, label: "Đặt mua hàng", icon: ShoppingBag },
      ],
    },
    {
      title: "Bán hàng & SA/PM",
      items: [
        { id: "sales-orders" as NavTabId, label: "Quản lý đơn hàng", icon: ShoppingBag },
        { id: "sales-order-pm" as NavTabId, label: "PM xử lý đơn hàng", icon: UserCheck },
        { id: "sales-order-sa" as NavTabId, label: "SA xử lý đơn hàng", icon: ClipboardList },
      ],
    },
    {
      title: "Điều chuyển nội bộ (7 bước)",
      items: [
        { id: "internal-transfer-requests" as NavTabId, label: "Đề nghị điều chuyển", icon: ArrowRightLeft },
        { id: "internal-transfer-pm" as NavTabId, label: "PM duyệt điều chuyển", icon: UserCheck },
        { id: "internal-transfer-batches" as NavTabId, label: "Đợt điều chuyển", icon: Boxes },
        { id: "internal-transfer-tech" as NavTabId, label: "Kỹ thuật điều chuyển", icon: Wrench },
        { id: "internal-transfer-sa" as NavTabId, label: "SA duyệt điều chuyển", icon: ClipboardList },
        { id: "internal-transfer-accounting" as NavTabId, label: "Kế toán điều chuyển", icon: FileText },
        { id: "internal-transfer-warehouse-out" as NavTabId, label: "Kho xuất điều chuyển", icon: Truck },
        { id: "internal-transfer-warehouse-in" as NavTabId, label: "Kho nhận điều chuyển", icon: PackageCheck },
      ],
    },
    {
      title: "Mã vạch & Quét QR",
      items: [
        { id: "warehouse-qr" as NavTabId, label: "Quét QR xuất kho", icon: QrCode },
        { id: "sales-qr" as NavTabId, label: "Quét QR xuất bán", icon: QrCode },
      ],
    },
    {
      title: "Thiết bị & Bảo hành",
      items: [
        { id: "machine-movements" as NavTabId, label: "Bàn giao di chuyển máy", icon: Truck },
        { id: "machine-repairs" as NavTabId, label: "Sửa chữa bảo hành máy", icon: Wrench },
      ],
    },
  ];

  return (
    <aside className="w-72 shrink-0 h-screen sticky top-0 flex flex-col bg-white dark:bg-neutral-900 border-r border-neutral-200/80 dark:border-neutral-800 transition-colors z-30 shadow-xs select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-neutral-100 dark:border-neutral-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-full flex items-center justify-center">
              <MedcomLogo alt="MEDCOMTECH" width={144} height={52} className="h-full w-full object-contain" priority />
            </div>
          </div>

          {onToggleLayoutMode && (
            <button
              type="button"
              onClick={onToggleLayoutMode}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Chuyển sang thanh điều hướng ngang (Top Header)"
            >
              <PanelLeftClose className="size-5" />
            </button>
          )}
        </div>

        {/* Dynamic Branch Selector Dropdown */}
        <div className="relative mt-3">
          <button
            type="button"
            onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/80 dark:bg-neutral-800/60 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm font-semibold text-neutral-800 dark:text-neutral-200 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="size-3.5 text-brand-600 shrink-0" />
              <span className="truncate">{activeBranch.name}</span>
            </div>
            <ChevronDown
              className={`size-3 text-neutral-400 transition-transform shrink-0 ml-1 ${
                branchDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {branchDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setBranchDropdownOpen(false)}
              />
              <div className="absolute left-0 mt-1.5 w-full rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl p-1.5 z-50 animate-uui-fade-in max-h-60 overflow-y-auto">
                <div className="px-2.5 py-1.5 border-b border-neutral-100 dark:border-neutral-800 text-sm">
                  <p className="font-bold text-neutral-900 dark:text-white">Chi nhánh ERP</p>
                  <p className="text-xs text-neutral-400">Chọn chi nhánh làm việc</p>
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
                        className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-sm transition-colors ${
                          isSelected
                            ? "bg-brand-100 dark:bg-brand-800 text-black dark:text-white font-bold"
                            : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                        }`}
                      >
                        <span className="truncate">{b.name}</span>
                        {isSelected && (
                          <Check className="size-3.5 text-brand-600 shrink-0 ml-1.5" />
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

      {/* Primary Action Button */}
      <div className="px-3 pt-3">
        <UntitledButton
          variant="primary"
          size="md"
          fullWidth
          onClick={onOpenQuickCreate}
          iconLeading={<Plus className="size-5" />}
        >
          Đề nghị mới
        </UntitledButton>
      </div>

      {/* Navigation Scrollable Body */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4 scrollbar-thin">
        {/* Core Modules */}
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 px-2 block mb-1">
            Chức năng chính
          </span>
          {mainNavItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all cursor-pointer ${
                  isActive
                    ? "bg-brand-100 dark:bg-brand-800 text-black dark:text-white ring-1 ring-inset ring-brand-300 dark:ring-brand-500 font-bold"
                    : "font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`size-5 shrink-0 ${
                      isActive ? "text-current" : "text-neutral-400"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-xs font-bold shrink-0 ${
                      isActive
                        ? "bg-brand-200 dark:bg-brand-800 text-brand-900 dark:text-brand-200"
                        : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ERP Modules (19 Screens) */}
        {tabAccess?.allowed == null ? (
          <div className="space-y-1 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 px-2 block mb-1">
              Màn hình ERP
            </span>
            {tabAccess?.error ? (
              <button
                type="button"
                onClick={onRetryTabs}
                className="w-full px-3 py-2 rounded-xl text-sm font-semibold text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 hover:bg-brand-50 dark:hover:bg-brand-950/40"
              >
                Không tải được quyền. Bấm để thử lại.
              </button>
            ) : (
              <p className="px-3 py-2 text-sm text-neutral-400">Đang tải quyền màn hình...</p>
            )}
          </div>
        ) : (
        erpSections
          .map((sec) => ({ ...sec, items: sec.items.filter((item) => (tabAccess.allowed as readonly string[]).includes(item.id)) }))
          .filter((sec) => sec.items.length > 0)
          .map((sec) => (
          <div key={sec.title} className="space-y-1 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 px-2 block mb-1">
              {sec.title}
            </span>
            {sec.items.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all cursor-pointer ${
                    isActive
                      ? "bg-brand-100 dark:bg-brand-800 text-black dark:text-white ring-1 ring-inset ring-brand-300 dark:ring-brand-500 font-bold"
                      : "font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  }`}
                >
                  <Icon
                    className={`size-5 shrink-0 ${
                      isActive ? "text-current" : "text-neutral-400"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        )))}

        {/* Settings */}
        <div className="space-y-1 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
          <a href="/help" target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
            <BookOpen className="size-5 shrink-0 text-neutral-400" />
            <span>Hướng dẫn sử dụng</span>
          </a>
          <button
            type="button"
            aria-current={activeTab === "settings" ? "page" : undefined}
            onClick={() => onTabChange("settings")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all cursor-pointer ${
              activeTab === "settings"
                ? "bg-brand-100 dark:bg-brand-800 text-black dark:text-white ring-1 ring-inset ring-brand-300 dark:ring-brand-500 font-bold"
                : "font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            }`}
          >
            <Settings2
              className={`size-5 shrink-0 ${
                activeTab === "settings" ? "text-current" : "text-neutral-400"
              }`}
            />
            <span className="truncate">Cài đặt hệ thống</span>
          </button>
        </div>
      </nav>

      {/* User Footer Profile & Actions */}
      <div className="p-3 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 space-y-2">
        <div className="flex items-center justify-between px-1">
          {/* Quick Actions (Notifications, Theme) */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onNotificationsClick}
              className="relative p-1.5 rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
              title="Thông báo"
            >
              <Bell className="size-5" />
              {unreadNotifications > 0 && (
                <span className="absolute top-1 right-1 size-2 rounded-full bg-brand-600 ring-2 ring-white dark:ring-neutral-900" />
              )}
            </button>

            <button
              type="button"
              onClick={onToggleDarkMode}
              className="p-1.5 rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
              title="Đổi màu giao diện sáng / tối"
            >
              {isDarkMode ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={onLogout}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            title="Đăng xuất"
          >
            <LogOut className="size-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="flex items-center gap-2.5 p-1.5 rounded-xl bg-white dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60">
          <div className="size-8 rounded-lg bg-gradient-to-tr from-brand-700 to-brand-500 text-white font-bold text-sm flex items-center justify-center shrink-0">
            {userName.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-neutral-900 dark:text-white leading-tight truncate">
              {userName}
            </p>
            <p className="text-xs text-neutral-400 leading-tight truncate mt-0.5">
              {userRole}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
