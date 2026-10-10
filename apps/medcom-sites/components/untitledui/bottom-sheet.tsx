"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface UntitledBottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeight?: string;
}

export function UntitledBottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxHeight = "max-h-[85vh]",
}: UntitledBottomSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof document !== "undefined") {
      const active =
        document.documentElement.classList.contains("dark") ||
        document.body.classList.contains("dark") ||
        localStorage.getItem("medcom.theme.dark") === "true";
      setIsDark(active);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || !mounted) return null;

  const content = (
    <div className={`fixed inset-0 z-50 flex flex-col justify-end md:justify-center md:items-center overflow-hidden ${isDark ? "dark" : ""}`}>
      {/* Backdrop covering full viewport */}
      <div
        className="fixed inset-0 bg-neutral-950/65 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet / Modal Container (Bottom on mobile, Centered on desktop) */}
      <div
        className={`relative z-10 w-full max-w-lg md:max-w-2xl bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white rounded-t-3xl md:rounded-3xl border-t border-x md:border border-neutral-200/90 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col ${maxHeight} animate-uui-slide-up md:my-auto`}
        role="dialog"
        aria-modal="true"
      >
        {/* Mobile Drag Pill Handle */}
        <div className="pt-2.5 pb-1 flex justify-center md:hidden cursor-grab">
          <div className="w-10 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        </div>

        {/* Header */}
        {(title || subtitle) && (
          <div className="px-5 py-3.5 border-b border-neutral-100 dark:border-neutral-800 flex items-start justify-between gap-3 bg-neutral-50/50 dark:bg-neutral-900/50">
            <div className="min-w-0 flex-1">
              {title && (
                <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white truncate">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 truncate">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 -mr-1 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label="Đóng"
            >
              <X className="size-5" />
            </button>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 scrollbar-thin">
          {children}
        </div>

        {/* Sticky Footer */}
        {footer && (
          <div className="p-4 bg-neutral-50/90 dark:bg-neutral-950/90 backdrop-blur-xs border-t border-neutral-200/80 dark:border-neutral-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
