"use client";

import React, { useState } from "react";
import {
  Search,
  Plus,
  Filter,
  FileText,
  Calendar,
  Building,
  User,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Printer,
  ChevronRight,
  MoreVertical,
} from "lucide-react";
import { UntitledBadge } from "./badge";
import { UntitledButton } from "./button";
import { UntitledBottomSheet } from "./bottom-sheet";
import { erpClient } from "@/lib/erp/erp-client";

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
  lines: {
    itemId: string;
    itemName: string;
    specification: string;
    unit: string;
    quantity: number;
    unitPrice: string;
    amount: string;
  }[];
}

const initialPurchases: PurchaseItem[] = [
  {
    id: "PR-2026-0128",
    code: "PR-2026-0128",
    date: "09/10/2026",
    creator: "DS. Nguyễn Thùy Linh",
    department: "Kho Cấp cứu",
    branch: "Chi nhánh 1 (Trung tâm)",
    purpose: "Bổ sung cơ số thuốc cấp cứu & hồi sức khẩn cấp",
    status: "pending",
    totalAmount: "48.500.000 đ",
    lines: [
      {
        itemId: "MED-001",
        itemName: "Hapacol 500mg (Paracetamol)",
        specification: "Hộp 10 vỉ x 10 viên",
        unit: "Hộp",
        quantity: 200,
        unitPrice: "45.000 đ",
        amount: "9.000.000 đ",
      },
      {
        itemId: "MED-003",
        itemName: "Bơm tiêm vô trùng 5ml (Vinahankook)",
        specification: "Hộp 100 cái, kim 23G",
        unit: "Hộp",
        quantity: 30,
        unitPrice: "150.000 đ",
        amount: "4.500.000 đ",
      },
      {
        itemId: "MED-004",
        itemName: "Dung dịch tiêm truyền NaCl 0.9% 500ml",
        specification: "Thùng 20 chai",
        unit: "Thùng",
        quantity: 50,
        unitPrice: "700.000 đ",
        amount: "35.000.000 đ",
      },
    ],
  },
  {
    id: "PR-2026-0127",
    code: "PR-2026-0127",
    date: "08/10/2026",
    creator: "DS. Lê Hoàng Nam",
    department: "Kho Ngoại trú",
    branch: "Chi nhánh 2 (Kho Dược)",
    purpose: "Đơn đặt hàng thuốc kháng sinh định kỳ tháng 10",
    status: "approved",
    totalAmount: "186.200.000 đ",
    lines: [
      {
        itemId: "MED-002",
        itemName: "Amoxicillin 500mg (Imexpharm)",
        specification: "Hộp 10 vỉ x 10 viên nang",
        unit: "Hộp",
        quantity: 500,
        unitPrice: "68.000 đ",
        amount: "34.000.000 đ",
      },
      {
        itemId: "MED-005",
        itemName: "Augmentin 1g (Amoxicillin/Clavulanic)",
        specification: "Hộp 14 viên nén bao phim",
        unit: "Hộp",
        quantity: 400,
        unitPrice: "215.000 đ",
        amount: "86.000.000 đ",
      },
      {
        itemId: "MED-006",
        itemName: "Cefixim 200mg",
        specification: "Hộp 10 vỉ x 10 viên",
        unit: "Hộp",
        quantity: 300,
        unitPrice: "220.667 đ",
        amount: "66.200.000 đ",
      },
    ],
  },
  {
    id: "PR-2026-0126",
    code: "PR-2026-0126",
    date: "07/10/2026",
    creator: "DS. Phạm Thu Hà",
    department: "Phòng Khám Đa Khoa",
    branch: "Chi nhánh 1 (Trung tâm)",
    purpose: "Dự thảo yêu cầu vật tư tiêu hao phòng xét nghiệm",
    status: "draft",
    totalAmount: "15.800.000 đ",
    lines: [
      {
        itemId: "VT-012",
        itemName: "Găng tay y tế không bột (Cỡ M)",
        specification: "Hộp 100 chiếc (50 đôi)",
        unit: "Hộp",
        quantity: 100,
        unitPrice: "98.000 đ",
        amount: "9.800.000 đ",
      },
      {
        itemId: "VT-014",
        itemName: "Cồn y tế 70 độ 500ml",
        specification: "Chai 500ml",
        unit: "Chai",
        quantity: 200,
        unitPrice: "30.000 đ",
        amount: "6.000.000 đ",
      },
    ],
  },
  {
    id: "PR-2026-0125",
    code: "PR-2026-0125",
    date: "05/10/2026",
    creator: "Võ Thanh Tùng",
    department: "Kho Dược BV",
    branch: "Chi nhánh 3 (Bệnh viện)",
    purpose: "Đề nghị bổ sung hóa chất khử trùng",
    status: "rejected",
    totalAmount: "32.000.000 đ",
    lines: [
      {
        itemId: "HC-001",
        itemName: "Dung dịch khử trùng Cloramin B 25%",
        specification: "Thùng 25kg",
        unit: "Thùng",
        quantity: 10,
        unitPrice: "3.200.000 đ",
        amount: "32.000.000 đ",
      },
    ],
  },
];

