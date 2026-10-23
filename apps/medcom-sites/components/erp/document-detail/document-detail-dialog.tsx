"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RecordDialog } from "../record-dialog";

const subscribe = () => () => {};
const getHost = () => document.body;
const getServerHost = () => null;

export interface DocumentDetailDialogProps {
  open: boolean;
  presentationAllowed?: boolean;
  title: string;
  documentNumber: string | null;
  closeLabel: string;
  onRequestClose(): void;
  children: ReactNode;
}

export function DocumentDetailDialog({ open, presentationAllowed = true, title, documentNumber, closeLabel, onRequestClose, children }: DocumentDetailDialogProps) {
  const host = useSyncExternalStore(subscribe, getHost, getServerHost);
  if (!host) return null;
  // Retained tab transforms create a containing block for fixed descendants.
  // The body portal restores viewport bounds while preserving React contexts.
  return createPortal(<RecordDialog open={open} presentationAllowed={presentationAllowed} title={documentNumber || title} documentNumber={null}
    className="p-0! sm:p-6! font-['Segoe_UI',Roboto,Arial,sans-serif] text-base leading-relaxed
      [&_.request-detail-dialog]:h-dvh! [&_.request-detail-dialog]:max-h-dvh! [&_.request-detail-dialog]:w-full! [&_.request-detail-dialog]:max-w-[1440px]! [&_.request-detail-dialog]:rounded-none! [&_.request-detail-dialog]:bg-white! [&_.request-detail-dialog]:text-black!
      sm:[&_.request-detail-dialog]:h-[min(900px,calc(100dvh-3rem))]! sm:[&_.request-detail-dialog]:max-h-[calc(100dvh-3rem)]! sm:[&_.request-detail-dialog]:rounded-2xl!
      dark:[&_.request-detail-dialog]:bg-neutral-900! dark:[&_.request-detail-dialog]:text-white!
      [&_.request-detail-header]:bg-white! [&_.request-detail-header]:px-4! [&_.request-detail-header]:pb-4! [&_.request-detail-header]:pt-[calc(1rem_+_env(safe-area-inset-top))]! sm:[&_.request-detail-header]:px-6! dark:[&_.request-detail-header]:bg-neutral-900!
      [&_.request-detail-header_h2]:order-none! [&_.request-detail-header_h2]:text-xl! [&_.request-detail-header_h2]:font-semibold! [&_.request-detail-header_h2]:text-neutral-900! dark:[&_.request-detail-header_h2]:text-neutral-100!
      [&_.request-detail-body]:block! [&_.request-detail-body]:bg-neutral-50! [&_.request-detail-body]:p-4! sm:[&_.request-detail-body]:p-6! dark:[&_.request-detail-body]:bg-neutral-950!
      [&_.record-dialog-actions]:bg-white! [&_.record-dialog-actions]:px-4! [&_.record-dialog-actions]:pt-3! [&_.record-dialog-actions]:pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]! sm:[&_.record-dialog-actions]:px-6! dark:[&_.record-dialog-actions]:bg-neutral-900!
      [&_.record-dialog-close]:size-11! [&_.record-dialog-close]:items-center! [&_.record-dialog-close]:justify-center! [&_.record-dialog-close]:rounded-xl! [&_.record-dialog-close]:border-0! [&_.record-dialog-close]:bg-transparent! [&_.record-dialog-close]:p-0! [&_.record-dialog-close]:text-neutral-700! [&_.record-dialog-close]:shadow-none! [&_.record-dialog-close:hover]:bg-neutral-100! dark:[&_.record-dialog-close]:text-neutral-200! dark:[&_.record-dialog-close:hover]:bg-neutral-800!"
    closeLabel={closeLabel} onRequestClose={onRequestClose}>{children}</RecordDialog>, host);
}
