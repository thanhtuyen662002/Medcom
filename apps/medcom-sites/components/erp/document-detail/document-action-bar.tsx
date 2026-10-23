"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { AppButton } from "@/components/app/app-button";
import { useIsMobile } from "@/components/app/use-is-mobile";
import type { DetailAction } from "@/lib/erp/document-detail/model";
import { UntitledBottomSheet } from "@/components/untitledui/bottom-sheet";
import { RecordActionBar } from "../record-dialog";
import { DetailActionButton } from "./presentation";

/** The retained sheet yields focus from RecordDialog to this higher dialog. */
function ActionMenu({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const opener = document.activeElement;
    const element = content.current;
    (element?.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? element)?.focus();
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <div ref={content} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
    className="grid gap-2 pb-[env(safe-area-inset-bottom)] outline-none"
    onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const buttons = Array.from(content.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const first = buttons[0], last = buttons.at(-1);
        if (!first) { event.preventDefault(); content.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === content.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === content.current)) { event.preventDefault(); first.focus(); }
      }
    }}>{children}</div>;
}

export function DocumentActionBar({ actions, busy = false, presentationAllowed = true, onAction, menuDisabled, menuTitle = "Thao tác khác", start,
  menuLabel = "Thao tác khác", menuOpen: controlledMenuOpen, onMenuOpenChange }: {
  actions: readonly DetailAction[]; busy?: boolean; presentationAllowed?: boolean; onAction(id: string): void;
  menuDisabled?: boolean; menuTitle?: string; start?: ReactNode;
  menuLabel?: string; menuOpen?: boolean; onMenuOpenChange?(open: boolean): void;
}) {
  const [localMenuOpen, setLocalMenuOpen] = useState(false);
  const mobile = useIsMobile();
  const menuOpen = controlledMenuOpen ?? localMenuOpen;
  const setMenuOpen = (open: boolean) => { setLocalMenuOpen(open); onMenuOpenChange?.(open); };
  const visible = actions.filter(action => action.visible);
  const primaryActions = visible.filter(action => action.placement === "primary");
  const menuActions = visible.filter(action => action.placement === "menu");
  const primaryId = (primaryActions.find(action => action.tone !== "outline" && action.tone !== "danger") ?? primaryActions[0])?.id;
  // Count More as a button too: leave the highest-priority action on the right.
  const direct = mobile && (menuActions.length > 0 || primaryActions.length > 2)
    ? primaryActions.filter(action => action.id === primaryId).slice(0, 1) : primaryActions;
  // Preserve controller order, flags and IDs; only the mobile surface changes.
  const overflow = mobile ? primaryActions.filter(action => !direct.includes(action)) : [];
  const menu = [...overflow, ...menuActions];
  const overflowEnabled = overflow.some(action => action.enabled && !action.busy && (!busy || action.disableWhileBusy === false));
  const menuAction = (action: DetailAction) => <DetailActionButton key={action.id} action={action} primary={action.id === primaryId} busy={busy} menu
    onAction={id => { if (!action.keepMenuOpen) setMenuOpen(false); onAction(id); }} />;
  return <>
    <RecordActionBar className="document-detail-actions flex w-full min-w-0 flex-nowrap items-center justify-end gap-2 sm:flex-wrap" presentationAllowed={presentationAllowed}>
      {start}
      {menu.length > 0 && <AppButton type="button" variant="secondary" className="shrink-0 whitespace-nowrap px-3" disabled={(menuDisabled ?? busy) && !overflowEnabled}
        aria-label={menuLabel} title={menuLabel} aria-haspopup="dialog" aria-expanded={menuOpen && presentationAllowed}
        onClick={() => setMenuOpen(true)}><MoreHorizontal aria-hidden="true" className="size-5" /><span className="sm:hidden">Thêm</span></AppButton>}
      {direct.map(action => <DetailActionButton key={action.id} action={action} primary={action.id === primaryId} busy={busy} onAction={onAction} />)}
    </RecordActionBar>
    {menuOpen && presentationAllowed && menu.length > 0 && <UntitledBottomSheet open onClose={() => setMenuOpen(false)} title={menuTitle}>
      <ActionMenu title={menuTitle} onClose={() => setMenuOpen(false)}>
        {overflow.map(menuAction)}
        {/* Preserve the original menu gate when an overflow action is available. */}
        {menuActions.length > 0 && <fieldset disabled={menuDisabled ?? busy} className="grid min-w-0 gap-2">
          <legend className="sr-only">{menuLabel}</legend>
          {menuActions.map(menuAction)}
        </fieldset>}
      </ActionMenu>
    </UntitledBottomSheet>}
  </>;
}
