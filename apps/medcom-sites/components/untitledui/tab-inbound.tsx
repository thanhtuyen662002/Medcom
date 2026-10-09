"use client";

import React, { useState } from "react";
import {
  PackageCheck,
  Search,
  Plus,
  ThermometerSnowflake,
  ShieldCheck,
  Truck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  Calendar,
  Layers,
  FileCheck2,
  ChevronRight,
  Barcode,
} from "lucide-react";
import { UntitledBadge } from "./badge";
import { UntitledButton } from "./button";
import { UntitledBottomSheet } from "./bottom-sheet";
import { erpClient } from "@/lib/erp/erp-client";

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
    name: string;
    batch: string;
    exp: string;
    orderedQty: number;
    receivedQty: number;
    unit: string;
    storageBin: string;
  }[];
}

const initialInbounds: InboundReceipt[] = [
  {
    id: "NK-2026-0412",
    code: "NK-2026-0412",
    poCode: "PO-2026-0891",
    supplier: "Công ty CP Dược Hậu Giang (DHG Pharma)",
    receivedDate: "09/10/2026 14:30",
    inspector: "KTV. Trần Văn Đạt",
    temperature: "22.4 °C (Chuẩn mát 15-25°C)",
    tempStatus: "pass",
    stage: "stored",
    batchNo: "DHG-240811",
    expiryDate: "12/2027",
    totalQuantity: 2000,
    items: [
      {
        name: "Hapacol 500mg (Paracetamol)",
        batch: "DHG-240811",
        exp: "12/2027",
        orderedQty: 2000,
        receivedQty: 2000,
        unit: "Hộp",
        storageBin: "Kệ A1 · Tầng 2 · Ô 04",
      },
    ],
  },
  {
    id: "NK-2026-0411",
    code: "NK-2026-0411",
    poCode: "PO-2026-0888",
    supplier: "B. Braun Việt Nam Co., Ltd",
    receivedDate: "09/10/2026 09:15",
    inspector: "KTV. Lê Thị Thảo",
    temperature: "24.1 °C (Chuẩn phòng)",
    tempStatus: "pass",
    stage: "inspecting",
    batchNo: "BB-240902",
    expiryDate: "10/2026",
    totalQuantity: 500,
    items: [
      {
        name: "Dung dịch tiêm truyền NaCl 0.9% 500ml",
        batch: "BB-240902",
        exp: "10/2026",
        orderedQty: 500,
        receivedQty: 500,
        unit: "Chai",
        storageBin: "Khu Dịch Truyền · Kệ DT-01",
      },
    ],
  },
  {
    id: "NK-2026-0410",
    code: "NK-2026-0410",
    poCode: "PO-2026-0875",
    supplier: "Công ty CP Dược phẩm Imexpharm",
    receivedDate: "08/10/2026 16:00",
    inspector: "KTV. Trần Văn Đạt",
    temperature: "21.8 °C",
    tempStatus: "pass",
    stage: "receiving",
    batchNo: "IMP-240718",
    expiryDate: "08/2026",
    totalQuantity: 1500,
    items: [
      {
        name: "Amoxicillin 500mg",
        batch: "IMP-240718",
        exp: "08/2026",
        orderedQty: 1500,
        receivedQty: 1500,
        unit: "Hộp",
        storageBin: "Chờ nghiệm thu",
      },
    ],
  },
];

export interface TabInboundProps {
  onOpenNewInbound?: () => void;
}

