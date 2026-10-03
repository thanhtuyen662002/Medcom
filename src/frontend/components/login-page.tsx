"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck, CircleHelp, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError, errorMessage, login, safeReturnPath } from "@/lib/api";

export function LoginPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setPending(true); setError(""); setReference(undefined);
    try {
      await login(String(values.get("username")), String(values.get("password")));
      window.location.replace(safeReturnPath(new URLSearchParams(window.location.search).get("returnTo")));
    } catch (failure) {
      setError(errorMessage(failure));
      if (failure instanceof ApiError) setReference(failure.correlationId);
    } finally {
      const password = form.elements.namedItem("password") as HTMLInputElement;
      if (password) password.value = "";
      setPending(false);
    }
  }
  return <main className="login-shell">
    <section className="login-story" aria-label="Medcom ERP">
      <a className="brand" href="/"><span className="brand-mark">m</span><span>medcom<span className="brand-suffix"> / ERP</span></span></a>
      <div className="story-content"><p className="eyebrow">KHÔNG GIAN LÀM VIỆC CỦA BẠN</p>
        <h1>Công việc rõ ràng.<br /><span>Vận hành liền mạch.</span></h1>
        <p className="story-description">Một nơi để kết nối đội ngũ, dữ liệu và các quy trình doanh nghiệp.</p>
        <div className="story-graphic" aria-hidden="true"><div className="graphic-ring ring-one"/><div className="graphic-ring ring-two"/><div className="graphic-center">m</div><span className="graphic-label label-one">Đội ngũ</span><span className="graphic-label label-two">Quy trình</span><span className="graphic-label label-three">Dữ liệu</span></div>
      </div><p className="story-footer">Medcom Web · Kết nối với hệ thống ERP của doanh nghiệp</p>
    </section>
    <section className="login-panel"><div className="login-card"><p className="eyebrow">CHÀO MỪNG TRỞ LẠI</p>
      <h2>Đăng nhập</h2><p className="muted">Sử dụng tài khoản ERP được doanh nghiệp cấp.</p>
      <form onSubmit={submit} className="login-form">
        <label htmlFor="username">Tên đăng nhập</label><input id="username" name="username" autoComplete="username" required maxLength={100} placeholder="Nhập tên đăng nhập" disabled={pending} />
        <label htmlFor="password">Mật khẩu</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} placeholder="Nhập mật khẩu" disabled={pending} />
        <div aria-live="polite">{error && <div className="error-message" role="alert"><p>{error}</p>{reference && <small>Mã hỗ trợ: {reference}</small>}</div>}</div>
        <Button type="submit" disabled={pending}>{pending ? <><LoaderCircle className="spin" size={18}/> Đang xác thực…</> : <>Đăng nhập <ArrowRight size={18}/></>}</Button>
      </form>
      <p className="security-note"><ShieldCheck size={17}/><span>Phiên làm việc và quyền truy cập được xác minh trên máy chủ.</span></p>
      <div className="login-help"><CircleHelp size={16}/><span>Cần trợ giúp? Liên hệ quản trị viên doanh nghiệp.</span></div>
    </div><footer className="panel-footer">MEDCOM ERP <span>Không gian doanh nghiệp</span></footer></section>
  </main>;
}
