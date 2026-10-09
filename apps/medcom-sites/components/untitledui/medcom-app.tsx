"use client";

import React, { useState, useEffect } from "react";
import { DeviceFrame } from "./device-frame";
import { DesktopHeader } from "./desktop-header";
import { UntitledMobileHeader, type BranchOption } from "./mobile-header";
import { UntitledBottomNav, type NavTabId } from "./bottom-nav";
import { TabHome } from "./tab-home";
import { TabOrders } from "./tab-orders";
import { TabPurchases, type PurchaseItem } from "./tab-purchases";
import { TabInbound } from "./tab-inbound";
import { UntitledQrScannerView, type ScannedMedicineInfo } from "./qr-scanner-view";
import { TabSettings } from "./tab-settings";
import { LoginScreen } from "./login-screen";
import { QuickCreateModal } from "./quick-create-modal";
import { UntitledBottomSheet } from "./bottom-sheet";
import { REAL_BRANCHES, erpClient, type LoginResult } from "@/lib/erp/erp-client";

const APP_BRANCHES: BranchOption[] = REAL_BRANCHES.map((b) => ({
  id: b.id,
  name: b.name,
  code: b.id,
  address: b.address,
}));

export function MedcomApp() {
  const [currentUser, setCurrentUser] = useState<LoginResult["user"] | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);

  const [activeTab, setActiveTab] = useState<NavTabId>("home");
  const [currentBranch, setCurrentBranch] = useState("CN01");
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Modals state
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selectedPurchaseItem, setSelectedPurchaseItem] = useState<PurchaseItem | null>(null);

  // Check saved session on load
  useEffect(() => {
    try {
      const savedUserStr = localStorage.getItem("medcom.auth.user");
      if (savedUserStr) {
        const savedUser = JSON.parse(savedUserStr);
        if (savedUser && savedUser.username) {
          setCurrentUser(savedUser);
          if (savedUser.branchId) {
            setCurrentBranch(savedUser.branchId);
          }
        }
      }

      const savedDark = localStorage.getItem("medcom.theme.dark");
      if (savedDark !== null) {
        setIsDarkMode(savedDark === "true");
      } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        setIsDarkMode(true);
      }
    } catch {}
    setIsAuthLoaded(true);
  }, []);

  const handleLoginSuccess = (user: NonNullable<LoginResult["user"]>) => {
    setCurrentUser(user);
    if (user.branchId) {
      setCurrentBranch(user.branchId);
    }
    try {
      localStorage.setItem("medcom.auth.user", JSON.stringify(user));
    } catch {}
    setActiveTab("home");
  };

  const handleLogout = () => {
    if (confirm("Bạn có chắc chắn muốn đăng xuất khỏi hệ thống ERP Medcom?")) {
      try {
        localStorage.removeItem("medcom.auth.user");
        erpClient.logout();
      } catch {}
      setCurrentUser(null);
    }
  };

  const handleToggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    try {
      localStorage.setItem("medcom.theme.dark", String(next));
    } catch {}
  };

  // When medicine is scanned, user can choose to create PR with it
  const handleScanAddToPurchase = (_med: ScannedMedicineInfo) => {
    setQuickCreateOpen(true);
  };

  const handleScanAddToInbound = (_med: ScannedMedicineInfo) => {
    setActiveTab("inbound");
  };

  // If still checking initial authentication in localStorage, show clean background
  if (!isAuthLoaded) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-2xl bg-purple-600 animate-pulse" />
          <p className="text-xs text-neutral-400 font-medium">Đang khởi tạo ERP Medcom...</p>
        </div>
      </div>
    );
  }

  // Authentication Gate: if user is not logged in, show real Login Screen
  if (!currentUser) {
    return (
      <div className={isDarkMode ? "dark" : ""}>
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  // Authenticated ERP Workspace
  return (
    <DeviceFrame isDarkMode={isDarkMode}>
      <div className="flex flex-col min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors">
        {/* Desktop Header (Visible on screens >= 768px) */}
        <div className="hidden md:block">
          <DesktopHeader
            currentBranch={currentBranch}
            onBranchChange={setCurrentBranch}
            branches={APP_BRANCHES}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            userName={currentUser.displayName}
            userRole={currentUser.role}
            unreadNotifications={3}
            onNotificationsClick={() => setNotificationsOpen(true)}
            onOpenQuickCreate={() => setQuickCreateOpen(true)}
            isDarkMode={isDarkMode}
            onToggleDarkMode={handleToggleDarkMode}
            onLogout={handleLogout}
            pendingOrdersCount={2}
            pendingPurchasesCount={8}
            pendingInboundCount={3}
          />
        </div>

        {/* Mobile Header (Visible on screens < 768px) */}
        <div className="md:hidden">
          <UntitledMobileHeader
            currentBranch={currentBranch}
            onBranchChange={setCurrentBranch}
            branches={APP_BRANCHES}
            userName={currentUser.displayName}
            userRole={currentUser.role}
            unreadNotifications={3}
            onNotificationsClick={() => setNotificationsOpen(true)}
            onProfileClick={() => setActiveTab("settings")}
          />
        </div>

        {/* Responsive Content Workspace Container */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 transition-all">
          {activeTab === "home" && (
            <TabHome
              onNavigateTab={(tab) => setActiveTab(tab)}
              onOpenQuickCreate={() => setQuickCreateOpen(true)}
              onSelectPurchaseItem={(item) => {
                setSelectedPurchaseItem(item);
                setActiveTab("purchases");
              }}
              userName={currentUser.displayName}
              currentBranch={currentBranch}
            />
          )}

          {activeTab === "orders" && (
            <TabOrders currentBranch={currentBranch} />
          )}

          {activeTab === "purchases" && (
            <TabPurchases
              onOpenCreateModal={() => setQuickCreateOpen(true)}
              selectedItemForDetail={selectedPurchaseItem}
              onCloseDetailModal={() => setSelectedPurchaseItem(null)}
            />
          )}

          {activeTab === "inbound" && (
            <TabInbound onOpenNewInbound={() => alert("Mở biểu mẫu nhập kho mới...")} />
          )}

          {activeTab === "scan" && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-4 sm:p-5 shadow-xs">
                <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
                  Quét tem mã vạch thuốc & QR Lô GSP
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Nhận diện chuẩn GS1 DataMatrix, mã vạch EAN-13 và tem niêm phong dược phẩm
                </p>
              </div>
              <UntitledQrScannerView
                onAddToPurchase={handleScanAddToPurchase}
                onAddToInbound={handleScanAddToInbound}
              />
            </div>
          )}

          {activeTab === "settings" && (
            <div className="max-w-2xl mx-auto">
              <TabSettings
                currentBranch={currentBranch}
                onBranchChange={setCurrentBranch}
                isDarkMode={isDarkMode}
                onToggleDarkMode={handleToggleDarkMode}
                isDeviceFrameMode={false}
                onToggleDeviceFrame={() => {}}
                onLogout={handleLogout}
              />
            </div>
          )}
        </main>

        {/* Mobile Sticky Bottom Navigation (Visible on screens < 768px) */}
        <div className="md:hidden">
          <UntitledBottomNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            pendingOrdersCount={2}
            pendingPurchasesCount={8}
            pendingInboundCount={3}
          />
        </div>

        {/* Quick Create PR Bottom Sheet */}
        <QuickCreateModal
          open={quickCreateOpen}
          onClose={() => setQuickCreateOpen(false)}
          currentBranch={currentBranch}
          onSuccess={(newPr) => {
            setSelectedPurchaseItem(newPr);
            setActiveTab("purchases");
          }}
        />

        {/* Realtime Notifications Sheet */}
        <UntitledBottomSheet
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          title="Thông báo hệ thống ERP Medcom"
          subtitle="Cập nhật phê duyệt và luồng kho thời gian thực"
        >
          <div className="space-y-2.5">
            {[
              {
                id: 1,
                title: "Đơn PO-2026-0891 đã được Giám đốc phê duyệt",
                desc: "Đơn đặt hàng thuốc cấp cứu DHG Pharma trị giá 45.000.000 đ",
                time: "5 phút trước",
                type: "success",
              },
              {
                id: 2,
                title: "Đơn mua PR-2026-0128 cần duyệt khẩn cấp",
                desc: "Kho Cấp cứu yêu cầu 200 hộp Paracetamol 500mg & kim tiêm",
                time: "15 phút trước",
                type: "warning",
              },
              {
                id: 3,
                title: "Xe lạnh DHG Pharma đã đến cổng kiểm định",
                desc: "Lô hàng DHG-240811 sẵn sàng đo nhiệt độ GSP tại Cổng 2",
                time: "40 phút trước",
                type: "info",
              },
              {
                id: 4,
                title: "Hoàn tất nhập kho lô NK-2026-0410",
                desc: "1.000 hộp Amoxicillin 500mg đã vào Kệ K02-B04",
                time: "2 giờ trước",
                type: "success",
              },
            ].map((n) => (
              <div
                key={n.id}
                className="p-3.5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-1 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white">
                    {n.title}
                  </span>
                  <span className="text-[10px] text-neutral-400 shrink-0 ml-2">{n.time}</span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{n.desc}</p>
              </div>
            ))}
          </div>
        </UntitledBottomSheet>
      </div>
    </DeviceFrame>
  );
}
