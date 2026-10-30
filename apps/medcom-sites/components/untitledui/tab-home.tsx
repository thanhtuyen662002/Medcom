"use client";

import React, { useState, useEffect, useRef } from "react";
import { Clock, PackageCheck, Building, FilePlus2, PackagePlus, QrCode, ChevronRight, ShoppingBag } from "lucide-react";
import { AppButton, RecordCard, ListState } from "@/components/app";
import { UntitledMetricCard } from "./metric-card";
import { MetricCardSkeleton } from "./skeleton";
import type { PurchaseItem } from "./tab-purchases";
import { erpStatusDisplay } from "@/lib/erp/status-chips";
import { formatDateTime } from "@/lib/erp/document-detail/format";
import { erpClient } from "@/lib/erp/erp-client";
import type { NavTabId } from "./bottom-nav";

export interface TabHomeProps {
  onNavigateTab: (tab: NavTabId) => void;
  onSelectPurchaseItem?: (item: PurchaseItem) => void;
  userName?: string;
  currentBranch?: string;
  ordersCount?: number;
  purchasesCount?: number;
  inboundCount?: number;
  isLoadingCounts?: boolean;
  isActive?: boolean;
}

export function TabHome({
  onNavigateTab,
  onSelectPurchaseItem,
  userName = "Dược sĩ phụ trách",
  currentBranch = "CN01",
  ordersCount = 0,
  purchasesCount = 0,
  inboundCount = 0,
  isLoadingCounts = false,
  isActive = true,
}: TabHomeProps) {
  const [pendingItems, setPendingItems] = useState<PurchaseItem[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const lastFetchedRef = useRef<{ branch: string; at: number } | null>(null);

  useEffect(() => {
    if (!isActive) return;
    if (
      lastFetchedRef.current &&
      lastFetchedRef.current.branch === currentBranch &&
      Date.now() - lastFetchedRef.current.at < 30000
    )
      return;
    let isCancelled = false;
    const branch = currentBranch;
    const fetchPending = async () => {
      setLoadingPending(true);
      try {
        // AP_PurchaseStatusTbl: 2 = "Chờ duyệt" (1 is "Nháp", not awaiting approval).
        const res = await erpClient.getErpModuleList("purchase-requests", { branchId: branch, page: 1, pageSize: 20, statusId: 2 });
        if (!isCancelled && res && res.rows) {
          const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
          const pending = res.rows
            .map((row): PurchaseItem => {
              const h = row.header ?? row;
              return {
                id: row.documentId, code: row.documentId,
                purpose: text(h.purposeDescOrClient) ?? text(h.notes) ?? "—",
                department: text(h.departmentName) ?? text(h.department) ?? "—",
                creator: text(h.personSuggestName) ?? text(h.personSuggest) ?? "—", branch,
                date: formatDateTime(text(h.purchaseDate) ?? undefined),
                totalAmount: "—", statusId: typeof h.statusId === "number" ? h.statusId : 2, statusName: text(h.statusName), lines: [],
                statusForeColor: text(h.statusForeColor), statusBackColor: text(h.statusBackColor),
              };
            });
          setPendingItems(pending);
          lastFetchedRef.current = { branch, at: Date.now() };
        } else if (!isCancelled) {
          setPendingItems([]);
        }
      } catch {
        if (!isCancelled) setPendingItems([]);
      } finally {
        if (!isCancelled) setLoadingPending(false);
      }
    };

    fetchPending();
    return () => {
      isCancelled = true;
    };
  }, [currentBranch, isActive]);

  return (
    <div className="min-w-0 space-y-5 pb-8 animate-uui-fade-in">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 text-white p-5 sm:p-6 shadow-xl">
        <div className="absolute -right-8 -top-8 size-40 rounded-full bg-brand-500/20 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-xs text-brand-200">
                Phiên bản Di động 2026
              </span>
              <span className="text-xs text-brand-300">· Hệ thống Dược GSP</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Xin chào, {userName}
            </h2>
            <p className="text-sm text-brand-200 max-w-md">
              Chi nhánh: <strong className="text-white">{currentBranch}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* KPI Metrics Grid (2x2 on Mobile, 4 col on Desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {isLoadingCounts ? (
          <MetricCardSkeleton count={4} />
        ) : (
          <>
            <UntitledMetricCard
              title="Đơn hàng PO"
              value={`${ordersCount} đơn`}
              icon={<ShoppingBag className="size-5" />}
              iconColor="brand"
              period=""
              onClick={() => onNavigateTab("orders")}
            />
            <UntitledMetricCard
              title="Đề nghị PR"
              value={`${purchasesCount} phiếu`}
              icon={<Clock className="size-5" />}
              iconColor="warning"
              change={loadingPending ? undefined : `${pendingItems.length} chờ duyệt`}
              changeType={pendingItems.length > 0 ? "warning" : "neutral"}
              period=""
              onClick={() => onNavigateTab("purchases")}
            />
            <UntitledMetricCard
              title="Nhập kho"
              value={`${inboundCount} phiếu`}
              icon={<PackageCheck className="size-5" />}
              iconColor="success"
              period=""
              onClick={() => onNavigateTab("inbound")}
            />
            <UntitledMetricCard
              title="Chi nhánh"
              value={currentBranch}
              icon={<Building className="size-5" />}
              iconColor="brand"
              period="Đổi trong Cài đặt"
              onClick={() => onNavigateTab("settings")}
            />
          </>
        )}
      </div>

      {/* Quick Actions (4 touch buttons) */}
      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">
            Thao tác nghiệp vụ nhanh
          </h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => onNavigateTab("orders")}
            className="flex min-h-11 flex-col items-center justify-center p-3 rounded-2xl bg-brand-50/80 dark:bg-brand-950/40 hover:bg-brand-100 dark:hover:bg-brand-900/40 border border-brand-100 dark:border-brand-900 active:scale-95 transition-all group"
          >
            <div className="size-11 rounded-xl bg-brand-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <ShoppingBag className="size-5" />
            </div>
            <span className="mt-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200 text-center leading-tight">
              Đơn hàng (PO)
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("purchases")}
            className="flex min-h-11 flex-col items-center justify-center p-3 rounded-2xl bg-brand-50/80 dark:bg-brand-950/40 hover:bg-brand-100 dark:hover:bg-brand-900/40 border border-brand-100 dark:border-brand-900 active:scale-95 transition-all group"
          >
            <div className="size-11 rounded-xl bg-brand-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <FilePlus2 className="size-5" />
            </div>
            <span className="mt-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200 text-center leading-tight">
              Đề nghị mua (PR)
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("inbound")}
            className="flex min-h-11 flex-col items-center justify-center p-3 rounded-2xl bg-brand-50/80 dark:bg-brand-950/40 hover:bg-brand-100 dark:hover:bg-brand-900/40 border border-brand-100 dark:border-brand-900 active:scale-95 transition-all group"
          >
            <div className="size-11 rounded-xl bg-brand-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <PackagePlus className="size-5" />
            </div>
            <span className="mt-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200 text-center leading-tight">
              Nhập kho GSP
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("scan")}
            className="flex min-h-11 flex-col items-center justify-center p-3 rounded-2xl bg-brand-50/80 dark:bg-brand-950/40 hover:bg-brand-100 dark:hover:bg-brand-900/40 border border-brand-100 dark:border-brand-900 active:scale-95 transition-all group"
          >
            <div className="size-11 rounded-xl bg-brand-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <QrCode className="size-5" />
            </div>
            <span className="mt-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200 text-center leading-tight">
              Quét tem barcode
            </span>
          </button>
        </div>
      </div>

      {/* Urgent Approval Queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              Cần xử lý phê duyệt
            </h3>
            <span className="size-5 rounded-full bg-brand-100 dark:bg-brand-950 text-brand-600 dark:text-brand-400 text-xs font-bold flex items-center justify-center">
              {pendingItems.length}
            </span>
          </div>
          <AppButton variant="ghost" onClick={() => onNavigateTab("purchases")}>
            Xem tất cả <ChevronRight aria-hidden="true" className="size-4" />
          </AppButton>
        </div>

        <div className="space-y-2.5">
          {loadingPending ? <ListState state="loading" /> : pendingItems.length === 0 ? (
            <ListState state="empty" empty={{ message: "Không có đề nghị chờ xử lý trên trang hiện tại." }} />
          ) : pendingItems.map(item => (
            <RecordCard key={item.id} code={item.code} title={item.purpose} meta={[item.date, item.department, item.creator]}
              status={{ ...erpStatusDisplay(item), statusForeColor: item.statusForeColor, statusBackColor: item.statusBackColor }}
              onOpen={() => onSelectPurchaseItem?.(item)} />
          ))}
        </div>
      </div>
    </div>
  );
}
