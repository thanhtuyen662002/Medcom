"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { erpClient } from "@/lib/erp/erp-client";
import type { SalesOrderModule } from "@/lib/erp/sales-order-workflow";

type StatusChoice = { id: number; label: string };
type StatusPage = { scope: string; choices: StatusChoice[]; page: number; hasMore: boolean };

/** Lookup data only: the list owns chip rendering and the server statusId query. */
export function useSalesOrderStatuses({ module, branchId, isActive }: {
  module: SalesOrderModule | null; branchId: string; isActive: boolean;
}) {
  const scope = `${module}:${branchId}`;
  const [result, setResult] = useState<StatusPage>();
  const [busy, setBusy] = useState(false);
  const [failedPage, setFailedPage] = useState<number>();
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const current = result?.scope === scope ? result : undefined;

  const load = useCallback(async (page: number) => {
    if (!module) return;
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
    queueMicrotask(() => { if (active && isActive && module) void load(1); });
    return () => { active = false; invalidate(); };
  }, [isActive, module, load, invalidate]);

  return {
    choices: current?.choices ?? [], busy, failedPage,
    hasMore: current?.hasMore ?? false,
    loadMore: () => { if (isActive && !busy && current?.hasMore) void load(current.page + 1); },
    retry: () => { if (isActive && !busy && failedPage != null) void load(failedPage); },
  };
}
