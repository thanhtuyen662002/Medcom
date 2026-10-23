import { statusColorStyle } from "@/lib/erp/status-colors";
import { cn } from "@/lib/utils";

export interface StatusBadgeProps {
  label: string;
  statusForeColor?: string | null;
  statusBackColor?: string | null;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  className?: string;
}

const tones = {
  neutral: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
  success: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  info: "bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-200",
};

export function StatusBadge({ label, statusForeColor, statusBackColor, tone = "neutral", className }: StatusBadgeProps) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone], className)}
    style={statusColorStyle(statusForeColor, statusBackColor)}>{label}</span>;
}
