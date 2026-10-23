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
  onStepChange?: (step: number) => void;
  stepDisabled?: boolean;
  backDisabled?: boolean;
  cancelDisabled?: boolean;
  cancelLabel?: string;
  hideFooter?: boolean;
}

export function FormSheet({ open, onClose, title, description, children, submitLabel, onSubmit, busy = false, submitDisabled,
  steps = [], currentStep = 0, onBack, onNext, nextDisabled, onStepChange, stepDisabled,
  backDisabled, cancelDisabled, cancelLabel = "Hủy", hideFooter = false }: FormSheetProps) {
  const formId = useId();
  const hasNext = steps.length > 0 && currentStep < steps.length - 1;
  return <AppSheet open={open} onClose={onClose} title={title} description={description} presentation="form">
    {steps.length > 0 && <ol aria-label="Các bước" className="flex shrink-0 gap-2 border-b border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800">
      {steps.map((step, index) => <li key={step.id} aria-current={index === currentStep ? "step" : undefined}
        className="min-w-0 flex-1">
        {onStepChange ? <AppButton variant="ghost" disabled={busy || stepDisabled} onClick={() => onStepChange(index)}
          aria-current={index === currentStep ? "step" : undefined}
          className="w-full flex-col items-stretch gap-1 px-1 py-2 text-left">
          <span aria-hidden="true" className={index <= currentStep ? "h-1 rounded-full bg-brand-600 dark:bg-brand-400" : "h-1 rounded-full bg-neutral-200 dark:bg-neutral-700"} />
          <span className={index === currentStep ? "text-brand-700 dark:text-brand-300" : "text-neutral-500 dark:text-neutral-400"}>{index + 1}. {step.label}</span>
        </AppButton> : <span className={index === currentStep ? "font-semibold text-brand-700 dark:text-brand-300" : "text-neutral-500 dark:text-neutral-400"}>{index + 1}. {step.label}</span>}
      </li>)}
    </ol>}
    <form id={formId} noValidate aria-label={title} aria-busy={busy} className="flex min-h-0 flex-1 flex-col overflow-hidden" onKeyDown={event => {
      const target = event.target as HTMLElement;
      if (event.key === "Enter" && (target.tagName === "INPUT" || target.tagName === "SELECT")) event.preventDefault();
    }} onSubmit={event => {
      event.preventDefault();
      if (busy) return;
      if (hasNext) { if (!nextDisabled) onNext?.(); }
      else if (!submitDisabled) onSubmit(event);
    }}>
      <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 md:p-6 [&_input]:min-h-11 [&_input]:min-w-0 [&_input]:text-base [&_textarea]:min-h-11 [&_textarea]:text-base [&_label]:text-sm [&_label]:font-medium [&_button]:min-h-11 [&_button]:min-w-11 [&_[role=button]]:inline-flex [&_[role=button]]:min-h-11 [&_[role=button]]:min-w-11 [&_[role=button]]:items-center [&_[role=button]]:justify-center">{children}</div>
      {!hideFooter && <footer className="sticky bottom-0 mt-auto flex shrink-0 items-center justify-end gap-3 border-t border-neutral-200 bg-white p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] dark:border-neutral-800 dark:bg-neutral-900">
        {steps.length > 0 && currentStep > 0 && onBack
          ? <AppButton variant="secondary" onClick={onBack} disabled={busy || backDisabled}>Quay lại</AppButton>
          : <AppButton variant="secondary" onClick={onClose} disabled={busy || cancelDisabled}>{cancelLabel}</AppButton>}
        <AppButton className="min-w-0 flex-1 md:flex-none" type="submit" form={formId} busy={busy} disabled={hasNext ? nextDisabled || !onNext : submitDisabled}>{hasNext ? "Tiếp tục" : submitLabel}</AppButton>
      </footer>}
    </form>
  </AppSheet>;
}
