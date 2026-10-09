"use client";

import React, { useEffect } from "react";
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
  maxHeight = "max-h-[88vh]",
}: UntitledBottomSheetProps) {
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Content Container */}
      <div
        className={`relative z-10 w-full max-w-lg mx-auto bg-white dark:bg-neutral-900 rounded-t-3xl border-t border-x border-neutral-200/80 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col ${maxHeight} animate-uui-slide-up`}
        role="dialog"
        aria-modal="true"
      >
        {/* Drag Pill Handle */}
        <div className="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1.2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        </div>

        {/* Header */}
        {(title || subtitle) && (
          <div className="px-5 py-3 border-b border-neutral-100 dark:border-neutral-800 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {title && (
                <h3 className="text-base font-bold text-neutral-900 dark:text-white truncate">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
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
}
