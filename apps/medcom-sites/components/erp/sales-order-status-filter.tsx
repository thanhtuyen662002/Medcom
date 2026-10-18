"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { erpClient } from "@/lib/erp/erp-client";
import type { SalesOrderModule } from "@/lib/erp/sales-order-workflow";

type StatusChoice = { id: number; label: string };
type StatusPage = { scope: string; choices: StatusChoice[]; page: number; hasMore: boolean };

export function SalesOrderStatusFilter({ module, branchId, isActive, value, onChange }: {
  module: SalesOrderModule; branchId: string; isActive: boolean;
  value: number | null; onChange: (value: number | null) => void;
}) {
  const scope = `${module}:${branchId}`;
  const [result, setResult] = useState<StatusPage>();
  const [busy, setBusy] = useState(false);
  const [failedPage, setFailedPage] = useState<number>();
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const current = result?.scope === scope ? result : undefined;

  const load = useCallback(async (page: number) => {
    const seq = ++generation.current;
    setBusy(true); setFailedPage(undefined);
    try {
      const response = await erpClient.getLookupOptions(module, {
        branchId, lookupId: "header.StatusID", page, pageSize: 100,
      });
      if (seq !== generation.current) return;
      if (response.requiredParameters.length) throw new Error("status_context_required");
      const choices = response.items.map(choice => {
        const id = Number(choice.id), label = choice.label?.trim();
        if (!/^-?\d+$/.test(choice.id) || !Number.isSafeInteger(id) || id < -2147483648 || id > 2147483647
          || !label || label.length > 100 || /[\p{Cc}\p{Cs}]/u.test(label)) throw new Error("invalid_status_choice");
        return { id, label };
      });
      setResult(previous => {
        const combined = page > 1 && previous?.scope === scope ? [...previous.choices, ...choices] : choices;
        return { scope, choices: combined.filter((choice, index) => combined.findIndex(item => item.id === choice.id) === index), page, hasMore: response.hasMore };
      });
    } catch {
      if (seq === generation.current) setFailedPage(page);
    } finally {
      if (seq === generation.current) setBusy(false);
    }
  }, [module, branchId, scope]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active && isActive) void load(1); });
    return () => { active = false; invalidate(); };
  }, [isActive, load, invalidate]);

  return <div className="space-y-2">
    <div role="group" aria-label="Lọc trạng thái đơn hàng" aria-busy={busy}
      className="flex items-center gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
      {[{ id: null, label: "Tất cả" }, ...(current?.choices ?? [])].map(choice => <button key={choice.id ?? "all"} type="button"
        aria-pressed={value === choice.id} disabled={!isActive} onClick={() => onChange(choice.id)}
        className={`inline-flex min-h-11 shrink-0 items-center rounded-xl border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${value === choice.id
          ? "border-brand-600 bg-brand-600 text-white" : "border-neutral-200 bg-white text-black hover:border-brand-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"}`}>
        {choice.label}
      </button>)}
      {busy && <span role="status" className="inline-flex shrink-0 items-center gap-2 px-2 text-sm"><Loader2 aria-hidden className="size-4 animate-spin" />Đang tải trạng thái...</span>}
      {!busy && failedPage == null && current?.hasMore && <button type="button" onClick={() => void load(current.page + 1)} className="min-h-11 shrink-0 rounded-xl border border-neutral-300 px-3 text-sm dark:border-neutral-700">Thêm trạng thái</button>}
    </div>
    {!busy && failedPage != null && <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
      <span>Chưa tải được danh sách trạng thái.</span><button type="button" onClick={() => void load(failedPage)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-neutral-300 px-3 font-semibold dark:border-neutral-700"><RefreshCw aria-hidden className="size-4" />Thử lại</button>
    </div>}
  </div>;
}
