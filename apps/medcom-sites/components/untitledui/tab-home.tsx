"use client";

import React, { useState, useEffect } from "react";
import {
  Clock,
  PackageCheck,
  Building,
  FilePlus2,
  PackagePlus,
  QrCode,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  ShoppingBag,
  Inbox,
  RefreshCw,
} from "lucide-react";
import { UntitledMetricCard } from "./metric-card";
import { UntitledBadge } from "./badge";
import { MetricCardSkeleton, DocumentCardSkeleton } from "./skeleton";
import { erpClient } from "@/lib/erp/erp-client";
import type { NavTabId } from "./bottom-nav";

export interface TabHomeProps {
  onNavigateTab: (tab: NavTabId) => void;
  onOpenQuickCreate: () => void;
  onSelectPurchaseItem?: (item: any) => void;
  userName?: string;
  currentBranch?: string;
  ordersCount?: number;
  purchasesCount?: number;
  inboundCount?: number;
  isLoadingCounts?: boolean;
}

export function TabHome({
  onNavigateTab,
  onOpenQuickCreate,
  onSelectPurchaseItem,
  userName = "Dược sĩ phụ trách",
  currentBranch = "CN01",
  ordersCount = 0,
  purchasesCount = 0,
  inboundCount = 0,
  isLoadingCounts = false,
}: TabHomeProps) {
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [approvedIds, setApprovedIds] = useState<string[]>([]);

  useEffect(() => {
    let isCancelled = false;
    const fetchPending = async () => {
      setLoadingPending(true);
      try {
        const res = await erpClient.getPurchaseRequestsList(1, "", currentBranch);
        if (!isCancelled && res && res.list && res.list.rows) {
          const pending = res.list.rows
            .filter((r) => r.statusId === 1 || r.statusId === null)
            .map((r) => ({
              id: r.documentId,
              title: `Phiếu yêu cầu mua sắm [${r.documentId}]`,
              department: r.department || "Kho Dược GSP",
              creator: r.personSuggest || "Dược sĩ phụ trách",
              time: r.purchaseDate
                ? new Date(r.purchaseDate).toLocaleDateString("vi-VN")
                : "Hôm nay",
              amount: "Xem chi tiết",
              itemsCount: 1,
            }));
          setPendingItems(pending);
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
  }, [currentBranch]);

  const handleQuickApprove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setApprovedIds((prev) => [...prev, id]);
  };

  return (
    <div className="space-y-5 pb-24 animate-uui-fade-in">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-700 via-purple-800 to-indigo-950 text-white p-5 sm:p-6 shadow-xl">
        <div className="absolute -right-8 -top-8 size-40 rounded-full bg-purple-500/20 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-xs text-purple-200">
                Phiên bản Di động 2026
              </span>
              <span className="text-xs text-purple-300">· Hệ thống Dược GSP</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Xin chào, {userName} 👋
            </h2>
            <p className="text-xs sm:text-sm text-purple-200 max-w-md">
              Chi nhánh: <strong className="text-white">{currentBranch}</strong> · Hiện có{" "}
              <strong className="text-white underline">{ordersCount} đơn hàng PO</strong> và{" "}
              <strong className="text-white underline">{purchasesCount} phiếu đề nghị PR</strong>{" "}
              trong hệ thống.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateTab("orders")}
              className="px-3.5 py-2.5 rounded-xl bg-purple-600/60 hover:bg-purple-600 text-white font-bold text-xs sm:text-sm border border-purple-400/40 active:scale-95 transition-all flex items-center gap-2 shrink-0"
            >
              <ShoppingBag className="size-4" />
              Đơn hàng PO ({ordersCount})
            </button>
            <button
              type="button"
              onClick={onOpenQuickCreate}
              className="px-4 py-2.5 rounded-xl bg-white text-purple-900 font-bold text-xs sm:text-sm shadow-md hover:bg-purple-50 active:scale-95 transition-all flex items-center gap-2 shrink-0"
            >
              <FilePlus2 className="size-4 text-purple-700" />
              + Tạo đề nghị
            </button>
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
              change={ordersCount > 0 ? `${ordersCount} đơn` : "0 đơn"}
              changeType={ordersCount > 0 ? "warning" : "neutral"}
              period="trong kỳ"
              onClick={() => onNavigateTab("orders")}
            />
            <UntitledMetricCard
              title="Phiếu đề nghị PR"
              value={`${purchasesCount} phiếu`}
              icon={<Clock className="size-5" />}
              iconColor="warning"
              change={purchasesCount > 0 ? `${purchasesCount} phiếu` : "0 phiếu"}
              changeType={purchasesCount > 0 ? "warning" : "neutral"}
              period="trong kỳ"
              onClick={() => onNavigateTab("purchases")}
            />
            <UntitledMetricCard
              title="Nhập kho (Inbound)"
              value={`${inboundCount} phiếu`}
              icon={<PackageCheck className="size-5" />}
              iconColor="success"
              change={inboundCount > 0 ? `${inboundCount} phiếu` : "0 phiếu"}
              changeType={inboundCount > 0 ? "positive" : "neutral"}
              period="chuẩn GSP"
              onClick={() => onNavigateTab("inbound")}
            />
            <UntitledMetricCard
              title="Chi nhánh hiện hành"
              value={currentBranch}
              icon={<Building className="size-5" />}
              iconColor="brand"
              change="Trực tuyến"
              changeType="positive"
              period="kết nối ERP"
              onClick={() => onNavigateTab("settings")}
            />
          </>
        )}
      </div>

      {/* Quick Actions (4 touch buttons) */}
      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Thao tác nghiệp vụ nhanh
          </h3>
          <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
            Phân hệ Quản trị Dược
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => onNavigateTab("orders")}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-purple-50/80 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-100 dark:border-purple-900 active:scale-95 transition-all group"
          >
            <div className="size-11 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <ShoppingBag className="size-5" />
            </div>
            <span className="mt-2 text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 text-center leading-tight">
              Đơn hàng (PO)
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("purchases")}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-100 dark:border-blue-900 active:scale-95 transition-all group"
          >
            <div className="size-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <FilePlus2 className="size-5" />
            </div>
            <span className="mt-2 text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 text-center leading-tight">
              Đề nghị mua (PR)
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("inbound")}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-100 dark:border-emerald-900 active:scale-95 transition-all group"
          >
            <div className="size-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <PackagePlus className="size-5" />
            </div>
            <span className="mt-2 text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 text-center leading-tight">
              Nhập kho GSP
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("scan")}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-100 dark:border-amber-900 active:scale-95 transition-all group"
          >
            <div className="size-11 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <QrCode className="size-5" />
            </div>
            <span className="mt-2 text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 text-center leading-tight">
              Quét tem barcode
            </span>
          </button>
        </div>
      </div>

      {/* Urgent Approval Queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
              Cần xử lý phê duyệt
            </h3>
            <span className="size-5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 text-xs font-bold flex items-center justify-center">
              {pendingItems.filter((i) => !approvedIds.includes(i.id)).length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab("purchases")}
            className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5"
          >
            Xem tất cả <ChevronRight className="size-3.5" />
          </button>
        </div>

        <div className="space-y-2.5">
          {loadingPending ? (
            <DocumentCardSkeleton count={2} />
          ) : pendingItems.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 text-center space-y-2">
              <Inbox className="size-8 text-neutral-400 mx-auto stroke-[1.4]" />
              <p className="text-xs sm:text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                Không có chứng từ nào chờ duyệt
              </p>
              <p className="text-xs text-neutral-400">
                Tất cả các yêu cầu tại chi nhánh {currentBranch} đã được xử lý xong.
              </p>
            </div>
          ) : (
            pendingItems.map((item) => {
              const isApproved = approvedIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => onSelectPurchaseItem?.(item)}
                  className={`rounded-2xl border p-4 transition-all duration-200 cursor-pointer shadow-xs ${
                    isApproved
                      ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
                      : "bg-white dark:bg-neutral-900 border-neutral-200/80 dark:border-neutral-800 hover:border-purple-300 dark:hover:border-purple-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-neutral-500 dark:text-neutral-400">
                          {item.id}
                        </span>
                        {isApproved ? (
                          <UntitledBadge variant="success" size="sm" dot>
                            Đã phê duyệt
                          </UntitledBadge>
                        ) : (
                          <UntitledBadge variant="warning" size="sm" dot>
                            Chờ duyệt
                          </UntitledBadge>
                        )}
                        <span className="text-[10px] text-neutral-400">{item.time}</span>
                      </div>

                      <h4 className="mt-1 text-sm font-bold text-neutral-900 dark:text-white truncate">
                        {item.title}
                      </h4>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                        {item.department} · {item.creator}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold text-purple-700 dark:text-purple-300 block">
                        {item.amount}
                      </span>
                    </div>
                  </div>

                  {!isApproved && (
                    <div className="mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPurchaseItem?.(item);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                      >
                        Chi tiết
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleQuickApprove(item.id, e)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-colors flex items-center gap-1 active:scale-95"
                      >
                        <CheckCircle2 className="size-3.5" />
                        Duyệt nhanh
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
