"use client";

import React, { useState, useEffect, useCallback } from "react";
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
import { SidebarDrawer } from "./sidebar-drawer";
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Real document counts for headers, badges, and dashboard
  const [ordersCount, setOrdersCount] = useState(0);
  const [purchasesCount, setPurchasesCount] = useState(0);
  const [inboundCount, setInboundCount] = useState(0);
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);

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
      let initialDark = false;
      if (savedDark !== null) {
        initialDark = savedDark === "true";
      } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        initialDark = true;
      }
      setIsDarkMode(initialDark);
      if (initialDark) {
        document.documentElement.classList.add("dark");
        document.body.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
        document.body.classList.remove("dark");
      }
    } catch {}
    setIsAuthLoaded(true);
  }, []);

  // Synchronize documentElement & body class with isDarkMode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      document.body.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.body.classList.remove("dark");
    }
  }, [isDarkMode]);

  // Fetch real document counts whenever user is logged in and branch changes
  const refreshGlobalCounts = useCallback(async (branch: string) => {
    setIsLoadingCounts(true);
    try {
      const [poData, prData, inData] = await Promise.allSettled([
        erpClient.getDocumentsList("purchase-orders", 1, "", branch),
        erpClient.getPurchaseRequestsList(1, "", branch),
        erpClient.getDocumentsList("inbound-requests", 1, "", branch),
      ]);

      if (poData.status === "fulfilled" && poData.value?.rows) {
        setOrdersCount(poData.value.rows.length);
      } else {
        setOrdersCount(0);
      }

      if (prData.status === "fulfilled" && prData.value?.list?.rows) {
        setPurchasesCount(prData.value.list.rows.length);
      } else {
        setPurchasesCount(0);
      }

      if (inData.status === "fulfilled" && inData.value?.rows) {
        setInboundCount(inData.value.rows.length);
      } else {
        setInboundCount(0);
      }
    } catch {
      // Fallback zero counts
      setOrdersCount(0);
      setPurchasesCount(0);
      setInboundCount(0);
    } finally {
      setIsLoadingCounts(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      refreshGlobalCounts(currentBranch);
    }
  }, [currentUser, currentBranch, refreshGlobalCounts]);

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

  const handleBranchChange = (newBranch: string) => {
    setCurrentBranch(newBranch);
    refreshGlobalCounts(newBranch);
  };

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

  // Authenticated ERP Workspace - Edge to edge responsive (no simulator frame)
  return (
    <div className={`min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors ${isDarkMode ? "dark" : ""}`}>
      <div className="flex flex-col min-h-screen">
        {/* Desktop Header (Visible on screens >= 768px) */}
        <div className="hidden md:block">
          <DesktopHeader
            currentBranch={currentBranch}
            onBranchChange={handleBranchChange}
            branches={APP_BRANCHES}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            userName={currentUser.displayName}
            userRole={currentUser.role}
            unreadNotifications={0}
            onNotificationsClick={() => setNotificationsOpen(true)}
            onOpenQuickCreate={() => setQuickCreateOpen(true)}
            isDarkMode={isDarkMode}
            onToggleDarkMode={handleToggleDarkMode}
            onLogout={handleLogout}
            pendingOrdersCount={ordersCount}
            pendingPurchasesCount={purchasesCount}
            pendingInboundCount={inboundCount}
          />
        </div>

        {/* Mobile Header (Visible on screens < 768px) */}
        <div className="md:hidden">
          <UntitledMobileHeader
            currentBranch={currentBranch}
            onBranchChange={handleBranchChange}
            branches={APP_BRANCHES}
            userName={currentUser.displayName}
            userRole={currentUser.role}
            unreadNotifications={0}
            onNotificationsClick={() => setNotificationsOpen(true)}
            onProfileClick={() => setIsSidebarOpen(true)}
          />
        </div>

        {/* Responsive Content Workspace Container with pb-28 for fixed bottom nav */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-28 md:pb-8 transition-all">
          {/* TAB 1: Home (Kept in DOM for instant response) */}
          <div className={activeTab === "home" ? "block" : "hidden"}>
            <TabHome
              onNavigateTab={(tab) => setActiveTab(tab)}
              onOpenQuickCreate={() => setQuickCreateOpen(true)}
              onSelectPurchaseItem={(item) => {
                setSelectedPurchaseItem(item);
                setActiveTab("purchases");
              }}
              userName={currentUser.displayName}
              currentBranch={currentBranch}
              ordersCount={ordersCount}
              purchasesCount={purchasesCount}
              inboundCount={inboundCount}
              isLoadingCounts={isLoadingCounts}
            />
          </div>

          {/* TAB 2: Orders (PO) */}
          <div className={activeTab === "orders" ? "block" : "hidden"}>
            <TabOrders
              currentBranch={currentBranch}
              isActive={activeTab === "orders"}
              onCountChange={setOrdersCount}
              onOpenCreateModal={() => setQuickCreateOpen(true)}
            />
          </div>

          {/* TAB 3: Purchases (PR) */}
          <div className={activeTab === "purchases" ? "block" : "hidden"}>
            <TabPurchases
              onOpenCreateModal={() => setQuickCreateOpen(true)}
              selectedItemForDetail={selectedPurchaseItem}
              onCloseDetailModal={() => setSelectedPurchaseItem(null)}
              currentBranch={currentBranch}
              isActive={activeTab === "purchases"}
              onCountChange={setPurchasesCount}
            />
          </div>

          {/* TAB 4: Inbound Receipts */}
          <div className={activeTab === "inbound" ? "block" : "hidden"}>
            <TabInbound
              currentBranch={currentBranch}
              isActive={activeTab === "inbound"}
              onCountChange={setInboundCount}
              onOpenNewInbound={() => setQuickCreateOpen(true)}
            />
          </div>

          {/* TAB 5: QR / Barcode Scanner */}
          <div className={activeTab === "scan" ? "block" : "hidden"}>
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
          </div>

          {/* TAB 6: Settings */}
          <div className={activeTab === "settings" ? "block" : "hidden"}>
            <div className="max-w-2xl mx-auto">
              <TabSettings
                currentBranch={currentBranch}
                onBranchChange={handleBranchChange}
                isDarkMode={isDarkMode}
                onToggleDarkMode={handleToggleDarkMode}
                onLogout={handleLogout}
              />
            </div>
          </div>
        </main>

        {/* Mobile Sticky Bottom Navigation (Fixed at bottom on screens < 768px) */}
        <div className="md:hidden">
          <UntitledBottomNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onOpenMenu={() => setIsSidebarOpen(true)}
            pendingOrdersCount={ordersCount}
            pendingPurchasesCount={purchasesCount}
            pendingInboundCount={inboundCount}
          />
        </div>

        {/* Left Navigation Sidebar Drawer */}
        <SidebarDrawer
          open={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setIsSidebarOpen(false);
          }}
          userName={currentUser.displayName}
          userRole={currentUser.role}
          currentBranch={currentBranch}
          branchName={APP_BRANCHES.find((b) => b.id === currentBranch)?.name}
          isDarkMode={isDarkMode}
          onToggleDarkMode={handleToggleDarkMode}
          onLogout={handleLogout}
          pendingOrdersCount={ordersCount}
          pendingPurchasesCount={purchasesCount}
          pendingInboundCount={inboundCount}
        />

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
          <div className="p-6 text-center space-y-2">
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Không có thông báo mới
            </p>
            <p className="text-xs text-neutral-400">
              Các sự kiện phát sinh từ máy chủ ERP sẽ hiển thị tại đây khi có thay đổi.
            </p>
          </div>
        </UntitledBottomSheet>
      </div>
    </div>
  );
}
