"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ScreenHeader, ScreenToolbar, FilterChips, FilterSheet, RecordList, CreateFab, StatusBadge, type RecordColumn } from "@/components/app";
import { UntitledBottomSheet } from "./bottom-sheet";
import { DetailLinesSkeleton } from "./skeleton";
import { erpClient } from "@/lib/erp/erp-client";
import type { PurchaseRequestHeaderFields, PurchaseRequestLineFields, PurchaseReadback } from "@/lib/erp/purchase-request-api";
import { errorMessage } from "@/lib/erp/api";

import { formatDateTime } from "@/lib/erp/document-detail/format";
import {formatMoney} from "@/lib/erp/money";
import { statusColorStyle } from "@/lib/erp/status-colors";

function formatVND(value?: string | null, currency = "VND"): string {
  const plainCurrency = value?.match(/^(-?\d+)\s*([A-Z]{3}|[₫$€])$/);
  if (plainCurrency) return `${formatMoney(plainCurrency[1])} ${plainCurrency[2]}`;
  if (value && /[A-Z]{3}|[₫$€]/.test(value)) return value;
  return `${formatMoney(value || "0")}${currency ? ` ${currency}` : ""}`;
}

export interface PurchaseItem {
  id: string;
  code: string;
  date: string;
  creator: string;
  department: string;
  branch: string;
  purpose: string;
  status: "pending" | "approved" | "draft" | "rejected";
  /** Màu trạng thái BE cung cấp (#RRGGBB) hoặc null; thiếu màu thì dùng màu mặc định. */
  statusForeColor?: string | null;
  statusBackColor?: string | null;
  totalAmount: string;
  notes?: string | null;
  currencyId?: string;
  objectId?: string;
  rateExchange?: number;
  headerFields?: PurchaseRequestHeaderFields;
  lines: {
    lineId?: string;
    itemId: string;
    itemName: string;
    specification: string;
    unit: string;
    quantity: number | string;
    unitPrice: string;
    amount: string;
    budget?: string | null;
    timeRequired?: string | null;
    fields?: PurchaseRequestLineFields;
  }[];
}

export interface TabPurchasesProps {
  onOpenCreateModal?: () => void;
  selectedItemForDetail?: PurchaseItem | null;
  onCloseDetailModal?: () => void;
  currentBranch?: string;
  isActive?: boolean;
  onCountChange?: (count: number) => void;
}

