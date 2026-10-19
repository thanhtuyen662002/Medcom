"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { erpClient } from "@/lib/erp/erp-client";
import type { SalesOrderModule } from "@/lib/erp/sales-order-workflow";

type StatusChoice = { id: number; label: string };
type StatusPage = { scope: string; choices: StatusChoice[]; page: number; hasMore: boolean };

const ALL_VALUE = "";
const MORE_VALUE = "__more__";

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

  return <div className="space-y-2" aria-busy={busy}>
    <div className="flex items-center gap-2">
      <div className="relative inline-flex items-center">
        <select
          aria-label="Lọc trạng thái đơn hàng"
          value={value === null ? ALL_VALUE : String(value)}
          disabled={!isActive}
          onChange={event => {
            const next = event.target.value;
            if (next === MORE_VALUE) { if (current?.hasMore) void load(current.page + 1); return; }
            onChange(next === ALL_VALUE ? null : Number(next));
          }}
          className="min-h-11 w-full min-w-[220px] max-w-xs appearance-none rounded-xl border border-neutral-200 bg-white py-2 pl-3 pr-9 text-sm font-semibold text-black shadow-2xs outline-none transition-colors cursor-pointer focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        >
          <option value={ALL_VALUE}>Tất cả</option>
          {(current?.choices ?? []).map(choice => (
            <option key={choice.id} value={String(choice.id)}>{choice.label}</option>
          ))}
          {current?.hasMore && <option value={MORE_VALUE}>Thêm trạng thái</option>}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 size-4 text-neutral-400" />
      </div>
      {busy && <span role="status" className="inline-flex shrink-0 items-center gap-2 text-sm text-neutral-500"><Loader2 aria-hidden className="size-4 animate-spin" />Đang tải trạng thái...</span>}
    </div>
    {!busy && failedPage != null && <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
      <span>Chưa tải được danh sách trạng thái.</span>
      <button type="button" onClick={() => void load(failedPage)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-neutral-300 px-3 font-semibold dark:border-neutral-700"><RefreshCw aria-hidden className="size-4" />Thử lại</button>
    </div>}
  </div>;
}
