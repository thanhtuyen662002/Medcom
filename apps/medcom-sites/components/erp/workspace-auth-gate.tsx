"use client";
import {useId, useLayoutEffect, useRef, type ReactNode} from "react";
import type {WorkspaceAuthState} from "@/lib/erp/workspace-auth-state";
import {ListLoading} from "./list-loading";
import {WorkspaceLogin, type WorkspaceLoginProps} from "./workspace-login";
import styles from "./workspace-auth-gate.module.css";

/** Apply INSIDE every protected body portal as well as the normal React tree.
 * Modal owners must also disable focus traps/autofocus while permission is false. */
export function protectedPresentationProps(presentationAllowed: boolean) {
  return {hidden: !presentationAllowed, inert: !presentationAllowed, "aria-hidden": !presentationAllowed, style: {display: presentationAllowed ? undefined : "none"}} as const;
}
export type WorkspaceAuthGateProps = {
  state: WorkspaceAuthState;
  onRetry: () => void;
  login: Omit<WorkspaceLoginProps, "active" | "lifecycleKey">;
  children: ReactNode;
};
export function WorkspaceAuthGate({state, onRetry, login, children}: WorkspaceAuthGateProps) {
  const title = useId(), gate = useRef<HTMLElement>(null), protectedRoot = useRef<HTMLDivElement>(null);
  const previous = useRef<{allowed: boolean; key: string} | null>(null);
  const opener = useRef<{element: HTMLElement; key: string} | null>(null);
  const {presentationAllowed: allowed, lifecycleKey: key, phase} = state;
  useLayoutEffect(() => {
    const prior = previous.current;
    if (!allowed) {
      if (prior?.allowed && prior.key === key && document.activeElement instanceof HTMLElement) opener.current = {element: document.activeElement, key};
      if (prior?.key !== key) opener.current = null;
      gate.current?.focus({preventScroll: true});
    } else if (!prior?.allowed || prior.key !== key) {
      const saved = opener.current;
      if (saved?.key === key && saved.element.isConnected && !saved.element.closest('[hidden],[inert],[aria-hidden="true"]') && !saved.element.matches(':disabled')) saved.element.focus({preventScroll: true});
      else protectedRoot.current?.focus({preventScroll: true});
      opener.current = null;
    }
    previous.current = {allowed, key};
  }, [allowed, key, phase]);
  return <>
    {!allowed && <section ref={gate} tabIndex={-1} className={styles.gate} aria-labelledby={title}>
      <div className={styles.card}>
        <p className={styles.brand}>MEDCOM · ERP</p>
        <h1 id={title}>{phase === "expired" ? "Phiên làm việc đã kết thúc" : phase === "anonymous" ? "Đăng nhập ERP" : phase === "recovery" ? "Chưa thể xác minh phiên làm việc" : "Đang xác minh phiên làm việc…"}</h1>
        {(phase === "anonymous" || phase === "expired") ? <WorkspaceLogin {...login} active lifecycleKey={key}/> : <>
          <p role="status">{phase === "recovery" ? "Kết nối tạm thời không khả dụng. Dữ liệu được ẩn cho đến khi quyền truy cập được xác minh lại." : "Vui lòng chờ hệ thống xác nhận phiên và quyền truy cập."}</p>
          {phase !== "recovery"&&<ListLoading label="Đang xác minh phiên và quyền ERP…"/>}
          {phase === "recovery" && <button type="button" onClick={onRetry}>Thử lại</button>}
        </>}
      </div>
    </section>}
    <div ref={protectedRoot} tabIndex={-1} {...protectedPresentationProps(allowed)}>
      {state.mountProtected ? children : null}
    </div>
  </>;
}
