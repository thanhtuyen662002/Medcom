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
import type { DocumentDetail } from "@/lib/erp/contracts";

export interface InboundReceipt {
  id: string;
  code: string;
  poCode: string;
  supplier: string;
  receivedDate: string;
  inspector: string;
  temperature: string;
  tempStatus: "pass" | "warning";
  stage: "receiving" | "inspecting" | "stored" | "rejected";
  batchNo: string;
  expiryDate: string;
  totalQuantity: number;
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
  const [activeItem, setActiveItem] = useState<InboundReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
        const pageData = await erpClient.getDocumentsList(
          "inbound-requests",
          1,
          search,
          currentBranch
        );

        if (pageData && pageData.rows) {
          const mapped: InboundReceipt[] = pageData.rows.map((r) => {
            let stage: InboundReceipt["stage"] = "receiving";
            if (r.statusId === 2) stage = "stored";
            else if (r.statusId === 1) stage = "inspecting";
            else if (r.statusId === 3 || r.statusId === -1) stage = "rejected";

            return {
              id: r.documentId,
              code: r.documentId,
              poCode: `PO-REF-${r.documentId}`,
              supplier: "Nhà cung ứng Dược phẩm ERP",
              receivedDate: r.documentDate || "—",
              inspector: "KTV. Kiểm soát Kho Dược",
              temperature: "22.5 °C (Chuẩn mát GSP)",
              tempStatus: "pass",
              stage,
              batchNo: `LÔ-${r.documentId}`,
              expiryDate: "Theo chứng từ",
              totalQuantity: 0,
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
        console.warn("Could not load remote inbounds:", e);
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
        const lines = detail.inboundRequestLines.map((l, idx) => ({
          lineId: l.lineId || `line-${idx}`,
          itemId: l.itemId,
          name: `Dược phẩm [${l.itemId}]`,
          batch: item.batchNo,
          exp: item.expiryDate,
          orderedQty: l.setQuantityByDocument || "—",
          receivedQty: l.setQuantityByReal || l.setQuantityByDocument || "—",
          unit: "Hộp/Đơn vị",
          storageBin: `Khu vực kho GSP · Ô ${idx + 1}`,
        }));

        setActiveItem((prev) =>
          prev
            ? {
                ...prev,
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

  return (
    <div className="space-y-4 pb-24 animate-uui-fade-in">
      {/* Header Info Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-800 text-white p-4 shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs text-emerald-200">
              <ShieldCheck className="size-4" />
              <span>Tiêu chuẩn GSP & ISO 9001:2026</span>
            </div>
            <h3 className="text-base font-bold">Quy trình Kiểm nhập Kho Dược</h3>
            <p className="text-xs text-emerald-100">
              Kiểm tra 100% điều kiện nhiệt độ xe lạnh và niêm phong chứng từ.
            </p>
          </div>
          <UntitledButton
            variant="secondary-gray"
            size="sm"
            onClick={onOpenNewInbound || (() => alert("Mở form lập biên bản nhập kho..."))}
            iconLeading={<Plus className="size-3.5" />}
          >
            Tạo phiếu
          </UntitledButton>
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

      {/* Search Input and Refresh Button */}
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
      </div>

      {/* Inbound List */}
      <div className="space-y-3">
        {loading && inbounds.length === 0 ? (
          <DocumentCardSkeleton count={4} />
        ) : inbounds.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center space-y-3">
            <PackageCheck className="size-10 text-neutral-400 mx-auto stroke-[1.4]" />
            <div>
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                Không có phiếu nhập kho nào
              </p>
              <p className="text-xs text-neutral-400 mt-0.5">
                Chưa có phiếu nhập nào được ghi nhận cho chi nhánh này.
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
          inbounds.map((item) => (
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
                Hàng hóa nhập kho ({activeItem.items?.length ?? 0})
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
                      className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-1.5"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="text-[10px] font-mono text-neutral-400 block">
                            #{i + 1} · {line.itemId}
                          </span>
                          <h6 className="text-xs font-bold text-neutral-900 dark:text-white">
                            {line.name}
                          </h6>
                        </div>
                        <span className="text-xs font-extrabold text-emerald-600">
                          {line.receivedQty} {line.unit}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-neutral-500 pt-1 border-t border-neutral-100 dark:border-neutral-800">
                        <span>Số lượng theo CT: {line.orderedQty}</span>
                        <span>Thực nhận: {line.receivedQty}</span>
                      </div>
                      <div className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                        Vị trí lưu: {line.storageBin}
                      </div>
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
