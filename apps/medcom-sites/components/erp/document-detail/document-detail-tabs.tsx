"use client";

import { Fragment, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, ChevronDown, Clock3, History, Package2, Send } from "lucide-react";
import { calculateDetailMoney, formatDetailValue, isEmptyDetailValue, sumDetailLineTotals } from "@/lib/erp/document-detail/format";
import type { DetailPage, DetailRow, DocumentDetailModel } from "@/lib/erp/document-detail/model";
import type { DocumentDetailConfig, LineColumnConfig } from "@/lib/erp/document-detail/types";
import { StatusBadge } from "@/components/app/status-badge";
import { readDocumentSummary, summaryDisplay } from "@/lib/erp/document-summary";

const cellClass = "border-b border-neutral-100 px-4 py-3.5 align-top dark:border-neutral-800";
const valuesClass = "grid min-w-0 grid-cols-2 gap-x-5 gap-y-4 text-base leading-6 [&_dt]:mb-1 [&_dt]:text-sm [&_dt]:font-normal [&_dd]:min-w-0 [&_dd]:break-words [&_dd]:font-medium";
const emptyPage: DetailPage = { rows: [], hasMore: false };

function cell(row: DetailRow, column: LineColumnConfig) {
  const raw = [column.key, ...(column.fallbackKeys ?? [])].map(key => key === "lineId" ? row.lineId : row.fields[key]).find(value => !isEmptyDetailValue(value));
  // Money retains the original numeric value; other saved display companions
  // and legacy aliases remain available to migrated configurations.
  if (column.format === "money" && raw != null && raw !== "") return formatDetailValue(raw, column.format);
  const display = column.displayKey ? row.fields[column.displayKey] : undefined;
  if (typeof display === "string" && display.trim()) return display;
  if (isEmptyDetailValue(raw) && column.fallbackCalculation) return formatDetailValue(calculateDetailMoney(row.fields, column.fallbackCalculation), "money");
  return formatDetailValue(raw, column.format, { enumId: column.enumId });
}

