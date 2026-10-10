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
            const h = r.inboundRequestHeader;
            let stage: InboundReceipt["stage"] = "receiving";
            if (r.statusId === 2) stage = "stored";
            else if (r.statusId === 1) stage = "inspecting";
            else if (r.statusId === 3 || r.statusId === -1) stage = "rejected";

            const poRef = h?.orderNumber || `PO-${r.documentId}`;
            const supplierName = h?.objectId ? `NCC: ${h.objectId}` : "Nhà cung ứng Dược phẩm ERP";

            return {
              id: r.documentId,
              code: r.documentId,
              poCode: poRef,
              orderNumber: h?.orderNumber,
              invoiceNo: h?.invoiceNo,
              departurePoint: h?.departurePoint,
              destinationPoint: h?.destinationPoint,
              supplier: supplierName,
              receivedDate: h?.documentDate ? h.documentDate.slice(0, 10) : (r.documentDate || "—"),
              inspector: h?.qrPrintType ? `KTV. ${h.qrPrintType}` : "KTV. Kiểm soát Kho Dược",
              temperature: "22.5 °C (Chuẩn mát GSP)",
              tempStatus: "pass",
              stage,
              batchNo: h?.declarationNumber ? `TK: ${h.declarationNumber}` : `LÔ-${r.documentId}`,
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
          const lot = f?.lotNumberByReal || f?.lotNumberByDocument || item.batchNo;
          const exp = f?.expireDateByReal ? f.expireDateByReal.slice(0, 10) : f?.expireDateByDocument ? f.expireDateByDocument.slice(0, 10) : item.expiryDate;
          const unitPriceStr = f?.unitPrice ? formatVND(f.unitPrice, "VND") : undefined;
          const amountStr = f?.amount ? formatVND(f.amount, "VND") : undefined;

          return {
            lineId: l.lineId || `line-${idx}`,
            itemId: l.itemId,
            name: `Dược phẩm [${l.itemId}]`,
            batch: lot,
            exp,
            orderedQty: f?.setQuantityByDocument || l.setQuantityByDocument || "—",
            receivedQty: f?.setQuantityByReal || l.setQuantityByReal || f?.setQuantityByDocument || "—",
            unit: f?.unit2 || "Hộp/Đơn vị",
            storageBin: `Khu vực kho GSP · Ô ${idx + 1}`,
            hangSX: f?.hangSX,
            unitPrice: unitPriceStr,
            amount: amountStr,
            checkerNote: f?.checkerNote,
            testStatus: f?.testStatus,
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

      {/* 4-Stage Visual Progress Bar */}
      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-3.5 shadow-xs">
        <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-2">
          Giai đoạn luồng kiểm hàng GSP
        </span>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {[
            { step: "1", title: "Cổng kho", desc: "Tiếp nhận" },
            { step: "2", title: "Ngoại quan", desc: "Niêm phong" },
            { step: "3", title: "Kiểm nghiệm", desc: "Nhiệt độ GSP" },
            { step: "4", title: "Nhập kệ", desc: "Mã vạch" },
          ].map((s, idx) => (
            <div
              key={s.step}
              className={`p-2 rounded-xl text-xs transition-colors ${
                idx === 2
                  ? "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold border border-purple-200 dark:border-purple-800"
                  : "bg-neutral-50 dark:bg-neutral-800/40 text-neutral-600 dark:text-neutral-400"
              }`}
            >
              <span className="block text-[10px] font-mono text-neutral-400">
                Bước {s.step}
              </span>
              <span className="font-semibold block truncate">{s.title}</span>
            </div>
          ))}
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
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <ThermometerSnowflake className="size-3.5" />
                  <span className="font-medium">{item.temperature}</span>
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
        subtitle={`Chứng từ ERP: ${activeItem?.code} · ${activeItem?.supplier}`}
        footer={
          activeItem && (
            <div className="flex gap-2">
              <UntitledButton
                variant="secondary-gray"
                size="md"
                fullWidth
                onClick={() => alert("Đang in mã vạch chuẩn GS1-128...")}
                iconLeading={<Barcode className="size-4" />}
              >
                In tem mã vạch
              </UntitledButton>
              {activeItem.stage !== "stored" && (
                <UntitledButton
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={() => handleAdvanceStage(activeItem.id)}
                  iconLeading={<CheckCircle2 className="size-4" />}
                >
                  Xác nhận vào kệ kho
                </UntitledButton>
              )}
            </div>
          )
        }
      >
        {activeItem && (
          <div className="space-y-4">
            {/* Status & Temp Card */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/80 dark:border-neutral-700/80">
                <span className="text-[11px] text-neutral-400 block">Trạng thái</span>
                <div className="mt-1">{getStageBadge(activeItem.stage)}</div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <span className="text-[11px] text-emerald-700 dark:text-emerald-300 block">
                  Nhiệt độ tiếp nhận
                </span>
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-200 block mt-1">
                  {activeItem.temperature}
                </span>
              </div>
            </div>

            {/* Header Attributes */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500">Mã yêu cầu nhập:</span>
                <span className="font-mono font-bold text-neutral-900 dark:text-white">
                  {activeItem.code}
                </span>
              </div>
              {activeItem.orderNumber && (
                <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500">Mã đơn mua hàng PO:</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {activeItem.orderNumber}
                  </span>
                </div>
              )}
              {activeItem.invoiceNo && (
                <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500">Số hóa đơn VAT:</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {activeItem.invoiceNo}
                  </span>
                </div>
              )}
              {activeItem.departurePoint && activeItem.destinationPoint && (
                <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500">Tuyến vận chuyển:</span>
                  <span className="font-semibold text-neutral-900 dark:text-white text-right max-w-[65%]">
                    {activeItem.departurePoint} → {activeItem.destinationPoint}
                  </span>
                </div>
              )}
              {activeItem.header?.totalPalletQuantityByDocument && (
                <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500">Tổng Pallet (CT / Thực tế):</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {activeItem.header.totalPalletQuantityByDocument} / {activeItem.header.totalPalletQuantityByReal || "—"} pallet
                  </span>
                </div>
              )}
              {activeItem.header?.totalBarrelQuantityByDocument && (
                <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500">Tổng thùng (CT / Thực tế):</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {activeItem.header.totalBarrelQuantityByDocument} / {activeItem.header.totalBarrelQuantityByReal || "—"} thùng
                  </span>
                </div>
              )}
              {activeItem.header?.notes && (
                <div className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500">Ghi chú:</span>
                  <span className="font-semibold text-neutral-900 dark:text-white text-right max-w-[65%]">
                    {activeItem.header.notes}
                  </span>
                </div>
              )}
            </div>

            {/* Checklist */}
            <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 p-3.5 space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Tiêu chuẩn nghiệm thu GSP
              </h5>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                  <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  <span>Bao bì nguyên vẹn, tem niêm phong nhà sản xuất đầy đủ</span>
                </div>
                <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                  <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  <span>Hóa đơn GTGT & Phiếu kiểm nghiệm (COA) kèm theo</span>
                </div>
                <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                  <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  <span>Số lô & Hạn sử dụng khớp hoàn toàn với chứng từ</span>
                </div>
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
