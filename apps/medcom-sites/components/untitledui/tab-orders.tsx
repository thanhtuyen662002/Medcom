"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Filter,
  ShoppingBag,
  Calendar,
  Building,
  User,
  CheckCircle2,
  LockKeyhole,
  Lock,
  Printer,
  ChevronRight,
  RefreshCw,
  Package,
  Plus,
} from "lucide-react";
import { UntitledBadge } from "./badge";
import { UntitledButton } from "./button";
import { UntitledBottomSheet } from "./bottom-sheet";
import { DocumentCardSkeleton, DetailLinesSkeleton } from "./skeleton";
import { erpClient } from "@/lib/erp/erp-client";
import type { DocumentDetail, PurchaseOrderHeader, PurchaseOrderLineFields } from "@/lib/erp/contracts";
import { errorMessage } from "@/lib/erp/api";

function formatVND(value?: string | null, currency = "VND"): string {
  if (!value) return "0 " + currency;
  const parts = value.split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.length > 1 ? `${intPart},${parts[1]} ${currency}` : `${intPart} ${currency}`;
}

export interface OrderItem {
  documentId: string;
  documentDate: string;
  branchId: string;
  statusId: number | null;
  statusName: string;
  isLocked: boolean;
  supplier: string;
  creator: string;
  totalAmount: string;
  notes: string;
  memo?: string | null;
  deliverDate?: string | null;
  currencyId?: string;
  contractId?: string | null;
  purchaseOrderHeader?: PurchaseOrderHeader;
  lines: {
    lineId: string;
    itemId: string;
    itemName: string;
    unit: string;
    quantity: string;
    quantity2: string;
    unitPrice: string;
    amount: string;
    fields?: PurchaseOrderLineFields;
  }[];
}

export interface TabOrdersProps {
  currentBranch: string;
  isActive?: boolean;
  onCountChange?: (count: number) => void;
  onOpenCreateModal?: () => void;
}

