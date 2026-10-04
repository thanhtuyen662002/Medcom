/** Presentation IDs are opaque UI IDs, never SQL identifiers or permissions. */
export type GridColumn = {id:string;label:string;width:number;required?:boolean;format?:"text"|"date"|"decimal"|"boolean"|"status"};
export type GridView = {id:string;name:string;schemaVersion:string;order:string[];hidden:string[];widths:Record<string,number>;pinned:string[]};
export function defaultView(columns:GridColumn[],schemaVersion:string):GridView{return {id:"default",name:"Mặc định",schemaVersion,order:columns.map(c=>c.id),hidden:[],widths:Object.fromEntries(columns.map(c=>[c.id,c.width])),pinned:columns.filter(c=>c.required).map(c=>c.id)};}
export function restoreView(input:GridView,columns:GridColumn[],schemaVersion:string){
 const ids=new Set(columns.map(c=>c.id));const defaults=defaultView(columns,schemaVersion);
 const retired=[...new Set([...input.order,...input.hidden,...input.pinned,Object.keys(input.widths)].flat())].filter(id=>!ids.has(id));
 const order=[...new Set(input.order.filter(id=>ids.has(id))),...defaults.order.filter(id=>!input.order.includes(id))];
 return {view:{...input,schemaVersion,order,hidden:input.hidden.filter(id=>ids.has(id)&&!columns.find(c=>c.id===id)?.required),pinned:input.pinned.filter(id=>ids.has(id)),widths:Object.fromEntries(columns.map(c=>[c.id,Math.max(96,Math.min(600,Number.isFinite(input.widths[c.id])?input.widths[c.id]:c.width))]))},retired};
}
export function moveColumn(order:string[],id:string,delta:number){const next=[...order];const index=next.indexOf(id);const target=index+delta;if(index<0||target<0||target>=next.length)return next;[next[index],next[target]]=[next[target],next[index]];return next;}
export function scopedSelection(selected:string[],rows:string[]){const allowed=new Set(rows);return [...new Set(selected)].filter(id=>allowed.has(id));}
export function sessionRemaining(idle:string,absolute:string,now=Date.now()){const limit=Math.min(Date.parse(idle),Date.parse(absolute));return Number.isFinite(limit)?Math.max(0,limit-now):0;}

export type FieldDefinition={id:string;label:string;sectionId:string;kind:"text"|"decimal"|"date"|"boolean"|"enum"|"lookup";required?:boolean;readOnly?:boolean;maxLength?:number;options?:{id:string;label:string}[];lookupId?:string};
export type ActionDefinition={id:string;label:string;enabled:boolean;reason?:string};
export type ScreenDefinition={id:string;version:string;label:string;sections:{id:string;label:string}[];fields:FieldDefinition[];actions:ActionDefinition[]};
export type Values=Record<string,string|boolean|null>;
export type DocumentSnapshot={id:string;version:string;values:Values;definition:ScreenDefinition};
export type OperationResult=
 |{kind:"confirmed";snapshot:DocumentSnapshot;referenceId?:string}
 |{kind:"rejected";message:string;fieldErrors:Record<string,string>;referenceId?:string}
 |{kind:"conflict";message:string;current:DocumentSnapshot;referenceId?:string}
 |{kind:"unknown";message:string;referenceId?:string};
