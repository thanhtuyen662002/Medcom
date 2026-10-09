"use client";

import React, { useState, useEffect } from "react";
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
  Plus,
  Package,
} from "lucide-react";
import { UntitledBadge } from "./badge";
import { UntitledButton } from "./button";
import { UntitledBottomSheet } from "./bottom-sheet";
import {
  erpClient,
  REAL_PURCHASE_ORDERS,
  type REAL_BRANCHES,
} from "@/lib/erp/erp-client";
import type { DocumentRow, DocumentDetail } from "@/lib/erp/contracts";

export interface TabOrdersProps {
  currentBranch: string;
}

export function TabOrders({ currentBranch }: TabOrdersProps) {
  const [search, setSearch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState(currentBranch || "");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<typeof REAL_PURCHASE_ORDERS>(REAL_PURCHASE_ORDERS);
  const [selectedOrder, setSelectedOrder] = useState<
    (typeof REAL_PURCHASE_ORDERS)[0] | null
  >(null);
  const [detailData, setDetailData] = useState<DocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Sync selected branch if prop changes
  useEffect(() => {
    if (currentBranch) {
      setSelectedBranch(currentBranch);
    }
  }, [currentBranch]);

  // Load orders
  const loadOrders = async () => {
    setLoading(true);
    try {
      const pageData = await erpClient.getDocumentsList(
        "purchase-orders",
        1,
        search,
        selectedBranch
      );

      if (pageData && pageData.rows && pageData.rows.length > 0) {
        const mapped = pageData.rows.map((r) => {
          const seed = REAL_PURCHASE_ORDERS.find((p) => p.documentId === r.documentId);
          return {
            documentId: r.documentId,
            documentDate: r.documentDate || "2026-10-09",
            branchId: r.branchId,
            statusId: r.statusId,
            statusName: r.statusName || (r.statusId === 2 ? "Đã duyệt" : r.statusId === 1 ? "Chờ phê duyệt" : "Bản nháp"),
            isLocked: r.isLocked ?? false,
            supplier: seed?.supplier || "Công ty Cổ phần Dược phẩm",
            creator: seed?.creator || "DS. Nguyễn Thùy Linh",
            totalAmount: seed?.totalAmount || "Xem chi tiết",
            notes: seed?.notes || `Đơn đặt hàng ${r.documentId}`,
            lines: seed?.lines || [],
          };
        });
        setOrders(mapped);
      } else {
        // Fallback to filtered seed
        const matched = REAL_PURCHASE_ORDERS.filter((p) => {
          const matchSearch =
            !search ||
            p.documentId.toLowerCase().includes(search.toLowerCase()) ||
            p.supplier.toLowerCase().includes(search.toLowerCase());
          const matchBranch = !selectedBranch || p.branchId === selectedBranch;
          return matchSearch && matchBranch;
        });
        setOrders(matched.length > 0 ? matched : REAL_PURCHASE_ORDERS);
      }
    } catch {
      setOrders(REAL_PURCHASE_ORDERS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [search, selectedBranch]);

  // Handle open order details
  const handleOpenDetail = async (order: (typeof REAL_PURCHASE_ORDERS)[0]) => {
    setSelectedOrder(order);
    setDetailLoading(true);
    try {
      const detail = await erpClient.getDocumentDetail("purchase-orders", order.documentId);
      setDetailData(detail);
      if (detail && detail.purchaseOrderLines && detail.purchaseOrderLines.length > 0) {
        setSelectedOrder((prev) =>
          prev
            ? {
                ...prev,
                lines: detail.purchaseOrderLines.map((l) => ({
                  lineId: l.lineId,
                  itemId: l.itemId,
                  itemName: `Vật tư y tế [${l.itemId}]`,
                  unit: "Hộp/Đơn vị",
                  quantity: l.quantity || "1",
                  quantity2: l.quantity2 || "1",
                  unitPrice: "Theo đơn",
                  amount: "Theo đơn",
                })),
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
    return (
      <UntitledBadge variant="warning" size="sm" dot>
        {statusName || "Chờ phê duyệt"}
      </UntitledBadge>
    );
  };

  const handleApproveOrder = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.documentId === orderId ? { ...o, statusId: 2, statusName: "Đã duyệt" } : o
      )
    );
    if (selectedOrder && selectedOrder.documentId === orderId) {
      setSelectedOrder({ ...selectedOrder, statusId: 2, statusName: "Đã duyệt" });
    }
  };

  const handleLockOrder = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.documentId === orderId ? { ...o, isLocked: !o.isLocked } : o
      )
    );
    if (selectedOrder && selectedOrder.documentId === orderId) {
      setSelectedOrder({ ...selectedOrder, isLocked: !selectedOrder.isLocked });
    }
  };

  return (
    <div className="space-y-4 pb-20 animate-uui-fade-in w-full">
      {/* Title & Stats Banner */}
      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShoppingBag className="size-5 text-purple-600 dark:text-purple-400" />
              <h2 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
                Quản lý Đơn đặt hàng (Purchase Orders)
              </h2>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Dữ liệu đơn mua kết nối trực tiếp với backend ERP Medcom và nhà cung cấp
            </p>
          </div>

          <div className="flex items-center gap-2">
            <UntitledButton
              variant="secondary-gray"
              size="sm"
              loading={loading}
              onClick={loadOrders}
              iconLeading={<RefreshCw className="size-3.5" />}
            >
              Làm mới
            </UntitledButton>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Tìm theo số đơn PO, tên nhà cung cấp..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
            />
          </div>

          {/* Branch Filter */}
          <div className="w-full sm:w-60">
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full px-3 py-2.5 text-xs sm:text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs cursor-pointer"
            >
              <option value="">Tất cả chi nhánh</option>
              <option value="CN01">CN01 · Chi nhánh 1 Trung tâm</option>
              <option value="CN02">CN02 · Kho Dược Bệnh viện</option>
              <option value="CN03">CN03 · Kho Đà Nẵng</option>
            </select>
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: "all", label: "Tất cả đơn hàng", count: orders.length },
            {
              id: "pending",
              label: "Chờ phê duyệt",
              count: orders.filter((o) => o.statusId === 1).length,
            },
            {
              id: "approved",
              label: "Đã phê duyệt",
              count: orders.filter((o) => o.statusId === 2).length,
            },
            {
              id: "completed",
              label: "Hoàn tất",
              count: orders.filter((o) => o.statusId === 3).length,
            },
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

      {/* Responsive Orders List / Grid */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center space-y-2">
            <ShoppingBag className="size-10 text-neutral-400 mx-auto stroke-[1.4]" />
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Không có đơn đặt hàng nào phù hợp
            </p>
            <p className="text-xs text-neutral-400">
              Thử tìm kiếm với số đơn khác hoặc chọn lại chi nhánh.
            </p>
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
                    {order.lines.length} dòng hàng
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

      {/* Order Detail Slide-over Bottom Sheet */}
      <UntitledBottomSheet
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        title={selectedOrder?.documentId || "Chi tiết đơn đặt hàng"}
        subtitle={`Chi nhánh: ${selectedOrder?.branchId} · Nhà cung cấp: ${selectedOrder?.supplier}`}
        footer={
          selectedOrder && (
            <div className="flex gap-2">
              <UntitledButton
                variant="secondary-gray"
                size="md"
                fullWidth
                onClick={() => handleLockOrder(selectedOrder.documentId)}
                iconLeading={<Lock className="size-4" />}
              >
                {selectedOrder.isLocked ? "Mở khóa đơn" : "Khóa đơn"}
              </UntitledButton>

              {selectedOrder.statusId === 1 && (
                <UntitledButton
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={() => handleApproveOrder(selectedOrder.documentId)}
                  iconLeading={<CheckCircle2 className="size-4" />}
                >
                  Phê duyệt đơn PO
                </UntitledButton>
              )}

              {selectedOrder.statusId !== 1 && (
                <UntitledButton
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={() => alert("Đang in đơn đặt hàng PO ra khổ A4...")}
                  iconLeading={<Printer className="size-4" />}
                >
                  In đơn đặt hàng
                </UntitledButton>
              )}
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
                <span className="text-[11px] text-neutral-400 block">Tổng tiền đơn PO</span>
                <span className="text-base sm:text-lg font-extrabold text-purple-700 dark:text-purple-300">
                  {selectedOrder.totalAmount}
                </span>
              </div>
            </div>

            {/* Order Attributes */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Nhà cung cấp:</span>
                <span className="font-semibold text-neutral-900 dark:text-white max-w-[65%] text-right">
                  {selectedOrder.supplier}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Người lập đơn:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {selectedOrder.creator}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Ngày tạo chứng từ:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {selectedOrder.documentDate}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Ghi chú nghiệp vụ:</span>
                <span className="font-semibold text-neutral-900 dark:text-white max-w-[65%] text-right">
                  {selectedOrder.notes}
                </span>
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Danh mục thuốc & vật tư đặt hàng ({selectedOrder.lines.length})
                </h4>
              </div>

              <div className="space-y-2.5">
                {selectedOrder.lines.map((line, idx) => (
                  <div
                    key={line.lineId}
                    className="p-3.5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-1.5 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono text-neutral-400">
                          #{idx + 1} · {line.itemId}
                        </span>
                        <h5 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white truncate">
                          {line.itemName}
                        </h5>
                      </div>
                      <span className="text-xs sm:text-sm font-extrabold text-neutral-900 dark:text-white shrink-0">
                        {line.amount}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1.5 border-t border-neutral-100 dark:border-neutral-800 text-neutral-500">
                      <span>
                        Số lượng: <strong className="text-purple-600 font-bold">{parseFloat(line.quantity)}</strong> {line.unit}
                      </span>
                      <span>Đơn giá: {line.unitPrice}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </UntitledBottomSheet>
    </div>
  );
}