export function TabOrders({ currentBranch, isActive = true, onCountChange, onOpenCreateModal }: TabOrdersProps) {
  const [search, setSearch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState(currentBranch || "");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [detailData, setDetailData] = useState<DocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const lastFetchedRef = useRef<number>(0);

  // Sync selected branch if prop changes
  useEffect(() => {
    if (currentBranch) {
      setSelectedBranch(currentBranch);
    }
  }, [currentBranch]);

  // Load orders from real backend
  const loadOrders = useCallback(
    async (isBackground = false) => {
      if (!isBackground) {
        if (orders.length === 0) setLoading(true);
        else setIsRefreshing(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        setError(null);
        const pageData = await erpClient.getDocumentsList(
          "purchase-orders",
          1,
          search,
          selectedBranch
        );

        if (pageData && pageData.rows) {
          const mapped: OrderItem[] = pageData.rows.map((r) => {
            const h = r.purchaseOrderHeader;
            const formattedTotal = h?.baseTotal
              ? formatVND(h.baseTotal, h.currencyId || "VND")
              : "Theo chi tiết đơn";

            return {
              documentId: r.documentId,
              documentDate: h?.documentDate ? h.documentDate.slice(0, 10) : (r.documentDate || "—"),
              branchId: r.branchId || selectedBranch || "CN01",
              statusId: r.statusId,
              statusName:
                r.statusName ||
                (r.statusId === 2
                  ? "Đã duyệt"
                  : r.statusId === 1
                  ? "Chờ phê duyệt"
                  : "Bản nháp"),
              isLocked: r.isLocked ?? false,
              supplier: h?.objectId ? `NCC: ${h.objectId}` : "Nhà cung cấp dược Medcom",
              creator: h?.userCreate || "Dược sĩ phụ trách",
              totalAmount: formattedTotal,
              notes: h?.notes || h?.memo || `Đơn đặt hàng ${r.documentId}`,
              memo: h?.memo,
              deliverDate: h?.deliverDate ? h.deliverDate.slice(0, 10) : null,
              currencyId: h?.currencyId || "VND",
              contractId: h?.contractId,
              purchaseOrderHeader: h,
              lines: [],
            };
          });

          setOrders(mapped);
          onCountChange?.(mapped.length);
          lastFetchedRef.current = Date.now();
        }
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [search, selectedBranch, orders.length, onCountChange]
  );

  // Fetch when search or branch changes
  useEffect(() => {
    loadOrders(false);
  }, [search, selectedBranch]);

  // Re-fetch when tab becomes active if stale > 30s
  useEffect(() => {
    if (isActive && Date.now() - lastFetchedRef.current > 30000) {
      loadOrders(true);
    }
  }, [isActive, loadOrders]);

  // Handle open order details
  const handleOpenDetail = async (order: OrderItem) => {
    setSelectedOrder(order);
    setDetailLoading(true);
    setDetailData(null);

    try {
      const detail = await erpClient.getDocumentDetail("purchase-orders", order.documentId);
      setDetailData(detail);

      if (detail && detail.purchaseOrderLines && detail.purchaseOrderLines.length > 0) {
        setSelectedOrder((prev) =>
          prev
            ? {
                ...prev,
                purchaseOrderHeader: detail.document.purchaseOrderHeader || prev.purchaseOrderHeader,
                lines: detail.purchaseOrderLines.map((l) => {
                  const f = l.fields;
                  const priceStr = f?.unitPrice ? formatVND(f.unitPrice, prev.currencyId || "VND") : "Theo hợp đồng";
                  const amtStr = f?.amount ? formatVND(f.amount, prev.currencyId || "VND") : "Theo hợp đồng";
                  return {
                    lineId: l.lineId,
                    itemId: l.itemId,
                    itemName: `Mã dược phẩm: ${l.itemId}`,
                    unit: f?.property2 || "Hộp/Đơn vị",
                    quantity: f?.quantity || l.quantity || "1",
                    quantity2: f?.quantity2 || l.quantity2 || "1",
                    unitPrice: priceStr,
                    amount: amtStr,
                    fields: f,
                  };
                }),
              }
            : prev
        );
      }
    } catch {
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // Filter orders
  const filtered = orders.filter((o) => {
    if (statusFilter === "pending") return o.statusId === 1;
    if (statusFilter === "approved") return o.statusId === 2;
    if (statusFilter === "completed") return o.statusId === 3;
    return true;
  });

  const getStatusBadge = (statusId: number | null, statusName?: string | null) => {
    if (statusId === 2) {
      return (
        <UntitledBadge variant="success" size="sm" dot>
          {statusName || "Đã duyệt"}
        </UntitledBadge>
      );
    }
    if (statusId === 3) {
      return (
        <UntitledBadge variant="blue" size="sm" dot>
          {statusName || "Hoàn tất"}
        </UntitledBadge>
      );
    }
    if (statusId === 1) {
      return (
        <UntitledBadge variant="warning" size="sm" dot>
          {statusName || "Chờ phê duyệt"}
        </UntitledBadge>
      );
    }
    return (
      <UntitledBadge variant="gray" size="sm">
        {statusName || "Bản nháp"}
      </UntitledBadge>
    );
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Search & Actions Bar */}
      <div className="space-y-2.5">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Tìm theo mã PO, nhà cung cấp, dược phẩm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
            />
          </div>

          <button
            type="button"
            onClick={() => loadOrders(false)}
            disabled={isRefreshing}
            className="p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors shrink-0 disabled:opacity-50"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin text-purple-600" : ""}`} />
          </button>

          <UntitledButton
            variant="primary"
            size="md"
            onClick={onOpenCreateModal || (() => alert("Mở form lập Đơn mua hàng (PO)..."))}
            iconLeading={<Plus className="size-4" />}
          >
            Tạo mới
          </UntitledButton>
        </div>

        {/* Filter Chips Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: "all", label: "Tất cả", count: orders.length },
            { id: "pending", label: "Chờ duyệt", count: orders.filter((o) => o.statusId === 1).length },
            { id: "approved", label: "Đã duyệt", count: orders.filter((o) => o.statusId === 2).length },
            { id: "completed", label: "Hoàn tất", count: orders.filter((o) => o.statusId === 3).length },
          ].map((chip) => {
            const isSelected = statusFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setStatusFilter(chip.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 ${
                  isSelected
                    ? "bg-purple-600 text-white shadow-xs"
                    : "bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border border-neutral-200/80 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                }`}
              >
                <span>{chip.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isSelected
                      ? "bg-purple-700 text-white"
                      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Orders List Container */}
      <div className="space-y-3">
        {error ? (
          <div className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/30 p-6 text-center space-y-3">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">{error}</p>
            <UntitledButton
              variant="secondary-gray"
              size="sm"
              onClick={() => loadOrders(false)}
              iconLeading={<RefreshCw className="size-3.5" />}
            >
              Thử lại
            </UntitledButton>
          </div>
        ) : loading ? (
          <>
            <DocumentCardSkeleton />
            <DocumentCardSkeleton />
            <DocumentCardSkeleton />
            <DocumentCardSkeleton />
          </>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center space-y-3">
            <div className="size-12 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto">
              <ShoppingBag className="size-6 stroke-[1.8]" />
            </div>
            <div>
              <p className="text-sm font-bold text-neutral-900 dark:text-white">
                Chưa có đơn đặt hàng PO nào
              </p>
              <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
                Không tìm thấy dữ liệu đơn đặt hàng cho chi nhánh hoặc điều kiện tìm kiếm hiện tại từ máy chủ backend.
              </p>
            </div>
            <UntitledButton
              variant="secondary-gray"
              size="sm"
              onClick={() => loadOrders(false)}
              iconLeading={<RefreshCw className="size-3.5" />}
            >
              Tải lại danh sách
            </UntitledButton>
          </div>
        ) : (
          filtered.map((order) => (
            <div
              key={order.documentId}
              data-order-id={order.documentId}
              onClick={() => handleOpenDetail(order)}
              className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 hover:border-purple-300 dark:hover:border-purple-800 p-4 sm:p-5 transition-all duration-150 cursor-pointer shadow-xs active:scale-[0.99] group"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-mono font-bold text-purple-700 dark:text-purple-300">
                      {order.documentId}
                    </span>
                    {getStatusBadge(order.statusId, order.statusName)}
                    {order.isLocked && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
                        <LockKeyhole className="size-3" /> Đã khóa
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white truncate">
                    {order.supplier}
                  </h4>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                    {order.notes}
                  </p>
                </div>

                <div className="sm:text-right shrink-0 mt-2 sm:mt-0 flex sm:flex-col justify-between sm:justify-start items-center sm:items-end">
                  <span className="text-sm sm:text-base font-extrabold text-neutral-900 dark:text-white">
                    {order.totalAmount}
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    {order.lines.length > 0 ? `${order.lines.length} dòng hàng` : "Xem chi tiết"}
                  </span>
                </div>
              </div>

              {/* Meta details footer */}
              <div className="mt-3.5 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                <div className="flex items-center gap-3 truncate">
                  <span className="flex items-center gap-1">
                    <Building className="size-3.5 text-neutral-400" />
                    {order.branchId}
                  </span>
                  <span className="flex items-center gap-1 truncate">
                    <User className="size-3.5 text-neutral-400" />
                    {order.creator}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-neutral-400 shrink-0">
                  <Calendar className="size-3.5" />
                  <span>{order.documentDate}</span>
                  <ChevronRight className="size-4 text-neutral-400 group-hover:text-purple-600 transition-colors ml-1" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Order Detail Viewport-Anchored Modal */}
      <UntitledBottomSheet
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        title={selectedOrder?.documentId || "Chi tiết đơn đặt hàng PO"}
        subtitle={`Chi nhánh: ${selectedOrder?.branchId || "CN01"} · Ngày chứng từ: ${selectedOrder?.documentDate}`}
        footer={
          selectedOrder && (
            <div className="flex gap-2">
              <UntitledButton
                variant="secondary-gray"
                size="md"
                fullWidth
                onClick={() => setSelectedOrder(null)}
              >
                Đóng
              </UntitledButton>

              <UntitledButton
                variant="primary"
                size="md"
                fullWidth
                onClick={() => window.print()}
                iconLeading={<Printer className="size-4" />}
              >
                In đơn đặt hàng
              </UntitledButton>
            </div>
          )
        }
      >
        {selectedOrder && (
          <div className="space-y-4">
            {/* Overview Box */}
            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/80 dark:border-neutral-700/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-neutral-400 block">Trạng thái duyệt</span>
                <div className="mt-1">
                  {getStatusBadge(selectedOrder.statusId, selectedOrder.statusName)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-neutral-400 block">Tổng tiền đơn</span>
                <span className="text-sm sm:text-base font-mono font-extrabold text-purple-700 dark:text-purple-300">
                  {selectedOrder.totalAmount}
                </span>
              </div>
            </div>

            {/* Order Attributes */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Mã chứng từ:</span>
                <span className="font-mono font-bold text-neutral-900 dark:text-white">
                  {selectedOrder.documentId}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Nhà cung cấp / Đối tượng:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {selectedOrder.purchaseOrderHeader?.objectId || selectedOrder.supplier}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Chi nhánh:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {selectedOrder.branchId}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Ngày lập chứng từ:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {selectedOrder.documentDate}
                </span>
              </div>
              {selectedOrder.deliverDate && (
                <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500">Ngày giao hàng:</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {selectedOrder.deliverDate}
                  </span>
                </div>
              )}
              {selectedOrder.contractId && (
                <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500">Hợp đồng liên kết:</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {selectedOrder.contractId}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Người lập đơn:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {selectedOrder.creator}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Khóa chứng từ:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {selectedOrder.isLocked ? "Đã khóa (Bảo vệ dữ liệu)" : "Chưa khóa"}
                </span>
              </div>
              {selectedOrder.memo && (
                <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500">Ghi chú nghiệp vụ:</span>
                  <span className="font-semibold text-neutral-900 dark:text-white text-right max-w-[65%]">
                    {selectedOrder.memo}
                  </span>
                </div>
              )}
            </div>

            {/* Line items Section */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h5 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Danh mục dược phẩm & vật tư ({selectedOrder.lines.length} dòng)
                </h5>
              </div>

              {detailLoading ? (
                <DetailLinesSkeleton />
              ) : selectedOrder.lines.length > 0 ? (
                <div className="space-y-2">
                  {selectedOrder.lines.map((line, idx) => (
                    <div
                      key={line.lineId || idx}
                      className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-800 space-y-1.5"
                    >
                      <div className="flex items-start justify-between text-xs gap-2">
                        <div>
                          <span className="font-mono font-bold text-purple-700 dark:text-purple-300">
                            [{line.itemId}]
                          </span>
                          <span className="font-bold text-neutral-900 dark:text-white ml-1.5">
                            {line.itemName}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-purple-600 dark:text-purple-400 shrink-0">
                          SL: {line.quantity} {line.unit}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 pt-1 border-t border-neutral-200/40 dark:border-neutral-700/40">
                        <span>Đơn giá: {line.unitPrice}</span>
                        <span className="font-semibold text-neutral-900 dark:text-white">
                          Thành tiền: {line.amount}
                        </span>
                      </div>
                      {line.fields?.notes && (
                        <p className="text-[11px] text-neutral-400 italic">
                          Ghi chú: {line.fields.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 text-center text-xs text-neutral-400">
                  Không có dòng vật tư chi tiết nào được ghi nhận cho đơn này.
                </div>
              )}
            </div>
          </div>
        )}
      </UntitledBottomSheet>
    </div>
  );
}