export function TabInbound({ onOpenNewInbound }: TabInboundProps) {
  const [inbounds, setInbounds] = useState<InboundReceipt[]>(initialInbounds);
  const [search, setSearch] = useState("");
  const [activeItem, setActiveItem] = useState<InboundReceipt | null>(null);
  const [loading, setLoading] = useState(false);

  const loadInbounds = async () => {
    setLoading(true);
    try {
      const pageData = await erpClient.getDocumentsList("inbound-requests", 1, search, "");
      if (pageData && pageData.rows && pageData.rows.length > 0) {
        const mapped = pageData.rows.map((r) => {
          const seed = initialInbounds.find((p) => p.code === r.documentId || p.poCode === r.documentId);
          return {
            id: r.documentId,
            code: r.documentId,
            poCode: seed?.poCode || `PO-${r.documentId}`,
            supplier: seed?.supplier || "Công ty Dược phẩm Cung ứng",
            receivedDate: r.documentDate ? new Date(r.documentDate).toLocaleDateString("vi-VN") : "09/10/2026",
            inspector: seed?.inspector || "KTV. Kiểm soát Kho Dược",
            temperature: seed?.temperature || "22.5 °C (Chuẩn mát)",
            tempStatus: (seed?.tempStatus || "pass") as any,
            stage: (r.statusId === 2 ? "stored" : r.statusId === 1 ? "inspecting" : "receiving") as any,
            batchNo: seed?.batchNo || `LÔ-${r.documentId}`,
            expiryDate: seed?.expiryDate || "12/2027",
            totalQuantity: seed?.totalQuantity || 1000,
            items: seed?.items || [],
          };
        });
        setInbounds(mapped);
        return;
      }
    } catch (e) {
      console.warn("Could not load remote inbounds:", e);
    } finally {
      setLoading(false);
    }
    setInbounds(initialInbounds);
  };

  React.useEffect(() => {
    loadInbounds();
  }, [search]);

  const handleOpenDetail = async (item: InboundReceipt) => {
    setActiveItem(item);
    try {
      const detail = await erpClient.getDocumentDetail("inbound-requests", item.id);
      if (detail && detail.inboundRequestLines && detail.inboundRequestLines.length > 0) {
        setActiveItem((prev) =>
          prev
            ? {
                ...prev,
                items: detail.inboundRequestLines.map((l) => ({
                  name: `Vật tư / Dược phẩm [${l.itemId}]`,
                  batch: prev.batchNo,
                  exp: prev.expiryDate,
                  orderedQty: Number(l.setQuantityByDocument) || 100,
                  receivedQty: Number(l.setQuantityByReal) || 100,
                  unit: "Đơn vị",
                  storageBin: "Khu vực kho GSP",
                })),
              }
            : prev
        );
      }
    } catch (e) {
      console.warn("Could not fetch remote inbound detail:", e);
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
              Kiểm tra 100% điều kiện nhiệt độ xe lạnh và niêm phong lô hàng.
            </p>
          </div>
          <UntitledButton
            variant="secondary-gray"
            size="sm"
            onClick={onOpenNewInbound}
            iconLeading={<Plus className="size-3.5" />}
          >
            Tạo phiếu
          </UntitledButton>
        </div>
      </div>

      {/* 4-Stage Visual Progress Bar */}
      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-3.5 shadow-xs">
        <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-2">
          Giai đoạn luồng kiểm hàng
        </span>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {[
            { step: "1", title: "Cổng kho", desc: "Tiếp nhận xe" },
            { step: "2", title: "Ngoại quan", desc: "Niêm phong" },
            { step: "3", title: "Kiểm nghiệm", desc: "Nhiệt độ GSP" },
            { step: "4", title: "Nhập kệ", desc: "In mã vạch" },
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

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Tìm theo số phiếu nhập, số PO, nhà cung cấp, số lô..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
        />
      </div>

      {/* Inbound List */}
      <div className="space-y-3">
        {inbounds.map((item) => (
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
                  Số đơn mua: <span className="font-mono">{item.poCode}</span> · Lô: <span className="font-mono">{item.batchNo}</span>
                </p>
              </div>

              <div className="text-right shrink-0">
                <span className="text-sm font-extrabold text-neutral-900 dark:text-white block">
                  {item.totalQuantity.toLocaleString()} sp
                </span>
                <span className="text-[11px] text-neutral-400">
                  HSD: {item.expiryDate}
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
                <span>{item.receivedDate}</span>
                <ChevronRight className="size-4 group-hover:text-purple-600 transition-colors ml-1" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Inbound Detail Bottom Sheet */}
      <UntitledBottomSheet
        open={Boolean(activeItem)}
        onClose={() => setActiveItem(null)}
        title={activeItem?.code || "Chi tiết biên bản nhập kho"}
        subtitle={`PO liên kết: ${activeItem?.poCode} · ${activeItem?.supplier}`}
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
                Hàng hóa nhập kho
              </h5>
              <div className="space-y-2">
                {(!activeItem.items || activeItem.items.length === 0) ? (
                  <div className="p-4 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 text-center text-xs text-neutral-400">
                    Đang cập nhật chi tiết các mặt hàng của phiếu nhập kho này...
                  </div>
                ) : (
                  activeItem.items.map((line, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-1.5"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <h6 className="text-xs font-bold text-neutral-900 dark:text-white">
                          {line.name}
                        </h6>
                        <span className="text-xs font-extrabold text-emerald-600">
                          {line.receivedQty} {line.unit}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-neutral-500 pt-1 border-t border-neutral-100 dark:border-neutral-800">
                        <span>Lô: {line.batch}</span>
                        <span>HSD: {line.exp}</span>
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
