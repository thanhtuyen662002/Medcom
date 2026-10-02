"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { moveColumn, navigateCell, setColumnHidden, setColumnWidth } from "./grid-state";
import styles from "./data-grid.module.css";

export type GridColumn<T> = { id: string; label: string; width?: number; numeric?: boolean;
  render: (row: T) => ReactNode };

export function DataGrid<T>({ label, rows, columns, getRowId, onActivate, busy = false, emptyMessage }: {
  label: string; rows: T[]; columns: GridColumn<T>[]; getRowId: (row: T) => string;
  onActivate?: (row: T, element: HTMLElement) => void; busy?: boolean; emptyMessage: string;
}) {
  const id = useId();
  const [settings, setSettings] = useState(() => columns.map(column => ({ id: column.id,
    hidden: false, width: column.width ?? 180 })));
  const [compact, setCompact] = useState(false);
  const [active, setActive] = useState({ rowId: "", columnId: "" });
  const cells = useRef(new Map<string, HTMLTableCellElement>());
  const scroller = useRef<HTMLDivElement>(null);
  const focusWithin = useRef(false);
  const visible = settings.filter(setting => !setting.hidden)
    .map(setting => ({ ...columns.find(column => column.id === setting.id)!, width: setting.width }));
  const rowIndex = Math.max(0, rows.findIndex(row => getRowId(row) === active.rowId));
  const columnIndex = Math.max(0, visible.findIndex(column => column.id === active.columnId));
  const cellKey = (rowId: string, columnId: string) => JSON.stringify([rowId, columnId]);
  useLayoutEffect(() => {
    // A refreshed row can disappear. Restore the fallback cell only if the old
    // focused cell was removed; never pull focus back from a toolbar control.
    if (focusWithin.current && document.activeElement === document.body && rows[rowIndex] && visible[columnIndex]) {
      cells.current.get(cellKey(getRowId(rows[rowIndex]), visible[columnIndex].id))?.focus();
    }
  });
  return <div className={styles.root}>
    <div className={styles.controls}>
      <details className={styles.settings}>
        <summary>Tùy chỉnh cột</summary>
        <div className={styles.panel}>
          <p>Cột nhận diện luôn cố định bên trái. Tùy chỉnh áp dụng trong màn hình đang mở.</p>
          {settings.map((setting, index) => {
            const column = columns.find(candidate => candidate.id === setting.id)!;
            return <fieldset key={column.id} className={styles.columnSetting}>
              <legend>{column.label}</legend>
              <label><input type="checkbox" checked={!setting.hidden} disabled={index === 0}
                onChange={event => setSettings(value => setColumnHidden(value, column.id, !event.target.checked))}/> Hiển thị {column.label}</label>
              <label>Độ rộng {column.label}<input type="range" min={100} max={480} step={10}
                value={setting.width} onChange={event => setSettings(value => setColumnWidth(value, column.id, Number(event.target.value)))}/>
                <output>{setting.width}px</output></label>
              {index > 0 && <div className={styles.moveButtons}>
                <Button variant="outline" disabled={index === 1} aria-label={`Đưa ${column.label} sang trái`}
                  onClick={() => setSettings(value => moveColumn(value, column.id, -1))}>←</Button>
                <Button variant="outline" disabled={index === settings.length - 1} aria-label={`Đưa ${column.label} sang phải`}
                  onClick={() => setSettings(value => moveColumn(value, column.id, 1))}>→</Button>
              </div>}
            </fieldset>;
          })}
          <Button variant="outline" onClick={() => { setSettings(columns.map(column => ({ id: column.id,
            hidden: false, width: column.width ?? 180 }))); setCompact(false); }}>Khôi phục bố cục</Button>
        </div>
      </details>
      <label><input type="checkbox" checked={compact} onChange={event => setCompact(event.target.checked)}/> Dòng gọn</label>
    </div>
    <p id={`${id}-help`} className="sr-only">Dùng các phím mũi tên để di chuyển ô; Home, End để tới đầu hoặc cuối dòng;
      Ctrl Home, Ctrl End để tới đầu hoặc cuối trang; Page Up, Page Down để di chuyển theo vùng nhìn. Tab để rời bảng.
      {onActivate && " Enter để xem chi tiết chứng từ."}</p>
    <div ref={scroller} className={`document-table-scroll ${styles.scroller}`} tabIndex={-1} aria-busy={busy}
      onFocusCapture={() => { focusWithin.current = true; }}
      onBlurCapture={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) focusWithin.current = false; }}>
      <table role="grid" aria-label={label} aria-describedby={`${id}-help`} aria-readonly="true"
        aria-colcount={visible.length} aria-rowcount={rows.length + 1}
        className={`document-table ${styles.table} ${compact ? styles.compact : ""}`}
        style={{ width: visible.reduce((total, column) => total + column.width, 0) }}>
        <colgroup>{visible.map(column => <col key={column.id} style={{ width: column.width }}/>)}</colgroup>
        <thead><tr role="row" aria-rowindex={1}>{visible.map((column, index) =>
          <th key={column.id} role="columnheader" scope="col" aria-colindex={index + 1}
            className={`${index === 0 ? styles.pinned : ""} ${column.numeric ? styles.numeric : ""}`}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, ri) => {
          const rowId = getRowId(row);
          return <tr key={rowId} role="row" aria-rowindex={ri + 2}>
            {visible.map((column, ci) => <td key={column.id} role="gridcell" aria-colindex={ci + 1}
              tabIndex={ri === rowIndex && ci === columnIndex ? 0 : -1}
              className={`${ci === 0 ? styles.pinned : ""} ${column.numeric ? styles.numeric : ""}`}
              ref={element => { const key = cellKey(rowId, column.id); if (element) cells.current.set(key, element); else cells.current.delete(key); }}
              onFocus={() => setActive({ rowId, columnId: column.id })}
              onClick={event => { if (event.target === event.currentTarget) event.currentTarget.focus(); }}
              onDoubleClick={event => { if (!busy) onActivate?.(row, event.currentTarget); }}
              onKeyDown={event => {
                if (event.target !== event.currentTarget || event.altKey || event.metaKey || event.shiftKey) return;
                if (event.key === "Enter" && onActivate && !busy) { event.preventDefault(); onActivate(row, event.currentTarget); return; }
                const rowHeight = event.currentTarget.offsetHeight || 40;
                const next = navigateCell({ row: ri, column: ci }, event.key, rows.length, visible.length,
                  event.ctrlKey, Math.floor((scroller.current?.clientHeight ?? 400) / rowHeight));
                if (!next) return;
                event.preventDefault();
                const target = cells.current.get(cellKey(getRowId(rows[next.row]), visible[next.column].id));
                target?.focus({ preventScroll: true });
                target?.scrollIntoView({ block: "nearest", inline: "nearest" });
              }}>{column.render(row)}</td>)}
          </tr>;
        })}</tbody>
      </table>
      {rows.length === 0 && <p className="document-state" role="status">{emptyMessage}</p>}
    </div>
  </div>;
}
