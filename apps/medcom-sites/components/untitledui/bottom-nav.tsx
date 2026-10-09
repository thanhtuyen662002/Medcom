"use client";

import React from "react";
import { LayoutDashboard, ShoppingBag, FileText, PackageCheck, Settings2 } from "lucide-react";

export type NavTabId = "home" | "orders" | "purchases" | "inbound" | "scan" | "settings";

export interface UntitledBottomNavProps {
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
  pendingOrdersCount?: number;
  pendingPurchasesCount?: number;
  pendingInboundCount?: number;
}

interface TabItem {
  id: NavTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge: number;
  isCenter?: boolean;
}

export function UntitledBottomNav({
  activeTab,
  onTabChange,
  pendingOrdersCount = 2,
  pendingPurchasesCount = 8,
  pendingInboundCount = 3,
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
      label: "Đơn hàng",
      icon: ShoppingBag,
      badge: pendingOrdersCount,
    },
    {
      id: "purchases",
      label: "Đề nghị",
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
      id: "settings",
      label: "Cài đặt",
      icon: Settings2,
      badge: 0,
    },
  ];

  return (
    <nav
      className="sticky bottom-0 left-0 right-0 z-40 w-full bg-white/95 dark:bg-neutral-900/95 backdrop-blur-lg border-t border-neutral-200/80 dark:border-neutral-800/80 px-2 pt-1 pb-3 transition-all mt-auto"
      aria-label="Thanh điều hướng ứng dụng"
    >
      <div className="flex items-center justify-around gap-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          if (tab.isCenter) {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className="group relative -top-3.5 flex flex-col items-center justify-center focus:outline-none"
                aria-label={tab.label}
              >
                <div
                  className={`size-13 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-200 ${
                    isActive
                      ? "bg-purple-600 text-white ring-4 ring-purple-100 dark:ring-purple-950 scale-105 shadow-purple-500/30"
                      : "bg-neutral-900 dark:bg-purple-600 text-white hover:scale-102 active:scale-95"
                  }`}
                >
                  <Icon className="size-6 stroke-[2.2]" />
                </div>
                <span
                  className={`mt-1 text-[10px] font-semibold tracking-tight transition-colors ${
                    isActive ? "text-purple-600 dark:text-purple-400" : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              data-tab={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
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
                  <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-neutral-900 animate-pulse">
                    {tab.badge}
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
