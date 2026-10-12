"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  PackageCheck,
  Search,
  Plus,
  ThermometerSnowflake,
  ShieldCheck,
  Truck,
  CheckCircle2,
  Clock,
  Building2,
  Calendar,
  ChevronRight,
  Barcode,
  RefreshCw,
  Layers,
} from "lucide-react";
import { UntitledBadge } from "./badge";
import { UntitledButton } from "./button";
import { UntitledBottomSheet } from "./bottom-sheet";
import { DocumentCardSkeleton, DetailLinesSkeleton } from "./skeleton";
import { erpClient } from "@/lib/erp/erp-client";
import type { DocumentDetail, InboundRequestHeader, InboundRequestLineFields } from "@/lib/erp/contracts";
import { errorMessage } from "@/lib/erp/api";

function formatVND(value?: string | null, currency = "VND"): string {
  if (!value) return "0 " + currency;
  if (value.includes("VND") || value.includes("USD") || value.includes("₫") || value.includes("$")) return value;
  const parts = value.split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.length > 1 ? `${intPart},${parts[1]} ${currency}` : `${intPart} ${currency}`;
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
  temperature: string;
  tempStatus: "pass" | "warning";
  stage: "receiving" | "inspecting" | "stored" | "rejected";
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
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [activeItem, setActiveItem] = useState<InboundReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const lastFetchedRef = useRef<number>(0);

  const loadInbounds = useCallback(
    async (isBackground = false) => {
      if (!isBackground) {
        if (inbounds.length === 0) setLoading(true);
        else setIsRefreshing(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        setError(null);
        const pageData = await erpClient.getDocumentsList(
          "inbound-requests",
          1,
          search,
          currentBranch
        );

        if (pageData && pageData.rows) {
          const mapped: InboundReceipt[] = pageData.rows.map((r) => {
            const raw = r as Record<string, unknown>;
            const h = r.inboundRequestHeader;
            let stage: InboundReceipt["stage"] = "receiving";
            if (r.statusId === 2) stage = "stored";
            else if (r.statusId === 1) stage = "inspecting";
            else if (r.statusId === 3 || r.statusId === -1) stage = "rejected";

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
                ? h.documentDate.slice(0, 10)
                : r.documentDate
                ? r.documentDate.slice(0, 10)
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
              temperature: "22.5 °C (Chuẩn mát GSP)",
              tempStatus: "pass",
              stage,
              batchNo: declarationNumber ? `TK: ${declarationNumber}` : `LÔ-${r.documentId}`,
              expiryDate: "Theo chứng từ",
              totalQuantity: 0,
              header: h,
              items: [],
            };
          });

          setInbounds(mapped);
          onCountChange?.(mapped.length);
          lastFetchedRef.current = Date.now();
        } else {
          setInbounds([]);
          onCountChange?.(0);
        }
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [search, currentBranch, inbounds.length, onCountChange]
  );

  // Initial and search/branch fetch
  useEffect(() => {
    loadInbounds();
  }, [search, currentBranch]);

  // Tab activation: stale-while-revalidate caching
  useEffect(() => {
    if (isActive) {
      const now = Date.now();
      if (now - lastFetchedRef.current > 45000 || inbounds.length === 0) {
        loadInbounds(inbounds.length > 0);
      }
    }
  }, [isActive, loadInbounds, inbounds.length]);

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
          const exp = (rawL.expireDateDisplay as string) || (expVal ? expVal.slice(0, 10) : item.expiryDate);
          const unitPriceVal = (rawL.unitPriceDisplay as string) || f?.unitPrice || (rawL.unitPrice as string);
          const amountVal = (rawL.amountDisplay as string) || (rawL.totalPriceDisplay as string) || f?.amount || (rawL.amount as string);
          const unitPriceStr = (rawL.unitPriceDisplay as string) || (unitPriceVal ? formatVND(unitPriceVal, "VND") : undefined);
          const amountStr = (rawL.amountDisplay as string) || (amountVal ? formatVND(amountVal, "VND") : undefined);
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

  const getStageBadge = (stage: InboundReceipt["stage"]) => {
    switch (stage) {
      case "stored":
        return (
          <UntitledBadge variant="success" size="sm" dot>
            Đã nhập kệ GSP
          </UntitledBadge>
        );
      case "inspecting":
        return (
          <UntitledBadge variant="purple" size="sm" dot>
            Đang kiểm định
          </UntitledBadge>
        );
      case "receiving":
        return (
          <UntitledBadge variant="warning" size="sm" dot>
            Chờ kiểm hàng
          </UntitledBadge>
        );
      case "rejected":
        return (
          <UntitledBadge variant="error" size="sm" dot>
            Từ chối lô
          </UntitledBadge>
        );
    }
  };

  const handleAdvanceStage = (id: string) => {
    setInbounds((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const nextStage: InboundReceipt["stage"] =
          item.stage === "receiving"
            ? "inspecting"
            : item.stage === "inspecting"
            ? "stored"
            : "stored";
        return { ...item, stage: nextStage };
      })
    );
    if (activeItem && activeItem.id === id) {
      setActiveItem((prev) => (prev ? { ...prev, stage: "stored" } : null));
    }
  };

  const filtered = inbounds.filter((item) => {
    if (stageFilter !== "all" && item.stage !== stageFilter) return false;
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
    <div className="space-y-4 pb-24 animate-uui-fade-in">
      {/* Search & Actions Bar */}
      <div className="space-y-2.5">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Tìm theo số phiếu nhập, số PO, nhà cung cấp..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
            />
          </div>

          <button
            type="button"
            onClick={() => loadInbounds(false)}
            disabled={isRefreshing}
            className="p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors shrink-0 disabled:opacity-50"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin text-purple-600" : ""}`} />
          </button>

          <UntitledButton
            variant="primary"
            size="md"
            onClick={onOpenNewInbound || (() => alert("Mở form lập Yêu cầu nhập kho..."))}
            iconLeading={<Plus className="size-4" />}
          >
            Tạo mới
          </UntitledButton>
        </div>

        {/* Filter Chips Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: "all", label: "Tất cả", count: inbounds.length },
            { id: "receiving", label: "Cổng kho", count: inbounds.filter((i) => i.stage === "receiving").length },
            { id: "inspecting", label: "Kiểm nghiệm GSP", count: inbounds.filter((i) => i.stage === "inspecting").length },
            { id: "stored", label: "Đã nhập kệ", count: inbounds.filter((i) => i.stage === "stored").length },
          ].map((chip) => {
            const isSelected = stageFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setStageFilter(chip.id)}
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

      {/* Inbound List */}
      <div className="space-y-3">
        {error ? (
          <div className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/30 p-6 text-center space-y-3">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">{error}</p>
            <UntitledButton
              variant="secondary-gray"
              size="sm"
              onClick={() => loadInbounds(false)}
              iconLeading={<RefreshCw className="size-3.5" />}
            >
              Thử lại
            </UntitledButton>
          </div>
        ) : loading && inbounds.length === 0 ? (
          <DocumentCardSkeleton count={4} />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center space-y-3">
            <PackageCheck className="size-10 text-neutral-400 mx-auto stroke-[1.4]" />
            <div>
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                Không có phiếu nhập kho nào
              </p>
              <p className="text-xs text-neutral-400 mt-0.5">
                Chưa có phiếu nhập nào khớp với bộ lọc hoặc tìm kiếm.
              </p>
            </div>
            <UntitledButton
              variant="secondary-gray"
              size="sm"
              onClick={() => loadInbounds(false)}
              iconLeading={<RefreshCw className="size-3.5" />}
            >
              Tải lại dữ liệu
            </UntitledButton>
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => handleOpenDetail(item)}
              className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 hover:border-purple-300 dark:hover:border-purple-800 p-4 transition-all duration-150 cursor-pointer shadow-xs active:scale-[0.99] group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {item.code}
                    </span>
                    {getStageBadge(item.stage)}
                  </div>
                  <h4 className="text-sm font-bold text-neutral-900 dark:text-white truncate">
                    {item.supplier}
                  </h4>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Mã chứng từ: <span className="font-mono">{item.code}</span>
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 block">
                    {item.items.length > 0 ? `${item.items.length} mặt hàng` : "Xem chi tiết"}
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    {item.receivedDate}
                  </span>
                </div>
              </div>

              {/* Inbound Meta */}
              <div className="mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
                <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                  <Calendar className="size-3.5 text-purple-600" />
                  <span className="font-medium">{item.receivedDate}</span>
                </div>

                <div className="flex items-center gap-1 text-neutral-400">
                  <span>{item.inspector}</span>
                  <ChevronRight className="size-4 group-hover:text-purple-600 transition-colors ml-1" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Inbound Detail Bottom Sheet */}
      <UntitledBottomSheet
        open={Boolean(activeItem)}
        onClose={() => setActiveItem(null)}
        title={activeItem?.code || "Chi tiết biên bản nhập kho"}
        subtitle={`Chứng từ ERP: ${activeItem?.code}`}
        footer={
          activeItem && activeItem.stage !== "stored" ? (
            <div className="flex gap-2">
              <UntitledButton
                variant="primary"
                size="md"
                fullWidth
                onClick={() => handleAdvanceStage(activeItem.id)}
                iconLeading={<CheckCircle2 className="size-4" />}
              >
                Xác nhận vào kệ kho
              </UntitledButton>
            </div>
          ) : null
        }
      >
        {activeItem && (
          <div className="space-y-4 pb-12">
            {/* THẺ THÔNG TIN CHUNG CHỨNG TỪ (Unified Card) */}
            <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-neutral-100 dark:border-neutral-800">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
                    Mã chứng từ
                  </span>
                  <p className="font-mono text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                    {activeItem.code}
                  </p>
                </div>
                <div>{getStageBadge(activeItem.stage)}</div>
              </div>

              {/* Tên đối tượng / Nhà cung cấp (ObjectName - có thể dài nên bố trí trọn dòng rõ ràng) */}
              <div className="py-1 border-b border-neutral-100 dark:border-neutral-800/60">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold block mb-1">
                  Nhà cung cấp / Đối tượng (ObjectName)
                </span>
                <p className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white leading-relaxed break-words">
                  {activeItem.supplier}
                </p>
              </div>

              {/* Chi tiết thông số thuộc tính */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                {activeItem.orderNumber && (
                  <div className="flex flex-col py-1">
                    <span className="text-[10px] text-neutral-400">Mã Đề nghị mua hàng PO</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200 font-mono">
                      {activeItem.orderNumber}
                    </span>
                  </div>
                )}
                {activeItem.invoiceNo && (
                  <div className="flex flex-col py-1">
                    <span className="text-[10px] text-neutral-400">Số hóa đơn VAT</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {activeItem.invoiceNo}
                    </span>
                  </div>
                )}
                <div className="flex flex-col py-1">
                  <span className="text-[10px] text-neutral-400">Ngày lập chứng từ</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {activeItem.receivedDate}
                  </span>
                </div>
                <div className="flex flex-col py-1">
                  <span className="text-[10px] text-neutral-400">Người kiểm soát</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {activeItem.inspector}
                  </span>
                </div>
                {activeItem.departurePoint && activeItem.destinationPoint && (
                  <div className="flex flex-col py-1 sm:col-span-2">
                    <span className="text-[10px] text-neutral-400">Tuyến vận chuyển</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200 break-words">
                      {activeItem.departurePoint} → {activeItem.destinationPoint}
                    </span>
                  </div>
                )}
                {activeItem.header?.totalPalletQuantityByDocument && (
                  <div className="flex flex-col py-1">
                    <span className="text-[10px] text-neutral-400">Tổng Pallet (CT / Thực tế)</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {activeItem.header.totalPalletQuantityByDocument} / {activeItem.header.totalPalletQuantityByReal || "—"} pallet
                    </span>
                  </div>
                )}
                {activeItem.header?.totalBarrelQuantityByDocument && (
                  <div className="flex flex-col py-1">
                    <span className="text-[10px] text-neutral-400">Tổng thùng (CT / Thực tế)</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {activeItem.header.totalBarrelQuantityByDocument} / {activeItem.header.totalBarrelQuantityByReal || "—"} thùng
                    </span>
                  </div>
                )}
                {activeItem.header?.notes && (
                  <div className="flex flex-col py-1 sm:col-span-2">
                    <span className="text-[10px] text-neutral-400">Ghi chú</span>
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
                      <div className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
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
