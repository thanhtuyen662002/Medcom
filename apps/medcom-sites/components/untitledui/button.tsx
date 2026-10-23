"use client";

import React from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary-gray" | "secondary-color" | "tertiary-gray" | "destructive" | "ghost";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface UntitledButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeading?: React.ReactNode;
  iconTrailing?: React.ReactNode;
  fullWidth?: boolean;
}

export function UntitledButton({
  variant = "primary",
  size = "md",
  loading = false,
  iconLeading,
  iconTrailing,
  fullWidth = false,
  children,
  className = "",
  disabled,
  ...props
}: UntitledButtonProps) {
  const baseStyles =
    "group relative inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150 ease-out cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100";

  const variantStyles: Record<ButtonVariant, string> = {
    primary:
      "bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-sm border border-brand-500/30 focus-visible:ring-brand-500",
    "secondary-gray":
      "bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-300/80 dark:border-neutral-700 shadow-xs focus-visible:ring-neutral-400",
    "secondary-color":
      "bg-brand-50 dark:bg-brand-950/60 hover:bg-brand-100 dark:hover:bg-brand-900/60 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 focus-visible:ring-brand-400",
    "tertiary-gray":
      "bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 focus-visible:ring-neutral-400",
    destructive:
      "bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-sm border border-rose-500/30 focus-visible:ring-rose-500",
    ghost:
      "bg-transparent hover:bg-neutral-100/60 dark:hover:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400 focus-visible:ring-neutral-400",
  };

  const sizeStyles: Record<ButtonSize, string> = {
    sm: "px-3 py-1.5 text-xs gap-1.5 min-h-[34px]",
    md: "px-4 py-2.5 text-sm gap-2 min-h-[42px]",
    lg: "px-5 py-3 text-base gap-2.5 min-h-[48px]",
    icon: "p-2 min-h-[38px] min-w-[38px] aspect-square rounded-lg",
  };

  const widthStyle = fullWidth ? "w-full" : "";

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin shrink-0" />
      ) : (
        iconLeading && <span className="shrink-0 flex items-center">{iconLeading}</span>
      )}
      {children && <span className="truncate">{children}</span>}
      {!loading && iconTrailing && <span className="shrink-0 flex items-center">{iconTrailing}</span>}
    </button>
  );
}
