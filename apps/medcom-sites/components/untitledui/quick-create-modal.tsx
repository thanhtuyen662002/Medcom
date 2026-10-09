"use client";

import React, { useState } from "react";
import { Plus, Minus, Trash2, CheckCircle2, Sparkles, Package } from "lucide-react";
import { UntitledBottomSheet } from "./bottom-sheet";
import { UntitledButton } from "./button";
import { UntitledBadge } from "./badge";

export interface QuickCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (newPr: any) => void;
  currentBranch: string;
}

const sampleCatalog = [
  { id: "MED-001", name: "Hapacol 500mg (Paracetamol)", unit: "Hộp", price: 45000 },
  { id: "MED-002", name: "Amoxicillin 500mg (Imexpharm)", unit: "Hộp", price: 68000 },
  { id: "MED-003", name: "Bơm tiêm vô trùng 5ml (Vinahankook)", unit: "Hộp", price: 150000 },
  { id: "MED-004", name: "Dung dịch tiêm truyền NaCl 0.9% 500ml", unit: "Thùng", price: 700000 },
  { id: "MED-005", name: "Cồn y tế 70 độ 500ml", unit: "Chai", price: 30000 },
];

export function QuickCreateModal({
  open,
  onClose,
  onSuccess,
  currentBranch,
}: QuickCreateModalProps) {
  const [purpose, setPurpose] = useState("Bổ sung thuốc cấp cứu & dự phòng định kỳ");
  const [department, setDepartment] = useState("Kho Cấp cứu");
  const [selectedItems, setSelectedItems] = useState<
    { id: string; name: string; unit: string; price: number; quantity: number }[]
  >([
    { id: "MED-001", name: "Hapacol 500mg (Paracetamol)", unit: "Hộp", price: 45000, quantity: 100 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddItem = (item: (typeof sampleCatalog)[0]) => {
    if (selectedItems.some((i) => i.id === item.id)) {
      setSelectedItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 50 } : i))
      );
    } else {
      setSelectedItems((prev) => [
        ...prev,
        { ...item, quantity: 50 },
      ]);
    }
  };

  const handleUpdateQty = (id: string, delta: number) => {
    setSelectedItems((prev) =>
      prev
        .map((i) => {
          if (i.id === id) {
            const next = i.quantity + delta;
            return next > 0 ? { ...i, quantity: next } : null;
          }
          return i;
        })
        .filter(Boolean) as typeof selectedItems
    );
  };

  const totalAmountNumber = selectedItems.reduce(
    (sum, i) => sum + i.price * i.quantity,
    0
  );

  const handleSubmit = () => {
    if (selectedItems.length === 0) return;
    setIsSubmitting(true);
    setTimeout(() => {
      const code = `PR-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const created = {
        id: code,
        code,
        date: new Date().toLocaleDateString("vi-VN"),
        creator: "DS. Trần Quang Minh",
        department,
        branch: currentBranch === "CN-01" ? "Chi nhánh 1 (Trung tâm)" : currentBranch,
        purpose,
        status: "pending",
        totalAmount: totalAmountNumber.toLocaleString("vi-VN") + " đ",
        lines: selectedItems.map((i) => ({
          itemId: i.id,
          itemName: i.name,
          specification: "Quy cách đóng gói tiêu chuẩn",
          unit: i.unit,
          quantity: i.quantity,
          unitPrice: i.price.toLocaleString("vi-VN") + " đ",
          amount: (i.price * i.quantity).toLocaleString("vi-VN") + " đ",
        })),
      };
      setIsSubmitting(false);
      onSuccess(created);
      onClose();
    }, 600);
  };

  return (
    <UntitledBottomSheet
      open={open}
      onClose={onClose}
      title="Tạo phiếu đề nghị mua sắm"
      subtitle="Biểu mẫu di động chuẩn Untitled UI · Medcom ERP"
      footer={
        <div className="flex gap-2">
          <UntitledButton
            variant="secondary-gray"
            size="md"
            fullWidth
            onClick={onClose}
          >
            Hủy
          </UntitledButton>
          <UntitledButton
            variant="primary"
            size="md"
            fullWidth
            loading={isSubmitting}
            onClick={handleSubmit}
            disabled={selectedItems.length === 0}
            iconLeading={<CheckCircle2 className="size-4" />}
          >
            Gửi phê duyệt ({totalAmountNumber.toLocaleString("vi-VN")} đ)
          </UntitledButton>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Purpose & Department */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 block mb-1">
              Mục đích yêu cầu
            </label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 block mb-1">
              Kho / Phòng ban nhận
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="Kho Cấp cứu">Kho Cấp cứu</option>
              <option value="Kho Dược Trung tâm">Kho Dược Trung tâm</option>
              <option value="Kho Ngoại trú">Kho Ngoại trú</option>
              <option value="Kho Vật tư tiêu hao">Kho Vật tư tiêu hao</option>
            </select>
          </div>
        </div>

        {/* Selected Items List */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Thuốc đã chọn ({selectedItems.length})
            </h4>
            <span className="text-xs font-bold text-purple-600">
              {totalAmountNumber.toLocaleString("vi-VN")} đ
            </span>
          </div>

          <div className="space-y-2">
            {selectedItems.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                    {item.name}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    {item.price.toLocaleString("vi-VN")} đ / {item.unit}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleUpdateQty(item.id, -10)}
                    className="size-7 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-8 text-center text-xs font-bold font-mono">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateQty(item.id, 10)}
                    className="size-7 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Catalog Selector Chips */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
            Thêm nhanh từ danh mục kho:
          </h4>
          <div className="flex flex-col gap-1.5">
            {sampleCatalog.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleAddItem(cat)}
                className="w-full p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-purple-300 dark:hover:border-purple-800 text-left flex items-center justify-between text-xs transition-colors"
              >
                <span className="truncate font-medium">{cat.name}</span>
                <span className="text-purple-600 dark:text-purple-400 font-bold shrink-0 ml-2">
                  + {cat.unit}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </UntitledBottomSheet>
  );
}
