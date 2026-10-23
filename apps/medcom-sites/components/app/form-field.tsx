"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface FormFieldControlProps {
  id: string;
  required: boolean;
  "aria-required": boolean;
  "aria-invalid": boolean;
  "aria-describedby"?: string;
  className: string;
}

export type FormFieldProps = Omit<ComponentProps<"input">, "children"> & {
  label: string;
  error?: string;
  hint?: string;
  children?: (control: FormFieldControlProps) => ReactNode;
};

export function FormField({ label, error, hint, children, required = false, id: suppliedId, className, "aria-describedby": describedBy, ...inputProps }: FormFieldProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const description = [describedBy, hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const control: FormFieldControlProps = {
    id, required, "aria-required": required, "aria-invalid": Boolean(error), "aria-describedby": description,
    className: cn("min-h-11 w-full min-w-0 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 placeholder:text-neutral-500 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-400 dark:focus-visible:outline-brand-300",
      error && "border-red-500 dark:border-red-400", className),
  };
  return <div className="min-w-0 space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">{label}{required && <span aria-hidden="true" className="ml-1 text-red-600 dark:text-red-400">*</span>}</label>
    {children ? children(control) : <input {...inputProps} {...control} />}
    {hint && <p id={`${id}-hint`} className="text-sm text-neutral-500 dark:text-neutral-400">{hint}</p>}
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
  </div>;
}

export interface FormSectionProps { title: string; description?: string; children: ReactNode; className?: string; layout?: "grid" | "stack"; action?: ReactNode }

export function FormSection({ title, description, children, className, layout = "grid", action }: FormSectionProps) {
  const titleId = useId();
  return <section aria-labelledby={titleId} className={cn("min-w-0 space-y-4", className)}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0"><h2 id={titleId} className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
        {description && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}</div>
      {action}
    </div>
    <div className={layout === "grid" ? "grid min-w-0 gap-4 md:grid-cols-2" : "min-w-0 space-y-4"}>{children}</div>
  </section>;
}
