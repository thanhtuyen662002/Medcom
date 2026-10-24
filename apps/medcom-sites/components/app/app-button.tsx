"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type AppButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg" | "icon";
  busy?: boolean;
};

const variants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-500 dark:text-white dark:hover:bg-brand-600",
  secondary: "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800",
  ghost: "bg-transparent text-neutral-700 hover:bg-neutral-100 dark:bg-transparent dark:text-neutral-200 dark:hover:bg-neutral-800",
  danger: "bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:text-white dark:hover:bg-red-600",
};
const sizes = { md: "min-h-11 min-w-11 px-4", lg: "min-h-12 min-w-12 px-5", icon: "size-11 shrink-0 p-0" };

export function AppButton({ variant = "primary", size = "md", busy = false, disabled, type = "button", className, children, ...props }: AppButtonProps) {
  return <button {...props} type={type} disabled={disabled || busy} aria-busy={busy || undefined}
    className={cn("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-[color,background-color,border-color,transform] duration-150 enabled:active:scale-[0.97] motion-reduce:transition-none motion-reduce:enabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:focus-visible:outline-brand-300 disabled:cursor-not-allowed disabled:opacity-50", variants[variant], sizes[size], className)}>
    {children}
  </button>;
}
