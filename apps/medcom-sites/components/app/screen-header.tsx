import { ScreenHelp } from "@/components/help/screen-help";
import { AppButton } from "./app-button";

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  branch?: string;
  count?: number;
  onCreate?: () => void;
  createLabel?: string;
  createDisabled?: boolean;
  /** Screen id whose embedded guide the header offers, if one is ready. */
  helpScreen?: string;
}

export function ScreenHeader({ title, subtitle, branch, count, onCreate, createLabel = "Tạo mới", createDisabled, helpScreen }: ScreenHeaderProps) {
  const description = subtitle ?? [branch ? `Chi nhánh ${branch}` : null, count !== undefined ? `${count} chứng từ trên trang` : null].filter(Boolean).join(" · ");
  return <header className="flex min-w-0 items-center justify-between gap-4 pb-1">
    <div className="min-w-0 border-l-4 border-brand-600 pl-3 dark:border-brand-400">
      <h1 className="break-words text-xl font-bold leading-tight tracking-tight text-neutral-950 sm:text-2xl dark:text-white">{title}</h1>
      {description && <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
    </div>
    {(helpScreen || onCreate) && <div className="flex shrink-0 items-center gap-2">
      {helpScreen && <ScreenHelp screen={helpScreen} title={title} />}
      {onCreate && <AppButton onClick={onCreate} disabled={createDisabled} className="hidden md:inline-flex">{createLabel}</AppButton>}
    </div>}
  </header>;
}
