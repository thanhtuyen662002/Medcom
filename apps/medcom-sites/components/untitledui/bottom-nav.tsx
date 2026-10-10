"use client";

import React from "react";
import { LayoutDashboard, ShoppingBag, FileText, PackageCheck, Menu } from "lucide-react";

export type NavTabId = "home" | "orders" | "purchases" | "inbound" | "scan" | "settings";

export interface UntitledBottomNavProps {
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
  onOpenMenu?: () => void;
  pendingOrdersCount?: number;
  pendingPurchasesCount?: number;
  pendingInboundCount?: number;
}

interface TabItem {
  id: NavTabId | "menu";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge: number;
}

export function UntitledBottomNav({
  activeTab,
  onTabChange,
  onOpenMenu,
  pendingOrdersCount = 0,
  pendingPurchasesCount = 0,
  pendingInboundCount = 0,
}: UntitledBottomNavProps) {
  const tabs: TabItem[] = [
    {
      id: "home",
      label: "Tổng quan",
      icon: LayoutDashboard,
      badge: 0,
    },
    {
      id: "orders",
      label: "Đơn hàng PO",
      icon: ShoppingBag,
      badge: pendingOrdersCount,
    },
    {
      id: "purchases",
      label: "Đề nghị PR",
      icon: FileText,
      badge: pendingPurchasesCount,
    },
    {
      id: "inbound",
      label: "Nhập kho",
      icon: PackageCheck,
      badge: pendingInboundCount,
    },
    {
      id: "menu",
      label: "Menu",
      icon: Menu,
      badge: 0,
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 w-full bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border-t border-neutral-200/90 dark:border-neutral-800/90 px-2 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg transition-all"
      aria-label="Thanh điều hướng ứng dụng di động"
    >
      <div className="flex items-center justify-around gap-1 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              data-tab={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === "menu") {
                  onOpenMenu?.();
                } else {
                  onTabChange(tab.id as NavTabId);
                }
              }}
              className={`relative flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all duration-150 active:scale-95 flex-1 min-w-0 ${
                isActive
                  ? "text-purple-600 dark:text-purple-400 font-semibold"
                  : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 font-medium"
              }`}
            >
              <div className="relative">
                <Icon
                  className={`size-5 transition-transform duration-150 ${
                    isActive ? "scale-110 stroke-[2.4]" : "stroke-[1.8]"
                  }`}
                />
                {tab.badge > 0 && (
                  <span className="absolute -top-1 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-neutral-900 shadow-xs">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </div>
              <span className="mt-1 text-[11px] truncate leading-tight">
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 w-3 h-0.5 rounded-full bg-purple-600 dark:bg-purple-400" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
