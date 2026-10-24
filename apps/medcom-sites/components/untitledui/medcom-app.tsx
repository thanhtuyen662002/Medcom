"use client";

import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { DesktopHeader } from "./desktop-header";
import { DesktopSidebar } from "./desktop-sidebar";
import { UntitledMobileHeader, type BranchOption } from "./mobile-header";
import { UntitledBottomNav, type NavTabId } from "./bottom-nav";
import { TabHome } from "./tab-home";
import { TabOrders } from "./tab-orders";
import { TabPurchases } from "./tab-purchases";
import { TabInbound } from "./tab-inbound";
import { UntitledQrScannerView } from "./qr-scanner-view";
import { TabSettings } from "./tab-settings";
import { LoginScreen } from "./login-screen";
import { PurchaseOrderCreateSheet } from "./purchase-order-create-sheet";
import { PurchaseRequestCreateSheet } from "./purchase-request-create-sheet";
import { ScreenHeader } from "@/components/app/screen-header";
import { navigationLabel } from "@/components/app/app-navigation";
import { NotificationsSheet } from "./notifications-sheet";
import { SidebarDrawer } from "./sidebar-drawer";
import { TabErpScreen } from "./tab-erp-screen";
import { type ErpScreenModule, erpScreenModules } from "@/lib/erp/proxy-policy";
import { REAL_BRANCHES, erpClient, type LoginResult } from "@/lib/erp/erp-client";
import { ROLE_QUEUE_STATUSES, roleQueueCount } from "@/lib/erp/role-queue";

const ERP_MODULES: readonly ErpScreenModule[] = erpScreenModules;

// F-01: the quick tabs (bottom nav, desktop header, home KPIs, QR hand-offs)
// show the unified ERP screen of their module. The legacy read-only tab stays
// only as a fallback while that module is not (yet) allowed by tabAccess.
const QUICK_TAB_MODULES = {
  orders: "purchase-orders",
  purchases: "purchase-requests",
  inbound: "inbound-requests",
} as const satisfies Partial<Record<NavTabId, ErpScreenModule>>;
type QuickTabId = keyof typeof QUICK_TAB_MODULES;

// Modules whose open document scans codes into ERP (api/erp/{module}/scan),
// and modules where a scanned code can be looked up in the list search.
const SCAN_INTO_MODULES: readonly ErpScreenModule[] = ["warehouse-qr", "sales-qr"];
const SCAN_SEARCH_MODULES: readonly ErpScreenModule[] = ["warehouse-qr", "sales-qr", "inbound-requests", "purchase-requests", "sales-orders"];

export function quickTabModule(tab: string, allowed: readonly string[] | null): ErpScreenModule | null {
  const mod = QUICK_TAB_MODULES[tab as QuickTabId];
  return mod && allowed?.includes(mod) ? mod : null;
}

