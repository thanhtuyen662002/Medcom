"use client";

import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface UntitledMetricCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  iconColor?: "brand" | "blue" | "success" | "warning" | "error";
  change?: string;
  changeType?: "positive" | "negative" | "neutral" | "warning";
  period?: string;
  onClick?: () => void;
  className?: string;
}

export function UntitledMetricCard({
  title,
  value,
  icon,
  iconColor = "brand",
  change,
  changeType = "positive",
  period = "so với tháng trước",
  onClick,
  className = "",
}: UntitledMetricCardProps) {
  const iconColorStyles = {
    brand: "bg-purple-50 dark:bg-purple-950/70 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-800",
    blue: "bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800",
    success: "bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800",
    warning: "bg-amber-50 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-800",
    error: "bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800",
  };

  const changeStyles = {
    positive: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 ring-emerald-600/20",
    negative: "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 ring-rose-600/20",
    neutral: "text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 ring-neutral-300/40",
    warning: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 ring-amber-600/20",
  };

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-4 sm:p-5 shadow-xs transition-all duration-200 ease-out hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-700 ${
        onClick ? "cursor-pointer active:scale-[0.99]" : ""
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-neutral-500 dark:text-neutral-400 truncate">
            {title}
          </p>
          <h3 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white truncate">
            {value}
          </h3>
        </div>
        {icon && (
          <div
            className={`size-10 sm:size-11 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs ${iconColorStyles[iconColor]}`}
          >
            {icon}
          </div>
        )}
      </div>

      {(change || period) && (
        <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
          {change && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ring-1 ring-inset ${changeStyles[changeType]}`}
            >
              {changeType === "positive" && <TrendingUp className="size-3" />}
              {changeType === "negative" && <TrendingDown className="size-3" />}
              {changeType === "neutral" && <Minus className="size-3" />}
              {change}
            </span>
          )}
          {period && (
            <span className="text-neutral-400 dark:text-neutral-500 truncate">
              {period}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
