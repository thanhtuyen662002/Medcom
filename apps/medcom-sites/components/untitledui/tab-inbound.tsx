"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ScreenHeader, ScreenToolbar, FilterChips, FilterSheet, RecordList, CreateFab, StatusBadge, type RecordColumn } from "@/components/app";
import { UntitledBottomSheet } from "./bottom-sheet";
import { DetailLinesSkeleton } from "./skeleton";
import { erpClient } from "@/lib/erp/erp-client";
import type { DocumentDetail, InboundRequestHeader, InboundRequestLineFields } from "@/lib/erp/contracts";
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

export interface InboundReceipt {
  id: string;
  code: string;
  poCode: string;
  invoiceNo?: string;
  orderNumber?: string;
  departurePoint?: string;
  destinationPoint?: string;
  supplier: string;
  receivedDate: string;
  inspector: string;
  statusName?: string | null;
  statusForeColor?: string | null;
  statusBackColor?: string | null;
  /** ERP status identity (IV_InboundRequestStatusTbl); statusName is its label. */
  statusId: number | null;
  batchNo: string;
  expiryDate: string;
  totalQuantity: number;
  header?: InboundRequestHeader;
  items: {
    lineId: string;
    itemId: string;
    name: string;
    batch: string;
    exp: string;
    orderedQty: string;
    receivedQty: string;
    unit: string;
    storageBin: string;
    hangSX?: string | null;
    unitPrice?: string;
    amount?: string;
    checkerNote?: string | null;
    testStatus?: string | null;
    fields?: InboundRequestLineFields;
  }[];
}

export interface TabInboundProps {
  currentBranch?: string;
  isActive?: boolean;
  onCountChange?: (count: number) => void;
  onOpenNewInbound?: () => void;
}