export function MedcomApp() {
  const [currentUser, setCurrentUser] = useState<LoginResult["user"] | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);

  const [activeTab, setActiveTab] = useState<NavTabId>("home");
  const [currentBranch, setCurrentBranch] = useState("CN01");
  const [branches, setBranches] = useState<BranchOption[]>(() =>
    REAL_BRANCHES.map((b) => ({
      id: b.id,
      name: b.name,
      code: b.id,
      address: b.address,
    }))
  );

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"vertical" | "top">("top");

  // Real document counts for headers, badges, and dashboard
  const [ordersCount, setOrdersCount] = useState(0);
  const [purchasesCount, setPurchasesCount] = useState(0);
  const [inboundCount, setInboundCount] = useState(0);
  // Nav badges count work awaiting action, not every document on the list.
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);

  // Quyền màn hình theo phiên ERP (/api/erp/permissions). allowed null =
  // chưa tải xong: không mặc định có quyền, BE vẫn là chốt chặn cuối.
  const [tabAccess, setTabAccess] = useState<{
    loading: boolean;
    error: boolean;
    allowed: readonly string[] | null;
  }>({ loading: false, error: false, allowed: null });
  // Last settled module list for the quick tabs: a reload (branch change) keeps
  // the open ERP screen instead of flashing the legacy tab until it answers.
  const [quickAccess, setQuickAccess] = useState<readonly string[] | null>(null);
  const quickModule = (tab: QuickTabId) => quickTabModule(tab, quickAccess);
  // The screen actually on display: a quick tab resolves to its ERP module.
  const shownTab: string = quickTabModule(activeTab, quickAccess) ?? activeTab;

  // Every screen stays mounted (hidden) and shares the window scroll position;
  // without a reset a newly opened screen starts mid-page, under its header.
  // (Screens reload their list on activation, so restoring an old offset is moot.)
  const shownTabRef = useRef<string>("home");
  useLayoutEffect(() => {
    if (shownTabRef.current === shownTab) return;
    shownTabRef.current = shownTab;
    if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
  }, [shownTab]);

  const retryTabAccess = useCallback(async () => {
    setTabAccess({ loading: true, error: false, allowed: null });
    try {
      const perms = await erpClient.getScreenPermissions(currentBranch);
      if (!perms || !Array.isArray(perms.screens)) throw new Error("invalid permissions");
      const allowed = perms.screens.filter((s) => s.canView).map((s) => s.module);
      setTabAccess({ loading: false, error: false, allowed });
      setQuickAccess(allowed);
    } catch {
      setTabAccess({ loading: false, error: true, allowed: null });
      setQuickAccess(null);
    }
  }, [currentBranch]);

  useEffect(() => {
    if (!currentUser) {
      setTabAccess({ loading: false, error: false, allowed: null });
      setQuickAccess(null);
      return;
    }
    void retryTabAccess();
  }, [currentUser, retryTabAccess]);

  // Modals state
  const [createRequest, setCreateRequest] = useState<{
    module: "purchase-orders" | "purchase-requests";
    user: LoginResult["user"];
    branch: string;
  } | null>(null);
  const createModule = createRequest?.user === currentUser && createRequest?.branch === currentBranch ? createRequest.module : null;
  const [createAccess, setCreateAccess] = useState<{
    user: LoginResult["user"];
    branch: string;
    modules: readonly string[];
  } | null>(null);

  // Creation is exposed only after both current branch CRUD and module actions
  // allow it. A response for an old session/branch cannot expose a new opener.
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    const user = currentUser;
    const branch = currentBranch;
    const load = async () => {
      try {
        const [permissions, ...actions] = await Promise.all([
          erpClient.getScreenPermissions(branch),
          erpClient.getErpModuleActions("purchase-orders", { branchId: branch }),
          erpClient.getErpModuleActions("purchase-requests", { branchId: branch }),
        ]);
        const modules = ["purchase-orders", "purchase-requests"].filter((module, index) => {
          const screen = permissions.screens.find(item => item.module === module);
          const action = actions[index].find(item => item.id === "create");
          return screen?.canView && screen.crud.canCreate && action?.visible && action.enabled;
        });
        if (!cancelled) setCreateAccess({ user, branch, modules });
      } catch {
        if (!cancelled) setCreateAccess({ user, branch, modules: [] });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [currentUser, currentBranch]);
  const canCreate = (module: string) => createAccess?.user === currentUser && createAccess?.branch === currentBranch && createAccess.modules.includes(module);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // "Chờ tôi xử lý" counts beside role screens in the menu: one status-count read
  // per allowed role screen, at most once a minute per branch.
  const [queueBadges, setQueueBadges] = useState<Record<string, number>>({});
  const queueBadgesRead = useRef<{ branch: string; at: number } | null>(null);
  const refreshQueueBadges = useCallback(async () => {
    const allowed = tabAccess.allowed;
    if (!allowed) return;
    const branch = currentBranch;
    if (queueBadgesRead.current?.branch === branch && Date.now() - queueBadgesRead.current.at < 60000) return;
    if (queueBadgesRead.current?.branch !== branch) setQueueBadges({});
    queueBadgesRead.current = { branch, at: Date.now() };
    const modules = (Object.keys(ROLE_QUEUE_STATUSES) as ErpScreenModule[]).filter(mod => allowed.includes(mod));
    const results = await Promise.allSettled(modules.map(mod => erpClient.getErpStatusCounts(mod, branch)));
    if (queueBadgesRead.current?.branch !== branch) return;
    const next: Record<string, number> = {};
    results.forEach((result, index) => {
      if (result.status === "fulfilled") next[modules[index]] = roleQueueCount(result.value.items, ROLE_QUEUE_STATUSES[modules[index]]!);
    });
    setQueueBadges(next);
  }, [tabAccess.allowed, currentBranch]);
  useEffect(() => { if (currentUser && tabAccess.allowed) void refreshQueueBadges(); }, [currentUser, tabAccess.allowed, refreshQueueBadges]);
  useEffect(() => { if (isSidebarOpen) void refreshQueueBadges(); }, [isSidebarOpen, refreshQueueBadges]);
  const [targetDocPerModule, setTargetDocPerModule] = useState<{ module: ErpScreenModule; documentId: string } | null>(null);
  const [scanSearch, setScanSearch] = useState<{ module: ErpScreenModule; text: string; nonce: number } | null>(null);
  const allowedModule = (mod: ErpScreenModule) => Boolean(tabAccess.allowed?.includes(mod));
  const scanTarget = (mod: ErpScreenModule) => ({ id: mod, label: navigationLabel(mod) ?? mod });
  // A module that has a quick tab opens through it, so the bottom nav stays highlighted.
  const tabForModule = (mod: ErpScreenModule): NavTabId =>
    (Object.keys(QUICK_TAB_MODULES) as QuickTabId[]).find(tab => quickModule(tab) === mod) ?? (mod as NavTabId);

  // Check saved session, theme, and layout on initial mount with automatic reauthentication
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      let cachedUser: LoginResult["user"] | null = null;
      try {
        const savedUserStr = localStorage.getItem("medcom.auth.user");
        if (savedUserStr) {
          const parsed = JSON.parse(savedUserStr);
          if (parsed && parsed.username) {
            cachedUser = parsed;
            if (isMounted) {
              setCurrentUser(parsed);
              if (parsed.branchId) {
                setCurrentBranch(parsed.branchId);
              }
            }
          }
        }

        const savedLayout = localStorage.getItem("medcom.layout.mode");
        if (savedLayout === "vertical" || savedLayout === "top") {
          if (isMounted) setLayoutMode(savedLayout);
        }

        const savedDark = localStorage.getItem("medcom.theme.dark");
        let initialDark = false;
        if (savedDark !== null) {
          initialDark = savedDark === "true";
        } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
          initialDark = true;
        }
        if (isMounted) setIsDarkMode(initialDark);
        if (initialDark) {
          document.documentElement.classList.add("dark");
          document.body.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
          document.body.classList.remove("dark");
        }
      } catch {}

      const isRemember = localStorage.getItem("medcom.auth.remember") !== "false";
      const savedCredsStr = localStorage.getItem("medcom.auth.credentials");

      try {
        // Test existing server session
        await erpClient.getSession();
      } catch (err: unknown) {
        const status = typeof err === "object" && err !== null && "status" in err ? (err as { status: number }).status : 0;
        const code = typeof err === "object" && err !== null && "code" in err ? (err as { code: string }).code : "";

        // If session expired or unauthorized on server, but user chose rememberMe with saved credentials
        if ((status === 401 || code === "session_expired" || code === "unauthorized" || !cachedUser) && isRemember && savedCredsStr) {
          try {
            const creds = JSON.parse(savedCredsStr);
            if (creds && typeof creds.username === "string" && typeof creds.password === "string") {
              const res = await erpClient.login(creds.username, creds.password);
              if (res.success && res.user && isMounted) {
                setCurrentUser(res.user);
                if (res.user.branchId) {
                  setCurrentBranch(res.user.branchId);
                }
                try {
                  localStorage.setItem("medcom.auth.user", JSON.stringify(res.user));
                } catch {}
                if (isMounted) setIsAuthLoaded(true);
                return;
              }
            }
          } catch {}
        }

        // If not rememberMe or auto-login failed
        if (status === 401 || code === "session_expired" || code === "unauthorized") {
          try {
            localStorage.removeItem("medcom.auth.user");
          } catch {}
          if (isMounted) setCurrentUser(null);
        }
      } finally {
        if (isMounted) setIsAuthLoaded(true);
      }
    };

    void initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen for unauthorized 401 events with silent reauthentication fallback
  useEffect(() => {
    let isAttemptingReauth = false;

    const handleUnauthorized = async () => {
      if (isAttemptingReauth) return;
      const isRemember = localStorage.getItem("medcom.auth.remember") !== "false";
      const savedCredsStr = localStorage.getItem("medcom.auth.credentials");

      if (isRemember && savedCredsStr) {
        isAttemptingReauth = true;
        try {
          const creds = JSON.parse(savedCredsStr);
          if (creds && typeof creds.username === "string" && typeof creds.password === "string") {
            const res = await erpClient.login(creds.username, creds.password);
            if (res.success && res.user) {
              setCurrentUser(res.user);
              try {
                localStorage.setItem("medcom.auth.user", JSON.stringify(res.user));
              } catch {}
              isAttemptingReauth = false;
              return;
            }
          }
        } catch {
        } finally {
          isAttemptingReauth = false;
        }
      }

      try {
        localStorage.removeItem("medcom.auth.user");
      } catch {}
      setCurrentUser(null);
    };

    window.addEventListener("medcom:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("medcom:unauthorized", handleUnauthorized);
    };
  }, []);

  // Keep session alive periodically (every 10 minutes) to prevent idle timeouts
  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(async () => {
      try {
        await erpClient.continueSession();
      } catch {
        // If continueSession fails with 401, medcom:unauthorized is dispatched automatically by request()
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [currentUser]);

  // Synchronize documentElement & body class with isDarkMode
  useEffect(() => {
    const syncSharedTheme = () => {
      try {
        const saved = localStorage.getItem("medcom.theme.dark");
        setIsDarkMode(saved !== null ? saved === "true" : window.matchMedia("(prefers-color-scheme: dark)").matches);
      } catch { /* Keep the current theme if preference storage is unavailable. */ }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "medcom.theme.dark" || event.key === null) syncSharedTheme();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", syncSharedTheme);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", syncSharedTheme);
    };
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      document.body.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.body.classList.remove("dark");
    }
  }, [isDarkMode]);

  // Fetch dynamic branches from Backend API without hardcoding
  const loadDynamicBranches = useCallback(async () => {
    try {
      const res = await erpClient.getBranchesList();
      if (res && res.items && res.items.length > 0) {
        const mapped: BranchOption[] = res.items.map((b) => ({
          id: b.id,
          name: b.name || `Chi nhánh ${b.id}`,
          code: b.code || b.id,
        }));
        setBranches(mapped);

        // Ensure currentBranch belongs to the allowed branch list
        setCurrentBranch((prev) => {
          if (!prev || !mapped.some((x) => x.id === prev)) {
            return mapped[0].id;
          }
          return prev;
        });
        return;
      }
    } catch (err) {
      console.warn("[MedcomApp] Could not load dynamic branches from API:", err);
    }

    // Secondary fallback: fetch from workspace if lookups failed
    try {
      const ws = await erpClient.getWorkspace();
      if (ws.branchIds && ws.branchIds.length > 0) {
        const mapped: BranchOption[] = ws.branchIds.map((id) => ({
          id,
          name: `Chi nhánh ${id}`,
          code: id,
        }));
        setBranches(mapped);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadDynamicBranches();
    }
  }, [currentUser, loadDynamicBranches]);

  // Fetch real document counts whenever user is logged in and branch changes
  const refreshGlobalCounts = useCallback(async (branch: string) => {
    setIsLoadingCounts(true);
    try {
      const [poData, prData, inData, notifData] = await Promise.allSettled([
        erpClient.getDocumentsList("purchase-orders", 1, "", branch),
        erpClient.getPurchaseRequestsList(1, "", branch),
        erpClient.getDocumentsList("inbound-requests", 1, "", branch),
        erpClient.getNotifications({ page: 1, pageSize: 1, unreadOnly: true }),
      ]);

      if (poData.status === "fulfilled" && poData.value) {
        const val = poData.value as { totalRows?: number; rows?: unknown[] };
        setOrdersCount(typeof val.totalRows === "number" ? val.totalRows : val.rows?.length ?? 0);
      } else {
        setOrdersCount(0);
      }

      if (prData.status === "fulfilled" && prData.value) {
        const val = prData.value.list as unknown as { totalRows?: number; rows?: { statusId?: number | null }[] };
        setPurchasesCount(typeof val?.totalRows === "number" ? val.totalRows : val?.rows?.length ?? 0);
        // AP_PurchaseStatusTbl: 2 = "Chờ duyệt" (same rule as the home approval list).
        setPendingApprovalCount(val?.rows?.filter(row => row.statusId === 2).length ?? 0);
      } else {
        setPurchasesCount(0);
        setPendingApprovalCount(0);
      }

      if (inData.status === "fulfilled" && inData.value) {
        const val = inData.value as { totalRows?: number; rows?: unknown[] };
        setInboundCount(typeof val.totalRows === "number" ? val.totalRows : val.rows?.length ?? 0);
      } else {
        setInboundCount(0);
      }

      if (notifData.status === "fulfilled" && notifData.value?.unreadCount !== undefined) {
        setUnreadNotificationsCount(notifData.value.unreadCount);
      }
    } catch {
      setOrdersCount(0);
      setPurchasesCount(0);
      setInboundCount(0);
      setPendingApprovalCount(0);
    } finally {
      setIsLoadingCounts(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      refreshGlobalCounts(currentBranch);
    }
  }, [currentUser, currentBranch, refreshGlobalCounts]);

  const handleLoginSuccess = (user: NonNullable<LoginResult["user"]>, rememberMe: boolean) => {
    setCurrentUser(user);
    if (user.branchId) {
      setCurrentBranch(user.branchId);
    }
    try {
      localStorage.setItem("medcom.auth.user", JSON.stringify(user));
      localStorage.setItem("medcom.auth.remember", String(rememberMe));
    } catch {}
    setActiveTab("home");
  };

  const handleLogout = () => {
    if (confirm("Bạn có chắc chắn muốn đăng xuất khỏi hệ thống ERP Medcom?")) {
      try {
        localStorage.removeItem("medcom.auth.user");
        localStorage.removeItem("medcom.auth.credentials");
        void erpClient.logout();
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

  const handleToggleLayoutMode = () => {
    const next = layoutMode === "vertical" ? "top" : "vertical";
    setLayoutMode(next);
    try {
      localStorage.setItem("medcom.layout.mode", next);
    } catch {}
  };

  const handleBranchChange = (newBranch: string) => {
    setCreateRequest(null);
    setCurrentBranch(newBranch);
    refreshGlobalCounts(newBranch);
  };

  // If still checking initial authentication in localStorage, show clean loader
  if (!isAuthLoaded) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-10 text-brand-600 dark:text-brand-400 animate-spin" />
          <p className="text-xs text-neutral-400 font-medium">Đang khởi tạo ERP Medcom...</p>
        </div>
      </div>
    );
  }

  // Authentication Gate: if user is not logged in or session expired, show Login Screen immediately
  if (!currentUser) {
    return (
      <div className={isDarkMode ? "dark" : ""}>
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors ${isDarkMode ? "dark" : ""}`}>
      <div className={`flex ${layoutMode === "vertical" ? "md:flex-row" : "flex-col"} min-h-screen`}>
        {/* Desktop Sidebar (when layoutMode === "vertical") */}
        {layoutMode === "vertical" ? (
          <div className="hidden md:block shrink-0">
            <DesktopSidebar
              currentBranch={currentBranch}
              onBranchChange={handleBranchChange}
              branches={branches}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              userName={currentUser.displayName}
              userRole={currentUser.role}
              unreadNotifications={unreadNotificationsCount}
              onNotificationsClick={() => setNotificationsOpen(true)}
              isDarkMode={isDarkMode}
              onToggleDarkMode={handleToggleDarkMode}
              onLogout={handleLogout}
              onToggleLayoutMode={handleToggleLayoutMode}
              tabAccess={tabAccess}
              onRetryTabs={() => void retryTabAccess()}
            />
          </div>
        ) : (
          /* Desktop Header (when layoutMode === "top") */
          <div className="hidden md:block">
            <DesktopHeader
              currentBranch={currentBranch}
              onBranchChange={handleBranchChange}
              branches={branches}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onOpenMenu={() => setIsSidebarOpen(true)}
              userName={currentUser.displayName}
              userRole={currentUser.role}
              unreadNotifications={unreadNotificationsCount}
              onNotificationsClick={() => setNotificationsOpen(true)}
              isDarkMode={isDarkMode}
              onToggleDarkMode={handleToggleDarkMode}
              onLogout={handleLogout}
              onToggleLayoutMode={handleToggleLayoutMode}
              tabAccess={tabAccess}
              queueBadges={queueBadges}
              onRetryTabs={() => void retryTabAccess()}
            />
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile Header (Visible on screens < 768px) */}
          <div className="md:hidden">
            <UntitledMobileHeader
              currentBranch={currentBranch}
              onBranchChange={handleBranchChange}
              branches={branches}
              userName={currentUser.displayName}
              userRole={currentUser.role}
              unreadNotifications={unreadNotificationsCount}
              onNotificationsClick={() => setNotificationsOpen(true)}
              onProfileClick={() => setIsSidebarOpen(true)}
            />
          </div>

          {/* Reserve the fixed bottom nav, 56px FAB, breathing room and safe area. */}
          <main className={`flex-1 min-w-0 w-full ${["orders", "purchases", "purchase-requests", "purchase-approvals", "purchase-orders", "sales-orders", "sales-order-pm", "sales-order-sa", "sales-qr", "inbound-requests"].includes(activeTab) ? "max-w-none" : "max-w-7xl"} mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-[calc(10rem_+_env(safe-area-inset-bottom))] md:pb-8 transition-all`}>
            {/* Màn có bảng chứng từ dùng toàn bộ bề rộng; màn chỉ có biểu mẫu/thẻ giữ khung hẹp. */}
            {/* TAB 1: Home (Cached in DOM for instant response) */}
            <div className={activeTab === "home" ? "block" : "hidden"}>
              <TabHome
                onNavigateTab={(tab) => setActiveTab(tab)}
                onSelectPurchaseItem={(item) => {
                  setTargetDocPerModule({ module: "purchase-requests", documentId: item.id });
                  setActiveTab("purchase-requests");
                }}
                userName={currentUser.displayName}
                currentBranch={currentBranch}
                ordersCount={ordersCount}
                purchasesCount={purchasesCount}
                inboundCount={inboundCount}
                isLoadingCounts={isLoadingCounts}
                isActive={activeTab === "home"}
              />
            </div>

            {/* TAB 2-4: legacy quick tabs, only while their ERP module is not allowed (F-01) */}
            {/* TAB 2: Orders (PO) */}
            {!quickModule("orders") && <div className={activeTab === "orders" ? "block" : "hidden"}>
              <TabOrders
                currentBranch={currentBranch}
                isActive={activeTab === "orders"}
                onCountChange={setOrdersCount}
                onOpenCreateModal={canCreate("purchase-orders") ? () => setCreateRequest({ module: "purchase-orders", user: currentUser, branch: currentBranch }) : undefined}
              />
            </div>}

            {/* TAB 3: Purchases (PR) */}
            {!quickModule("purchases") && <div className={activeTab === "purchases" ? "block" : "hidden"}>
              <TabPurchases
                onOpenCreateModal={canCreate("purchase-requests") ? () => setCreateRequest({ module: "purchase-requests", user: currentUser, branch: currentBranch }) : undefined}
                currentBranch={currentBranch}
                isActive={activeTab === "purchases"}
                onCountChange={setPurchasesCount}
              />
            </div>}

            {/* TAB 4: Inbound Receipts */}
            {!quickModule("inbound") && <div className={activeTab === "inbound" ? "block" : "hidden"}>
              <TabInbound
                currentBranch={currentBranch}
                isActive={activeTab === "inbound"}
                onCountChange={setInboundCount}
              />
            </div>}

            {/* TAB 5: QR / Barcode Scanner */}
            <div className={activeTab === "scan" ? "block" : "hidden"}>
              <div className="space-y-4 max-w-2xl mx-auto">
                <ScreenHeader title="Quét mã QR" subtitle="Chọn việc cần quét" />
                {activeTab === "scan" && <UntitledQrScannerView
                  key={currentUser.username + ":" + currentBranch}
                  scopeKey={currentUser.username + ":" + currentBranch}
                  scanTargets={SCAN_INTO_MODULES.filter(allowedModule).map(scanTarget)}
                  searchTargets={SCAN_SEARCH_MODULES.filter(allowedModule).map(scanTarget)}
                  onOpenTarget={mod => setActiveTab(tabForModule(mod as ErpScreenModule))}
                  onSearchIn={(mod, text) => {
                    setScanSearch(previous => ({ module: mod as ErpScreenModule, text, nonce: (previous?.nonce ?? 0) + 1 }));
                    setActiveTab(tabForModule(mod as ErpScreenModule));
                  }}
                />}
              </div>
            </div>

            {/* TAB 6: Settings */}
            <div className={activeTab === "settings" ? "block" : "hidden"}>
              <div className="max-w-2xl mx-auto">
                <TabSettings
                  currentUser={currentUser}
                  currentBranch={currentBranch}
                  onBranchChange={handleBranchChange}
                  isDarkMode={isDarkMode}
                  onToggleDarkMode={handleToggleDarkMode}
                  onLogout={handleLogout}
                />
              </div>
            </div>

            {/* TAB 7+: ERP screen modules, also shown by their quick tab (cached in DOM for instant tab switching) */}
            {ERP_MODULES.map((mod) => (
              <div key={mod} className={shownTab === mod ? "block" : "hidden"}>
                <TabErpScreen
                  module={mod}
                  currentBranch={currentBranch}
                  isActive={shownTab === mod}
                  targetDocumentId={targetDocPerModule?.module === mod ? targetDocPerModule.documentId : undefined}
                  searchRequest={scanSearch?.module === mod ? scanSearch : undefined}
                  onOpenScanner={() => setActiveTab("scan")}
                />
              </div>
            ))}
          </main>
        </div>

        {/* Mobile Sticky Bottom Navigation (Fixed at bottom on screens < 768px) */}
        <div className="md:hidden">
          <UntitledBottomNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onOpenMenu={() => setIsSidebarOpen(true)}
            pendingOrdersCount={ordersCount}
            pendingPurchasesCount={pendingApprovalCount}
            pendingInboundCount={0}
            menuOpen={isSidebarOpen}
          />
        </div>

        {/* Left Navigation Sidebar Drawer (Mobile & Hamburger) */}
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
          branchName={branches.find((b) => b.id === currentBranch)?.name}
          isDarkMode={isDarkMode}
          onToggleDarkMode={handleToggleDarkMode}
          onLogout={handleLogout}
          pendingOrdersCount={ordersCount}
          pendingPurchasesCount={pendingApprovalCount}
          pendingInboundCount={0}
          tabAccess={tabAccess}
          onRetryTabs={() => void retryTabAccess()}
          queueBadges={queueBadges}
        />

        {createModule === "purchase-orders" && canCreate("purchase-orders") && <PurchaseOrderCreateSheet
          key={currentBranch}
          open
          onClose={() => setCreateRequest(null)}
          currentBranch={currentBranch}
          onCreated={documentId => {
            setCreateRequest(null);
            setTargetDocPerModule({ module: "purchase-orders", documentId });
            setActiveTab("purchase-orders");
            void refreshGlobalCounts(currentBranch);
          }}
        />}
        {createModule === "purchase-requests" && canCreate("purchase-requests") && <PurchaseRequestCreateSheet
          key={currentBranch}
          open
          onClose={() => setCreateRequest(null)}
          currentBranch={currentBranch}
          onCreated={documentId => {
            setCreateRequest(null);
            setTargetDocPerModule({ module: "purchase-requests", documentId });
            setActiveTab("purchase-requests");
            void refreshGlobalCounts(currentBranch);
          }}
        />}

        {/* Realtime Notifications Sheet */}
        <NotificationsSheet
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          onUnreadCountChange={setUnreadNotificationsCount}
          onNavigateToModule={(tab, branchId, documentId) => {
            if (branchId && branchId !== currentBranch) {
              handleBranchChange(branchId);
            }
            if (documentId) {
              setTargetDocPerModule({ module: tab as ErpScreenModule, documentId });
            }
            setActiveTab(tab);
          }}
        />
      </div>
    </div>
  );
}
