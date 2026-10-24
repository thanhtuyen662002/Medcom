import { AppButton } from "./app-button";

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  branch?: string;
  count?: number;
  onCreate?: () => void;
  createLabel?: string;
  createDisabled?: boolean;
}

export function ScreenHeader({ title, subtitle, branch, count, onCreate, createLabel = "Tạo mới", createDisabled }: ScreenHeaderProps) {
  const description = subtitle ?? [branch ? `Chi nhánh ${branch}` : null, count !== undefined ? `${count} chứng từ trên trang` : null].filter(Boolean).join(" · ");
  return <header className="flex min-w-0 items-center justify-between gap-4 pb-4 pt-1">
    <div className="min-w-0 border-l-4 border-brand-600 pl-3 dark:border-brand-400">
      <h1 className="break-words text-2xl font-bold leading-tight tracking-tight text-neutral-950 sm:text-[1.625rem] dark:text-white">{title}</h1>
      {description && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
    </div>
    {onCreate && <AppButton onClick={onCreate} disabled={createDisabled} className="hidden md:inline-flex">{createLabel}</AppButton>}
  </header>;
}
