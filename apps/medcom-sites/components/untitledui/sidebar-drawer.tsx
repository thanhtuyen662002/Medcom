"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  LayoutDashboard,
  ShoppingBag,
  FileText,
  PackageCheck,
  QrCode,
  Boxes,
  Truck,
  Thermometer,
  Pill,
  Users,
  BarChart3,
  Settings2,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { type NavTabId } from "./bottom-nav";

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
}

interface NavSection {
  title: string;
  items: {
    id: NavTabId | string;
    label: string;
    description?: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string;
    badgeColor?: "purple" | "emerald" | "amber" | "neutral";
    isExternal?: boolean;
    disabled?: boolean;
  }[];
}

export function SidebarDrawer({
  open,
  onClose,
  activeTab,
  onSelectTab,
  userName = "Dược sĩ Minh",
  userRole = "Trưởng phòng Cung ứng",
  currentBranch = "CN01",
  branchName = "Kho Dược Trung Tâm",
  isDarkMode = false,
  onToggleDarkMode,
  onLogout,
  pendingOrdersCount = 0,
  pendingPurchasesCount = 0,
  pendingInboundCount = 0,
}: SidebarDrawerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || !mounted) return null;

  const sections: NavSection[] = [
    {
      title: "Phân hệ Nghiệp vụ Chính",
      items: [
        {
          id: "home",
          label: "Tổng quan Dashboard",
          description: "Chỉ số KPI, tiến độ & cảnh báo",
          icon: LayoutDashboard,
        },
        {
          id: "orders",
          label: "Đơn mua hàng (PO)",
          description: "19 trường header & 12 cột chi tiết",
          icon: ShoppingBag,
          badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined,
          badgeColor: "purple",
        },
        {
          id: "purchases",
          label: "Phiếu đề nghị mua (PR)",
          description: "14 trường header & 9 cột chi tiết",
          icon: FileText,
          badge: pendingPurchasesCount > 0 ? pendingPurchasesCount : undefined,
          badgeColor: "purple",
        },
        {
          id: "inbound",
          label: "Yêu cầu nhập kho Dược",
          description: "37 trường header & 25 cột chi tiết",
          icon: PackageCheck,
          badge: pendingInboundCount > 0 ? pendingInboundCount : undefined,
          badgeColor: "emerald",
        },
        {
          id: "scan",
          label: "Quét mã QR Thuốc & Vật tư",
          description: "Đọc chuẩn mã vạch GSP Dược điển",
          icon: QrCode,
          badge: "Camera",
          badgeColor: "purple",
        },
      ],
    },
    {
      title: "Kho Dược & Điều chuyển (Mở rộng)",
      items: [
        {
          id: "inventory",
          label: "Kiểm kê kho & Hạn dùng",
          description: "Cảnh báo thuốc cận hạn & tồn kho",
          icon: Boxes,
          badge: "Sắp có",
          badgeColor: "neutral",
        },
        {
          id: "transfer",
          label: "Xuất kho điều chuyển",
          description: "Điều phối thuốc giữa các chi nhánh",
          icon: Truck,
          badge: "Sắp có",
          badgeColor: "neutral",
        },
        {
          id: "cold_chain",
          label: "Giám sát nhiệt độ kho GSP",
          description: "Theo dõi cảm biến kho lạnh 2-8°C",
          icon: Thermometer,
          badge: "Chuẩn GSP",
          badgeColor: "emerald",
        },
      ],
    },
    {
      title: "Danh mục & Báo cáo",
      items: [
        {
          id: "medicines_catalog",
          label: "Danh mục Thuốc & Vật tư",
          description: "Kho dữ liệu 116 cột nguồn ERP",
          icon: Pill,
          badge: "116 cột",
          badgeColor: "purple",
        },
        {
          id: "partners",
          label: "Đối tác & Nhà cung cấp",
          description: "Nhà sản xuất, đơn vị ủy quyền",
          icon: Users,
        },
        {
          id: "reports",
          label: "Báo cáo phân tích chi phí",
          description: "Biểu đồ chi tiêu & tiến độ giao hàng",
          icon: BarChart3,
        },
      ],
    },
    {
      title: "Hệ thống & Tài khoản",
      items: [
        {
          id: "settings",
          label: "Cài đặt hệ thống",
          description: "Cấu hình theme, bảo mật & phiên làm việc",
          icon: Settings2,
        },
      ],
    },
  ];

  const handleItemClick = (id: string) => {
    if (id === "home" || id === "orders" || id === "purchases" || id === "inbound" || id === "scan" || id === "settings") {
      onSelectTab(id as NavTabId);
      onClose();
    } else {
      // Notification for roadmap tabs
      alert(`Phân hệ "${id}" đang được đồng bộ dữ liệu theo lộ trình Production ERP Goal #45.`);
    }
  };

  const isDarkActive =
    isDarkMode ||
    (typeof document !== "undefined" &&
      (document.documentElement.classList.contains("dark") ||
        document.body.classList.contains("dark")));

  const content = (
    <div
      className={`fixed inset-0 z-50 overflow-hidden flex ${
        isDarkActive ? "dark" : ""
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Menu phân hệ ứng dụng"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-neutral-950/65 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Left Drawer Container */}
      <div className="relative z-10 w-84 sm:w-96 max-w-[85vw] h-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white border-r border-neutral-200/90 dark:border-neutral-800 shadow-2xl flex flex-col animate-uui-slide-in-left">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/70 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-10 rounded-2xl bg-gradient-to-tr from-purple-700 to-purple-500 text-white flex items-center justify-center font-extrabold text-base shadow-sm ring-2 ring-purple-100 dark:ring-purple-950 shrink-0">
              M
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white truncate">
                  MEDCOM ERP
                </h3>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-600/20">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                Quản lý Cung ứng & Kho Dược
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Đóng menu"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* User Card info */}
        <div className="px-4 py-3 bg-purple-50/40 dark:bg-purple-950/20 border-b border-purple-100/60 dark:border-purple-900/30 flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
              {userName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                {userName}
              </p>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                {userRole} · <span className="font-semibold text-purple-700 dark:text-purple-300">{currentBranch}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] px-2 py-0.5 rounded-lg bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200/80 dark:border-neutral-700 font-mono font-bold">
              {currentBranch}
            </span>
          </div>
        </div>

        {/* Scrollable Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 scrollbar-thin">
          {sections.map((section, sIdx) => (
            <div key={sIdx} className="space-y-1">
              <span className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block mb-1.5">
                {section.title}
              </span>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleItemClick(item.id)}
                      className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-all group ${
                        isActive
                          ? "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold border border-purple-200/80 dark:border-purple-800/80 shadow-2xs"
                          : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/70 border border-transparent font-medium"
                      }`}
                    >
                      <div
                        className={`size-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                          isActive
                            ? "bg-purple-600 text-white"
                            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 group-hover:text-purple-600 dark:group-hover:text-purple-300 group-hover:bg-purple-50 dark:group-hover:bg-purple-950/50"
                        }`}
                      >
                        <Icon className="size-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs truncate">{item.label}</span>
                          {item.badge !== undefined && (
                            <span
                              className={`px-1.5 py-0.2 text-[9px] font-bold rounded-full whitespace-nowrap ${
                                item.badgeColor === "emerald"
                                  ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                                  : item.badgeColor === "purple"
                                  ? "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300"
                                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate font-normal">
                            {item.description}
                          </p>
                        )}
                      </div>

                      <ChevronRight
                        className={`size-3.5 text-neutral-300 dark:text-neutral-600 shrink-0 group-hover:translate-x-0.5 transition-transform ${
                          isActive ? "text-purple-600 dark:text-purple-400" : ""
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions (Theme toggle & Logout) */}
        <div className="p-3 bg-neutral-50/90 dark:bg-neutral-950/90 border-t border-neutral-200/80 dark:border-neutral-800 space-y-2">
          {onToggleDarkMode && (
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                {isDarkMode ? (
                  <Moon className="size-4 text-purple-400" />
                ) : (
                  <Sun className="size-4 text-amber-500" />
                )}
                <span>{isDarkMode ? "Giao diện tối (Dark)" : "Giao diện sáng (Light)"}</span>
              </div>
              <span className="text-[10px] text-neutral-400">Đổi theme</span>
            </button>
          )}

          {onLogout && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs font-bold text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950 transition-colors"
            >
              <LogOut className="size-3.5" />
              <span>Đăng xuất tài khoản</span>
            </button>
          )}

          <div className="text-center pt-1">
            <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
              Medcom ERP v2026.1 · Full 116 Fields Active
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
