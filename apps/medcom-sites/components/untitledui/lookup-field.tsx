"use client";

import React, { useEffect, useState } from "react";
import { Search, X, Loader2, Check } from "lucide-react";
import { erpClient } from "@/lib/erp/erp-client";
import type { ErpChoice } from "@/lib/erp/erp-screen-contracts";
import type { ErpScreenModule } from "@/lib/erp/proxy-policy";

export function choiceLabel(choice: ErpChoice | null, fallback: string): string {
  if (choice && typeof choice.label === "string" && choice.label) return choice.label;
  return fallback;
}

export function fieldText(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/* ---------- Searchable lookup combobox (options API) ---------- */
export function LookupField({
  label,
  required,
  module,
  lookupId,
  branchId,
  value,
  choice,
  displayValue,
  onSelect,
  placeholder,
  error,
  compact,
  multiple,
  selected,
  onMultiSelect,
}: {
  label: string;
  required?: boolean;
  module: ErpScreenModule;
  lookupId: string;
  branchId: string;
  value: string;
  choice: ErpChoice | null;
  displayValue?: string;
  onSelect: (choice: ErpChoice | null) => void;
  placeholder?: string;
  error?: string;
  compact?: boolean;
  multiple?: boolean;
  selected?: ErpChoice[];
  onMultiSelect?: (choices: ErpChoice[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ErpChoice[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      erpClient
        .getLookupOptions(module, {
          branchId,
          lookupId,
          page: 1,
          pageSize: 20,
          search: search.trim() ? search.trim() : null,
        })
        .then((page) => {
          if (!cancelled) setItems(page.items || []);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, search ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, search, module, lookupId, branchId]);

  const isSelected = (id: string) => (selected ?? []).some((c) => c.id === id);
  const toggleMulti = (item: ErpChoice) => {
    const cur = selected ?? [];
    onMultiSelect?.(isSelected(item.id) ? cur.filter((c) => c.id !== item.id) : [...cur, item]);
  };

  return (
    <div>
      <label className="block text-neutral-500 dark:text-neutral-400 mb-1 font-medium">
        {label} {required && <span className="text-red-500">*</span>}
        {multiple && (selected ?? []).length > 0 && (
          <span className="ml-1.5 text-[10px] font-bold text-brand-600 dark:text-brand-400">
            {(selected ?? []).length} đã chọn
          </span>
        )}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setOpen((v) => !v);
          }}
          className={`w-full pr-8 rounded-xl border bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs text-left ${
            error
              ? "border-red-400 dark:border-red-700"
              : "border-neutral-300 dark:border-neutral-700"
          } ${compact ? "p-1.5" : "p-2.5"}`}
        >
          {multiple ? (
            (selected ?? []).length === 0 ? (
              <span className="text-neutral-400">{placeholder || "Chọn nhiều..."}</span>
            ) : (
              <span className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {(selected ?? []).map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-brand-100 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 text-[11px] font-semibold"
                  >
                    <span className="max-w-32 truncate">{fieldText(c.label) || c.id}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Bỏ ${fieldText(c.label) || c.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMultiSelect?.((selected ?? []).filter((x) => x.id !== c.id));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onMultiSelect?.((selected ?? []).filter((x) => x.id !== c.id));
                        }
                      }}
                      className="p-0.5 rounded-full hover:bg-brand-200 dark:hover:bg-brand-900"
                    >
                      <X className="size-3" />
                    </span>
                  </span>
                ))}
              </span>
            )
          ) : (
            <span className="block truncate">
              {choiceLabel(choice, displayValue || value) || (
                <span className="text-neutral-400">{placeholder || "Chọn..."}</span>
              )}
            </span>
          )}
        </button>
        {!multiple && value && (
          <button
            type="button"
            aria-label="Xóa lựa chọn"
            onClick={() => onSelect(null)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <X className="size-3.5" />
          </button>
        )}
        {open && (
          <div className="absolute z-30 mt-1 w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl overflow-hidden">
            <div className="flex items-center gap-2 p-2 border-b border-neutral-100 dark:border-neutral-800">
              <Search className="size-3.5 text-neutral-400 shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm kiếm..."
                className="w-full bg-transparent outline-none text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {loading ? (
                <p className="p-3 text-xs text-neutral-400 flex items-center gap-2">
                  <Loader2 className="size-3.5 animate-spin" /> Đang tải...
                </p>
              ) : items.length === 0 ? (
                <p className="p-3 text-xs text-neutral-400">Không có lựa chọn nào.</p>
              ) : (
                items.map((item) => {
                  const checked = multiple && isSelected(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (multiple) toggleMulti(item);
                        else {
                          onSelect(item);
                          setOpen(false);
                        }
                      }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-brand-50 dark:hover:bg-brand-950/40 flex items-center gap-2 ${
                        !multiple && item.id === value
                          ? "text-brand-700 dark:text-brand-300 font-bold"
                          : "text-neutral-700 dark:text-neutral-300"
                      } ${checked ? "bg-brand-50/60 dark:bg-brand-950/30" : ""}`}
                    >
                      {multiple && (
                        <span
                          className={`size-4 rounded border flex items-center justify-center shrink-0 ${
                            checked
                              ? "bg-brand-600 border-brand-600 text-white"
                              : "border-neutral-300 dark:border-neutral-600 text-transparent"
                          }`}
                        >
                          <Check className="size-3" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate ${checked ? "font-bold text-brand-700 dark:text-brand-300" : ""}`}>
                          {fieldText(item.label) || item.id}
                        </span>
                        {fieldText(item.label) && item.label !== item.id && (
                          <span className="block truncate text-[10px] text-neutral-400">{item.id}</span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {multiple && (
              <div className="p-2 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white hover:bg-brand-700"
                >
                  Xong{(selected ?? []).length > 0 ? ` (${(selected ?? []).length})` : ""}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
