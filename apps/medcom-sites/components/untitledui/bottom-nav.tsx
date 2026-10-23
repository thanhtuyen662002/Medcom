"use client";

import React from "react";
import { LayoutDashboard, FileText, PackageCheck, Menu } from "lucide-react";

import { type ErpScreenModule } from "@/lib/erp/proxy-policy";

export type NavTabId =
  | "home"
  | "orders"
  | "purchases"
  | "inbound"
  | "scan"
  | "settings"
  | ErpScreenModule;

export interface UntitledBottomNavProps {
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
  onOpenMenu?: () => void;
  pendingOrdersCount?: number;
  pendingPurchasesCount?: number;
  pendingInboundCount?: number;
  menuOpen?: boolean;
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
  pendingPurchasesCount = 0,
  pendingInboundCount = 0,
  menuOpen = false,
}: UntitledBottomNavProps) {
  const tabs: TabItem[] = [
    {
      id: "home",
      label: "Tổng quan",
      icon: LayoutDashboard,
      badge: 0,
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
      className="fixed bottom-0 left-0 right-0 z-40 w-full bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border-t border-neutral-200/90 dark:border-neutral-800/90 px-2 pt-1 pb-[calc(0.25rem_+_env(safe-area-inset-bottom))] shadow-lg transition-colors"
      aria-label="Thanh điều hướng ứng dụng di động"
    >
      <div className="flex items-center justify-around gap-1 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === "menu" ? !["home", "purchases", "inbound"].includes(activeTab) : activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              data-tab={tab.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              aria-expanded={tab.id === "menu" ? menuOpen : undefined}
              aria-haspopup={tab.id === "menu" ? "dialog" : undefined}
              onClick={() => {
                if (tab.id === "menu") {
                  onOpenMenu?.();
                } else {
                  onTabChange(tab.id as NavTabId);
                }
              }}
              className={`relative flex min-h-14 min-w-11 flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-colors duration-150 flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                isActive
                  ? "bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 font-semibold"
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
                  <span className="absolute -top-1.5 -right-3 min-w-5 h-5 px-1 rounded-full bg-brand-600 dark:bg-brand-500 text-white text-xs font-semibold flex items-center justify-center ring-2 ring-white dark:ring-neutral-900">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </div>
              <span className="mt-1 max-w-full text-xs truncate leading-tight">
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 w-3 h-0.5 rounded-full bg-brand-600 dark:bg-brand-400" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
