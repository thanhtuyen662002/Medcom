"use client";

import { Fragment, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, ChevronDown, Clock3, History, Package2, Send } from "lucide-react";
import { SALES_ORDER_LINE_COLUMNS } from "@/lib/erp/sales-order-lines";
import { documentStatusLabel } from "@/lib/erp/document-status";
import {formatMoney, isMoneyField} from "@/lib/erp/money";

interface OrderLine { lineId: string; fields: Record<string, unknown> }
interface HistoryLine { lineId: string; fields?: Record<string, unknown> }

function text(value: unknown): string {
  return value == null || value === "" ? "—" : String(value);
}

function lineCell(fields: Record<string, unknown>, key: string): string {
  const raw = fields[key] ?? fields[key[0].toUpperCase() + key.slice(1)];
  if (isMoneyField(key) && raw != null && raw !== "") return formatMoney(raw);
  const display = fields[`${key}Display`];
  if (typeof display === "string" && display.trim()) return display;
  if (key === "itemCode") return text(fields.itemCode ?? fields.ItemCode ?? fields.manufacturerItemCode ?? fields.mfgItemId ?? fields.manufacturerItemId);
  if (key === "itemName") return text(fields.itemName ?? fields.ItemName ?? fields.itemDisplay ?? fields.name);
  if (key === "unit") return text(fields.unit ?? fields.Unit ?? fields.unit1);
  return text(fields[key] ?? fields[key[0].toUpperCase() + key.slice(1)]);
}

const cellClass = "border-b border-neutral-100 px-4 py-3.5 align-top dark:border-neutral-800";
const valuesClass = "grid min-w-0 grid-cols-2 gap-x-5 gap-y-4 text-base leading-6 [&_dt]:mb-1 [&_dt]:text-sm [&_dt]:font-normal [&_dd]:min-w-0 [&_dd]:break-words [&_dd]:font-medium";

function LineInformation({ line }: { line: OrderLine }) {
  return <dl className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 rounded-xl bg-neutral-50 p-4 text-base leading-6 sm:grid-cols-2 sm:p-5 xl:grid-cols-4 [&_dt]:mb-1 [&_dt]:text-sm [&_dt]:font-normal [&_dd]:min-w-0 [&_dd]:break-words [&_dd]:font-medium dark:bg-neutral-950">
    {SALES_ORDER_LINE_COLUMNS.map(column => <div key={column.key}
      className={`min-w-0 ${column.key === "itemId" ? "sm:col-span-2" : column.key === "dienGiai" || column.key === "notes" ? "col-span-full" : ""}`}>
      <dt>{column.label}</dt><dd className={`whitespace-pre-wrap ${"numeric" in column && column.numeric ? "tabular-nums" : ""}`}>{lineCell(line.fields, column.key)}</dd>
    </div>)}
  </dl>;
}

function EmptyPanel({ history }: { history?: boolean }) {
  const Icon = history ? History : Package2;
  return <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center sm:py-16">
    <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800"><Icon aria-hidden="true" className="size-6" /></span>
    <div className="space-y-1"><p className="text-base font-semibold">{history ? "Chưa có lịch sử gửi / duyệt" : "Chưa có hàng hóa"}</p>
      <p className="max-w-sm text-sm leading-6">{history ? "Các lần gửi và duyệt đơn hàng sẽ hiển thị tại đây." : "Đơn hàng chưa có dòng chi tiết để hiển thị."}</p></div>
  </div>;
}

