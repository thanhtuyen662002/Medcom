"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  context,
  preloadAll = false,
  secondaryFields = [],
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
  /** Values for the lookup's declared `parameters` (e.g. contract lookup bound to ObjectID). */
  context?: Record<string, string | null>;
  /** Load every bounded page, including before opening (customer's contracts). */
  preloadAll?: boolean;
  secondaryFields?: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // On a phone the field can sit at the bottom of the sheet; bring the whole list into view.
  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [open]);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<{ key: string; items: ErpChoice[]; hasMore: boolean; page: number }>();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [failureKey, setFailureKey] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [pagination, setPagination] = useState({ key: "", page: 1 });

  // Callers inline a fresh object each render; serialize it so the request only
  // reruns when the linked parent value actually changes.
  const contextKey = JSON.stringify(context ?? null);
  const effectiveSearch = open ? search.trim() : "";
  const queryKey = JSON.stringify([module, lookupId, branchId, contextKey, effectiveSearch, preloadAll]);
  const page = pagination.key === queryKey ? pagination.page : 1;
  const enabled = open || preloadAll;
  const currentKey = useRef(queryKey);
  useLayoutEffect(() => { currentKey.current = queryKey; }, [queryKey]);
  const items = result?.key === queryKey ? result.items : [];
  const loading = pendingKey === queryKey || (enabled && result?.key !== queryKey && failureKey !== queryKey);
  const failed = failureKey === queryKey;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const key = queryKey;
    const [requestModule, requestLookup, requestBranch, requestContext, requestSearch] = JSON.parse(key) as
      [ErpScreenModule, string, string, string, string, boolean];
    setPendingKey(key);
    setFailureKey(null);
    const timer = setTimeout(() => {
      void (async () => {
        const accumulated: ErpChoice[] = [];
        for (let next = 1; next <= 1000; next++) {
          const response = await erpClient.getLookupOptions(requestModule, {
            branchId: requestBranch, lookupId: requestLookup, page: next, pageSize: 100,
            search: requestSearch || null, context: JSON.parse(requestContext),
          });
          if (cancelled) return;
          accumulated.push(...response.items);
          if (!response.hasMore || (!preloadAll && next >= page)) {
            setResult({ key, items: accumulated, hasMore: response.hasMore, page: next });
            return;
          }
        }
        throw new Error("Lookup page limit reached");
      })().catch(() => {
        if (!cancelled) { setResult(undefined); setFailureKey(key); }
      }).finally(() => {
        if (!cancelled) setPendingKey(null);
      });
    }, requestSearch ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, queryKey, page, retry, preloadAll]);

  const isSelected = (id: string) => (selected ?? []).some((c) => c.id === id);
  const toggleMulti = (item: ErpChoice) => {
    const cur = selected ?? [];
    onMultiSelect?.(isSelected(item.id) ? cur.filter((c) => c.id !== item.id) : [...cur, item]);
  };

  return (
    <div className="min-w-0 text-base leading-6 text-black dark:text-white">
      <label className="mb-1.5 block text-sm font-medium text-black dark:text-white">
        {label} {required && <span className="text-red-500">*</span>}
        {multiple && (selected ?? []).length > 0 && (
          <span className="ml-1.5 text-sm font-semibold text-brand-600 dark:text-brand-400">
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
          className={`min-h-11 w-full pr-12 rounded-xl border bg-white dark:bg-neutral-900 text-black dark:text-white text-base leading-6 font-medium text-left ${
            error
              ? "border-red-400 dark:border-red-700"
              : "border-neutral-300 dark:border-neutral-700"
          } ${compact ? "p-1.5" : "p-2.5"}`}
        >
          {multiple ? (
            (selected ?? []).length === 0 ? (
              <span className="text-black dark:text-white">{placeholder || "Chọn nhiều..."}</span>
            ) : (
              <span className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {(selected ?? []).map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-brand-100 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 text-base font-medium"
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
                <span className="text-black dark:text-white">{placeholder || "Chọn..."}</span>
              )}
            </span>
          )}
        </button>
        {!multiple && value && (
          <button
            type="button"
            aria-label="Xóa lựa chọn"
            onClick={() => onSelect(null)}
            className="absolute right-1 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-black hover:bg-neutral-100 dark:text-white dark:hover:bg-neutral-800"
          >
            <X className="size-3.5" />
          </button>
        )}
        {open && (
          <div ref={panelRef} className="absolute z-30 mt-1 w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl overflow-hidden">
            <div className="p-2 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2 rounded-lg bg-neutral-100 px-3 ring-1 ring-transparent transition-shadow focus-within:bg-white focus-within:ring-brand-500/50 dark:bg-neutral-800 dark:focus-within:bg-neutral-900 dark:focus-within:ring-brand-400/50">
                <Search className="size-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm kiếm..."
                  className="min-h-10 w-full bg-transparent outline-none focus-visible:outline-none text-base leading-6 text-black dark:text-white placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {loading ? (
                <p className="p-3 text-sm text-black dark:text-white flex items-center gap-2">
                  <Loader2 className="size-3.5 animate-spin" /> Đang tải...
                </p>
              ) : failed ? (
                <div role="alert" className="p-3 text-sm text-red-600">
                  Không tải được danh sách lựa chọn.
                  <button type="button" onClick={() => setRetry(v => v + 1)} className="ml-2 underline">Thử lại</button>
                </div>
              ) : items.length === 0 ? (
                <p className="p-3 text-sm text-black dark:text-white">Không có lựa chọn nào.</p>
              ) : (
                items.map((item) => {
                  const checked = multiple && isSelected(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (currentKey.current !== queryKey || loading || failed) return;
                        if (multiple) toggleMulti(item);
                        else {
                          onSelect(item);
                          setOpen(false);
                        }
                      }}
                      className={`min-h-11 w-full text-left px-3 py-2 text-base leading-6 font-medium hover:bg-brand-50 dark:hover:bg-brand-950/40 flex items-center gap-2 ${
                        !multiple && item.id === value
                          ? "text-brand-700 dark:text-brand-300 font-bold"
                          : "text-black dark:text-white"
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
                          <span className="block truncate text-sm text-black dark:text-white">{item.id}</span>
                        )}
                        {secondaryFields.map(field => fieldText(item.fields?.[field])).filter(Boolean).length > 0 && (
                          <span className="block text-sm text-black dark:text-white">
                            {secondaryFields.map(field => fieldText(item.fields?.[field])).filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {!loading && !failed && result?.key === queryKey && result.hasMore && (
              <button type="button" onClick={() => setPagination({ key: queryKey, page: result.page + 1 })}
                className="min-h-11 w-full p-2 text-sm font-semibold text-brand-600 dark:text-brand-300 border-t border-neutral-100 dark:border-neutral-800">
                Tải thêm lựa chọn
              </button>
            )}
            {multiple && (
              <div className="p-2 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="min-h-11 px-3 py-1.5 rounded-lg text-base font-semibold bg-brand-600 text-white hover:bg-brand-700"
                >
                  Xong{(selected ?? []).length > 0 ? ` (${(selected ?? []).length})` : ""}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}
