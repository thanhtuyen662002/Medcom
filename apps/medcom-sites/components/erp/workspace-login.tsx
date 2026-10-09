"use client";
import {useId, useLayoutEffect, useRef, useState, type FormEvent} from "react";
import {Eye,EyeOff} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {login} from "@/lib/erp/api";
import styles from "./workspace-auth-gate.module.css";

export type WorkspaceLoginProps = {
  /** Rotate on root login/sign-out/retirement boundaries; never a credential. */
  lifecycleKey: string;
  active: boolean;
  configured: boolean;
  onSuccess: () => void;
  authenticate?: typeof login;
};
export function WorkspaceLogin(props: WorkspaceLoginProps) {
  return props.active ? <LoginForm key={props.lifecycleKey} {...props}/> : null;
}
function LoginForm({configured, onSuccess, authenticate = login}: WorkspaceLoginProps) {
  const id = useId();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<"idle" | "busy" | "failed" | "succeeded">("idle");
  const mounted = useRef(false), pending = useRef(false), attempt = useRef({value: 0});
  const feedback = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {const counter = attempt.current; mounted.current = true; return () => {mounted.current = false; counter.value++;};}, []);
  useLayoutEffect(() => {if (status === "failed" || status === "succeeded") feedback.current?.focus();}, [status]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!mounted.current || pending.current || !configured || status === "succeeded" || !username.trim() || !password) return;
    pending.current = true;
    const current = ++attempt.current.value;
    setStatus("busy");
    // Clear the field immediately; the existing API owns its transient request.
    const submittedPassword = password;
    setPassword(""); setVisible(false);
    try {
      await authenticate(username.trim(), submittedPassword);
    } catch {
      if (mounted.current && attempt.current.value === current) {pending.current = false; setStatus("failed");}
      return;
    }
    if (!mounted.current || attempt.current.value !== current) return;
    setStatus("succeeded");
    // Root must invalidate old reads and validate workspace; no local admission.
    onSuccess();
  }
  const busy = status === "busy" || status === "succeeded";
  return <form className={styles.form} onSubmit={submit} aria-label="Đăng nhập ERP" aria-busy={status === "busy"}>
    <p>Sử dụng tài khoản Medcom để truy cập nghiệp vụ được cấp quyền.</p>
    <label htmlFor={`${id}-username`}>Tên đăng nhập</label>
    <Input id={`${id}-username`} autoComplete="username" required maxLength={100} value={username} onChange={e => setUsername(e.target.value)} disabled={busy || !configured}/>
    <label htmlFor={`${id}-password`}>Mật khẩu</label>
    <div className={styles.password}>
      <Input id={`${id}-password`} type={visible ? "text" : "password"} autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} disabled={busy || !configured}/>
      <Button className={styles.visibility} variant="ghost" size="icon" type="button" aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={visible} disabled={busy || !configured} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={18} aria-hidden="true"/> : <Eye size={18} aria-hidden="true"/>}</Button>
    </div>
    {!configured && <p role="alert">Chưa có kết nối ERP. Vui lòng liên hệ quản trị viên.</p>}
    {status === "failed" && <p ref={feedback} tabIndex={-1} role="alert">Không thể đăng nhập. Kiểm tra thông tin hoặc thử lại sau.</p>}
    {status === "succeeded" && <p ref={feedback} tabIndex={-1} role="status">Đang chờ xác minh quyền làm việc…</p>}
    <Button className={styles.submit} type="submit" disabled={busy || !configured}>{status === "busy" ? "Đang xác thực…" : status === "succeeded" ? "Đang xác minh…" : "Đăng nhập"}</Button>
    <p className={styles.footnote}>Quyền và phiên làm việc do hệ thống ERP xác nhận.</p>
  </form>;
}
