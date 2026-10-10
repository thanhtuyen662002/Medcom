"use client";

import React, { useState } from "react";
import { QrCode, Flashlight, RefreshCw, Volume2, VolumeX, Search, CheckCircle2, Package, MapPin, Calendar, AlertCircle } from "lucide-react";
import { UntitledBadge } from "./badge";
import { UntitledButton } from "./button";

export interface ScannedMedicineInfo {
  barcode: string;
  name: string;
  activeIngredient: string;
  registrationNumber: string;
  unit: string;
  stockQuantity: number;
  location: string;
  expiryDate: string;
  storageTemp: string;
  manufacturer: string;
}

const GS1_NATIONAL_MEDICINE_CATALOG: Record<string, ScannedMedicineInfo> = {
  "8935001810012": {
    barcode: "8935001810012",
    name: "Hapacol 500mg (Paracetamol)",
    activeIngredient: "Paracetamol 500mg",
    registrationNumber: "VD-21345-14",
    unit: "Hộp 10 vỉ x 10 viên",
    stockQuantity: 420,
    location: "Kệ A1 · Tầng 2 · Ô 04",
    expiryDate: "12/2027",
    storageTemp: "Dưới 30°C, khô ráo",
    manufacturer: "Dược Hậu Giang (DHG Pharma)",
  },
  "8935123456789": {
    barcode: "8935123456789",
    name: "Amoxicillin 500mg",
    activeIngredient: "Amoxicillin trihydrat 500mg",
    registrationNumber: "VD-31209-18",
    unit: "Hộp 10 vỉ x 10 viên",
    stockQuantity: 185,
    location: "Kệ B2 · Tầng 1 · Ô 12",
    expiryDate: "08/2026",
    storageTemp: "15 - 25°C (Kho mát GSP)",
    manufacturer: "Imexpharm Corporation",
  },
  "8936009876543": {
    barcode: "8936009876543",
    name: "Bơm tiêm vô trùng 5ml (Đốc kim số 23G)",
    activeIngredient: "Nhựa y tế nguyên sinh, kim thép không gỉ",
    registrationNumber: "190001234/PCBA-HN",
    unit: "Hộp 100 cái",
    stockQuantity: 1250,
    location: "Khu Vật Tư · Kệ VT-03",
    expiryDate: "05/2028",
    storageTemp: "Nhiệt độ phòng",
    manufacturer: "Công ty CP Thiết bị Y tế Vinahankook",
  },
  "8934567890123": {
    barcode: "8934567890123",
    name: "Dung dịch tiêm truyền NaCl 0.9% 500ml",
    activeIngredient: "Natri clorid 4.5g / 500ml",
    registrationNumber: "VD-18920-13",
    unit: "Chai nhựa 500ml",
    stockQuantity: 84,
    location: "Kệ Dịch Truyền · Kệ DT-01",
    expiryDate: "10/2026",
    storageTemp: "15 - 30°C",
    manufacturer: "B. Braun Việt Nam",
  },
};

export interface UntitledQrScannerViewProps {
  onMedicineSelected?: (medicine: ScannedMedicineInfo) => void;
  onAddToPurchase?: (medicine: ScannedMedicineInfo) => void;
  onAddToInbound?: (medicine: ScannedMedicineInfo) => void;
}

