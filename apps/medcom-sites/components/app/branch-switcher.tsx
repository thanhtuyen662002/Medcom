"use client";

import { useState } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
import type { BranchOption } from "@/components/untitledui/mobile-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AppButton } from "./app-button";

interface BranchSwitcherProps {
  branches: readonly BranchOption[];
  currentBranch: string;
  onBranchChange: (branchId: string) => void;
  compact?: boolean;
  /** Fill the container (desktop sidebar) instead of the header's capped width. */
  fullWidth?: boolean;
}

/** Header copy sits beside the MEDCOMTECH logo, so the company prefix is dropped there. */
export function shortBranchName(name: string): string {
  const short = name.replace(/^\s*MEDCOMTECH\s+/i, "").trim();
  return short ? short.charAt(0).toLocaleUpperCase("vi") + short.slice(1) : name;
}

export function BranchSwitcher({ branches, currentBranch, onBranchChange, compact = false, fullWidth = false }: BranchSwitcherProps) {
  const [open, setOpen] = useState(false);
  const active = branches.find(branch => branch.id === currentBranch);
  const label = active?.name || (currentBranch ? `Chi nhánh ${currentBranch}` : "Chưa có chi nhánh");
  const shown = active?.name ? shortBranchName(active.name) : label;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><AppButton variant="ghost" aria-label={`Chọn chi nhánh: ${label}`} title={label} disabled={branches.length === 0}
      className={compact ? "min-w-0 flex-1 justify-start gap-1.5 px-1 text-left" : `min-w-0 ${fullWidth ? "w-full" : "max-w-64"} justify-start border border-neutral-200 px-3 dark:border-neutral-700`}>
      {!compact && <Building2 aria-hidden="true" className="size-5 shrink-0 text-brand-600 dark:text-brand-400" />}
      <span className="min-w-0 flex-1">
        {compact && <span className="block truncate text-xs font-medium text-neutral-500 dark:text-neutral-400">Chi nhánh</span>}
        <span className="block truncate text-sm font-semibold">{shown}</span>
      </span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-neutral-400" />
    </AppButton></PopoverTrigger>
    <PopoverContent align="start" aria-label="Chọn chi nhánh làm việc" className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-neutral-200 bg-white p-2 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
      <p className="px-3 py-2 text-sm font-semibold">Chi nhánh làm việc</p>
      <div className="max-h-[min(20rem,var(--radix-popover-content-available-height))] space-y-1 overflow-y-auto overscroll-contain">
        {branches.map(branch => <AppButton key={branch.id} variant="ghost" aria-pressed={branch.id === currentBranch}
          className={`w-full justify-start px-3 text-left ${branch.id === currentBranch ? "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300" : ""}`}
          onClick={() => { onBranchChange(branch.id); setOpen(false); }}>
          <Building2 aria-hidden="true" className="size-5 shrink-0" />
          <span className="min-w-0 flex-1 py-2"><span className="block break-words text-sm">{branch.name}</span>
            {branch.address && <span className="block truncate text-sm font-normal text-neutral-500 dark:text-neutral-400">{branch.address}</span>}
          </span>
          {branch.id === currentBranch && <Check aria-hidden="true" className="size-4 shrink-0" />}
        </AppButton>)}
      </div>
    </PopoverContent>
  </Popover>;
}