export function SalesOrderDetailTabs({ lines, history, currencyId, hasMoreLines=false, hasMoreHistory=false, loadingMore=false, onMoreLines, onMoreHistory }: {
  lines: OrderLine[]; history: HistoryLine[]; currencyId?:string; hasMoreLines?:boolean; hasMoreHistory?:boolean; loadingMore?:boolean; onMoreLines?:()=>void; onMoreHistory?:()=>void;
}) {
  const prefix = useId();
  const tablist = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"lines" | "history">("lines");
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  const tabs = [
    { id: "lines" as const, label: "Chi tiết hàng hóa", count: lines.length, icon: Package2 },
    { id: "history" as const, label: "Lịch sử gửi / duyệt", count: history.length, icon: History },
  ];
  const toggle = (id: string) => setExpandedLine(current => current === id ? null : id);
  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[next].id);
    tablist.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return <section data-sales-order-detail-tabs aria-label="Chi tiết và lịch sử đơn hàng" className="min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white text-base text-black shadow-xs dark:border-neutral-800 dark:bg-neutral-900 dark:text-white">
    <div ref={tablist} role="tablist" aria-label="Nội dung đơn hàng" className="grid min-w-0 grid-cols-2 border-b border-neutral-200 px-2 sm:flex sm:px-5 dark:border-neutral-800">
      {tabs.map(({ id, label, count, icon: Icon }, index) => <button key={id} type="button" role="tab" id={`${prefix}-tab-${id}`} aria-controls={`${prefix}-panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={event => moveTab(event, index)}
        className={`relative flex min-h-16 min-w-0 items-center justify-center gap-2 px-2 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand-500 sm:justify-start sm:gap-2.5 sm:px-4 sm:text-base ${tab === id ? "text-brand-700 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-brand-600 sm:after:inset-x-4 dark:text-brand-300" : "text-black hover:bg-neutral-50 dark:text-white dark:hover:bg-neutral-800/60"}`}>
        <Icon aria-hidden="true" className="hidden size-5 shrink-0 sm:block" /><span className="min-w-0 leading-5">{label}</span>
        <span className={`inline-flex min-w-6 shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-sm tabular-nums ${tab === id ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300" : "bg-neutral-100 text-black dark:bg-neutral-800 dark:text-white"}`}>{count}</span>
      </button>)}
    </div>

    <div role="tabpanel" id={`${prefix}-panel-lines`} aria-labelledby={`${prefix}-tab-lines`} hidden={tab !== "lines"} tabIndex={0} className="min-w-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500">
      {currencyId && <p className="border-b border-neutral-100 px-4 py-3 text-sm dark:border-neutral-800">Đơn vị tiền: <strong>{currencyId}</strong></p>}
      {lines.length === 0 ? <EmptyPanel /> : <>
        <div className="hidden min-w-0 lg:block">
          <div role="region" aria-label="Bảng hàng hóa đơn hàng" tabIndex={0} className="max-h-[32rem] overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500">
            <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-left text-base leading-6">
              <caption className="sr-only">Hàng hóa trên trang chi tiết đơn hàng hiện tại</caption>
              <thead className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-950"><tr>
                {["STT", "Hàng hóa", "ĐVT", "Số lượng", "Đơn giá", "Số tiền", "Tổng tiền", ""].map((label, index) => <th key={index} scope="col" className={`whitespace-nowrap border-b border-neutral-200 px-4 py-3 text-sm font-semibold dark:border-neutral-800 ${index >= 3 && index <= 6 ? "text-right" : ""}`}>{label || <span className="sr-only">Thông tin đầy đủ</span>}</th>)}
              </tr></thead>
              <tbody>{lines.map((line, index) => {
                const open = expandedLine === line.lineId;
                return <Fragment key={line.lineId}><tr className={open ? "bg-brand-50/50 dark:bg-brand-950/30" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"}>
                  <td className={`${cellClass} w-14 tabular-nums`}>{index + 1}</td>
                  <td className={`${cellClass} min-w-64 max-w-96`}><p className="break-words font-semibold">{lineCell(line.fields, "itemName")}</p><p className="mt-1 break-words text-sm">{lineCell(line.fields, "itemId")}</p></td>
                  {["unit", "quantity", "unitPrice", "amount", "totalAmount"].map(key => <td key={key} className={`${cellClass} whitespace-nowrap ${key === "unit" ? "" : "text-right tabular-nums"} ${key === "totalAmount" ? "font-semibold text-brand-800 dark:text-brand-200" : ""}`}>{lineCell(line.fields, key)}</td>)}
                  <td className={`${cellClass} w-16 px-2 py-2`}><button type="button" aria-label={`${open ? "Thu gọn" : "Xem đầy đủ"} dòng hàng ${index + 1}`} aria-expanded={open} aria-controls={`${prefix}-desktop-line-${index}`} onClick={() => toggle(line.lineId)} className="inline-flex size-11 items-center justify-center rounded-xl border border-neutral-200 bg-white hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-brand-500 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"><ChevronDown aria-hidden="true" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} /></button></td>
                </tr><tr id={`${prefix}-desktop-line-${index}`} hidden={!open}><td colSpan={8} className="border-b border-neutral-200 p-4 dark:border-neutral-800"><LineInformation line={line} /></td></tr></Fragment>;
              })}</tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3 p-3 sm:p-4 lg:hidden">{lines.map((line, index) => {
          const open = expandedLine === line.lineId;
          return <article key={line.lineId} className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
            <div className="space-y-4 p-4">
              <div className="flex items-start gap-3"><span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-sm font-semibold tabular-nums dark:bg-neutral-800">{index + 1}</span><div className="min-w-0"><h4 className="break-words text-base font-semibold leading-6">{lineCell(line.fields, "itemName")}</h4><p className="mt-1 break-words text-sm">{lineCell(line.fields, "itemId")}</p></div></div>
              <dl className={valuesClass}>
                {[{ key: "quantity", label: "Số lượng" }, { key: "unit", label: "Đơn vị tính" }, { key: "unitPrice", label: "Đơn giá" }, { key: "amount", label: "Số tiền" }].map(({ key, label }) => <div key={key}><dt>{label}</dt><dd className="tabular-nums">{lineCell(line.fields, key)}</dd></div>)}
              </dl>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800"><span className="text-sm font-medium">Tổng tiền</span><strong className="break-words text-lg tabular-nums text-brand-800 dark:text-brand-200">{lineCell(line.fields, "totalAmount")}</strong></div>
            </div>
            <button type="button" aria-expanded={open} aria-controls={`${prefix}-mobile-line-${index}`} onClick={() => toggle(line.lineId)} className="flex min-h-11 w-full items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-3 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 dark:border-neutral-800 dark:bg-neutral-950">
              <span>{open ? "Thu gọn thông tin" : "Xem đầy đủ thông tin"}<span className="sr-only"> dòng hàng {index + 1}</span></span><ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            <div id={`${prefix}-mobile-line-${index}`} hidden={!open} className="border-t border-neutral-200 dark:border-neutral-800"><LineInformation line={line} /></div>
          </article>;
        })}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50/60 px-4 py-3 text-sm sm:px-5 dark:border-neutral-800 dark:bg-neutral-950/50"><span>{lines.length} dòng hàng đã tải</span>{hasMoreLines && <button type="button" disabled={loadingMore} onClick={onMoreLines} className="min-h-11 rounded-lg border border-neutral-300 px-4 font-semibold disabled:opacity-50 dark:border-neutral-700">{loadingMore?"Đang tải…":"Tải thêm hàng hóa"}</button>}</div>
      </>}
    </div>

    <div role="tabpanel" id={`${prefix}-panel-history`} aria-labelledby={`${prefix}-tab-history`} hidden={tab !== "history"} tabIndex={0} className="min-w-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500">
      {history.length === 0 ? <EmptyPanel history /> : <ol aria-label="Các lần gửi và duyệt" className="space-y-0 p-4 sm:p-6">{history.map((row, index) => {
        const fields = row.fields || {};
        const statusId = typeof fields.statusId === "number" ? fields.statusId : null;
        const statusLabel = documentStatusLabel(statusId, typeof fields.statusName === "string" ? fields.statusName : null);
        return <li key={row.lineId} className="relative min-w-0 pb-5 pl-11 last:pb-0 sm:pl-14">
          {index < history.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-4 top-9 w-px bg-neutral-200 dark:bg-neutral-700" />}
          <span aria-hidden="true" className="absolute left-0 top-0 inline-flex size-9 items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300"><Send className="size-4" /></span>
          <article className="min-w-0 rounded-xl border border-neutral-200 bg-white p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><p className="mb-1 text-sm">Người gửi</p><h4 className="break-words text-base font-semibold">{text(fields.userName)}</h4></div>
              <span className="inline-flex max-w-full items-start gap-1.5 text-sm leading-6"><Clock3 aria-hidden="true" className="mt-1 size-4 shrink-0" /><span className="break-words">{text(fields.thoiGianDisplay ?? fields.thoiGian)}</span></span>
            </div>
            <dl className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0"><dt className="mb-1 text-sm">Gửi đến</dt><dd className="flex items-start gap-2 text-base font-medium"><ArrowRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-brand-600 dark:text-brand-300" /><span className="min-w-0 break-words">{text(fields.sendTo)}</span></dd></div>
              <div className="min-w-0"><dt className="mb-1 text-sm">Trạng thái</dt><dd title={statusId == null ? undefined : `Mã trạng thái: ${statusId}`} className="inline-flex max-w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-sm font-semibold dark:border-neutral-700 dark:bg-neutral-800"><span className="break-words">{statusLabel}</span></dd></div>
            </dl>
            {fields.notes != null && String(fields.notes).trim() && <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-neutral-800"><p className="mb-1 text-sm">Ghi chú</p><p className="whitespace-pre-wrap break-words text-base leading-6">{String(fields.notes)}</p></div>}
          </article>
        </li>;
      })}</ol>}
      {hasMoreHistory && <div className="border-t border-neutral-200 p-4 dark:border-neutral-800"><button type="button" disabled={loadingMore} onClick={onMoreHistory} className="min-h-11 rounded-lg border border-neutral-300 px-4 text-sm font-semibold disabled:opacity-50 dark:border-neutral-700">{loadingMore?"Đang tải…":"Tải thêm lịch sử"}</button></div>}
    </div>
  </section>;
}
