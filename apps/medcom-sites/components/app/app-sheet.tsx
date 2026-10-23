"use client";

import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { AppButton } from "./app-button";

export interface AppSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  id?: string;
  presentation: "form" | "filter";
  children: ReactNode;
}

/** Radix owns modal focus trapping and Escape; retain the external opener without a SheetTrigger. */
export function AppSheet({ open, onClose, title, description, id, presentation, children }: AppSheetProps) {
  const opener = useRef<HTMLElement | null>(null);
  return <Sheet open={open} modal onOpenChange={nextOpen => { if (!nextOpen) onClose(); }}>
    <SheetContent id={id} side="bottom" showCloseButton={false} aria-modal="true"
      onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={event => {
        if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); }
      }}
      className={cn("gap-0 overflow-hidden border-neutral-200 bg-white p-0 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100",
        presentation === "form"
          ? "inset-0 h-dvh max-h-dvh w-full rounded-none md:inset-auto md:left-1/2 md:top-1/2 md:h-auto md:max-h-[90dvh] md:w-[calc(100%_-_2rem)] md:max-w-3xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
          : "max-h-[90dvh] rounded-t-2xl md:inset-auto md:right-6 md:top-[var(--app-filter-top,8rem)] md:max-h-[calc(100dvh_-_var(--app-filter-top,8rem)_-_1rem)] md:w-96 md:rounded-2xl")}>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
        <div className="min-w-0">
          <SheetTitle className="break-words text-xl font-semibold text-neutral-900 dark:text-neutral-100">{title}</SheetTitle>
          <SheetDescription className={cn("mt-1 text-sm text-neutral-500 dark:text-neutral-400", !description && "sr-only")}>{description ?? title}</SheetDescription>
        </div>
        <AppButton variant="ghost" size="icon" aria-label="Đóng" onClick={onClose}><X aria-hidden="true" className="size-5" /></AppButton>
      </div>
      {children}
    </SheetContent>
  </Sheet>;
}
