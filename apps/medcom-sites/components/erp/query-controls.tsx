"use client";
import {useState} from "react";
import {Filter,Plus,X} from "lucide-react";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {RequestButton,RequestInput,RequestSelect} from "./request-presentation";
import {validQuery,type FilterDefinition,type ServerQuery} from "@/lib/erp/presentation";
/** Adapter sends typed terms to BE. Never filters the loaded page or evaluates SQL. */
export function ServerQueryControls({fields,sortFields,groups,value,onApply,busy}:{fields:FilterDefinition[];sortFields:{id:string;label:string}[];groups:{id:string;label:string}[];value:ServerQuery;onApply:(query:ServerQuery)=>void;busy:boolean}){
 const [open,setOpen]=useState(false);const [draft,setDraft]=useState(value);const operators={eq:"Bằng",like:"Chứa",gte:"Từ",lte:"Đến"};
 return <><RequestButton type="button" disabled={busy} onClick={()=>{setDraft({filters:value.filters.map(f=>({...f})),sort:value.sort.map(s=>({...s})),groupId:value.groupId});setOpen(true);}}><Filter size={15}/>Lọc & sắp xếp{value.filters.length>0?` (${value.filters.length})`:""}</RequestButton>
 <Dialog open={open} onOpenChange={setOpen}><DialogContent className="query-controls-modal"><DialogHeader><DialogTitle>Lọc và sắp xếp dữ liệu</DialogTitle><DialogDescription>Áp dụng cho truy vấn ERP trong phạm vi được cấp quyền. Chỉ các trường và điều kiện được hệ thống cung cấp mới khả dụng.</DialogDescription></DialogHeader>
  <div className="query-terms">{draft.filters.map((term,index)=>{
   const field=fields.find(f=>f.id===term.fieldId);
   const update=(patch:Partial<typeof term>)=>setDraft(old=>({...old,filters:old.filters.map((t,i)=>i===index?{...t,...patch}:t)}));
   return <div className="query-term" key={index}>
    <RequestSelect aria-label={`Trường lọc ${index+1}`} value={term.fieldId} onChange={event=>{const selected=fields.find(f=>f.id===event.target.value);if(selected)update({fieldId:selected.id,operator:selected.operators[0],value:""});}}>{fields.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</RequestSelect>
    <RequestSelect aria-label={`Điều kiện ${index+1}`} value={term.operator} onChange={event=>{const operator=event.target.value;if(field?.operators.includes(operator as typeof term.operator))update({operator:operator as typeof term.operator});}}>{field?.operators.map(o=><option key={o} value={o}>{operators[o]}</option>)}</RequestSelect>
    {field?.kind==="enum"?<RequestSelect aria-label={`Giá trị ${index+1}`} value={term.value} onChange={event=>update({value:event.target.value})}><option value="" disabled>Chọn giá trị</option>{field.options?.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</RequestSelect>:<RequestInput aria-label={`Giá trị ${index+1}`} type={field?.kind==="date"?"date":"text"} inputMode={field?.kind==="decimal"?"decimal":undefined} value={term.value} maxLength={250} onChange={event=>update({value:event.target.value})}/>}
    <RequestButton type="button" variant="ghost" aria-label={`Bỏ điều kiện ${index+1}`} onClick={()=>setDraft(old=>({...old,filters:old.filters.filter((_,i)=>i!==index)}))}><X size={15}/></RequestButton>
   </div>;
  })}</div>
  <RequestButton type="button" disabled={!fields.length||draft.filters.length>=20} onClick={()=>{const f=fields[0];if(f)setDraft(old=>({...old,filters:[...old.filters,{fieldId:f.id,operator:f.operators[0],value:""}]}));}}><Plus size={15}/>Thêm điều kiện</RequestButton>
  {sortFields.length>0&&<div className="query-sort"><span>Sắp xếp</span><RequestSelect aria-label="Trường sắp xếp" value={draft.sort[0]?.fieldId??"none"} onChange={event=>{const id=event.target.value;setDraft(old=>({...old,sort:id==="none"?[]:[{fieldId:id,direction:old.sort[0]?.direction??"asc"}]}));}}><option value="none">Mặc định của ERP</option>{sortFields.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</RequestSelect>
   {draft.sort.length>0&&<RequestSelect aria-label="Chiều sắp xếp" value={draft.sort[0].direction} onChange={event=>{const direction=event.target.value;setDraft(old=>({...old,sort:[{...old.sort[0],direction:direction as "asc"|"desc"}]}));}}><option value="asc">Tăng dần</option><option value="desc">Giảm dần</option></RequestSelect>}
  </div>}
  {groups.length>0&&<RequestSelect aria-label="Nhóm dữ liệu" value={draft.groupId??"none"} onChange={event=>{const id=event.target.value;setDraft(old=>({...old,groupId:id==="none"?undefined:id}));}}><option value="none">Không nhóm</option>{groups.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}</RequestSelect>}
  <div className="recovery-actions"><RequestButton type="button" onClick={()=>setDraft({filters:[],sort:[]})}>Xóa điều kiện</RequestButton><RequestButton type="button" variant="default" disabled={busy||!validQuery(draft,fields,sortFields.map(f=>f.id),groups.map(g=>g.id))} onClick={()=>{onApply(draft);setOpen(false);}}>Áp dụng truy vấn</RequestButton></div>
 </DialogContent></Dialog></>;
}
