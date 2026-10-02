"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowLeft, ArrowUpRight, ChevronRight, Clock3, Database, LogOut, RefreshCw, ShieldCheck, LayoutDashboard, LoaderCircle } from "lucide-react";
import { DocumentList } from "@/components/document-list";
import { Button } from "@/components/ui/button";
import { ApiError, continueSession, errorMessage, getHealth, getWorkspace, logout } from "@/lib/api";

export function WorkspacePage() {
  const client = useQueryClient();
  const retiring = useRef(false);
  const [screen, setScreen] = useState("platform-status");
  useEffect(() => { const requested = new URLSearchParams(window.location.search).get("screen"); if (requested) setScreen(requested); }, []);
  const [visible, setVisible] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const workspace = useQuery({ queryKey: ["workspace"], queryFn: ({ signal }) => getWorkspace(signal), enabled: visible && !retiring.current });
  const health = useQuery({ queryKey: ["readiness"], queryFn: ({ signal }) => getHealth(signal), enabled: !!workspace.data && visible });
  useEffect(() => {
    const clear = () => { setVisible(false); void client.cancelQueries(); client.clear(); };
    const validate = () => { client.clear(); setVisible(true); };
    const visibility = () => document.visibilityState === "hidden" ? clear() : validate();
    const message = () => {
      if (retiring.current) return;
      retiring.current = true; clear(); window.location.replace("/?returnTo=%2Fworkspace%2F");
    };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("medcom-session") : null;
    if (channel) channel.onmessage = message;
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", validate);
    document.addEventListener("visibilitychange", visibility);
    return () => { channel?.close(); window.removeEventListener("pagehide", clear); window.removeEventListener("pageshow", validate); document.removeEventListener("visibilitychange", visibility); };
  }, [client]);
  useEffect(() => {
    if (!retiring.current && workspace.error instanceof ApiError && workspace.error.status === 401) {
      client.clear(); window.location.replace("/?returnTo=%2Fworkspace%2F");
    }
  }, [workspace.error, client]);
  useEffect(() => {
    if (!workspace.data) return;
    const remaining = new Date(workspace.data.session.idleExpiresAt).getTime() - Date.now();
    if (remaining <= 0) { client.clear(); window.location.replace("/"); return; }
    const timer = setTimeout(() => { client.clear(); window.location.replace("/"); }, Math.min(remaining, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [workspace.data, client]);
  async function exit() {
    if (actionPending) return;
    retiring.current = true;
    setActionPending(true); setActionError("");
    try {
      await logout(); setVisible(false); await client.cancelQueries(); client.clear();
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("medcom-session"); channel.postMessage("logout"); channel.close();
      }
      window.location.replace("/");
    } catch (error) { retiring.current = false; setActionError(errorMessage(error)); setActionPending(false); }
  }
  async function extend() {
    if (actionPending) return;
    setActionPending(true); setActionError("");
    try { await continueSession(); await workspace.refetch(); }
    catch (error) { setActionError(errorMessage(error)); }
    finally { setActionPending(false); }
  }
  if (!visible || workspace.isPending) return <main className="center-state"><LoaderCircle className="spin"/><p>Đang xác minh phiên làm việc…</p></main>;
  if (!workspace.data || workspace.error) return <main className="center-state"><ShieldCheck size={30}/><h1>Không thể mở không gian làm việc</h1><p>{errorMessage(workspace.error)}</p><Button asChild><a href="/"><ArrowLeft size={16}/> Về trang đăng nhập</a></Button></main>;
  const { session, navigation } = workspace.data;
  const documentScreen = (screen === "purchase-orders" || screen === "inbound-requests") && navigation.some(item => item.id === screen) ? screen : null;
  const canSeeStatus = navigation.some(item => item.id === "platform-status");
  return <div className="workspace-shell">
    <aside className="sidebar"><a className="brand" href="/workspace/"><span className="brand-mark">m</span><span>medcom</span></a>
      <p className="sidebar-caption">KHÔNG GIAN LÀM VIỆC</p><nav aria-label="Điều hướng chính">{navigation.map(item => <a key={item.id} href={item.href} className={`nav-item ${item.id === screen ? "active" : ""}`} onClick={event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); setScreen(item.id); window.history.replaceState(null, "", item.href); }}><LayoutDashboard size={18}/>{item.label}<ChevronRight size={14}/></a>)}</nav>
      <div className="sidebar-bottom"><span className="company-avatar">{session.companyName.slice(0, 1)}</span><div><strong>{session.companyName}</strong><small>Doanh nghiệp hiện tại</small></div></div>
    </aside><div className="workspace-main"><header className="workspace-header"><span>Không gian làm việc <ChevronRight size={14}/> {documentScreen === "purchase-orders" ? "Đơn đặt hàng mua" : documentScreen === "inbound-requests" ? "Yêu cầu nhập kho" : "Tổng quan"}</span><div className="user-menu"><span className="user-avatar">{session.displayName.slice(0, 1)}</span><span>{session.displayName}</span><Button variant="ghost" onClick={exit} disabled={actionPending} aria-label="Đăng xuất"><LogOut size={18}/></Button></div></header>
      <main className="workspace-content"><nav className="mobile-navigation" aria-label="Điều hướng nghiệp vụ">{navigation.map(item => <a key={item.id} href={item.href} aria-current={item.id === screen ? "page" : undefined}>{item.label}</a>)}</nav>{documentScreen ? <DocumentList key={documentScreen} kind={documentScreen} session={session} branches={workspace.data.branchIds}/> : <><div className="page-heading"><div><p className="eyebrow">MEDCOM WORKSPACE</p><h1>Chào bạn, {session.displayName}.</h1><p className="muted">Theo dõi trạng thái kết nối và quản lý phiên làm việc.</p></div><Button variant="outline" onClick={() => { void workspace.refetch(); void health.refetch(); }} disabled={workspace.isFetching || health.isFetching}><RefreshCw size={16} className={health.isFetching ? "spin" : ""}/> Làm mới</Button></div>
        <section className="connection-banner"><div className="banner-icon"><ShieldCheck size={24}/></div><div><strong>Phiên làm việc đã được xác minh</strong><p>Quyền truy cập và doanh nghiệp được máy chủ xác định.</p></div><span className="pill pill-green">Đã xác thực</span></section>
        <div className="overview-grid"><section className="surface session-surface"><div className="section-heading"><h2>Phiên làm việc</h2><Clock3 size={19}/></div><dl><div><dt>Doanh nghiệp</dt><dd>{session.companyName}</dd></div><div><dt>Hết hạn nếu không tương tác</dt><dd>{new Date(session.idleExpiresAt).toLocaleString("vi-VN")}</dd></div><div><dt>Phiên bản quyền</dt><dd>{session.authorityVersion}</dd></div></dl><Button variant="outline" onClick={extend} disabled={actionPending}>Tiếp tục phiên <ArrowUpRight size={16}/></Button><p className="small-muted">Làm mới dữ liệu nền không kéo dài phiên đăng nhập.</p></section>
          <section className="surface"><div className="section-heading"><h2>Kết nối hệ thống</h2><Activity size={19}/></div>{canSeeStatus ? health.error ? <p role="alert" className="error-message">{errorMessage(health.error)}</p> : health.data ? <div className="health-list">{health.data.checks.map(item => <div key={item.component} className="health-row"><span><Database size={17}/>{item.component === "database" ? "Cơ sở dữ liệu ERP" : item.component === "legacy_adapter" ? "Dịch vụ ERP cũ" : item.component === "business_release" ? "Nghiệm thu nghiệp vụ" : "Web API"}</span><span className={`pill ${item.status === "healthy" ? "pill-green" : "pill-amber"}`}>{item.status === "healthy" ? "Đang hoạt động" : item.component === "business_release" ? "Chưa nghiệm thu" : "Chưa kết nối"}</span></div>)}</div> : <p className="muted">Đang kiểm tra…</p> : <p className="muted">Tài khoản chưa được cấp quyền xem trạng thái hệ thống.</p>}</section></div>
        <section className="surface business-empty"><div className="empty-icon"><LayoutDashboard size={26}/></div><h2>Chức năng nghiệp vụ sẽ xuất hiện tại đây</h2><p>Hiện chưa có màn hình nghiệp vụ được kích hoạt cho phiên này. Quản trị viên cần hoàn tất tích hợp ERP và cấp quyền trước khi sử dụng.</p></section>
        </>}{actionError && <div role="alert" className="error-message">{actionError}</div>}
      </main><footer className="workspace-footer"><span>Medcom ERP</span><span>Quyền truy cập được xác minh trên máy chủ</span></footer></div>
  </div>;
}
