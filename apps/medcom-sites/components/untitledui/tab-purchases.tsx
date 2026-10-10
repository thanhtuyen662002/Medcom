"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Plus,
  FileText,
  Calendar,
  Building,
  User,
  CheckCircle2,
  Clock,
  Printer,
  ChevronRight,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { UntitledBadge } from "./badge";
import { UntitledButton } from "./button";
import { UntitledBottomSheet } from "./bottom-sheet";
import { DocumentCardSkeleton, DetailLinesSkeleton } from "./skeleton";
import { erpClient } from "@/lib/erp/erp-client";
import type { PurchaseRequestHeaderFields, PurchaseRequestLineFields, PurchaseReadback } from "@/lib/erp/purchase-request-api";
import { errorMessage } from "@/lib/erp/api";

function formatVND(value?: string | null, currency = "VND"): string {
  if (!value) return "0 " + currency;
  const parts = value.split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.length > 1 ? `${intPart},${parts[1]} ${currency}` : `${intPart} ${currency}`;
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
  onOpenCreateModal: () => void;
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
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
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
    async (isBackground = false) => {
      if (!isBackground) {
        if (purchases.length === 0) setLoading(true);
        else setIsRefreshing(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        setError(null);
        const res = await erpClient.getPurchaseRequestsList(1, search, currentBranch);
        if (res && res.list && res.list.rows) {
          setCurrentScopeKey(res.scopeKey);
          const mapped: PurchaseItem[] = res.list.rows.map((r) => {
            const f = r.fields;
            let status: PurchaseItem["status"] = "draft";
            if (r.statusId === 2) status = "approved";
            else if (r.statusId === 1) status = "pending";
            else if (r.statusId === 3 || r.statusId === -1) status = "rejected";

            const branchLabel =
              r.branchId === "CN01"
                ? "Chi nhánh 1 (Trung tâm)"
                : r.branchId === "CN02"
                ? "Chi nhánh 2 (Kho Dược)"
                : `Chi nhánh ${r.branchId}`;

            const dateStr = f?.purchaseDate ? f.purchaseDate.slice(0, 10) : r.purchaseDate ? r.purchaseDate.slice(0, 10) : "—";
            const totalStr = f?.price ? formatVND(f.price, f.currencyId || "VND") : "Chi tiết dòng";
            const purposeStr = f?.purposeDescOrClient || f?.notes || `Yêu cầu bổ sung thuốc / vật tư y tế [${r.documentId}]`;

            return {
              id: r.documentId,
              code: r.documentId,
              date: dateStr,
              creator: f?.personSuggest || r.personSuggest || "Dược sĩ phụ trách",
              department: f?.department || r.department || "Kho Dược GSP",
              branch: branchLabel,
              purpose: purposeStr,
              status,
              totalAmount: totalStr,
              notes: f?.notes,
              currencyId: f?.currencyId,
              objectId: f?.objectId,
              rateExchange: f?.rateExchange,
              headerFields: f,
              lines: [],
            };
          });

          setPurchases(mapped);
          onCountChange?.(mapped.length);
          lastFetchedRef.current = Date.now();
        } else {
          setPurchases([]);
          onCountChange?.(0);
        }
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [search, currentBranch, purchases.length, onCountChange]
  );

  // Initial and search-triggered fetch
  useEffect(() => {
    loadPurchases();
  }, [search, currentBranch]);

  // Tab activation: stale-while-revalidate caching
  useEffect(() => {
    if (isActive) {
      const now = Date.now();
      if (now - lastFetchedRef.current > 45000 || purchases.length === 0) {
        loadPurchases(purchases.length > 0);
      }
    }
  }, [isActive, loadPurchases, purchases.length]);

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

          const lines = (src?.lines && src.lines.length > 0)
            ? src.lines.map((l, idx) => ({
                lineId: l.userAutoId || `line-${idx}`,
                itemId: l.itemId,
                itemName: `Dược phẩm [${l.itemId}]`,
                specification: l.model || "Tiêu chuẩn Dược điển",
                unit: "Hộp/Đơn vị",
                quantity: l.quantity,
                unitPrice: formatVND(l.unitPrice, headerFields?.currencyId || "VND"),
                amount: l.totalPrice ? formatVND(l.totalPrice, headerFields?.currencyId || "VND") : formatVND(l.unitPrice, headerFields?.currencyId || "VND"),
                budget: l.budget,
                timeRequired: l.timeRequired,
                fields: l,
              }))
            : doc.lines.map((l) => ({
                lineId: l.lineId,
                itemId: l.values.itemId,
                itemName: `Dược phẩm [${l.values.itemId}]`,
                specification: l.values.model || "Tiêu chuẩn Dược điển",
                unit: "Hộp/Đơn vị",
                quantity: l.values.quantity,
                unitPrice: formatVND(l.values.unitPrice, headerFields?.currencyId || "VND"),
                amount: l.values.totalPrice ? formatVND(l.values.totalPrice, headerFields?.currencyId || "VND") : formatVND(l.values.unitPrice, headerFields?.currencyId || "VND"),
                budget: l.values.budget,
                timeRequired: l.values.timeRequired,
              }));

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
    const matchStatus = filterStatus === "all" || item.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const getStatusBadge = (status: PurchaseItem["status"]) => {
    switch (status) {
      case "pending":
        return (
          <UntitledBadge variant="warning" size="sm" dot>
            Chờ duyệt
          </UntitledBadge>
        );
      case "approved":
        return (
          <UntitledBadge variant="success" size="sm" dot>
            Đã duyệt
          </UntitledBadge>
        );
      case "draft":
        return (
          <UntitledBadge variant="gray" size="sm" dot>
            Dự thảo
          </UntitledBadge>
        );
      case "rejected":
        return (
          <UntitledBadge variant="error" size="sm" dot>
            Từ chối
          </UntitledBadge>
        );
    }
  };

  const handleApprove = (id: string) => {
    setPurchases((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "approved" as const } : p))
    );
    if (activeItem && activeItem.id === id) {
      setActiveItem({ ...activeItem, status: "approved" });
    }
  };

  const handleReject = (id: string) => {
    setPurchases((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "rejected" as const } : p))
    );
    if (activeItem && activeItem.id === id) {
      setActiveItem({ ...activeItem, status: "rejected" });
    }
  };

  return (
    <div className="space-y-4 pb-24 animate-uui-fade-in">
      {/* Search & Actions Bar */}
      <div className="space-y-2.5">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Tìm theo số phiếu PR, người lập, nội dung..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
            />
          </div>

          <button
            type="button"
            onClick={() => loadPurchases(false)}
            disabled={isRefreshing}
            className="p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors shrink-0 disabled:opacity-50"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin text-purple-600" : ""}`} />
          </button>

          <UntitledButton
            variant="primary"
            size="md"
            onClick={onOpenCreateModal}
            iconLeading={<Plus className="size-4" />}
          >
            Tạo mới
          </UntitledButton>
        </div>

        {/* Filter Chips Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: "all", label: "Tất cả", count: purchases.length },
            {
              id: "pending",
              label: "Chờ duyệt",
              count: purchases.filter((p) => p.status === "pending").length,
            },
            {
              id: "approved",
              label: "Đã duyệt",
              count: purchases.filter((p) => p.status === "approved").length,
            },
            {
              id: "draft",
              label: "Dự thảo",
              count: purchases.filter((p) => p.status === "draft").length,
            },
            {
              id: "rejected",
              label: "Từ chối",
              count: purchases.filter((p) => p.status === "rejected").length,
            },
          ].map((chip) => {
            const isSelected = filterStatus === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilterStatus(chip.id)}
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

      {/* List of Purchases (Mobile Cards) */}
      <div className="space-y-3">
        {error ? (
          <div className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/30 p-6 text-center space-y-3">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">{error}</p>
            <UntitledButton
              variant="secondary-gray"
              size="sm"
              onClick={() => loadPurchases(false)}
              iconLeading={<RefreshCw className="size-3.5" />}
            >
              Thử lại
            </UntitledButton>
          </div>
        ) : loading && purchases.length === 0 ? (
          <DocumentCardSkeleton count={4} />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center space-y-3">
            <FileText className="size-10 text-neutral-400 mx-auto stroke-[1.4]" />
            <div>
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                Không tìm thấy phiếu yêu cầu mua sắm nào
              </p>
              <p className="text-xs text-neutral-400 mt-0.5">
                Chưa có dữ liệu cho chi nhánh này hoặc từ khóa tìm kiếm chưa khớp.
              </p>
            </div>
            <UntitledButton
              variant="secondary-gray"
              size="sm"
              onClick={() => loadPurchases(false)}
              iconLeading={<RefreshCw className="size-3.5" />}
            >
              Tải lại dữ liệu
            </UntitledButton>
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              data-purchase-id={item.code}
              onClick={() => handleOpenDetail(item)}
              className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 hover:border-purple-300 dark:hover:border-purple-800 p-4 transition-all duration-150 cursor-pointer shadow-xs active:scale-[0.99] group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-purple-700 dark:text-purple-300">
                      {item.code}
                    </span>
                    {getStatusBadge(item.status)}
                  </div>
                  <h4 className="text-sm font-bold text-neutral-900 dark:text-white truncate">
                    {item.purpose}
                  </h4>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-sm font-extrabold text-neutral-900 dark:text-white block">
                    {item.totalAmount}
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    {item.lines.length > 0 ? `${item.lines.length} mặt hàng` : "Xem chi tiết"}
                  </span>
                </div>
              </div>

              {/* Meta details */}
              <div className="mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                  <User className="size-3.5 text-neutral-400 shrink-0" />
                  <span className="truncate">{item.creator}</span>
                </div>

                <div className="flex items-center gap-1.5 text-neutral-400 shrink-0">
                  <Calendar className="size-3.5" />
                  <span>{item.date}</span>
                  <ChevronRight className="size-4 text-neutral-400 group-hover:text-purple-600 transition-colors ml-1" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Item Detail Bottom Sheet */}
      <UntitledBottomSheet
        open={Boolean(activeItem)}
        onClose={() => {
          setActiveItem(null);
          onCloseDetailModal?.();
        }}
        title={activeItem?.code || "Chi tiết phiếu mua sắm"}
        subtitle={`${activeItem?.department} · ${activeItem?.branch}`}
        footer={
          activeItem && (
            <div className="flex gap-2">
              {activeItem.status === "pending" && (
                <>
                  <UntitledButton
                    variant="destructive"
                    size="md"
                    fullWidth
                    onClick={() => handleReject(activeItem.id)}
                  >
                    Từ chối
                  </UntitledButton>
                  <UntitledButton
                    variant="primary"
                    size="md"
                    fullWidth
                    onClick={() => handleApprove(activeItem.id)}
                    iconLeading={<CheckCircle2 className="size-4" />}
                  >
                    Phê duyệt
                  </UntitledButton>
                </>
              )}
              {activeItem.status !== "pending" && (
                <UntitledButton
                  variant="secondary-gray"
                  size="md"
                  fullWidth
                  onClick={() => alert("Đang chuẩn bị lệnh in ERP cho phiếu " + activeItem.code)}
                  iconLeading={<Printer className="size-4" />}
                >
                  In phiếu ERP
                </UntitledButton>
              )}
            </div>
          )
        }
      >
        {activeItem && (
          <div className="space-y-4">
            {/* Status & Overview Box */}
            <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/80 dark:border-neutral-700/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-neutral-400 block">Trạng thái</span>
                <div className="mt-0.5">{getStatusBadge(activeItem.status)}</div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-neutral-400 block">Tổng thanh toán</span>
                <span className="text-base font-extrabold text-purple-700 dark:text-purple-300">
                  {activeItem.totalAmount}
                </span>
              </div>
            </div>

            {/* Information Grid */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Mã đề nghị mua:</span>
                <span className="font-mono font-bold text-neutral-900 dark:text-white">
                  {activeItem.code}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Mục đích yêu cầu:</span>
                <span className="font-semibold text-neutral-900 dark:text-white max-w-[60%] text-right">
                  {activeItem.purpose}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Người đề nghị:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {activeItem.creator}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Phòng ban đề xuất:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {activeItem.department}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Ngày lập phiếu:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {activeItem.date}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Chi nhánh trực thuộc:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {activeItem.branch}
                </span>
              </div>
              {activeItem.objectId && (
                <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500">Đối tượng liên kết:</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {activeItem.objectId}
                  </span>
                </div>
              )}
              {activeItem.notes && (
                <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500">Ghi chú bổ sung:</span>
                  <span className="font-semibold text-neutral-900 dark:text-white max-w-[60%] text-right">
                    {activeItem.notes}
                  </span>
                </div>
              )}
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
                          Số lượng: <strong className="text-purple-600">{line.quantity}</strong> {line.unit}
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
