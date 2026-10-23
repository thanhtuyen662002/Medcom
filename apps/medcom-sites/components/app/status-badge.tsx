import { statusBadgeStyle, statusBadgeTone } from "@/lib/erp/status-colors";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface StatusBadgeProps {
  label: string;
  title?: string;
  statusForeColor?: string | null;
  statusBackColor?: string | null;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  className?: string;
}

export function StatusBadge({ label, title, statusForeColor, statusBackColor, tone, className }: StatusBadgeProps) {
  return <span title={title} className={cn("app-status-badge inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold", className)}
    style={statusBadgeStyle(statusForeColor, statusBackColor, tone ?? statusBadgeTone(label)) as CSSProperties}>{label}</span>;
}