export interface TabPurchasesProps {
  onOpenCreateModal: () => void;
  selectedItemForDetail?: PurchaseItem | null;
  onCloseDetailModal?: () => void;
}

export function TabPurchases({
  onOpenCreateModal,
  selectedItemForDetail,
  onCloseDetailModal,
}: TabPurchasesProps) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [purchases, setPurchases] = useState<PurchaseItem[]>(initialPurchases);
  const [activeItem, setActiveItem] = useState<PurchaseItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentScopeKey, setCurrentScopeKey] = useState<string | null>(null);

  // Sync prop if provided
  React.useEffect(() => {
    if (selectedItemForDetail) {
      setActiveItem(selectedItemForDetail);
    }
  }, [selectedItemForDetail]);

  const loadPurchases = async () => {
    setLoading(true);
    try {
      const res = await erpClient.getPurchaseRequestsList(1, search, "");
      if (res && res.list && res.list.rows && res.list.rows.length > 0) {
        setCurrentScopeKey(res.scopeKey);
        const mapped = res.list.rows.map((r) => {
          const seed = initialPurchases.find((p) => p.code === r.documentId);
          return {
            id: r.documentId,
            code: r.documentId,
            date: r.purchaseDate ? new Date(r.purchaseDate).toLocaleDateString("vi-VN") : "09/10/2026",
            creator: r.personSuggest || seed?.creator || "DS. Nguyễn Thùy Linh",
            department: r.department || seed?.department || "Kho Cấp cứu",
            branch: r.branchId === "CN01" ? "Chi nhánh 1 (Trung tâm)" : r.branchId === "CN02" ? "Chi nhánh 2 (Kho Dược)" : `Chi nhánh ${r.branchId}`,
            purpose: seed?.purpose || `Đề nghị mua sắm vật tư y tế [${r.documentId}]`,
            status: (r.statusId === 2 ? "approved" : r.statusId === 1 ? "pending" : "draft") as any,
            totalAmount: seed?.totalAmount || "Xem chi tiết",
            lines: seed?.lines || [],
          };
        });
        setPurchases(mapped);
        return;
      }
    } catch (e) {
      console.warn("Could not load remote purchases:", e);
    } finally {
      setLoading(false);
    }
    // Fallback to initial
    setPurchases(initialPurchases);
  };

  React.useEffect(() => {
    loadPurchases();
  }, [search]);

  const handleOpenDetail = async (item: PurchaseItem) => {
    setActiveItem(item);
    if (currentScopeKey) {
      try {
        const detail = await erpClient.getPurchaseRequestDetail(currentScopeKey, item.id);
        if (detail && detail.document) {
          const doc = detail.document;
          setActiveItem((prev) =>
            prev
              ? {
                  ...prev,
                  purpose: doc.header.purposeDescOrClient || doc.header.notes || prev.purpose,
                  totalAmount: doc.header.price ? `${Number(doc.header.price).toLocaleString("vi-VN")} đ` : prev.totalAmount,
                  lines: doc.lines.map((l) => ({
                    itemId: l.values.itemId,
                    itemName: `Dược phẩm [${l.values.itemId}]`,
                    specification: l.values.model || "Theo tiêu chuẩn Dược điển",
                    unit: "Hộp/Đơn vị",
                    quantity: Number(l.values.quantity) || 1,
                    unitPrice: l.values.unitPrice ? `${Number(l.values.unitPrice).toLocaleString("vi-VN")} đ` : "Theo hợp đồng",
                    amount: l.values.totalPrice ? `${Number(l.values.totalPrice).toLocaleString("vi-VN")} đ` : "Theo hợp đồng",
                  })),
                }
              : prev
          );
        }
      } catch (e) {
        console.warn("Could not fetch remote purchase detail:", e);
      }
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
              placeholder="Tìm theo số phiếu, người lập, nội dung..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
            />
          </div>

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
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center space-y-2">
            <FileText className="size-10 text-neutral-400 mx-auto stroke-[1.4]" />
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Không tìm thấy phiếu yêu cầu mua sắm nào
            </p>
            <p className="text-xs text-neutral-400">
              Thử thay đổi từ khóa tìm kiếm hoặc bỏ bộ lọc trạng thái.
            </p>
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
                    {item.lines.length} mặt hàng
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
                  onClick={() => alert("Đang gửi lệnh in phiếu ra máy in GSP...")}
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
                <span className="text-neutral-500">Ngày lập phiếu:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {activeItem.date}
                </span>
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
                Danh sách thuốc & vật tư ({activeItem.lines?.length ?? 0})
              </h4>
              <div className="space-y-2">
                {(!activeItem.lines || activeItem.lines.length === 0) ? (
                  <div className="p-4 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 text-center text-xs text-neutral-400">
                    Đang tải chi tiết các mặt hàng hoặc chưa có dòng phát sinh...
                  </div>
                ) : (
                  activeItem.lines.map((line, idx) => (
                    <div
                      key={line.itemId || idx}
                      className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                        <span className="text-[10px] font-mono text-neutral-400">
                          #{idx + 1} · {line.itemId}
                        </span>
                        <h5 className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                          {line.itemName}
                        </h5>
                        <p className="text-[11px] text-neutral-400">{line.specification}</p>
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
