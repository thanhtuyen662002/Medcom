"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { LockKeyhole } from "lucide-react";
import { ScreenHeader, ScreenToolbar, FilterChips, FilterSheet, RecordList, CreateFab, StatusBadge, AppButton, type RecordColumn } from "@/components/app";
import { UntitledBottomSheet } from "./bottom-sheet";
import { DetailLinesSkeleton } from "./skeleton";
import { erpClient } from "@/lib/erp/erp-client";
import type { DocumentDetail, PurchaseOrderHeader, PurchaseOrderLineFields } from "@/lib/erp/contracts";
import { errorMessage } from "@/lib/erp/api";

import { formatDateTime } from "@/lib/erp/document-detail/format";
import { erpStatusChips, erpStatusDisplay, matchesErpStatus } from "@/lib/erp/status-chips";
import {formatMoney} from "@/lib/erp/money";

function formatVND(value?: string | null, currency = "VND"): string {
  const plainCurrency = value?.match(/^(-?\d+)\s*([A-Z]{3}|[₫$€])$/);
  if (plainCurrency) return `${formatMoney(plainCurrency[1])} ${plainCurrency[2]}`;
  if (value && /[A-Z]{3}|[₫$€]/.test(value)) return value;
  return `${formatMoney(value || "0")}${currency ? ` ${currency}` : ""}`;
}

