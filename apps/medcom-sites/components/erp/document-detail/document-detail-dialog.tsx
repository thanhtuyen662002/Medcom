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
  return createPortal(<RecordDialog open={open} presentationAllowed={presentationAllowed} title={title} documentNumber={documentNumber}
    className="p-0! sm:p-6! font-['Segoe_UI',Roboto,Arial,sans-serif] text-base leading-relaxed
      [&_.request-detail-dialog]:h-dvh! [&_.request-detail-dialog]:max-h-dvh! [&_.request-detail-dialog]:w-full! [&_.request-detail-dialog]:max-w-[1440px]! [&_.request-detail-dialog]:rounded-none! [&_.request-detail-dialog]:bg-white! [&_.request-detail-dialog]:text-black!
      sm:[&_.request-detail-dialog]:h-[min(900px,calc(100dvh-3rem))]! sm:[&_.request-detail-dialog]:max-h-[calc(100dvh-3rem)]! sm:[&_.request-detail-dialog]:rounded-2xl!
      dark:[&_.request-detail-dialog]:bg-neutral-900! dark:[&_.request-detail-dialog]:text-white!
      [&_.request-detail-header]:bg-white! [&_.request-detail-header]:p-4! sm:[&_.request-detail-header]:px-6! dark:[&_.request-detail-header]:bg-neutral-900!
      [&_.request-detail-header_h2]:text-lg! sm:[&_.request-detail-header_h2]:text-xl! [&_.record-document-number]:text-sm! [&_.record-document-number]:text-black! dark:[&_.record-document-number]:text-white!
      [&_.request-detail-body]:block! [&_.request-detail-body]:bg-neutral-50! [&_.request-detail-body]:p-4! sm:[&_.request-detail-body]:p-6! dark:[&_.request-detail-body]:bg-neutral-950!
      [&_.record-dialog-actions]:bg-white! [&_.record-dialog-actions]:p-4! sm:[&_.record-dialog-actions]:px-6! dark:[&_.record-dialog-actions]:bg-neutral-900!
      [&_.record-dialog-close]:items-center! [&_.record-dialog-close]:justify-center! [&_.record-dialog-close]:text-black! dark:[&_.record-dialog-close]:text-white!"
    closeLabel={closeLabel} onRequestClose={onRequestClose}>{children}</RecordDialog>, host);
}