function MoreButton({ page, busy, onMore, rowNoun = "dòng" }: { page: DetailPage; busy: boolean; onMore(): void; rowNoun?: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50/60 px-4 py-3 text-sm sm:px-5 dark:border-neutral-800 dark:bg-neutral-950/50">
    <span>{`${page.rows.length} ${rowNoun} đã tải`}</span>{page.hasMore && <button type="button" disabled={busy} onClick={() => { if (!busy) onMore(); }} className="min-h-11 rounded-lg border border-neutral-300 px-4 font-semibold disabled:opacity-50 dark:border-neutral-700">{busy ? "Đang tải…" : "Tải thêm…"}</button>}
  </div>;
}

function EmptyPanel({ text, history = false }: { text: string; history?: boolean }) {
  const Icon = history ? History : Package2;
  return <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center sm:py-16">
    <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800"><Icon aria-hidden="true" className="size-6" /></span>
    <p className="text-base font-semibold">{text}</p>
  </div>;
}

function LineInformation({ row, columns, groups }: {
  row: DetailRow; columns: readonly LineColumnConfig[]; groups: NonNullable<DocumentDetailConfig["lines"]["expandGroups"]>;
}) {
  return <div className="grid min-w-0 gap-6 rounded-xl bg-neutral-50 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4 dark:bg-neutral-950">
    {groups.map(group => <section key={group.label} aria-label={group.label} className="min-w-0 space-y-4">
      <h4 className="border-b border-neutral-200 pb-2 text-sm font-semibold dark:border-neutral-800">{group.label}</h4>
      <dl className={valuesClass}>{group.keys.map(key => {
        const column = columns.find(column => column.key === key);
        return column ? <div key={key} className={group.fullWidth?.includes(key) ? "col-span-full" : "min-w-0"}>
          <dt>{column.label}</dt><dd className={`whitespace-pre-wrap ${column.align === "end" ? "tabular-nums" : ""}`}>{cell(row, column)}</dd>
        </div> : null;
      })}</dl>
    </section>)}
  </div>;
}

function DetailTable({ title, page, columns, expandGroups = [], emptyText, busy, onMore, rowNoun, calculatedTotal, footerTotal, header, summary }: {
  title: string; page: DetailPage; columns: readonly LineColumnConfig[];
  expandGroups?: DocumentDetailConfig["lines"]["expandGroups"]; emptyText: string; busy: boolean; onMore(): void;
  rowNoun?: string; calculatedTotal?: DocumentDetailConfig["lines"]["calculatedTotal"];
  footerTotal?: DocumentDetailConfig["lines"]["footerTotal"]; header?: Record<string, unknown>;
  summary?: unknown;
}) {
  const prefix = useId();
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  const tableColumns: readonly LineColumnConfig[] = [
    ...columns.filter(column => column.inTable !== false),
    ...(calculatedTotal ? [{ key: "__calculatedTotal", label: calculatedTotal.label, format: "money" as const, align: "end" as const, role: "total" as const, fallbackCalculation: calculatedTotal }] : []),
  ];
  const total = footerTotal ? sumDetailLineTotals(page.rows, footerTotal) : null;
  const currency = header?.[footerTotal?.currencyKey ?? "currencyId"];
  const summaryView = readDocumentSummary(summary);
  const primary = tableColumns.find(column => column.role === "primary");
  const secondary = primary ? tableColumns.filter(column => column.role === "secondary") : [];
  const visible = tableColumns.filter(column => !secondary.includes(column));
  const expandable = expandGroups.some(group => group.keys.some(key => columns.some(column => column.key === key)));
  const toggle = (id: string) => setExpandedLine(current => current === id ? null : id);
  const primaryValue = (row: DetailRow, column: LineColumnConfig) => <>
    <p className="break-words font-semibold">{cell(row, column)}</p>
    {secondary.map(column => <p key={column.key} className="mt-1 break-words text-sm">{cell(row, column)}</p>)}
  </>;
  const emphasis = (column: LineColumnConfig) => `${column.align === "end" ? "text-right tabular-nums" : ""} ${column.role === "total" ? "font-semibold text-brand-800 dark:text-brand-200" : ""}`;
  return <>
    {page.rows.length === 0 ? <EmptyPanel text={emptyText} /> : <>
      <div className="hidden min-w-0 lg:block">
        <div role="region" aria-label={title} tabIndex={0} className="max-h-[32rem] overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500">
          <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-left text-base leading-6">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-950"><tr>
              <th scope="col" className="whitespace-nowrap border-b border-neutral-200 px-4 py-3 text-sm font-semibold dark:border-neutral-800">STT</th>
              {visible.map(column => <th key={column.key} scope="col" className={`whitespace-nowrap border-b border-neutral-200 px-4 py-3 text-sm font-semibold dark:border-neutral-800 ${column.align === "end" ? "text-right" : ""}`}>{column.label}</th>)}
              {expandable && <th scope="col" className="whitespace-nowrap border-b border-neutral-200 px-4 py-3 text-sm font-semibold dark:border-neutral-800"><span className="sr-only">Thông tin đầy đủ</span></th>}
            </tr></thead>
            <tbody>{page.rows.map((row, index) => {
              const open = expandedLine === row.lineId;
              return <Fragment key={row.lineId}><tr className={open ? "bg-brand-50/50 dark:bg-brand-950/30" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"}>
                <td className={`${cellClass} w-14 tabular-nums`}>{index + 1}</td>
                {visible.map(column => <td key={column.key} className={`${cellClass} ${column === primary ? "min-w-64 max-w-96" : "whitespace-nowrap"} ${emphasis(column)}`}>{column === primary ? primaryValue(row, column) : cell(row, column)}</td>)}
                {expandable && <td className={`${cellClass} w-16 px-2 py-2`}><button type="button" aria-label={`${open ? "Thu gọn" : "Xem đầy đủ"} dòng ${index + 1}`} aria-expanded={open} aria-controls={`${prefix}-desktop-line-${index}`} onClick={() => toggle(row.lineId)} className="inline-flex size-11 items-center justify-center rounded-xl border border-neutral-200 bg-white hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-brand-500 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"><ChevronDown aria-hidden="true" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} /></button></td>}
              </tr>{expandable && <tr id={`${prefix}-desktop-line-${index}`} hidden={!open}><td colSpan={visible.length + 2} className="border-b border-neutral-200 p-4 dark:border-neutral-800"><LineInformation row={row} columns={columns} groups={expandGroups} /></td></tr>}</Fragment>;
            })}</tbody>
          </table>
        </div>
      </div>
      <div className="space-y-3 p-3 sm:p-4 lg:hidden">{page.rows.map((row, index) => {
        const open = expandedLine === row.lineId;
        return <article key={row.lineId} className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
          <div className="space-y-4 p-4">
            <div className="flex items-start gap-3"><span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-sm font-semibold tabular-nums dark:bg-neutral-800">{index + 1}</span>{primary && <div className="min-w-0">{primaryValue(row, primary)}</div>}</div>
            <dl className={valuesClass}>{visible.filter(column => column !== primary && column.role !== "total").map(column => <div key={column.key}><dt>{column.label}</dt><dd className={emphasis(column)}>{cell(row, column)}</dd></div>)}</dl>
            {visible.filter(column => column.role === "total").map(column => <div key={column.key} className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800"><span className="text-sm font-medium">{column.label}</span><strong className="break-words text-lg tabular-nums text-brand-800 dark:text-brand-200">{cell(row, column)}</strong></div>)}
          </div>
          {expandable && <><button type="button" aria-expanded={open} aria-controls={`${prefix}-mobile-line-${index}`} onClick={() => toggle(row.lineId)} className="flex min-h-11 w-full items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-3 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 dark:border-neutral-800 dark:bg-neutral-950">
            <span>{open ? "Thu gọn thông tin" : "Xem đầy đủ thông tin"}<span className="sr-only"> dòng {index + 1}</span></span><ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
          </button><div id={`${prefix}-mobile-line-${index}`} hidden={!open} className="border-t border-neutral-200 dark:border-neutral-800"><LineInformation row={row} columns={columns} groups={expandGroups} /></div></>}
        </article>;
      })}</div>
    </>}
    {summaryView && <div data-document-summary className="border-t border-neutral-200 bg-neutral-50/60 px-4 py-3 sm:px-5 dark:border-neutral-800 dark:bg-neutral-950/50">
      {summaryView.entries.length > 0 && <dl className="grid min-w-0 grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        {summaryView.entries.map(entry => <div key={entry.key} className="min-w-0"><dt className="text-sm">{entry.label}</dt>
          <dd className="min-w-0 break-words font-semibold tabular-nums">{summaryDisplay(entry, typeof currency === "string" ? currency : undefined)}</dd></div>)}
      </dl>}
      <div className="mt-3 flex min-w-0 flex-wrap items-baseline justify-between gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <span className="text-sm font-semibold uppercase tracking-wide">Tổng cộng ({summaryView.rowCount ?? page.rows.length} dòng toàn chứng từ)</span>
        {summaryView.total && <strong className="break-words text-lg font-semibold tabular-nums text-brand-800 dark:text-brand-200">{summaryDisplay(summaryView.total, typeof currency === "string" ? currency : undefined)}</strong>}
      </div>
    </div>}
    {!summaryView && footerTotal && total !== null && <div data-document-lines-total className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 px-4 py-3.5 sm:px-5 dark:border-neutral-800">
      <span className="font-semibold">{footerTotal.label} ({page.rows.length} dòng)</span>
      <strong className="break-words text-lg tabular-nums text-brand-800 dark:text-brand-200">{formatDetailValue(total, "money")}{typeof currency === "string" && currency ? ` ${currency}` : ""}</strong>
    </div>}
    {(page.rows.length > 0 || page.hasMore) && <MoreButton page={page} busy={busy} onMore={onMore} rowNoun={rowNoun} />}
  </>;
}

function HistoryPanel({ page, busy, onMore }: { page: DetailPage; busy: boolean; onMore(): void }) {
  return <>
    {page.rows.length === 0 ? <EmptyPanel history text="Chưa có lịch sử gửi / duyệt" /> : <ol aria-label="Các lần gửi và duyệt" className="space-y-0 p-4 sm:p-6">{page.rows.map((row, index) => {
      const fields = row.fields;
      const status = formatDetailValue(fields.statusId, "status", { statusName: fields.statusName });
      return <li key={row.lineId} className="relative min-w-0 pb-5 pl-11 last:pb-0 sm:pl-14">
        {index < page.rows.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-4 top-9 w-px bg-neutral-200 dark:bg-neutral-700" />}
        <span aria-hidden="true" className="absolute left-0 top-0 inline-flex size-9 items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300"><Send className="size-4" /></span>
        <article className="min-w-0 rounded-xl border border-neutral-200 bg-white p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><p className="mb-1 text-sm">Người gửi</p><h4 className="break-words text-base font-semibold">{formatDetailValue(fields.userName)}</h4></div>
            <span className="inline-flex max-w-full items-start gap-1.5 text-sm leading-6"><Clock3 aria-hidden="true" className="mt-1 size-4 shrink-0" /><span className="break-words">{formatDetailValue(fields.thoiGianDisplay ?? fields.thoiGian, "datetime")}</span></span>
          </div>
          <dl className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0"><dt className="mb-1 text-sm">Gửi đến</dt><dd className="flex items-start gap-2 text-base font-medium"><ArrowRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-brand-600 dark:text-brand-300" /><span className="min-w-0 break-words">{formatDetailValue(fields.sendTo)}</span></dd></div>
            <div className="min-w-0"><dt className="mb-1 text-sm">Trạng thái</dt><dd><StatusBadge title={fields.statusId == null ? undefined : `Mã trạng thái: ${fields.statusId}`} label={status}
              statusForeColor={typeof fields.statusForeColor === "string" ? fields.statusForeColor : undefined}
              statusBackColor={typeof fields.statusBackColor === "string" ? fields.statusBackColor : undefined} className="max-w-full break-words" /></dd></div>
          </dl>
          {!isEmptyDetailValue(fields.notes) && <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-neutral-800"><p className="mb-1 text-sm">Ghi chú</p><p className="whitespace-pre-wrap break-words text-base leading-6">{formatDetailValue(fields.notes, "multiline")}</p></div>}
        </article>
      </li>;
    })}</ol>}
    {page.hasMore && <MoreButton page={page} busy={busy} onMore={onMore} />}
  </>;
}

export function DocumentDetailTabs({ config, model, onLoadMore }: {
  config: DocumentDetailConfig; model: DocumentDetailModel; onLoadMore(section: string): void;
}) {
  const prefix = useId();
  const tablist = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState("lines");
  const tabs = [
    { id: "lines", label: config.lines.title, count: model.lines.rows.length, icon: Package2 },
    ...(config.history ? [{ id: "history", label: config.history.title, count: model.history?.rows.length ?? 0, icon: History }] : []),
    ...Object.entries(config.sections ?? {}).map(([key, section]) => ({ id: `section:${key}`, label: section.title, count: model.sections?.[key]?.rows.length ?? 0, icon: Package2 })),
  ];
  const active = tabs.some(tab => tab.id === selected) ? selected : "lines";
  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setSelected(tabs[next].id);
    tablist.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }
  return <section data-document-detail-tabs aria-label="Chi tiết và lịch sử chứng từ" className="min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white text-base text-black shadow-xs dark:border-neutral-800 dark:bg-neutral-900 dark:text-white">
    <div ref={tablist} role="tablist" aria-label="Nội dung chứng từ" className="grid min-w-0 grid-cols-2 border-b border-neutral-200 px-2 sm:flex sm:px-5 dark:border-neutral-800">
      {tabs.map(({ id, label, count, icon: Icon }, index) => <button key={id} type="button" role="tab" id={`${prefix}-tab-${id}`} aria-controls={`${prefix}-panel-${id}`} aria-selected={active === id} tabIndex={active === id ? 0 : -1} onClick={() => setSelected(id)} onKeyDown={event => moveTab(event, index)}
        className={`relative flex min-h-16 min-w-0 items-center justify-center gap-2 px-2 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand-500 sm:justify-start sm:gap-2.5 sm:px-4 sm:text-base ${active === id ? "text-brand-700 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-brand-600 sm:after:inset-x-4 dark:text-brand-300" : "text-black hover:bg-neutral-50 dark:text-white dark:hover:bg-neutral-800/60"}`}>
        <Icon aria-hidden="true" className="hidden size-5 shrink-0 sm:block" /><span className="min-w-0 leading-5">{label}</span>
        <span className={`inline-flex min-w-6 shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-sm tabular-nums ${active === id ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300" : "bg-neutral-100 text-black dark:bg-neutral-800 dark:text-white"}`}>{count}</span>
      </button>)}
    </div>
    {tabs.map(tab => <div key={tab.id} role="tabpanel" id={`${prefix}-panel-${tab.id}`} aria-labelledby={`${prefix}-tab-${tab.id}`} hidden={active !== tab.id} tabIndex={0} className="min-w-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500">
      {tab.id === "lines" ? <DetailTable title={config.lines.title} page={model.lines} columns={config.lines.columns} expandGroups={config.lines.expandGroups} emptyText={config.lines.emptyText} rowNoun={config.lines.rowNoun} calculatedTotal={config.lines.calculatedTotal} footerTotal={config.lines.footerTotal} header={model.header} summary={model.summary} busy={model.paginationDisabled || (model.paginationBusy ?? model.busy)} onMore={() => onLoadMore("lines")} />
        : tab.id === "history" ? <HistoryPanel page={model.history ?? emptyPage} busy={model.paginationBusy ?? model.busy} onMore={() => onLoadMore("history")} />
          : <DetailTable title={tab.label} page={model.sections?.[tab.id.slice(8)] ?? emptyPage} columns={config.sections?.[tab.id.slice(8)].columns ?? []} emptyText="Chưa có dữ liệu." busy={model.paginationBusy ?? model.busy} onMore={() => onLoadMore(tab.id.slice(8))} />}
    </div>)}
  </section>;
}