export function TabPurchases({
  onOpenCreateModal,
  selectedItemForDetail,
  onCloseDetailModal,
  currentBranch = "CN01",
  isActive = true,
  onCountChange,
}: TabPurchasesProps) {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [hasMore, setHasMore] = useState(false);
  const listSeqRef = useRef(0);
  const [activeItem, setActiveItem] = useState<PurchaseItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [currentScopeKey, setCurrentScopeKey] = useState<string | null>(null);
  const lastFetchedRef = useRef<number>(0);

  // Sync prop if provided
  useEffect(() => {
    if (selectedItemForDetail) {
      setActiveItem(selectedItemForDetail);
    }
  }, [selectedItemForDetail]);

  const loadPurchases = useCallback(
    async (isBackground = false, targetPage = page, targetPageSize = pageSize) => {
      const seq = ++listSeqRef.current;
      if (!isBackground) setLoading(true);
      else setIsRefreshing(true);

      try {
        setError(null);
        const res = await erpClient.getPurchaseRequestsList(targetPage, search, currentBranch, targetPageSize);
        if (seq !== listSeqRef.current) return;
        if (res && res.list && res.list.rows) {
          setCurrentScopeKey(res.scopeKey);
          const mapped: PurchaseItem[] = res.list.rows.map((r) => {
            const raw = r as Record<string, unknown>;
            const f = r.fields;
            let status: PurchaseItem["status"] = "draft";
            if (r.statusId === 2) status = "approved";
            else if (r.statusId === 1) status = "pending";
            else if (r.statusId === 3 || r.statusId === -1) status = "rejected";
            const statusForeColor = (raw.statusForeColor as string) || null;
            const statusBackColor = (raw.statusBackColor as string) || null;

            const branchId = r.branchId || (raw.branchId as string) || currentBranch || "CN01";
            const branchLabel =
              branchId === "CN01"
                ? "Chi nhánh 1 (Trung tâm)"
                : branchId === "CN02"
                ? "Chi nhánh 2 (Kho Dược)"
                : `Chi nhánh ${branchId}`;

            const dateStr =
              (raw.purchaseDateDisplay as string) ||
              (f as any)?.purchaseDateDisplay ||
              (f?.purchaseDate ? f.purchaseDate : undefined) ||
              (r.purchaseDate ? r.purchaseDate : undefined) ||
              (raw.purchaseDate as string ? String(raw.purchaseDate) : "—");
            const priceVal =
              f?.price ||
              (raw.price as string) ||
              (raw.totalAmount as string) ||
              (raw.baseTotal as string) ||
              (raw.priceDisplay as string) ||
              (raw.totalAmountDisplay as string);
            const currencyVal = f?.currencyId || (raw.currencyId as string) || "VND";
            const totalStr = priceVal ? formatVND(priceVal, currencyVal) : "—";
            const purposeStr =
              f?.purposeDescOrClient ||
              (raw.purposeDescOrClient as string) ||
              f?.notes ||
              (raw.notes as string) ||
              (raw.purpose as string) ||
              `Yêu cầu bổ sung thuốc / vật tư y tế [${r.documentId}]`;
            const creatorStr =
              f?.personSuggest ||
              (raw.personSuggest as string) ||
              r.personSuggest ||
              (raw.creator as string) ||
              (raw.userCreate as string) ||
              "Dược sĩ phụ trách";
            const deptStr =
              f?.department ||
              (raw.department as string) ||
              r.department ||
              "Kho Dược GSP";

            return {
              id: r.documentId,
              code: r.documentId,
              date: dateStr,
              creator: creatorStr,
              department: deptStr,
              branch: (raw.branchName as string) || (f as any)?.branchName || branchLabel,
              purpose: purposeStr,
              status,
              statusForeColor,
              statusBackColor,
              totalAmount: totalStr,
              notes: f?.notes || (raw.notes as string),
              currencyId: f?.currencyId || (raw.currencyId as string) || "VND",
              rateExchange:
                typeof f?.rateExchange === "number"
                  ? f.rateExchange
                  : typeof raw.rateExchange === "number"
                  ? raw.rateExchange
                  : typeof raw.rateExchange === "string" && !isNaN(Number(raw.rateExchange))
                  ? Number(raw.rateExchange)
                  : undefined,
              headerFields: f,
              lines: [],
            };
          });

          setPurchases(mapped);
          setPage(res.list.page);
          setPageSize(res.list.pageSize);
          setHasMore(res.list.hasMore);
          onCountChange?.(mapped.length);
          lastFetchedRef.current = Date.now();
        } else {
          setPurchases([]);
          onCountChange?.(0);
        }
      } catch (e) {
        if (seq !== listSeqRef.current) return;
        setError(errorMessage(e));
      } finally {
        if (seq === listSeqRef.current) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [search, currentBranch, page, pageSize, onCountChange]
  );

  // A new query starts at page one; returning to a stale tab refreshes its page.
  const listQueryRef = useRef<string | null>(null);
  const wasActiveRef = useRef(false);
  useEffect(() => {
    const becameActive = isActive && !wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (!isActive) return;
    const query = JSON.stringify([search, currentBranch]);
    const queryChanged = query !== listQueryRef.current;
    if (queryChanged || (becameActive && Date.now() - lastFetchedRef.current > 45000)) {
      listQueryRef.current = query;
      void loadPurchases(!queryChanged, queryChanged ? 1 : page);
    }
  }, [search, currentBranch, isActive, loadPurchases, page]);

  const handleOpenDetail = async (item: PurchaseItem) => {
    setActiveItem(item);
    setDetailLoading(true);

    try {
      let scopeKey = currentScopeKey;
      if (!scopeKey) {
        const wsRes = await erpClient.getPurchaseRequestsList(1, "", currentBranch);
        scopeKey = wsRes?.scopeKey || null;
        if (scopeKey) setCurrentScopeKey(scopeKey);
      }

      if (scopeKey) {
        const detail: PurchaseReadback = await erpClient.getPurchaseRequestDetail(scopeKey, item.id);
        if (detail && detail.document) {
          const doc = detail.document;
          const src = detail.sourceFields;
          const headerFields = src?.header || item.headerFields;
          const totalStr = headerFields?.price
            ? formatVND(headerFields.price, headerFields.currencyId || "VND")
            : doc.header.price
            ? formatVND(doc.header.price, doc.header.currencyId || "VND")
            : item.totalAmount;

          const rawLines = (src?.lines && src.lines.length > 0) ? src.lines : doc.lines;
          const lines = rawLines.map((l: any, idx: number) => {
            const vals = l.values ?? l;
            const rawLine = l as Record<string, any>;
            const itemName = rawLine.itemName || vals.itemName || rawLine.name || (vals.itemId ? `Dược phẩm [${vals.itemId}]` : "Vật tư y tế");
            const itemCode = rawLine.itemCode || vals.itemCode || vals.itemId || "";
            const unit = rawLine.unit || vals.unit || "Hộp";
            const unitPrice = vals.unitPrice != null ? formatVND(vals.unitPrice, headerFields?.currencyId || "VND") : rawLine.unitPriceDisplay || vals.unitPriceDisplay || "—";
            const amount = vals.totalPrice != null ? formatVND(vals.totalPrice, headerFields?.currencyId || "VND") : rawLine.totalPriceDisplay || vals.totalPriceDisplay || unitPrice;
            return {
              lineId: l.lineId || rawLine.userAutoId || `line-${idx}`,
              itemId: vals.itemId || itemCode,
              itemName,
              specification: vals.model || rawLine.specification || "Tiêu chuẩn Dược điển",
              unit,
              quantity: vals.quantity,
              unitPrice,
              amount,
              budget: vals.budget,
              timeRequired: vals.timeRequired,
              fields: l,
            };
          });

          setActiveItem((prev) =>
            prev
              ? {
                  ...prev,
                  headerFields,
                  purpose:
                    headerFields?.purposeDescOrClient ||
                    headerFields?.notes ||
                    doc.header.purposeDescOrClient ||
                    doc.header.notes ||
                    prev.purpose,
                  totalAmount: totalStr,
                  currencyId: headerFields?.currencyId || doc.header.currencyId,
                  objectId: headerFields?.objectId || doc.header.objectId,
                  notes: headerFields?.notes || doc.header.notes,
                  lines,
                }
              : prev
          );
        }
      }
    } catch (e) {
      console.warn("Could not fetch remote purchase detail:", e);
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = purchases.filter((item) => {
    const matchSearch =
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      item.purpose.toLowerCase().includes(search.toLowerCase()) ||
      item.creator.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "" || item.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statusLabels = { pending: "Chờ duyệt", approved: "Đã duyệt", draft: "Dự thảo", rejected: "Từ chối" };
  const statusTones = { pending: "warning", approved: "success", draft: "neutral", rejected: "danger" } as const;
  const getStatusBadge = (status: PurchaseItem["status"], style?: { color?: string; backgroundColor?: string }) => <StatusBadge label={statusLabels[status]} tone={statusTones[status]} statusForeColor={style?.color} statusBackColor={style?.backgroundColor} />;
  const statuses = [{ value: "", label: "Tất cả" }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))];

  const tableColumns: RecordColumn<PurchaseItem>[] = [
    { id: "document", label: "Mã PR", className: "min-w-40 whitespace-nowrap", render: item => <span className="font-mono font-semibold text-brand-700 dark:text-brand-300">{item.code}</span> },
    { id: "date", label: "Ngày đề nghị", className: "whitespace-nowrap tabular-nums", render: item => formatDateTime(item.date) },
    { id: "purpose", label: "Mục đích / Nội dung", className: "min-w-60 max-w-sm", render: item => <span className="line-clamp-2 break-words font-medium" title={item.purpose}>{item.purpose}</span> },
    { id: "status", label: "Trạng thái", className: "whitespace-nowrap", render: item => getStatusBadge(item.status, statusColorStyle(item.statusForeColor, item.statusBackColor)) },
    { id: "creator", label: "Người đề nghị", className: "min-w-40 max-w-52", render: item => <span className="line-clamp-2 break-words">{item.creator}</span> },
    { id: "amount", label: "Tổng tiền", className: "whitespace-nowrap text-right font-semibold tabular-nums", render: item => item.totalAmount },
  ];

  return (
    <div className="min-w-0 space-y-3 pb-8 animate-uui-fade-in">
      <ScreenHeader title="Đề nghị PR" branch={currentBranch} count={purchases.length} />
      <ScreenToolbar search={searchInput} onSearchChange={setSearchInput} onSearch={setSearch}
        onFilter={() => setFilterOpen(true)} filterOpen={filterOpen} filterId="purchases-filters"
        filterCount={Number(Boolean(filterStatus)) + Number(pageSize !== 20)}
        refreshing={loading || isRefreshing} onRefresh={() => void loadPurchases(true)} onCreate={onOpenCreateModal} />
      <FilterChips description="Bộ lọc trạng thái và số đếm áp dụng cho trang hiện tại." items={statuses.map(status => ({ ...status, count: status.value ? purchases.filter(item => item.status === status.value).length : purchases.length }))}
        value={filterStatus} onChange={setFilterStatus} onPageChange={() => { if (page !== 1) void loadPurchases(false, 1); }} />
      <RecordList label="Danh sách đề nghị mua hàng" rows={filtered} columns={tableColumns} rowId={item => item.id}
        card={item => ({ code: item.code, title: item.purpose, meta: [formatDateTime(item.date), item.creator, item.totalAmount === "—" ? null : item.totalAmount], status: { label: statusLabels[item.status], tone: statusTones[item.status], statusForeColor: item.statusForeColor, statusBackColor: item.statusBackColor } })}
        onOpen={handleOpenDetail} loading={loading} error={error} onRetry={() => void loadPurchases(false)}
        empty={{ message: "Chưa có chứng từ khớp với tìm kiếm hoặc bộ lọc.", onCreate: onOpenCreateModal }}
        pagination={{ page, pageSize, rowCount: purchases.length, visibleRowCount: filtered.length, hasMore, busy: loading || isRefreshing, maxPage: 1000,
          onPageChange: nextPage => void loadPurchases(false, nextPage), onPageSizeChange: size => void loadPurchases(false, 1, size) }} />
      <FilterSheet id="purchases-filters" open={filterOpen} onClose={() => setFilterOpen(false)} value={{ status: filterStatus, pageSize }} statuses={statuses}
        onApply={value => { setFilterStatus(value.status); void loadPurchases(false, 1, value.pageSize); }} />
      {onOpenCreateModal && <CreateFab allowed={isActive && !activeItem && !filterOpen} label="Tạo đề nghị PR" onClick={onOpenCreateModal} />}

      {/* Item Detail Bottom Sheet */}
      <UntitledBottomSheet
        presentation="document"
        open={Boolean(activeItem)}
        onClose={() => {
          setActiveItem(null);
          onCloseDetailModal?.();
        }}
        title={activeItem?.code || "Chi tiết phiếu mua sắm"}
        subtitle={`${activeItem?.department} · ${activeItem?.branch}`}
      >
        {activeItem && (
          <div className="space-y-4 pb-12">
            {/* THẺ THÔNG TIN CHUNG ĐỀ NGHỊ MUA (Unified Card) */}
            <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-neutral-100 dark:border-neutral-800">
                <div className="space-y-0.5">
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Mã đề nghị PR
                  </span>
                  <p className="font-mono text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                    {activeItem.code}
                  </p>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  {getStatusBadge(activeItem.status, statusColorStyle(activeItem.statusForeColor, activeItem.statusBackColor))}
                  <span className="text-sm font-mono font-extrabold text-brand-700 dark:text-brand-300">
                    {activeItem.totalAmount}
                  </span>
                </div>
              </div>

              {/* Tên đối tượng / Mục đích đề nghị */}
              <div className="py-1 border-b border-neutral-100 dark:border-neutral-800/60">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 block mb-1">
                  Mục đích đề xuất / Đối tượng
                </span>
                <p className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white leading-relaxed break-words">
                  {activeItem.purpose || activeItem.objectId || "Mua sắm Dược phẩm theo kế hoạch"}
                </p>
              </div>

              {/* Chi tiết thông số thuộc tính */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                <div className="flex flex-col py-1">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Người đề nghị</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {activeItem.creator}
                  </span>
                </div>
                <div className="flex flex-col py-1">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Phòng ban đề xuất</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {activeItem.department}
                  </span>
                </div>
                <div className="flex flex-col py-1">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Ngày lập phiếu</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {formatDateTime(activeItem.date)}
                  </span>
                </div>
                <div className="flex flex-col py-1">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Chi nhánh trực thuộc</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {activeItem.branch}
                  </span>
                </div>
                {activeItem.objectId && (
                  <div className="flex flex-col py-1">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Đối tượng liên kết</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {activeItem.objectId}
                    </span>
                  </div>
                )}
                {activeItem.notes && (
                  <div className="flex flex-col py-1 sm:col-span-2">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Ghi chú</span>
                    <span className="font-medium text-neutral-700 dark:text-neutral-300 break-words">
                      {activeItem.notes}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
                Danh sách thuốc & vật tư ({activeItem.lines?.length ?? 0} mặt hàng)
              </h4>
              <div className="space-y-2">
                {detailLoading ? (
                  <DetailLinesSkeleton count={3} />
                ) : !activeItem.lines || activeItem.lines.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 text-center text-xs text-neutral-400">
                    Không có dòng thuốc hoặc chi tiết dòng chưa được lưu trên hệ thống.
                  </div>
                ) : (
                  activeItem.lines.map((line, idx) => (
                    <div
                      key={line.lineId || line.itemId || idx}
                      className="p-3.5 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] font-mono text-neutral-400">
                            #{idx + 1} · [{line.itemId}]
                          </span>
                          <h5 className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                            {line.itemName}
                          </h5>
                          {line.specification && (
                            <p className="text-[11px] text-neutral-400">Quy cách/Model: {line.specification}</p>
                          )}
                        </div>
                        <span className="text-xs font-bold text-neutral-900 dark:text-white shrink-0">
                          {line.amount}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-neutral-100 dark:border-neutral-800/80 text-neutral-500">
                        <span>
                          Số lượng: <strong className="text-brand-600">{line.quantity}</strong> {line.unit}
                        </span>
                        <span>Đơn giá: {line.unitPrice}</span>
                      </div>
                      {line.timeRequired && (
                        <p className="text-[11px] text-neutral-400 italic">
                          Thời gian cần: {line.timeRequired}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </UntitledBottomSheet>
    </div>
  );
}
