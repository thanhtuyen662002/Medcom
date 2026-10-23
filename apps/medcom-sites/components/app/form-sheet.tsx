"use client";

import { useId, type FormEventHandler, type ReactNode } from "react";
import { AppButton } from "./app-button";
import { AppSheet } from "./app-sheet";

export interface FormSheetStep { id: string; label: string }
export interface FormSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  submitLabel: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  busy?: boolean;
  submitDisabled?: boolean;
  steps?: readonly FormSheetStep[];
  currentStep?: number;
  onBack?: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
}

export function FormSheet({ open, onClose, title, description, children, submitLabel, onSubmit, busy = false, submitDisabled,
  steps = [], currentStep = 0, onBack, onNext, nextDisabled }: FormSheetProps) {
  const formId = useId();
  const hasNext = steps.length > 0 && currentStep < steps.length - 1;
  return <AppSheet open={open} onClose={onClose} title={title} description={description} presentation="form">
    {steps.length > 0 && <ol aria-label="Các bước" className="flex shrink-0 gap-3 overflow-x-auto border-b border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
      {steps.map((step, index) => <li key={step.id} aria-current={index === currentStep ? "step" : undefined}
        className={index === currentStep ? "shrink-0 font-semibold text-brand-700 dark:text-brand-300" : "shrink-0 text-neutral-500 dark:text-neutral-400"}>{index + 1}. {step.label}</li>)}
    </ol>}
    <form id={formId} aria-label={title} aria-busy={busy} className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={event => {
      event.preventDefault();
      if (busy) return;
      if (hasNext) { if (!nextDisabled) onNext?.(); }
      else if (!submitDisabled) onSubmit(event);
    }}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 md:p-6">{children}</div>
      <footer className="sticky bottom-0 mt-auto flex shrink-0 items-center justify-end gap-3 border-t border-neutral-200 bg-white p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] dark:border-neutral-800 dark:bg-neutral-900">
        {steps.length > 0 && currentStep > 0
          ? <AppButton variant="secondary" onClick={onBack} disabled={busy || !onBack}>Quay lại</AppButton>
          : <AppButton variant="secondary" onClick={onClose} disabled={busy}>Hủy</AppButton>}
        <AppButton type="submit" form={formId} busy={busy} disabled={hasNext ? nextDisabled || !onNext : submitDisabled}>{hasNext ? "Tiếp tục" : submitLabel}</AppButton>
      </footer>
    </form>
  </AppSheet>;
}
