"use client";

import { useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import type { DetailAction } from "@/lib/erp/document-detail/model";
import { UntitledBottomSheet } from "@/components/untitledui/bottom-sheet";
import { RecordActionBar } from "../record-dialog";
import { RequestButton, requestStyles } from "../request-presentation";
import { DetailActionButton } from "./presentation";

export function DocumentActionBar({ actions, busy = false, presentationAllowed = true, onAction, menuDisabled, menuTitle = "Thao tác khác", start,
  menuLabel = "Thao tác khác", menuOpen: controlledMenuOpen, onMenuOpenChange }: {
  actions: readonly DetailAction[]; busy?: boolean; presentationAllowed?: boolean; onAction(id: string): void;
  menuDisabled?: boolean; menuTitle?: string; start?: ReactNode;
  menuLabel?: string; menuOpen?: boolean; onMenuOpenChange?(open: boolean): void;
}) {
  const [localMenuOpen, setLocalMenuOpen] = useState(false);
  const menuOpen = controlledMenuOpen ?? localMenuOpen;
  const setMenuOpen = (open: boolean) => { setLocalMenuOpen(open); onMenuOpenChange?.(open); };
  const visible = actions.filter(action => action.visible);
  const menu = visible.filter(action => action.placement === "menu");
  return <>
    <RecordActionBar className={`${requestStyles.actions} w-full justify-end`} presentationAllowed={presentationAllowed}>
      {start}
      {menu.length > 0 && <RequestButton type="button" variant="outline" className="!flex-none px-3" disabled={menuDisabled ?? busy}
        aria-label={menuLabel} title={menuLabel} aria-haspopup="dialog" aria-expanded={menuOpen && presentationAllowed}
        onClick={() => setMenuOpen(true)}><MoreHorizontal aria-hidden="true" className="size-5" /></RequestButton>}
      {visible.filter(action => action.placement === "primary").map(action => <DetailActionButton key={action.id} action={action} busy={busy} onAction={onAction} />)}
    </RecordActionBar>
    {menuOpen && presentationAllowed && menu.length > 0 && <UntitledBottomSheet open onClose={() => setMenuOpen(false)} title={menuTitle}>
      <div className="grid gap-2">{menu.map(action => <DetailActionButton key={action.id} action={action} busy={busy} menu
        onAction={id => { if (!action.keepMenuOpen) setMenuOpen(false); onAction(id); }} />)}</div>
    </UntitledBottomSheet>}
  </>;
}