export interface OrderItem {
  documentId: string;
  documentDate: string;
  branchId: string;
  statusId: number | null;
  /** AP_OrderStatusTbl label for statusId. */
  statusName: string | null;
  /** Màu trạng thái BE cung cấp (#RRGGBB) hoặc null; thiếu màu thì dùng màu mặc định. */
  statusForeColor?: string | null;
  statusBackColor?: string | null;
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
  const [searchInput, setSearchInput] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(currentBranch || "");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [hasMore, setHasMore] = useState(false);
  const listSeqRef = useRef(0);
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
    async (isBackground = false, targetPage = page, targetPageSize = pageSize) => {
      const seq = ++listSeqRef.current;
      if (!isBackground) setLoading(true);
      else setIsRefreshing(true);

      try {
        setError(null);
        const pageData = await erpClient.getDocumentsList(
          "purchase-orders",
          targetPage,
          search,
          selectedBranch,
          targetPageSize
        );
        if (seq !== listSeqRef.current) return;

        if (pageData && pageData.rows) {
          const mapped: OrderItem[] = pageData.rows.map((r) => {
            const raw = r as Record<string, unknown>;
            const h = r.purchaseOrderHeader;
            const baseTotal =
              h?.baseTotal ||
              (raw.baseTotal as string) ||
              (raw.totalAmount as string) ||
              (raw.amount as string) ||
              (raw.baseTotalDisplay as string) ||
              (raw.totalAmountDisplay as string);
            const currencyId = h?.currencyId || (raw.currencyId as string) || "VND";
            const formattedTotal = baseTotal
              ? formatVND(baseTotal, currencyId)
              : "—";

            return {
              documentId: r.documentId,
              documentDate:
                (raw.documentDateDisplay as string) ||
                (h as any)?.documentDateDisplay ||
                (h?.documentDate
                  ? h.documentDate
                  : r.documentDate
                  ? r.documentDate
                  : "—"),
              branchId: (raw.branchName as string) || (h as any)?.branchName || r.branchId || selectedBranch || "CN01",
              statusId: r.statusId,
              statusName: (raw.statusName as string) || r.statusName || null,
              statusForeColor: (raw.statusForeColor as string) || null,
              statusBackColor: (raw.statusBackColor as string) || null,
              isLocked: r.isLocked ?? false,
              supplier:
                (raw.objectName as string) ||
                (raw.objectIdName as string) ||
                (h as any)?.objectName ||
                (h?.objectId
                  ? `NCC: ${h.objectId}`
                  : (raw.objectId as string)
                  ? `NCC: ${raw.objectId}`
                  : (raw.vendorName as string) || (raw.supplierName as string) || "Nhà cung cấp dược Medcom"),
              creator:
                h?.userCreate ||
                (raw.userCreate as string) ||
                (raw.creator as string) ||
                "—",
              totalAmount: formattedTotal,
              notes:
                h?.notes ||
                h?.memo ||
                (raw.notes as string) ||
                (raw.memo as string) ||
                `Đơn đặt hàng ${r.documentId}`,
              memo: h?.memo || (raw.memo as string),
              deliverDate:
                (raw.deliverDateDisplay as string) ||
                (h as any)?.deliverDateDisplay ||
                (h?.deliverDate
                  ? h.deliverDate
                  : (raw.deliverDate as string)
                  ? String(raw.deliverDate)
                  : null),
              currencyId,
              contractId: h?.contractId || (raw.contractId as string),
              purchaseOrderHeader: h,
              lines: [],
            };
          });

          setOrders(mapped);
          setPage(pageData.page);
          setPageSize(pageData.pageSize);
          setHasMore(pageData.hasMore);
          onCountChange?.(mapped.length);
          lastFetchedRef.current = Date.now();
        }
      } catch (err) {
        if (seq !== listSeqRef.current) return;
        setError(errorMessage(err));
      } finally {
        if (seq === listSeqRef.current) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [search, selectedBranch, page, pageSize, onCountChange]
  );

  // A new query starts at page one; returning to a stale tab refreshes its page.
  const listQueryRef = useRef<string | null>(null);
  const wasActiveRef = useRef(false);
  useEffect(() => {
    const becameActive = isActive && !wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (!isActive) return;
    const query = JSON.stringify([search, selectedBranch]);
    const queryChanged = query !== listQueryRef.current;
    if (queryChanged || (becameActive && Date.now() - lastFetchedRef.current > 30000)) {
      listQueryRef.current = query;
      void loadOrders(!queryChanged, queryChanged ? 1 : page);
    }
  }, [search, selectedBranch, isActive, loadOrders, page]);

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
                purchaseOrderHeader:
                  detail.document.purchaseOrderHeader ||
                  prev.purchaseOrderHeader,
                lines: detail.purchaseOrderLines.map((l: any) => {
                  const f = l.fields;
                  const rawL = l as Record<string, unknown>;
                  const unitPriceVal = f?.unitPrice ?? (rawL.unitPrice as string);
                  const amountVal = f?.amount ?? (rawL.amount as string);
                  const priceStr = unitPriceVal != null ? formatVND(unitPriceVal, prev.currencyId || "VND") : (rawL.unitPriceDisplay as string) || "Theo hợp đồng";
                  const amtStr = amountVal != null ? formatVND(amountVal, prev.currencyId || "VND") : (rawL.amountDisplay as string) || (rawL.totalPriceDisplay as string) || "Theo hợp đồng";
                  const itemName =
                    (rawL.itemName as string) ||
                    (f as Record<string, unknown> | undefined)?.itemName ||
                    (rawL.itemDescription as string) ||
                    (l.itemId || "—");
                  const unit =
                    (rawL.unit as string) ||
                    f?.property2 ||
                    (rawL.property2 as string) ||
                    "";
                  const qty = f?.quantity || l.quantity || (rawL.quantity as string) || "1";
                  const qty2 = f?.quantity2 || l.quantity2 || (rawL.quantity2 as string) || "1";

                  return {
                    lineId: l.lineId,
                    itemId: l.itemId,
                    itemName: String(itemName),
                    unit: String(unit),
                    quantity: String(qty),
                    quantity2: String(qty2),
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
    return matchesErpStatus(o, statusFilter);
  });

  const getStatusBadge = (order: OrderItem) => <StatusBadge {...erpStatusDisplay(order)} statusForeColor={order.statusForeColor} statusBackColor={order.statusBackColor} />;
  const statuses = erpStatusChips(orders);

  const tableColumns: RecordColumn<OrderItem>[] = [
    { id: "document", label: "Mã PO", className: "min-w-40 whitespace-nowrap", render: order => <span className="font-mono font-semibold text-brand-700 dark:text-brand-300">{order.documentId}</span> },
    { id: "date", label: "Ngày chứng từ", className: "whitespace-nowrap tabular-nums", render: order => formatDateTime(order.documentDate) },
    { id: "supplier", label: "Nhà cung cấp", className: "min-w-60 max-w-sm", render: order => <span className="line-clamp-2 break-words font-medium" title={order.supplier}>{order.supplier}</span> },
    { id: "status", label: "Trạng thái", className: "whitespace-nowrap", render: order => <div className="flex items-center gap-2">{getStatusBadge(order)}{order.isLocked && <LockKeyhole aria-label="Đã khóa" className="size-4" />}</div> },
    { id: "creator", label: "Người lập", className: "min-w-40 max-w-52", render: order => <span className="line-clamp-2 break-words">{order.creator}</span> },
    { id: "amount", label: "Tổng tiền", className: "whitespace-nowrap text-right font-semibold tabular-nums", render: order => order.totalAmount },
  ];

  return (
    <div className="min-w-0 space-y-3 pb-8">
      <ScreenHeader title="Đơn hàng PO" branch={currentBranch} count={orders.length} />
      <ScreenToolbar search={searchInput} onSearchChange={setSearchInput} onSearch={setSearch}
        onFilter={() => setFilterOpen(true)} filterOpen={filterOpen} filterId="orders-filters"
        filterCount={Number(Boolean(statusFilter)) + Number(pageSize !== 20)}
        refreshing={loading || isRefreshing} onRefresh={() => void loadOrders(true)} onCreate={onOpenCreateModal} />
      <FilterChips description="Bộ lọc trạng thái và số đếm áp dụng cho trang hiện tại." items={statuses}
        value={statusFilter} onChange={setStatusFilter} onPageChange={() => { if (page !== 1) void loadOrders(false, 1); }} />
      <RecordList label="Danh sách đặt mua hàng" rows={filtered} columns={tableColumns} rowId={order => order.documentId}
        card={order => ({ code: order.documentId, title: order.supplier, meta: [formatDateTime(order.documentDate), order.creator, order.totalAmount === "—" ? null : order.totalAmount, order.isLocked ? "Đã khóa" : null], status: { ...erpStatusDisplay(order), statusForeColor: order.statusForeColor, statusBackColor: order.statusBackColor } })}
        onOpen={handleOpenDetail} loading={loading} error={error} onRetry={() => void loadOrders(false)}
        empty={{ message: "Chưa có chứng từ khớp với tìm kiếm hoặc bộ lọc.", onCreate: onOpenCreateModal }}
        pagination={{ page, pageSize, rowCount: orders.length, visibleRowCount: filtered.length, hasMore, busy: loading || isRefreshing, maxPage: 1000,
          onPageChange: nextPage => void loadOrders(false, nextPage), onPageSizeChange: size => void loadOrders(false, 1, size) }} />
      <FilterSheet id="orders-filters" open={filterOpen} onClose={() => setFilterOpen(false)} value={{ status: statusFilter, pageSize }} statuses={statuses}
        onApply={value => { setStatusFilter(value.status); void loadOrders(false, 1, value.pageSize); }} />
      {onOpenCreateModal && <CreateFab allowed={isActive && !selectedOrder && !filterOpen} label="Tạo đơn hàng PO" onClick={onOpenCreateModal} />}

      {/* Order Detail Viewport-Anchored Modal */}
      <UntitledBottomSheet
        presentation="document"
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        title={selectedOrder?.documentId || "Chi tiết đơn đặt hàng PO"}
        subtitle={`Chi nhánh: ${selectedOrder?.branchId || "CN01"} · Ngày chứng từ: ${formatDateTime(selectedOrder?.documentDate)}`}
        footer={
          selectedOrder && (
            <div className="flex gap-2">
              <AppButton
                variant="secondary"
                className="w-full"
                onClick={() => setSelectedOrder(null)}
              >
                Đóng
              </AppButton>
            </div>
          )
        }
      >
        {selectedOrder && (
          <div className="space-y-4 pb-12">
            {/* THẺ THÔNG TIN CHUNG ĐƠN HÀNG (Unified Card) */}
            <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-neutral-100 dark:border-neutral-800">
                <div className="space-y-0.5">
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Mã đơn hàng PO
                  </span>
                  <p className="font-mono text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                    {selectedOrder.documentId}
                  </p>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  {getStatusBadge(selectedOrder)}
                  <span className="text-sm font-mono font-extrabold text-brand-700 dark:text-brand-300">
                    {selectedOrder.totalAmount}
                  </span>
                </div>
              </div>

              {/* Tên đối tượng / Nhà cung cấp */}
              <div className="py-1 border-b border-neutral-100 dark:border-neutral-800/60">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 block mb-1">
                  Nhà cung cấp / Đối tượng
                </span>
                <p className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white leading-relaxed break-words">
                  {selectedOrder.purchaseOrderHeader?.objectId || selectedOrder.supplier}
                </p>
              </div>

              {/* Chi tiết thông số thuộc tính */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                <div className="flex flex-col py-1">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Ngày lập chứng từ</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {formatDateTime(selectedOrder.documentDate)}
                  </span>
                </div>
                <div className="flex flex-col py-1">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Chi nhánh</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {selectedOrder.branchId}
                  </span>
                </div>
                {selectedOrder.deliverDate && (
                  <div className="flex flex-col py-1">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Ngày giao hàng</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {formatDateTime(selectedOrder.deliverDate)}
                    </span>
                  </div>
                )}
                {selectedOrder.contractId && (
                  <div className="flex flex-col py-1">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Hợp đồng liên kết</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {selectedOrder.contractId}
                    </span>
                  </div>
                )}
                <div className="flex flex-col py-1">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Người lập đơn</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {selectedOrder.creator}
                  </span>
                </div>
                <div className="flex flex-col py-1">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Khóa chứng từ</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {selectedOrder.isLocked ? "Đã khóa (Bảo vệ dữ liệu)" : "Chưa khóa"}
                  </span>
                </div>
                {selectedOrder.memo && (
                  <div className="flex flex-col py-1 sm:col-span-2">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Ghi chú nghiệp vụ</span>
                    <span className="font-medium text-neutral-700 dark:text-neutral-300 break-words">
                      {selectedOrder.memo}
                    </span>
                  </div>
                )}
              </div>
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
                          <span className="font-mono font-bold text-brand-700 dark:text-brand-300">
                            [{line.itemId}]
                          </span>
                          <span className="font-bold text-neutral-900 dark:text-white ml-1.5">
                            {line.itemName}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-brand-600 dark:text-brand-400 shrink-0">
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
