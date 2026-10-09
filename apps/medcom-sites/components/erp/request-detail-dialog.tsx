"use client";

import {useId,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {RequestButton,RecordActionHost,RecordSecondaryHost,RecordStatusHost,RecordDetailContext} from "./request-presentation";

/** Root owns history. These operations request navigation; only a later selectedId
 * observation proves acceptance. Cancellation/pending custody leaves it unchanged. */
export type RequestDetailNavigation = {
  selectedId: string | null;
  /** Synchronous admitted selection, not a committed React observation. */
  getSelectedId: () => string | null;
  requestOpen: (documentId: string) => void;
  requestClose: () => void;
};
export type RegisterRequestDetailNavigation = (navigation: RequestDetailNavigation | null) => void;

export function useRequestDetailNavigation(register: RegisterRequestDetailNavigation | undefined, navigation: RequestDetailNavigation) {
  const current = useRef(navigation);
  useLayoutEffect(() => { current.current = navigation; });
  useLayoutEffect(() => {
    register?.({selectedId: navigation.selectedId, getSelectedId: () => current.current.getSelectedId(),
      requestOpen: id => current.current.requestOpen(id), requestClose: () => current.current.requestClose()});
    return () => register?.(null);
  }, [register, navigation.selectedId]);
}

/** No portal and no conditional child tree. In particular this does not rely on
 * forceMount on the generic DialogContent (which does not retain its Portal).
 * The root guard's body portal remains above this surface and owns focus while
 * its AlertDialog or a higher visible root dialog is present. No history listener or command operation lives here. */
export function RequestDetailDialog({open, presentationAllowed = true, title, closeLabel, onRequestClose, children, actions, documentNumber, mode="view", bodyRef, onBodyScroll}: {
  open: boolean; presentationAllowed?: boolean; title: string; closeLabel: string;
  onRequestClose: () => void; children: ReactNode; actions?:ReactNode; documentNumber?:string|null; mode?:"view"|"create"|"edit"; bodyRef?:import("react").Ref<HTMLDivElement>; onBodyScroll?:import("react").UIEventHandler<HTMLDivElement>;
}) {
  const [actionHost,setActionHost]=useState<HTMLElement|null>(null);
  const [secondaryHost,setSecondaryHost]=useState<HTMLElement|null>(null),[statusHost,setStatusHost]=useState<HTMLElement|null>(null);
  // Kept for source compatibility; all dismissal presentation uses the single X.
  const titleId = useId(), content = useRef<HTMLDivElement>(null), close = useRef(onRequestClose);
  useLayoutEffect(() => { close.current = onRequestClose; });
  const shown = open && presentationAllowed;
  useLayoutEffect(() => {
    const element = content.current;
    if (!shown || !element) return;
    let active = true;
    const rendered = (node: HTMLElement, modalOwnership = false) => {
      if (!node.isConnected || node.closest('[hidden],[inert],[aria-hidden="true"]') || node.getClientRects().length === 0) return false;
      // Radix owns focus during its mounted open/closed fade. Its own zero
      // opacity animation frame must not hand focus back to the detail. Keep
      // opacity-hidden ancestors and ordinary focus targets excluded.
      const modalFade = modalOwnership && ["open", "closed"].includes(node.getAttribute("data-state") ?? "");
      for (let current: HTMLElement | null = node; current; current = current.parentElement) {
        const css = getComputedStyle(current);
        if (css.display === "none" || css.visibility === "hidden" || css.visibility === "collapse"
          || css.opacity === "0" && !(modalFade && current === node)) return false;
      }
      return true;
    };
    const layer = (node: HTMLElement) => {
      let result = 0;
      for (let current: HTMLElement | null = node; current; current = current.parentElement) {
        const value = Number(getComputedStyle(current).zIndex);
        if (Number.isFinite(value)) result = Math.max(result, value);
      }
      return result;
    };
    // Root-owned Radix modals can mount before their aria-hidden update reaches
    // this surface. Yield to a visible higher dialog as well as the dirty guard;
    // an arbitrary hidden (or lower) role=dialog is not a focus owner.
    const guard = () => Array.from(document.querySelectorAll<HTMLElement>('[role="alertdialog"],[role="dialog"]'))
      .some(node => node !== element && !element.contains(node) && !node.contains(element) && rendered(node, true)
        && (node.getAttribute("role") === "alertdialog" || layer(node) > layer(element)));
    const visible = () => active && !document.hidden && rendered(element);
    const focusable = () => Array.from(element.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]'))
      .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && rendered(node));
    let lastFocus: HTMLElement = element;
    const focus = () => {
      if (!visible() || guard()) return;
      const target = rendered(lastFocus) && !lastFocus.matches(':disabled') ? lastFocus : element;
      target.focus({preventScroll: true});
    };
    const key = (event: KeyboardEvent) => {
      if (!visible() || guard()) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); }
      const scrollBody = element.querySelector<HTMLElement>(".request-detail-body");
      if (scrollBody && !scrollBody.contains(document.activeElement) && ["PageDown", "PageUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        scrollBody.scrollTop = event.key === "Home" ? 0 : event.key === "End" ? scrollBody.scrollHeight
          : scrollBody.scrollTop + scrollBody.clientHeight * (event.key === "PageUp" ? -1 : 1);
      }
      if (event.key === "Tab") {
        const nodes = focusable(), first = nodes[0], last = nodes.at(-1), active = document.activeElement;
        if (!first) { event.preventDefault(); focus(); }
        else if (event.shiftKey && (active === first || active === element || !element.contains(active))) { event.preventDefault(); last?.focus({preventScroll: true}); }
        else if (!event.shiftKey && (active === last || !element.contains(active))) { event.preventDefault(); first.focus({preventScroll: true}); }
      }
    };
    const contain = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && element.contains(event.target)) lastFocus = event.target;
      else if (event.target instanceof Node) focus();
    };
    // Do not change any scroll offsets to open a dialog. Body scroll is locked,
    // while the detail body owns its own scroll. Guard portals can still scroll.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    focus();
    const backdropScroll = (event: Event) => {
      if (event.target instanceof Node && !element.contains(event.target)) event.preventDefault();
    };
    const surface = element.parentElement;
    surface?.addEventListener("wheel", backdropScroll, {passive: false});
    surface?.addEventListener("touchmove", backdropScroll, {passive: false});
    document.addEventListener("keydown", key, true);
    document.addEventListener("focusin", contain);
    // The root AlertDialog has no local Trigger. Its closing portal may remove
    // the focused Cancel button without a focusin event on this surface.
    // Retire a focused control when a reread disables it; re-enabling it later
    // must not restore obsolete focus over a newer explicit Open ticket.
    const observer = new MutationObserver(() => { const current = document.activeElement; if (!element.contains(current) || current instanceof HTMLElement && current.matches(':disabled')) focus(); });
    observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "inert", "aria-hidden", "role", "style", "class", "data-state", "disabled"]});
    return () => {
      active = false;
      observer.disconnect();
      surface?.removeEventListener("wheel", backdropScroll);
      surface?.removeEventListener("touchmove", backdropScroll);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("focusin", contain);
    };
  }, [shown]);
  return <div hidden={!shown} inert={!shown} data-request-detail-surface="" className="request-detail-surface">
    <style>{`
      .request-detail-surface:not([hidden]){position:fixed;inset:0;z-index:45;display:grid;place-items:center;padding:24px;isolation:isolate}
      .request-detail-backdrop{position:absolute;inset:0;background:rgb(0 0 0 / .48)}
      .request-detail-dialog{position:relative;display:flex;flex-direction:column;width:min(1120px,100%);max-width:100%;height:auto;max-height:min(860px,calc(100dvh - 48px));min-height:0;overflow:hidden;background:var(--background,#fff);color:var(--foreground,#111);border:1px solid var(--border,#ccc);border-radius:16px;box-shadow:0 20px 60px #0005;outline:none}
      .request-detail-header{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:16px;border-bottom:1px solid var(--border,#ccc);flex-shrink:0}
      .request-detail-header h2{flex:1;min-width:0;overflow-wrap:anywhere;font-weight:600}
      .request-detail-body{overflow:auto;overscroll-behavior:contain;min-height:0;min-width:0;padding:16px;overflow-wrap:anywhere}
      .request-detail-body>*{min-width:0;max-width:100%}
      @media(max-width:767px){.request-detail-surface:not([hidden]){padding:0}.request-detail-dialog{width:100%;height:100dvh;max-height:100dvh;border:0;border-radius:0}.request-detail-header{padding:calc(12px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right)) 12px calc(12px + env(safe-area-inset-left))}.request-detail-body{padding:12px calc(12px + env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left))}}
    `}</style>
    <div className="request-detail-backdrop" aria-hidden="true" onClick={() => close.current()}/>
    <div ref={content} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="request-detail-dialog" data-record-mode={mode}>
      <header className="request-detail-header">
        <div className="record-dialog-identity"><h2 id={titleId}>{title}{documentNumber&&<span className="record-document-number">{documentNumber}</span>}</h2><div className="record-dialog-status" ref={setStatusHost}/></div>
        <div className="record-dialog-header-actions">
          <RequestButton type="button" className="record-dialog-close" aria-label={closeLabel} title="Đóng hộp thoại" onClick={() => close.current()}>×</RequestButton>
        </div>
        <div className="record-dialog-secondary-actions" role="group" aria-label="Thao tác phiếu" ref={setSecondaryHost}/>
      </header>
      <RecordDetailContext.Provider value={true}><RecordStatusHost.Provider value={statusHost}><RecordSecondaryHost.Provider value={secondaryHost}><RecordActionHost.Provider value={actionHost}><div ref={bodyRef} onScroll={onBodyScroll} className="request-detail-body">{children}</div></RecordActionHost.Provider></RecordSecondaryHost.Provider></RecordStatusHost.Provider></RecordDetailContext.Provider><footer className="record-dialog-actions" ref={setActionHost}>{actions}</footer>
    </div>
  </div>;
}



/** Obscuring presentation keeps custody, but an old read cannot reopen it.
 * The host supplies a committed ready-read object and requests a fresh GET. */
export function useDetailPresentationProof(allowed: boolean, proof: unknown, revalidate: () => void) {
  const [gate, setGate] = useState({allowed, suspended: !allowed, proof});
  if (gate.allowed !== allowed || !allowed && gate.proof !== proof) setGate({allowed, suspended: true, proof});
  const previous = useRef(allowed), callback = useRef(revalidate);
  useLayoutEffect(() => { callback.current = revalidate; });
  useLayoutEffect(() => {
    if (allowed && !previous.current) callback.current();
    previous.current = allowed;
  }, [allowed]);
  return allowed && (!gate.suspended || proof !== null && proof !== gate.proof);
}