export function UntitledQrScannerView({
  onMedicineSelected,
  onAddToPurchase,
  onAddToInbound,
}: UntitledQrScannerViewProps) {
  const [torch, setTorch] = useState(false);
  const [sound, setSound] = useState(true);
  const [manualCode, setManualCode] = useState("");
  const [scannedResult, setScannedResult] = useState<ScannedMedicineInfo | null>(null);

  const handleScanCode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const found = GS1_NATIONAL_MEDICINE_CATALOG[trimmed];
    if (found) {
      setScannedResult(found);
      onMedicineSelected?.(found);
    } else {
      // Create ad-hoc result for any barcode
      const adhoc: ScannedMedicineInfo = {
        barcode: trimmed,
        name: `Mã sản phẩm: ${trimmed}`,
        activeIngredient: "Dữ liệu tra cứu danh mục Medcom ERP",
        registrationNumber: "Đang cập nhật",
        unit: "Hộp / Lọ",
        stockQuantity: 50,
        location: "Kệ chờ phân loại",
        expiryDate: "2027",
        storageTemp: "GSP Chuẩn",
        manufacturer: "Dược phẩm Medcom",
      };
      setScannedResult(adhoc);
      onMedicineSelected?.(adhoc);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Scanner Viewport */}
      <div className="relative aspect-[4/3] sm:aspect-video rounded-3xl overflow-hidden bg-neutral-950 border border-neutral-800 shadow-xl flex flex-col items-center justify-center">
        {/* Background Grid Pattern */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)`,
            backgroundSize: "20px 20px",
          }}
        />

        {/* Viewfinder Target Frame */}
        <div className="relative size-56 sm:size-64 border border-white/20 rounded-2xl flex items-center justify-center">
          {/* 4 Glowing Corner Marks */}
          <div className="absolute top-0 left-0 size-6 border-t-4 border-l-4 border-purple-500 rounded-tl-xl" />
          <div className="absolute top-0 right-0 size-6 border-t-4 border-r-4 border-purple-500 rounded-tr-xl" />
          <div className="absolute bottom-0 left-0 size-6 border-b-4 border-l-4 border-purple-500 rounded-bl-xl" />
          <div className="absolute bottom-0 right-0 size-6 border-b-4 border-r-4 border-purple-500 rounded-br-xl" />

          {/* Laser Scanner Beam */}
          <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-transparent shadow-[0_0_12px_#a855f7] animate-uui-laser" />

          {/* QR Icon in center */}
          <div className="text-white/30 flex flex-col items-center gap-2">
            <QrCode className="size-16 stroke-[1.2]" />
            <span className="text-[11px] font-medium text-white/60">
              Đặt mã vạch hoặc mã QR vào khung
            </span>
          </div>
        </div>

        {/* Controls Overlay */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-white">
          <UntitledBadge variant="purple" size="sm" dot>
            Camera AI Live
          </UntitledBadge>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTorch(!torch)}
              className={`p-2 rounded-xl backdrop-blur-md transition-colors ${
                torch ? "bg-amber-500 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
              title="Bật/Tắt Đèn pin"
            >
              <Flashlight className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setSound(!sound)}
              className={`p-2 rounded-xl backdrop-blur-md transition-colors ${
                sound ? "bg-purple-600 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
              title="Bật/Tắt Âm thanh"
            >
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
          </div>
        </div>

        {/* Supported Formats Pill */}
        <div className="absolute bottom-3 text-center">
          <span className="text-[10px] text-white/50 tracking-wide font-mono">
            EAN-13 · GS1 DataMatrix · Code128 · QR Code
          </span>
        </div>
      </div>

      {/* Manual Input / Fast Barcode Selector */}
      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-4 shadow-xs">
        <label
          htmlFor="manual-barcode-input"
          className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 block mb-2"
        >
          Nhập mã vạch hoặc chọn mẫu thử nghiệm
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              id="manual-barcode-input"
              type="text"
              placeholder="VD: 8935001810012..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleScanCode(manualCode);
              }}
              className="w-full pl-3 pr-8 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <UntitledButton
            variant="primary"
            size="sm"
            onClick={() => handleScanCode(manualCode)}
            iconLeading={<Search className="size-3.5" />}
          >
            Tra cứu
          </UntitledButton>
        </div>

        {/* Quick sample chips */}
        <div className="mt-3 flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] text-neutral-400">Mẫu sẵn:</span>
          {Object.keys(GS1_NATIONAL_MEDICINE_CATALOG).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => handleScanCode(code)}
              className="text-[10px] px-2 py-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-950 dark:hover:text-purple-300 text-neutral-600 dark:text-neutral-300 transition-colors font-mono"
            >
              {GS1_NATIONAL_MEDICINE_CATALOG[code].name.split(" ")[0]} ({code.slice(-4)})
            </button>
          ))}
        </div>
      </div>

      {/* Scanned Medication Result Card */}
      {scannedResult && (
        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-purple-200 dark:border-purple-900/60 p-4 sm:p-5 shadow-md relative overflow-hidden animate-uui-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <UntitledBadge variant="success" size="sm" dot>
                  Đã nhận diện
                </UntitledBadge>
                <span className="text-[11px] font-mono text-neutral-400 truncate">
                  {scannedResult.barcode}
                </span>
              </div>
              <h4 className="text-base font-bold text-neutral-900 dark:text-white truncate">
                {scannedResult.name}
              </h4>
              <p className="text-xs text-purple-700 dark:text-purple-400 font-medium">
                {scannedResult.activeIngredient}
              </p>
            </div>

            <div className="size-11 rounded-2xl bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Package className="size-6" />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs border-t border-neutral-100 dark:border-neutral-800 pt-3">
            <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
              <MapPin className="size-3.5 text-neutral-400 shrink-0" />
              <span className="truncate">{scannedResult.location}</span>
            </div>
            <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
              <Calendar className="size-3.5 text-neutral-400 shrink-0" />
              <span>HSD: {scannedResult.expiryDate}</span>
            </div>
            <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400 col-span-2">
              <span className="font-semibold text-neutral-900 dark:text-white">
                Tồn kho khả dụng:
              </span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {scannedResult.stockQuantity.toLocaleString()} {scannedResult.unit}
              </span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex gap-2">
            <UntitledButton
              variant="secondary-gray"
              size="sm"
              fullWidth
              onClick={() => onAddToPurchase?.(scannedResult)}
            >
              + Đề nghị mua
            </UntitledButton>
            <UntitledButton
              variant="primary"
              size="sm"
              fullWidth
              onClick={() => onAddToInbound?.(scannedResult)}
            >
              + Nhập kho
            </UntitledButton>
          </div>
        </div>
      )}
    </div>
  );
}