export type EditorState={phase:"pristine"|"dirty"|"submitting"|"confirmed"|"rejected"|"conflict"|"unknown"|"reconciling";baseline:DocumentSnapshot;values:Values;result?:OperationResult};
export type EditorEvent={type:"change";id:string;value:string|boolean|null}|{type:"submit"}|{type:"result";result:OperationResult}|{type:"reconcile"}|{type:"reload";snapshot:DocumentSnapshot}|{type:"reapply"};
export function editorReducer(state:EditorState,event:EditorEvent):EditorState{
 if(event.type==="reload")return {phase:"pristine",baseline:event.snapshot,values:{...event.snapshot.values}};
 if(event.type==="change"){
  if(["submitting","unknown","reconciling","conflict"].includes(state.phase))return state;
  const field=state.baseline.definition.fields.find(f=>f.id===event.id);if(!field||field.readOnly)return state;
  const values={...state.values,[event.id]:event.value};return {...state,values,phase:JSON.stringify(values)===JSON.stringify(state.baseline.values)?"pristine":"dirty",result:undefined};
 }
 if(event.type==="submit")return ["dirty","rejected"].includes(state.phase)?{...state,phase:"submitting",result:undefined}:state;
 if(event.type==="reconcile")return state.phase==="unknown"?{...state,phase:"reconciling"}:state;
 if(event.type==="reapply"){
  if(state.result?.kind!=="conflict")return state;
  const current=state.result.current;const values={...current.values};
  for(const field of current.definition.fields){if(!field.readOnly&&Object.hasOwn(state.values,field.id))values[field.id]=state.values[field.id];}
  return {...state,baseline:current,values,phase:"dirty",result:undefined};
 }
 if(event.result.kind==="confirmed")return {phase:"confirmed",baseline:event.result.snapshot,values:{...event.result.snapshot.values},result:event.result};
 return {...state,phase:event.result.kind,result:event.result};
}
export type LookupValue={id:string;label:string;context?:string;unresolved?:boolean};
export type LookupAdapter=(lookupId:string,query:string,signal:AbortSignal)=>Promise<{items:LookupValue[];hasMore:boolean}>;
export type DocumentAdapter={save:(snapshot:DocumentSnapshot,values:Values,actionId:string)=>Promise<OperationResult>;reconcile:(input:{documentId:string;version:string;referenceId?:string})=>Promise<OperationResult>;reload:(id:string)=>Promise<DocumentSnapshot>};
/** A server-authorized editor receives its scope and concurrency version from BE. */
export type RoleNavigation={roleId:string;roleLabel:string;version:string;canPublish:boolean;entries:{screenId:string;label:string;enabled:boolean;primary:boolean}[];allowedTargets:{id:string;label:string}[]};
export type RoleNavigationAdapter={publish:(draft:RoleNavigation)=>Promise<RoleNavigation>;reload:()=>Promise<RoleNavigation>};
export type ReportDefinition={id:string;version:string;label:string;description:string;parameters:FieldDefinition[];canRun:boolean};
export type ReportJob={id:string;reportId:string;label:string;status:"queued"|"running"|"completed"|"failed";createdAt:string;snapshotAt?:string;message?:string;referenceId?:string;canDownload:boolean};
export type ReportAdapter={catalog:(signal:AbortSignal)=>Promise<ReportDefinition[]>;jobs:(signal:AbortSignal)=>Promise<ReportJob[]>;start:(report:ReportDefinition,values:Values)=>Promise<ReportJob>;reconcileStart:(report:ReportDefinition,values:Values)=>Promise<{kind:"confirmed";job:ReportJob}|{kind:"rejected"|"unknown";message:string}>;download:(jobId:string)=>Promise<void>};
export type FilterDefinition={id:string;label:string;kind:"text"|"decimal"|"date"|"enum";operators:("eq"|"like"|"gte"|"lte")[];options?:{id:string;label:string}[]};
export type FilterTerm={fieldId:string;operator:"eq"|"like"|"gte"|"lte";value:string};
export type ServerQuery={filters:FilterTerm[];sort:{fieldId:string;direction:"asc"|"desc"}[];groupId?:string};
export function validQuery(query:ServerQuery,fields:FilterDefinition[],sortFields:string[],groupIds:string[]){return query.filters.length<=20&&query.sort.length<=3&&query.filters.every(term=>{const field=fields.find(f=>f.id===term.fieldId);return !!field&&field.operators.includes(term.operator)&&term.value.length>0&&term.value.length<=250&&(field.kind!=="enum"||field.options?.some(o=>o.id===term.value))&&(field.kind!=="decimal"||/^-?\d{1,28}(?:\.\d{1,4})?$/.test(term.value));})&&query.sort.every(s=>sortFields.includes(s.fieldId)&&["asc","desc"].includes(s.direction))&&(!query.groupId||groupIds.includes(query.groupId));}
