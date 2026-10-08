"use client";

import {useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type KeyboardEvent, type Ref} from "react";
import {useTable, tableFeatures, columnOrderingFeature, columnVisibilityFeature, columnSizingFeature, type ColumnDef, type RowData} from "@tanstack/react-table";
import {useVirtualizer} from "@tanstack/react-virtual";
import {ArrowUp, ArrowDown, Pin, SlidersHorizontal, Save, RotateCcw, X} from "lucide-react";
import {Checkbox} from "@/components/ui/checkbox";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription} from "@/components/ui/dialog";
import {Table, TableHeader, TableHead, TableBody, TableRow, TableCell} from "@/components/ui/table";
import {defaultView, restoreView, moveColumn, scopedSelection, type GridColumn, type GridView} from "@/lib/erp/presentation";
import {ListCustomizationSlot} from "./request-list-shell";
import {protectedPresentationProps} from "./workspace-auth-gate";
import {RequestButton, RequestInput} from "./request-presentation";

const features = tableFeatures({columnOrderingFeature, columnVisibilityFeature, columnSizingFeature});
export type GridRowAction = {label:string; accessibleLabel:string; selected?:boolean; buttonRef?:Ref<HTMLButtonElement>};
export type GridProps<T extends RowData> = {
  rows:T[]; columns:GridColumn[]; rowId:(row:T)=>string; renderCell:(row:T,column:string)=>ReactNode;
  /** Compatibility slot for existing consumers. New lists use the labelled responsive cells. */
  mobileCard?:(row:T)=>ReactNode;
  onOpen:(row:T)=>void; schemaVersion:string; scopeKey:string; compact:boolean; label:string;
  rowAction?:(row:T)=>GridRowAction;
  /** Presentation capabilities only. Document selection and authority stay with the caller. */
  selectable?:boolean; customizable?:boolean; virtualize?:boolean; presentationAllowed?:boolean; isPresentationAllowed?:()=>boolean; setCompact?:(value:boolean)=>void;
};