export function TabInbound({
  currentBranch = "CN01",
  isActive = true,
  onCountChange,
  onOpenNewInbound,
}: TabInboundProps) {
  const [inbounds, setInbounds] = useState<InboundReceipt[]>([]);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [hasMore, setHasMore] = useState(false);
  const listSeqRef = useRef(0);
  const [activeItem, setActiveItem] = useState<InboundReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const lastFetchedRef = useRef<number>(0);

  const loadInbounds = useCallback(
    async (isBackground = false, targetPage = page, targetPageSize = pageSize) => {
      const seq = ++listSeqRef.current;
      if (!isBackground) setLoading(true);
      else setIsRefreshing(true);
      try {
        setError(null);
        const pageData = await erpClient.getDocumentsList(
          "inbound-requests",
          targetPage,
          search,
          currentBranch,
          targetPageSize
        );

        if (seq !== listSeqRef.current) return;
        if (pageData && pageData.rows) {
          const mapped: InboundReceipt[] = pageData.rows.map((r) => {
            const raw = r as Record<string, unknown>;
            const h = r.inboundRequestHeader;

            const orderNumber = h?.orderNumber || (raw.orderNumber as string);
            const poRef = orderNumber || `PO-${r.documentId}`;
            const objectId =
              (raw.objectName as string) ||
              (raw.objectIdName as string) ||
              (h as any)?.objectName ||
              h?.objectId ||
              (raw.objectId as string) ||
              (raw.supplierName as string) ||
              (raw.vendorName as string);
            const supplierName = objectId ? (objectId.startsWith("NCC") ? objectId : `NCC: ${objectId}`) : "Nhà cung ứng Dược phẩm ERP";
            const invoiceNo = h?.invoiceNo || (raw.invoiceNo as string);
            const departurePoint = h?.departurePoint || (raw.departurePoint as string);
            const destinationPoint = h?.destinationPoint || (raw.destinationPoint as string);
            const docDate =
              (raw.documentDateDisplay as string) ||
              (h as any)?.documentDateDisplay ||
              (h?.documentDate
                ? h.documentDate
                : r.documentDate
                ? r.documentDate
                : "—");
            const declarationNumber =
              h?.declarationNumber || (raw.declarationNumber as string);

            return {
              id: r.documentId,
              code: r.documentId,
              poCode: poRef,
              orderNumber,
              invoiceNo,
              departurePoint,
              destinationPoint,
              supplier: supplierName,
              receivedDate: docDate,
              inspector: h?.qrPrintType
                ? `KTV. ${h.qrPrintType}`
                : (raw.qrPrintType as string)
                ? `KTV. ${raw.qrPrintType}`
                : "KTV. Kiểm soát Kho Dược",
              statusName: r.statusName,
              statusForeColor: typeof r.statusForeColor === "string" ? r.statusForeColor : null,
              statusBackColor: typeof r.statusBackColor === "string" ? r.statusBackColor : null,
              statusId: r.statusId ?? null,
              batchNo: declarationNumber ? `TK: ${declarationNumber}` : `LÔ-${r.documentId}`,
              expiryDate: "Theo chứng từ",
              totalQuantity: 0,
              header: h,
              items: [],
            };
          });

          setInbounds(mapped);
          setPage(pageData.page);
          setPageSize(pageData.pageSize);
          setHasMore(pageData.hasMore);
          onCountChange?.(mapped.length);
          lastFetchedRef.current = Date.now();
        } else {
          setInbounds([]);
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

  // Query changes start at page one; stale activation refreshes the current page.
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
      void loadInbounds(!queryChanged, queryChanged ? 1 : page);
    }
  }, [search, currentBranch, isActive, loadInbounds, page]);

  const handleOpenDetail = async (item: InboundReceipt) => {
    setActiveItem(item);
    setDetailLoading(true);

    try {
      const detail = await erpClient.getDocumentDetail("inbound-requests", item.id);
      if (detail && detail.inboundRequestLines) {
        const header = detail.document.inboundRequestHeader || item.header;
        const lines = detail.inboundRequestLines.map((l, idx) => {
          const f = l.fields;
          const rawL = l as Record<string, unknown>;
          const lot =
            f?.lotNumberByReal ||
            (rawL.lotNumberByReal as string) ||
            f?.lotNumberByDocument ||
            (rawL.lotNumberByDocument as string) ||
            (rawL.lotNumber as string) ||
            item.batchNo;
          const expVal =
            f?.expireDateByReal ||
            (rawL.expireDateByReal as string) ||
            f?.expireDateByDocument ||
            (rawL.expireDateByDocument as string) ||
            (rawL.expireDate as string);
          const exp = formatDateTime((rawL.expireDateDisplay as string) || expVal || item.expiryDate);
          const unitPriceVal = f?.unitPrice ?? (rawL.unitPrice as string);
          const amountVal = f?.amount ?? (rawL.amount as string);
          const unitPriceStr = unitPriceVal != null ? formatVND(unitPriceVal, "VND") : (rawL.unitPriceDisplay as string) || undefined;
          const amountStr = amountVal != null ? formatVND(amountVal, "VND") : (rawL.amountDisplay as string) || (rawL.totalPriceDisplay as string) || undefined;
          const orderedQty =
            f?.setQuantityByDocument ||
            l.setQuantityByDocument ||
            (rawL.setQuantityByDocument as string) ||
            (rawL.quantity as string) ||
            "—";
          const receivedQty =
            f?.setQuantityByReal ||
            l.setQuantityByReal ||
            (rawL.setQuantityByReal as string) ||
            orderedQty;
          const unit =
            (rawL.unit as string) ||
            f?.unit2 ||
            (rawL.unit2 as string) ||
            "Hộp";
          const itemName =
            (rawL.itemName as string) ||
            (f as Record<string, unknown> | undefined)?.itemName ||
            (rawL.itemDescription as string) ||
            (l.itemId ? `Dược phẩm [${l.itemId}]` : "Vật tư y tế");
          const hangSX = f?.hangSX || (rawL.hangSX as string);
          const checkerNote = f?.checkerNote || (rawL.checkerNote as string);
          const testStatus = f?.testStatus || (rawL.testStatus as string);

          return {
            lineId: l.lineId || `line-${idx}`,
            itemId: l.itemId,
            name: String(itemName),
            batch: lot,
            exp,
            orderedQty,
            receivedQty,
            unit: String(unit),
            storageBin: `Khu vực kho GSP · Ô ${idx + 1}`,
            hangSX,
            unitPrice: unitPriceStr,
            amount: amountStr,
            checkerNote,
            testStatus,
            fields: f,
          };
        });

        setActiveItem((prev) =>
          prev
            ? {
                ...prev,
                header,
                totalQuantity: lines.length,
                items: lines,
              }
            : prev
        );
      }
    } catch (e) {
      console.warn("Could not fetch remote inbound detail:", e);
    } finally {
      setDetailLoading(false);
    }
  };

  const getStageBadge = (item: InboundReceipt) => <StatusBadge {...erpStatusDisplay(item)} statusForeColor={item.statusForeColor} statusBackColor={item.statusBackColor} />;
  const statuses = erpStatusChips(inbounds);
  const tableColumns: RecordColumn<InboundReceipt>[] = [
    { id: "document", label: "Mã phiếu nhập", render: item => <span className="font-mono font-semibold text-brand-700 dark:text-brand-300">{item.code}</span> },
    { id: "date", label: "Ngày chứng từ", className: "whitespace-nowrap", render: item => formatDateTime(item.receivedDate) },
    { id: "supplier", label: "Nhà cung cấp", className: "min-w-60 max-w-sm", render: item => <span className="line-clamp-2 break-words">{item.supplier}</span> },
    { id: "status", label: "Trạng thái", render: getStageBadge },
    { id: "order", label: "Đơn hàng PO", render: item => item.orderNumber || "—" },
    { id: "invoice", label: "Số hóa đơn", render: item => item.invoiceNo || "—" },
  ];

  const filtered = inbounds.filter((item) => {
    if (!matchesErpStatus(item, stageFilter)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const codeMatch = item.id.toLowerCase().includes(q) || (item.orderNumber && item.orderNumber.toLowerCase().includes(q));
      const suppMatch = item.supplier.toLowerCase().includes(q);
      const inspectorMatch = item.inspector.toLowerCase().includes(q);
      const invoiceMatch = item.header?.invoiceNo?.toLowerCase().includes(q);
      return codeMatch || suppMatch || inspectorMatch || invoiceMatch;
    }
    return true;
  });

  return (
    <div className="min-w-0 space-y-3 pb-8 animate-uui-fade-in">
      <ScreenHeader title="Nhập kho" branch={currentBranch} count={inbounds.length} />
      <ScreenToolbar search={searchInput} onSearchChange={setSearchInput} onSearch={setSearch}
        onFilter={() => setFilterOpen(true)} filterOpen={filterOpen} filterId="inbound-filters"
        filterCount={Number(Boolean(stageFilter)) + Number(pageSize !== 20)}
        refreshing={loading || isRefreshing} onRefresh={() => void loadInbounds(true)} onCreate={onOpenNewInbound} />
      <FilterChips description="Bộ lọc trạng thái và số đếm áp dụng cho trang hiện tại." items={statuses}
        value={stageFilter} onChange={setStageFilter} onPageChange={() => { if (page !== 1) void loadInbounds(false, 1); }} />
      <RecordList label="Danh sách nhập kho" rows={filtered} columns={tableColumns} rowId={item => item.id}
        card={item => ({ code: item.code, title: item.supplier, meta: [formatDateTime(item.receivedDate), item.orderNumber ? "PO: " + item.orderNumber : null, item.invoiceNo ? "Hóa đơn: " + item.invoiceNo : null], status: { ...erpStatusDisplay(item), statusForeColor: item.statusForeColor, statusBackColor: item.statusBackColor } })}
        onOpen={handleOpenDetail} loading={loading} error={error} onRetry={() => void loadInbounds(false)}
        empty={{ message: "Chưa có chứng từ khớp với tìm kiếm hoặc bộ lọc.", onCreate: onOpenNewInbound }}
        pagination={{ page, pageSize, rowCount: inbounds.length, visibleRowCount: filtered.length, hasMore, busy: loading || isRefreshing, maxPage: 1000,
          onPageChange: nextPage => void loadInbounds(false, nextPage), onPageSizeChange: size => void loadInbounds(false, 1, size) }} />
      <FilterSheet id="inbound-filters" open={filterOpen} onClose={() => setFilterOpen(false)} value={{ status: stageFilter, pageSize }} statuses={statuses}
        onApply={value => { setStageFilter(value.status); void loadInbounds(false, 1, value.pageSize); }} />
      {onOpenNewInbound && <CreateFab allowed={isActive && !activeItem && !filterOpen} label="Tạo phiếu nhập kho" onClick={onOpenNewInbound} />}

      {/* Inbound Detail Bottom Sheet */}
      <UntitledBottomSheet
        presentation="document"
        open={Boolean(activeItem)}
        onClose={() => setActiveItem(null)}
        title={activeItem?.code || "Chi tiết biên bản nhập kho"}
        subtitle={`Chứng từ ERP: ${activeItem?.code}`}
      >
        {activeItem && (
          <div className="space-y-4 pb-12">
            {/* THẺ THÔNG TIN CHUNG CHỨNG TỪ (Unified Card) */}
            <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-neutral-100 dark:border-neutral-800">
                <div className="space-y-0.5">
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Mã chứng từ
                  </span>
                  <p className="font-mono text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                    {activeItem.code}
                  </p>
                </div>
                <div>{getStageBadge(activeItem)}</div>
              </div>

              {/* Tên đối tượng / Nhà cung cấp (ObjectName - có thể dài nên bố trí trọn dòng rõ ràng) */}
              <div className="py-1 border-b border-neutral-100 dark:border-neutral-800/60">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 block mb-1">
                  Nhà cung cấp / Đối tượng
                </span>
                <p className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white leading-relaxed break-words">
                  {activeItem.supplier}
                </p>
              </div>

              {/* Chi tiết thông số thuộc tính */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                {activeItem.orderNumber && (
                  <div className="flex flex-col py-1">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Mã Đề nghị mua hàng PO</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200 font-mono">
                      {activeItem.orderNumber}
                    </span>
                  </div>
                )}
                {activeItem.invoiceNo && (
                  <div className="flex flex-col py-1">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Số hóa đơn VAT</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {activeItem.invoiceNo}
                    </span>
                  </div>
                )}
                <div className="flex flex-col py-1">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Ngày lập chứng từ</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {formatDateTime(activeItem.receivedDate)}
                  </span>
                </div>
                <div className="flex flex-col py-1">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Người kiểm soát</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {activeItem.inspector}
                  </span>
                </div>
                {activeItem.departurePoint && activeItem.destinationPoint && (
                  <div className="flex flex-col py-1 sm:col-span-2">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Tuyến vận chuyển</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200 break-words">
                      {activeItem.departurePoint} → {activeItem.destinationPoint}
                    </span>
                  </div>
                )}
                {activeItem.header?.totalPalletQuantityByDocument && (
                  <div className="flex flex-col py-1">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Tổng Pallet (CT / Thực tế)</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {activeItem.header.totalPalletQuantityByDocument} / {activeItem.header.totalPalletQuantityByReal || "—"} pallet
                    </span>
                  </div>
                )}
                {activeItem.header?.totalBarrelQuantityByDocument && (
                  <div className="flex flex-col py-1">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Tổng thùng (CT / Thực tế)</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {activeItem.header.totalBarrelQuantityByDocument} / {activeItem.header.totalBarrelQuantityByReal || "—"} thùng
                    </span>
                  </div>
                )}
                {activeItem.header?.notes && (
                  <div className="flex flex-col py-1 sm:col-span-2">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Ghi chú</span>
                    <span className="font-medium text-neutral-700 dark:text-neutral-300 break-words">
                      {activeItem.header.notes}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Items */}
            <div>
              <h5 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                Hàng hóa nhập kho ({activeItem.items?.length ?? 0} mặt hàng)
              </h5>
              <div className="space-y-2">
                {detailLoading ? (
                  <DetailLinesSkeleton count={2} />
                ) : !activeItem.items || activeItem.items.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 text-center text-xs text-neutral-400">
                    Không có dòng chi tiết hoặc chưa cập nhật danh sách mặt hàng.
                  </div>
                ) : (
                  activeItem.items.map((line, i) => (
                    <div
                      key={line.lineId || i}
                      className="p-3.5 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-1.5"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="text-[10px] font-mono text-neutral-400 block">
                            #{i + 1} · [{line.itemId}]
                          </span>
                          <h6 className="text-xs font-bold text-neutral-900 dark:text-white">
                            {line.name}
                          </h6>
                          {line.hangSX && (
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                              Hãng SX: {line.hangSX}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-extrabold text-emerald-600">
                          {line.receivedQty} {line.unit}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-neutral-500 pt-1 border-t border-neutral-100 dark:border-neutral-800">
                        <span>Lô: {line.batch}</span>
                        <span>HSD: {line.exp}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-neutral-500">
                        <span>Theo CT: {line.orderedQty}</span>
                        <span>Thực nhận: {line.receivedQty}</span>
                      </div>
                      {line.unitPrice && (
                        <div className="flex justify-between text-[11px] text-neutral-500">
                          <span>Đơn giá: {line.unitPrice}</span>
                          <span className="font-semibold text-neutral-900 dark:text-white">Thành tiền: {line.amount}</span>
                        </div>
                      )}
                      <div className="text-[11px] text-brand-600 dark:text-brand-400 font-medium">
                        Vị trí lưu: {line.storageBin}
                      </div>
                      {line.checkerNote && (
                        <p className="text-[11px] text-neutral-400 italic">
                          Ghi chú KTV: {line.checkerNote}
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
