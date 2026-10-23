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
  const description = subtitle ?? [branch ? `Chi nhánh ${branch}` : null, count !== undefined ? `${count} chứng từ` : null].filter(Boolean).join(" · ");
  return <header className="flex min-w-0 items-center justify-between gap-4 py-4">
    <div className="min-w-0">
      <h1 className="break-words text-xl font-semibold text-neutral-900 dark:text-neutral-100">{title}</h1>
      {description && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
    </div>
    {onCreate && <AppButton onClick={onCreate} disabled={createDisabled} className="hidden md:inline-flex">{createLabel}</AppButton>}
  </header>;
}
