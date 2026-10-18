"use client";

import React, { useEffect, useState } from "react";
import { MedcomLogo } from "@/components/brand/medcom-logo";
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
  CheckCircle2,
  ArrowRightLeft,
  UserCheck,
  ClipboardList,
  Wrench,
  BookOpen,
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
  /** Quyền màn hình từ /api/erp/permissions; allowed null = chưa có quyền. */
  tabAccess?: { loading: boolean; error: boolean; allowed: readonly string[] | null } | null;
  onRetryTabs?: () => void;
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
  tabAccess = null,
  onRetryTabs,
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
      ],
    },
    {
      title: "Mua hàng",
      items: [
        {
          id: "purchase-requests",
          label: "Đề nghị mua hàng (PR)",
          description: "Menu 05011 • AP_PurposeRequestListFrm",
          icon: FileText,
          badge: "Mới",
          badgeColor: "emerald",
        },
        {
          id: "purchase-approvals",
          label: "Duyệt đề nghị mua hàng",
          description: "Menu 05012 • Duyệt & Không duyệt",
          icon: CheckCircle2,
          badge: "Quy trình",
          badgeColor: "purple",
        },
        {
          id: "purchase-orders",
          label: "Đặt mua hàng",
          description: "Menu 050129 • AP_OrderFrm",
          icon: ShoppingBag,
          badge: "CUD",
          badgeColor: "purple",
        },
      ],
    },
    {
      title: "Quản lý Bán hàng & SA/PM",
      items: [
        {
          id: "sales-orders",
          label: "Quản lý đơn hàng",
          description: "Menu 0600201 • Gửi PM, thu hồi & hợp đồng",
          icon: ShoppingBag,
          badge: "CUD",
          badgeColor: "purple",
        },
        {
          id: "sales-order-pm",
          label: "PM xử lý đơn hàng",
          description: "Menu 060021 • Gửi SA, Từ chối, Hợp đồng",
          icon: UserCheck,
          badge: "Xử lý PM",
          badgeColor: "purple",
        },
        {
          id: "sales-order-sa",
          label: "SA xử lý đơn hàng",
          description: "Menu 060022 • Gửi Kế toán/Kỹ thuật, Trả về",
          icon: ClipboardList,
          badge: "Duyệt SA",
          badgeColor: "purple",
        },
      ],
    },
    {
      title: "Điều chuyển nội bộ (Toàn trình 7 bước)",
      items: [
        {
          id: "internal-transfer-requests",
          label: "Đề nghị điều chuyển",
          description: "Menu 07010100 • Điều chuyển giữa các chi nhánh",
          icon: ArrowRightLeft,
          badge: "CUD",
          badgeColor: "purple",
        },
        {
          id: "internal-transfer-pm",
          label: "PM duyệt điều chuyển",
          description: "Menu 07010110 • Xác nhận & Từ chối PM",
          icon: UserCheck,
          badge: "Bước 1",
          badgeColor: "purple",
        },
        {
          id: "internal-transfer-batches",
          label: "Đợt điều chuyển",
          description: "Menu 07010120 • Đồng bộ đề nghị & Gửi kỹ thuật",
          icon: Boxes,
          badge: "Bước 2",
          badgeColor: "purple",
        },
        {
          id: "internal-transfer-tech",
          label: "Kỹ thuật điều chuyển",
          description: "Menu 07010130 • Kiểm định thiết bị & Gửi SA",
          icon: Wrench,
          badge: "Bước 3",
          badgeColor: "purple",
        },
        {
          id: "internal-transfer-sa",
          label: "SA duyệt điều chuyển",
          description: "Menu 07010140 • Duyệt số lượng & Gửi kế toán",
          icon: ClipboardList,
          badge: "Bước 4",
          badgeColor: "purple",
        },
        {
          id: "internal-transfer-accounting",
          label: "Kế toán điều chuyển",
          description: "Menu 07010150 • Phiếu xuất & Gửi kho nguồn",
          icon: FileText,
          badge: "Bước 5",
          badgeColor: "purple",
        },
        {
          id: "internal-transfer-warehouse-out",
          label: "Kho nguồn điều chuyển",
          description: "Menu 07010160 • Xuất điều chuyển / Dispatch",
          icon: Truck,
          badge: "Bước 6",
          badgeColor: "purple",
        },
        {
          id: "internal-transfer-warehouse-in",
          label: "Kho đích điều chuyển",
          description: "Menu 07010170 • Xác nhận nhận hàng / Receive",
          icon: PackageCheck,
          badge: "Bước 7",
          badgeColor: "emerald",
        },
      ],
    },
    {
      title: "Quét QR Xuất kho & Xuất bán",
      items: [
        {
          id: "warehouse-qr",
          label: "Quét QR xuất kho",
          description: "Menu 0702001 • Quét thêm & quét xóa mã lô",
          icon: QrCode,
          badge: "26 đối chiếu",
          badgeColor: "emerald",
        },
        {
          id: "sales-qr",
          label: "Quét QR xuất bán hàng",
          description: "Menu 0702010 • Quét thêm/xóa & đối chiếu hóa đơn",
          icon: Boxes,
          badge: "49 đối chiếu",
          badgeColor: "emerald",
        },
      ],
    },
    {
      title: "Thiết bị & Máy móc Y tế",
      items: [
        {
          id: "machine-movements",
          label: "Bàn giao & di chuyển máy",
          description: "Menu 1207 • Theo dõi luân chuyển thiết bị y tế",
          icon: Building2,
          badge: "18 trường",
          badgeColor: "purple",
        },
        {
          id: "machine-repairs",
          label: "Sửa chữa & bảo trì máy",
          description: "Menu 1209 • Quản lý bảo hành, phụ tùng thay thế",
          icon: ShieldCheck,
          badge: "22 trường",
          badgeColor: "purple",
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
    onSelectTab(id as NavTabId);
    onClose();
  };

  const isDarkActive =
    isDarkMode ||
    (typeof document !== "undefined" &&
      (document.documentElement.classList.contains("dark") ||
        document.body.classList.contains("dark")));

  const content = (
    <div
      className={`fixed inset-0 z-50 overflow-hidden flex ${isDarkActive ? "dark" : ""
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
            <div className="h-10 w-24 flex items-center justify-center shrink-0">
              <MedcomLogo alt="MEDCOMTECH" width={176} height={64} className="h-full w-full object-contain" priority />
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
        <div className="px-4 py-3 bg-brand-50/40 dark:bg-brand-950/20 border-b border-brand-100/60 dark:border-brand-900/30 flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-brand-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
              {userName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                {userName}
              </p>
              <p className="text-[13px] text-neutral-500 dark:text-neutral-400 truncate">
                {userRole} · <span className="font-semibold text-brand-700 dark:text-brand-300">{currentBranch}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[13px] px-2 py-0.5 rounded-lg bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200/80 dark:border-neutral-700 font-mono font-bold">
              {currentBranch}
            </span>
          </div>
        </div>

        {/* Scrollable Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 scrollbar-thin">
          {tabAccess?.allowed == null ? (
            <div className="space-y-1">
              <span className="px-2.5 text-[13px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block mb-1.5">
                Màn hình ERP
              </span>
              {tabAccess?.error ? (
                <button
                  type="button"
                  onClick={onRetryTabs}
                  className="w-full px-2.5 py-2 rounded-xl text-xs font-semibold text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800"
                >
                  Không tải được quyền. Bấm để thử lại.
                </button>
              ) : (
                <p className="px-2.5 py-2 text-xs text-neutral-400">Đang tải quyền màn hình...</p>
              )}
            </div>
          ) : (
            sections
              .map((section) => ({
                ...section,
                items: section.items.filter((item) => (tabAccess.allowed as readonly string[]).includes(item.id)),
              }))
              .filter((section) => section.items.length > 0)
              .map((section, sIdx) => (
                <div key={sIdx} className="space-y-1">
                  <span className="px-2.5 text-[13px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block mb-1.5">
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
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => handleItemClick(item.id)}
                          className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-all group ${isActive
                              ? "bg-brand-100 dark:bg-brand-800 text-black dark:text-white font-bold border border-brand-300 dark:border-brand-500"
                              : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/70 border border-transparent font-medium"
                            }`}
                        >
                          <div
                            className={`size-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${isActive
                                ? "bg-brand-600 text-white"
                                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 group-hover:text-brand-600 dark:group-hover:text-brand-300 group-hover:bg-brand-50 dark:group-hover:bg-brand-950/50"
                              }`}
                          >
                            <Icon className="size-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-sm truncate">{item.label}</span>
                              {item.badge !== undefined && (
                                <span
                                  className={`px-1.5 py-0.2 text-[9px] font-bold rounded-full whitespace-nowrap ${item.badgeColor === "emerald"
                                      ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                                      : item.badgeColor === "purple"
                                        ? "bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-300"
                                        : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                                    }`}
                                >
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-[13px] text-neutral-400 dark:text-neutral-500 truncate font-normal">
                                {item.description}
                              </p>
                            )}
                          </div>

                          <ChevronRight
                            className={`size-3.5 text-neutral-300 dark:text-neutral-600 shrink-0 group-hover:translate-x-0.5 transition-transform ${isActive ? "text-brand-600 dark:text-brand-400" : ""
                              }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )))}
        </div>

        {/* Footer Actions (Theme toggle & Logout) */}
        <div className="p-3 bg-neutral-50/90 dark:bg-neutral-950/90 border-t border-neutral-200/80 dark:border-neutral-800 space-y-2">
          <a href="/help" target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-2 px-3 py-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            <BookOpen className="size-4 text-brand-600" />
            <span>Hướng dẫn sử dụng</span>
          </a>
          {onToggleDarkMode && (
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                {isDarkMode ? (
                  <Moon className="size-4 text-brand-400" />
                ) : (
                  <Sun className="size-4 text-amber-500" />
                )}
                <span>{isDarkMode ? "Giao diện tối (Dark)" : "Giao diện sáng (Light)"}</span>
              </div>
              <span className="text-[13px] text-neutral-400">Đổi theme</span>
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
            <p className="text-[13px] text-neutral-400 dark:text-neutral-500">
              Medcom ERP v2026.1 · Full 116 Fields Active
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