/** One responsive row/action tree. No querying, business actions or synthetic totals. */
export function ErpGrid<T extends RowData>({rows, columns, rowId, renderCell, mobileCard, onOpen, schemaVersion, scopeKey, compact, label, rowAction, selectable=true, customizable=true, virtualize=true, presentationAllowed=true, isPresentationAllowed, setCompact}:GridProps<T>) {
  const authority=useRef({presentationAllowed,isPresentationAllowed});
  useLayoutEffect(()=>{authority.current={presentationAllowed,isPresentationAllowed};if(!presentationAllowed)setSettings(false);},[presentationAllowed,isPresentationAllowed]);
  const currentAuthority=()=>authority.current.presentationAllowed&&(authority.current.isPresentationAllowed?.()??true);
  const [localCompact,setLocalCompact]=useState(compact);
  const density=setCompact?compact:localCompact;
  const [view,setView] = useState(()=>defaultView(columns,schemaVersion));
  const [views,setViews] = useState<GridView[]>([]);
  const [viewName,setViewName] = useState("");
  const [settings,setSettings] = useState(false);
  const [selection,setSelection] = useState<string[]>([]);
  const [recovery,setRecovery] = useState<string[]>([]);
  const [active,setActive] = useState({row:0,col:0});
  const [mobile,setMobile] = useState(false);
  const anchor = useRef(0);
  const viewport = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLTableElement>(null);

  useEffect(()=>{setSelection([]);setActive({row:0,col:0});anchor.current=0;},[scopeKey]);
  useEffect(()=>{setView(old=>{const restored=restoreView(old,columns,schemaVersion);setRecovery(restored.retired);return restored.view;});},[columns,schemaVersion]);
  useEffect(()=>{
    if(!customizable&&!virtualize&&!mobileCard)return;
    if(typeof window==="undefined"||typeof window.matchMedia!=="function")return;
    const media=window.matchMedia("(max-width: 767px)");
    const update=()=>setMobile(media.matches);
    update();media.addEventListener("change",update);
    return()=>media.removeEventListener("change",update);
  },[customizable,virtualize,mobileCard]);
  const [viewportWidth,setViewportWidth] = useState(0);
  useEffect(()=>{
    if(!customizable)return;
    const element=viewport.current;if(!element)return;
    const observer=new ResizeObserver(()=>setViewportWidth(element.clientWidth));
    observer.observe(element);setViewportWidth(element.clientWidth);
    return()=>observer.disconnect();
  },[customizable]);

  const ids=rows.map(rowId);
  const selected=selectable?scopedSelection(selection,ids):[];
  const defs=useMemo<ColumnDef<typeof features,T>[]>(()=>columns.map(c=>({id:c.id,accessorFn:row=>row,header:c.label,size:c.width})),[columns]);
  const table=useTable({features,data:rows,columns:defs,getRowId:rowId,state:{columnOrder:view.order,columnVisibility:Object.fromEntries(columns.map(c=>[c.id,!view.hidden.includes(c.id)])),columnSizing:view.widths}});
  // Mobile cards keep the complete original projection even when a desktop layout hides columns.
  const ordered=mobile?columns.map(definition=>table.getColumn(definition.id)!):table.getVisibleLeafColumns();
  const pinned=customizable&&!mobile?ordered.filter(c=>view.pinned.includes(c.id)):[];
  const unpinned=customizable&&!mobile?ordered.filter(c=>!view.pinned.includes(c.id)):ordered;
  const orderedColumns=[...pinned,...unpinned];
  const selectionWidth=selectable?44:0;
  const actionWidth=rowAction?132:0;
  const pinWidth=pinned.reduce((sum,c)=>sum+c.getSize(),selectionWidth);
  const rowHeight=density?45:65;
  const virtualRows=useVirtualizer({count:rows.length,getScrollElement:()=>viewport.current,estimateSize:()=>rowHeight,overscan:6,enabled:virtualize&&customizable&&!mobile});
  const virtualColumns=useVirtualizer({horizontal:true,scrollMargin:pinWidth,count:unpinned.length,getScrollElement:()=>viewport.current,estimateSize:i=>unpinned[i]?.getSize()??160,overscan:2,enabled:virtualize&&customizable&&!mobile});
  const wide=virtualize&&customizable&&!mobile&&unpinned.length>12;
  const renderedColumns=wide?[...pinned,...virtualColumns.getVirtualItems().map(v=>unpinned[v.index])]:orderedColumns;
  const rowsVirtualized=virtualize&&customizable&&!mobile&&rows.length>30;
  const renderedRows=rowsVirtualized?virtualRows.getVirtualItems():rows.map((_,index)=>({index,start:index*rowHeight,end:(index+1)*rowHeight}));
  const totalWidth=orderedColumns.reduce((sum,c)=>sum+c.getSize(),selectionWidth+actionWidth);
  const columnItems=virtualColumns.getVirtualItems();
  const padLeft=wide?Math.max(0,(columnItems[0]?.start??pinWidth)-pinWidth):0;
  const padRight=wide?Math.max(0,virtualColumns.getTotalSize()-((columnItems.at(-1)?.end??pinWidth)-pinWidth)):0;
  const fillWidth=customizable?Math.max(0,viewportWidth-totalWidth):0;
  const colSpan=renderedColumns.length+(selectable?1:0)+(rowAction?1:0)+(padLeft>0?1:0)+(padRight>0?1:0)+(fillWidth>0?1:0);
  const interactive=customizable||selectable;
  const activeRow=Math.max(0,Math.min(active.row,rows.length-1));
  const activeColumn=Math.max(0,Math.min(active.col,orderedColumns.length-1));
  const visibleColumnCount=orderedColumns.length;
  // Manual virtual scrolling must leave one reachable cell in the mounted window.
  const focusableRow=renderedRows.some(row=>row.index===activeRow)?activeRow:renderedRows[0]?.index??activeRow;
  const focusableColumn=renderedColumns.some(column=>column.id===orderedColumns[activeColumn]?.id)?activeColumn:Math.max(0,orderedColumns.findIndex(column=>column.id===renderedColumns[0]?.id));
  useLayoutEffect(()=>{
    setActive(old=>{
      const row=Math.max(0,Math.min(old.row,rows.length-1)),col=Math.max(0,Math.min(old.col,visibleColumnCount-1));
      return row===old.row&&col===old.col?old:{row,col};
    });
  },[rows.length,visibleColumnCount]);

  // Virtualizer caches estimates: changing callbacks alone does not update offsets.
  const columnGeometry=JSON.stringify([pinWidth,...unpinned.map(column=>[column.id,column.getSize()])]);
  useLayoutEffect(()=>{if(virtualize)virtualRows.measure();},[rowHeight,virtualRows,virtualize]);
  useLayoutEffect(()=>{if(virtualize)virtualColumns.measure();},[columnGeometry,virtualColumns,virtualize]);

  function toggle(index:number,range=false) {
    if(!selectable)return;
    const id=ids[index];if(!id)return;
    setSelection(old=>{const chosen=scopedSelection(old,ids);return range?[...new Set([...chosen,...ids.slice(Math.min(anchor.current,index),Math.max(anchor.current,index)+1)])]:chosen.includes(id)?chosen.filter(x=>x!==id):[...chosen,id];});
    if(!range)anchor.current=index;
  }
  function focusCell(row:number,col:number) {
    if(!rows.length||!orderedColumns.length)return;
    const r=Math.max(0,Math.min(rows.length-1,row)),c=Math.max(0,Math.min(orderedColumns.length-1,col));
    setActive({row:r,col:c});
    if(rowsVirtualized)virtualRows.scrollToIndex(r);
    const index=unpinned.findIndex(x=>x.id===orderedColumns[c]?.id);
    if(wide&&index>=0)virtualColumns.scrollToIndex(index);
    requestAnimationFrame(()=>requestAnimationFrame(()=>grid.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)?.focus()));
  }
  function keyboard(event:KeyboardEvent,r:number,c:number) {
    if(event.target!==event.currentTarget)return;
    const movements:Record<string,[number,number]>={ArrowDown:[r+1,c],ArrowUp:[r-1,c],ArrowLeft:[r,c-1],ArrowRight:[r,c+1],Home:[event.ctrlKey?0:r,0],End:[event.ctrlKey?rows.length-1:r,orderedColumns.length-1],PageDown:[r+8,c],PageUp:[r-8,c]};
    if(movements[event.key]){event.preventDefault();focusCell(...movements[event.key]);}
    else if(event.key==="Enter"){event.preventDefault();onOpen(rows[r]);}
    else if(event.key===" "&&selectable){event.preventDefault();toggle(r,event.shiftKey);}
    else if(event.key==="Escape")setSelection([]);
  }
  function style(id:string):CSSProperties|undefined {
    if(!customizable||mobile)return undefined;
    const column=orderedColumns.find(c=>c.id===id)!;
    const index=pinned.findIndex(c=>c.id===id),width=column.getSize();
    return {width,minWidth:width,maxWidth:width,...(index>=0?{position:"sticky",left:selectionWidth+pinned.slice(0,index).reduce((sum,c)=>sum+c.getSize(),0),zIndex:2}:{})};
  }
  function saveView() {
    const name=viewName.trim();if(!name||views.length>=10)return;
    const next={...view,id:crypto.randomUUID(),name};
    setViews(old=>[...old,next]);setView(next);setViewName("");
  }
  function header(id:string) {
    const column=orderedColumns.find(c=>c.id===id)!;
    const definition=columns.find(c=>c.id===id)!;
    return <TableHead key={id} scope="col" role="columnheader" aria-colindex={orderedColumns.findIndex(c=>c.id===id)+1+(selectable?1:0)} style={style(id)}><span>{definition.label}</span>{customizable&&!mobile&&!view.pinned.includes(id)&&<div className="column-resizer" role="separator" aria-orientation="vertical" aria-label={`Độ rộng ${definition.label}`} tabIndex={0}
      onKeyDown={event=>{if(["ArrowLeft","ArrowRight"].includes(event.key)){event.preventDefault();setView(old=>({...old,widths:{...old.widths,[id]:Math.max(96,Math.min(600,column.getSize()+(event.key==="ArrowRight"?16:-16)))}}));}}}
      onPointerDown={event=>{
        event.preventDefault();const start=event.clientX,width=column.getSize(),element=event.currentTarget;
        element.setPointerCapture(event.pointerId);
        const move=(next:PointerEvent)=>setView(old=>({...old,widths:{...old.widths,[id]:Math.max(96,Math.min(600,width+next.clientX-start))}}));
        const end=()=>{element.removeEventListener("pointermove",move);element.removeEventListener("pointerup",end);element.removeEventListener("pointercancel",end);};
        element.addEventListener("pointermove",move);element.addEventListener("pointerup",end);element.addEventListener("pointercancel",end);
      }}/>}</TableHead>;
  }
  function cell(row:T,r:number,id:string) {
    const index=orderedColumns.findIndex(c=>c.id===id),definition=columns.find(c=>c.id===id)!;
    const content=renderCell(row,id);
    return <TableCell key={id} role={interactive?"gridcell":"cell"} aria-colindex={index+1+(selectable?1:0)} style={style(id)} data-cell={`${r}:${index}`} data-label={definition.label} title={typeof content==="string"||typeof content==="number"?String(content):undefined}
      className={index===0?"grid-identity-cell":undefined} tabIndex={interactive&&focusableRow===r&&focusableColumn===index?0:interactive?-1:undefined}
      onFocus={interactive?()=>setActive({row:r,col:index}):undefined} onKeyDown={interactive?event=>keyboard(event,r,index):undefined}>
      <span className="grid-cell-value">{content}</span>{index===0&&mobileCard&&<button type="button" className="grid-mobile-card-content" onClick={()=>onOpen(row)}>{mobileCard(row)}</button>}
    </TableCell>;
  }

  return <div className="erp-grid" data-customizable={customizable} data-selectable={selectable} data-compact={density} data-mobile-card={mobileCard?"custom":"cells"}>
    {customizable&&<ListCustomizationSlot><RequestButton type="button" className="grid-customization-button" disabled={!presentationAllowed} onClick={()=>{if(currentAuthority())setSettings(true);}}><SlidersHorizontal size={15}/><span>Tùy chỉnh bảng</span></RequestButton></ListCustomizationSlot>}
    {recovery.length>0&&<p className="grid-recovery" role="status">Đã bỏ {recovery.length} cột không còn trong cấu hình. Các cột hợp lệ vẫn được giữ.</p>}
    {selected.length>0&&<div className="grid-selection" role="status"><span>Đã chọn {selected.length}/{rows.length} dòng của trang đang mở</span><RequestButton variant="ghost" onClick={()=>setSelection([])}><X size={14}/>Bỏ chọn</RequestButton></div>}
    <div className="desktop-grid-viewport" ref={viewport} data-virtualized={rowsVirtualized} style={{"--grid-row-height":`${rowHeight}px`,...(!mobile&&customizable?{height:Math.min(480,44+rows.length*rowHeight)}:{})} as CSSProperties}>
      <Table ref={grid} role={interactive?"grid":"table"} aria-label={label} aria-rowcount={rows.length+1} aria-colcount={orderedColumns.length+(selectable?1:0)+(rowAction?1:0)} data-shared-grid="true" className="request-list-table shared-grid-table" style={!mobile&&customizable?{width:totalWidth+fillWidth}:undefined}>
        <TableHeader role="rowgroup"><TableRow role="row">
          {selectable&&<TableHead role="columnheader" scope="col" aria-colindex={1} className="grid-select-cell"><Checkbox aria-label="Chọn tất cả dòng trên trang này" checked={rows.length>0&&selected.length===rows.length?true:selected.length?"indeterminate":false} disabled={!rows.length} onCheckedChange={value=>setSelection(value===true?ids:[])}/></TableHead>}
          {pinned.map(c=>header(c.id))}
          {padLeft>0&&<TableHead aria-hidden className="grid-spacer" style={{width:padLeft,padding:0}}/>}
          {renderedColumns.filter(c=>!pinned.includes(c)).map(c=>header(c.id))}
          {padRight>0&&<TableHead aria-hidden className="grid-spacer" style={{width:padRight,padding:0}}/>}
          {rowAction&&<TableHead scope="col" role="columnheader" aria-colindex={orderedColumns.length+1+(selectable?1:0)} className="request-list-action-heading" style={customizable&&!mobile?{width:actionWidth,minWidth:actionWidth,maxWidth:actionWidth}:undefined}><span className="sr-only">Thao tác</span></TableHead>}
          {fillWidth>0&&<TableHead aria-hidden className="grid-spacer" style={{width:fillWidth,minWidth:fillWidth,padding:0}}/>}
        </TableRow></TableHeader>
        <TableBody role="rowgroup">
          {renderedRows[0]?.start>0&&<TableRow aria-hidden className="grid-spacer"><TableCell colSpan={colSpan} style={{height:renderedRows[0].start,padding:0}}/></TableRow>}
          {renderedRows.map(v=>{
            const row=rows[v.index],id=rowId(row),action=rowAction?.(row),chosen=selected.includes(id);
            return <TableRow key={id} role="row" data-grid-row={id} className="mobile-document-card" aria-rowindex={v.index+2} aria-selected={selectable?chosen:undefined} data-selected={action?.selected||undefined} data-state={chosen?"selected":undefined}
              onDoubleClick={interactive&&!mobile?()=>onOpen(row):undefined}
              onClick={mobile&&interactive?event=>{if(event.target instanceof Element&&!event.target.closest("button,input,select,a,[role=checkbox]"))onOpen(row);}:undefined}>
              {selectable&&<TableCell role="gridcell" aria-colindex={1} className="grid-select-cell"><Checkbox aria-label={`Chọn ${id}`} checked={chosen} onCheckedChange={()=>toggle(v.index)}/></TableCell>}
              {pinned.map(c=>cell(row,v.index,c.id))}
              {padLeft>0&&<TableCell aria-hidden className="grid-spacer" style={{width:padLeft,padding:0}}/>}
              {renderedColumns.filter(c=>!pinned.includes(c)).map(c=>cell(row,v.index,c.id))}
              {padRight>0&&<TableCell aria-hidden className="grid-spacer" style={{width:padRight,padding:0}}/>}
              {action&&<TableCell role={interactive?"gridcell":"cell"} aria-colindex={orderedColumns.length+1+(selectable?1:0)} className="request-list-open"><RequestButton ref={action.buttonRef} type="button" aria-label={action.accessibleLabel} aria-pressed={action.selected} onClick={()=>onOpen(row)} className="scroll-mt-24">{action.label}</RequestButton></TableCell>}
              {fillWidth>0&&<TableCell aria-hidden className="grid-spacer" style={{width:fillWidth,minWidth:fillWidth,padding:0}}/>}
            </TableRow>;
          })}
          {rowsVirtualized&&renderedRows.length>0&&<TableRow aria-hidden className="grid-spacer"><TableCell colSpan={colSpan} style={{height:Math.max(0,virtualRows.getTotalSize()-(renderedRows.at(-1)?.end??0)),padding:0}}/></TableRow>}
        </TableBody>
      </Table>
    </div>
    {customizable&&<Dialog open={settings&&presentationAllowed&&!mobile} onOpenChange={open=>{if(!open||currentAuthority())setSettings(open);}}><DialogContent {...protectedPresentationProps(presentationAllowed)} className="grid-settings-modal" onCloseAutoFocus={event=>{if(!currentAuthority())event.preventDefault();}}><DialogHeader><DialogTitle>Tùy chỉnh bảng</DialogTitle><DialogDescription>Cột và bố cục cá nhân. Các chế độ xem được giữ trong phiên đang mở; dữ liệu và quyền truy cập do ERP xác nhận.</DialogDescription></DialogHeader>
      <label className="grid-density-choice"><input type="checkbox" checked={density} disabled={!presentationAllowed} onChange={event=>{if(currentAuthority()){if(setCompact)setCompact(event.target.checked);else setLocalCompact(event.target.checked);}}}/>Bảng dữ liệu gọn</label>
      <div className="saved-view-list"><RequestButton variant={view.id==="default"?"secondary":"outline"} onClick={()=>setView(defaultView(columns,schemaVersion))}>Mặc định</RequestButton>{views.map(v=><div key={v.id}><RequestButton variant={view.id===v.id?"secondary":"outline"} onClick={()=>{const restored=restoreView(v,columns,schemaVersion);setView(restored.view);setRecovery(restored.retired);}}>{v.name}</RequestButton><RequestButton variant="ghost" aria-label={`Xóa chế độ xem ${v.name}`} onClick={()=>{setViews(old=>old.filter(x=>x.id!==v.id));if(view.id===v.id)setView(defaultView(columns,schemaVersion));}}><X size={13}/></RequestButton></div>)}</div>
      <div className="column-settings-list">{view.order.map((id,index)=>{const column=columns.find(x=>x.id===id);if(!column)return null;return <div className="column-setting" key={id}>
        <Checkbox checked={!view.hidden.includes(id)} disabled={column.required} aria-label={`Hiển thị ${column.label}`} onCheckedChange={value=>setView(old=>({...old,hidden:value===true?old.hidden.filter(x=>x!==id):[...old.hidden,id]}))}/><span>{column.label}</span>
        <RequestInput type="number" min={96} max={600} aria-label={`Độ rộng ${column.label}`} value={view.widths[id]} onChange={event=>{const n=event.target.valueAsNumber;if(Number.isFinite(n))setView(old=>({...old,widths:{...old.widths,[id]:Math.max(96,Math.min(600,n))}}));}}/>
        <RequestButton variant={view.pinned.includes(id)?"secondary":"ghost"} aria-label={`Cố định ${column.label}`} aria-pressed={view.pinned.includes(id)} onClick={()=>setView(old=>({...old,pinned:old.pinned.includes(id)?old.pinned.filter(x=>x!==id):[...old.pinned,id]}))}><Pin size={14}/></RequestButton>
        <RequestButton variant="ghost" disabled={index===0} aria-label={`Đưa ${column.label} lên`} onClick={()=>setView(old=>({...old,order:moveColumn(old.order,id,-1)}))}><ArrowUp size={14}/></RequestButton>
        <RequestButton variant="ghost" disabled={index===view.order.length-1} aria-label={`Đưa ${column.label} xuống`} onClick={()=>setView(old=>({...old,order:moveColumn(old.order,id,1)}))}><ArrowDown size={14}/></RequestButton>
      </div>;})}</div>
      <form className="save-view-form" onSubmit={event=>{event.preventDefault();saveView();}}><RequestInput aria-label="Tên chế độ xem" placeholder="Tên chế độ xem cá nhân" value={viewName} maxLength={60} onChange={event=>setViewName(event.target.value)}/><RequestButton disabled={!viewName.trim()||views.length>=10}><Save size={14}/>Lưu bố cục</RequestButton></form>
      <RequestButton variant="ghost" onClick={()=>setView(defaultView(columns,schemaVersion))}><RotateCcw size={14}/>Khôi phục bố cục mặc định</RequestButton>
    </DialogContent></Dialog>}
  </div>;
}
