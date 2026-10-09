"use client";

import React from "react";

export type BadgeVariant = "brand" | "gray" | "success" | "warning" | "error" | "blue" | "purple";
export type BadgeSize = "sm" | "md" | "lg";

export interface UntitledBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function UntitledBadge({
  variant = "brand",
  size = "md",
  dot = false,
  icon,
  children,
  className = "",
  ...props
}: UntitledBadgeProps) {
  const variantStyles: Record<BadgeVariant, { bg: string; text: string; ring: string; dot: string }> = {
    brand: {
      bg: "bg-purple-50 dark:bg-purple-950/60",
      text: "text-purple-700 dark:text-purple-300",
      ring: "ring-1 ring-purple-600/20 dark:ring-purple-400/30",
      dot: "bg-purple-500",
    },
    blue: {
      bg: "bg-blue-50 dark:bg-blue-950/60",
      text: "text-blue-700 dark:text-blue-300",
      ring: "ring-1 ring-blue-600/20 dark:ring-blue-400/30",
      dot: "bg-blue-500",
    },
    purple: {
      bg: "bg-violet-50 dark:bg-violet-950/60",
      text: "text-violet-700 dark:text-violet-300",
      ring: "ring-1 ring-violet-600/20 dark:ring-violet-400/30",
      dot: "bg-violet-500",
    },
    success: {
      bg: "bg-emerald-50 dark:bg-emerald-950/60",
      text: "text-emerald-700 dark:text-emerald-300",
      ring: "ring-1 ring-emerald-600/20 dark:ring-emerald-400/30",
      dot: "bg-emerald-500",
    },
    warning: {
      bg: "bg-amber-50 dark:bg-amber-950/60",
      text: "text-amber-700 dark:text-amber-300",
      ring: "ring-1 ring-amber-600/20 dark:ring-amber-400/30",
      dot: "bg-amber-500",
    },
    error: {
      bg: "bg-rose-50 dark:bg-rose-950/60",
      text: "text-rose-700 dark:text-rose-300",
      ring: "ring-1 ring-rose-600/20 dark:ring-rose-400/30",
      dot: "bg-rose-500",
    },
    gray: {
      bg: "bg-neutral-100 dark:bg-neutral-800",
      text: "text-neutral-700 dark:text-neutral-300",
      ring: "ring-1 ring-neutral-300/40 dark:ring-neutral-700",
      dot: "bg-neutral-500",
    },
  };

  const sizeStyles: Record<BadgeSize, string> = {
    sm: "px-2 py-0.5 text-[11px] font-medium gap-1",
    md: "px-2.5 py-0.5 text-xs font-medium gap-1.5",
    lg: "px-3 py-1 text-sm font-medium gap-2",
  };

  const v = variantStyles[variant];

  return (
    <span
      className={`inline-flex items-center rounded-full transition-colors ${v.bg} ${v.text} ${v.ring} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`size-1.5 rounded-full shrink-0 ${v.dot}`}
          aria-hidden="true"
        />
      )}
      {icon && <span className="shrink-0 size-3.5 flex items-center justify-center">{icon}</span>}
      <span className="truncate leading-none">{children}</span>
    </span>
  );
}
