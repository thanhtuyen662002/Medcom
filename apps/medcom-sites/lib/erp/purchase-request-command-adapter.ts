import type {PurchaseReadback} from "./purchase-request-api";
import type {MobileRequestAdapter,PurchaseRequestIntent,PurchaseRequestResult,PurchaseRequestSnapshot} from "@/components/erp/mobile-request";

export type PurchaseCommandRoute="save"|"submit"|"save/lookup"|"submit/lookup";
export type PurchaseCommandTransport=(scopeKey:string,route:PurchaseCommandRoute,body:string,signal:AbortSignal)=>Promise<unknown>;
type Aggregate=PurchaseReadback["document"];
type LineValues=Aggregate["lines"][number]["values"];
export type ExistingPurchaseSave={idempotencyKey:string;branchId:string;purchaseRequestId:string;expectedStateToken:string;
 header:Aggregate["header"];lineChanges:{kind:"Update";lineId:string;clientLineKey:null;values:LineValues}[]};
export type ExistingPurchaseSubmit={idempotencyKey:string;branchId:string;purchaseRequestId:string;expectedStateToken:string};
export type FrozenPurchaseCommand={action:PurchaseRequestIntent["action"];dto:ExistingPurchaseSave|ExistingPurchaseSubmit;
 json:string;desired:Aggregate;signature:string};
const copy=<T,>(value:T):T=>structuredClone(value);
function freeze<T>(value:T):T{
 if(value!==null&&typeof value==="object"){for(const part of Object.values(value))freeze(part);Object.freeze(value);}return value;
}
function equal(a:unknown,b:unknown):boolean{
 if(Object.is(a,b))return true;
 if(a===null||b===null||typeof a!=="object"||typeof b!=="object"||Array.isArray(a)!==Array.isArray(b))return false;
 const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left);
 return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&equal(left[key],right[key]));
}
function fields(value:unknown,keys:string[]):value is Record<string,unknown>{
 return !!value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
}
function text(value:string,max:number){
 if(typeof value!=="string"||value.length>max||value.includes("\0"))throw new Error("Unsupported text");
 for(let i=0;i<value.length;i++){
  const c=value.charCodeAt(i);
  if(c>=0xd800&&c<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw new Error("Invalid Unicode");}
  else if(c>=0xdc00&&c<=0xdfff)throw new Error("Invalid Unicode");
 }
 return value;
}
function integer(value:string){
 if(typeof value!=="string"||value.length>40||!(/^-?\d+$/).test(value))throw new Error("Exact integer required");
 const n=BigInt(value);if(n>BigInt("999999999999999999")||n<BigInt("-999999999999999999"))throw new Error("Source precision exceeded");
 return n.toString(); // String-to-BigInt-to-string, never IEEE754 coercion.
}
function nullableText(original:string|null,display:string,max:number){return display===(original??"")?original:text(display,max);}

/** Display values are never the write DTO. All writes below start with a copy of
 * the full raw aggregate and overlay only an explicit set of representable edits. */
export function commandPurchaseSnapshot(readback:PurchaseReadback):PurchaseRequestSnapshot{
 const d=readback.document,h=d.header;
 return {documentId:d.purchaseRequestId,version:readback.stateToken,confirmation:d.statusId===1?"draft":d.statusId===2?"submitted":null,
  status:{id:String(d.statusId),label:`Trạng thái ERP: ${d.statusId}`},values:{purchaseDate:h.purchaseDate?.slice(0,10)??"",
   personSuggest:h.personSuggest,department:h.department,purposeId:h.purposeId===null?"":String(h.purposeId),purposeDescOrClient:h.purposeDescOrClient??"",
   notes:h.notes??"",branchId:d.branchId,currencyId:h.currencyId,objectId:h.objectId,
   lines:d.lines.map(l=>({localKey:l.lineId,lineId:l.lineId,itemId:l.values.itemId,quantity:l.values.quantity,unitPrice:l.values.unitPrice,
    budget:l.values.budget??"",timeRequired:l.values.timeRequired??"",model:l.values.model??""}))}};
}

export function freezePurchaseCommand(raw:PurchaseReadback,intent:PurchaseRequestIntent):FrozenPurchaseCommand{
 const source=raw.document,display=commandPurchaseSnapshot(raw).values,v=intent.values;
 if(!source.purchaseRequestId||source.statusId!==1||source.isLocked===true||source.lines.length>500
  ||source.lines.some(l=>!l.lineId)||new Set(source.lines.map(l=>l.lineId)).size!==source.lines.length
  ||intent.documentId!==source.purchaseRequestId||intent.expectedVersion!==raw.stateToken
  ||!(/^[a-f0-9-]{1,100}$/i).test(intent.intentId))throw new Error("Existing authorized draft required");
 for(const field of ["branchId","purchaseDate","purposeId","currencyId","objectId"] as const)
  if(v[field]!==display[field])throw new Error(`Locked field: ${field}`);
 if(intent.action!=="saveDraft"&&intent.action!=="submit")throw new Error("Fixed action required");
 if(intent.action==="submit"&&!equal(v,display))throw new Error("Save and confirm changes before Submit");
 const dto:ExistingPurchaseSubmit={idempotencyKey:intent.intentId,branchId:source.branchId,purchaseRequestId:source.purchaseRequestId,expectedStateToken:raw.stateToken};
 const desired=copy(source);
 let command:ExistingPurchaseSave|ExistingPurchaseSubmit=dto;
 if(intent.action==="submit"){desired.statusId=2;desired.isLocked=true;}
 else{
  const header=copy(source.header);header.personSuggest=text(v.personSuggest,500);header.department=text(v.department,100);
  header.notes=nullableText(header.notes,v.notes,65536);header.purposeDescOrClient=nullableText(header.purposeDescOrClient,v.purposeDescOrClient,65536);
  const remaining=new Map(source.lines.map(line=>[line.lineId,line]));const changes:ExistingPurchaseSave["lineChanges"]=[],lines:Aggregate["lines"]=[];
  // This existing-document profile permits only updates to the complete original
  // line set. Never silently restore omitted rows or serialize structural edits.
  if(v.lines.length!==source.lines.length)throw new Error("Original line set required");
  for(const line of v.lines){
   const original=line.lineId?remaining.get(line.lineId):undefined;
   if(!original||line.localKey!==line.lineId||line.itemId!==original.values.itemId)throw new Error("Add, duplicate or item substitution unavailable");
   remaining.delete(original.lineId);const values=copy(original.values);
   for(const name of ["quantity","unitPrice"] as const)if(line[name]!==original.values[name])values[name]=integer(line[name]);
   if(line.budget!==(original.values.budget??""))values.budget=integer(line.budget);
   values.timeRequired=nullableText(values.timeRequired,line.timeRequired,200);values.model=nullableText(values.model,line.model,50);
   // totalPrice, header price/rateExchange and SQL wall-clock are NEVER recomputed.
   lines.push({lineId:original.lineId,values});
   if(!equal(values,original.values))changes.push({kind:"Update",lineId:original.lineId,clientLineKey:null,values});
  }
  if(remaining.size)throw new Error("Original line set required");
  desired.header=header;desired.lines=lines.sort((a,b)=>a.lineId<b.lineId?-1:a.lineId>b.lineId?1:0);
  command={...dto,header,lineChanges:changes};
 }
 const json=JSON.stringify(command);
 if(new TextEncoder().encode(json).byteLength>1048576)throw new Error("Command body exceeds 1 MiB");
 return freeze({action:intent.action,dto:command,json,desired,signature:JSON.stringify(intent)});
}

export function createPurchaseCommandAdapter(scopeKey:string,initial:PurchaseReadback,transport:PurchaseCommandTransport){
 if(!/^[a-f0-9]{64}$/.test(scopeKey))throw new Error("Session scope required");
 let raw=freeze(copy(initial)),pending:FrozenPurchaseCommand|null=null,retired=false,fresh=true,readEpoch=0;
 const attempted=new Set<string>();
 const unknown=(intent:PurchaseRequestIntent):PurchaseRequestResult=>({kind:"unknown",intentId:intent.intentId,
  message:"Kết quả chưa được xác nhận. Giữ yêu cầu gốc và kiểm tra kết quả; không gửi lại hoặc đổi mã yêu cầu."});
 function accept(response:unknown,frozen:FrozenPurchaseCommand,intent:PurchaseRequestIntent,lookup:boolean):PurchaseRequestResult{
  if(!fields(response,["scopeKey","data"])||response.scopeKey!==scopeKey||!fields(response.data,["outcome","receipt"]))return unknown(intent);
  const data=response.data;
  // Actual Contracts enums: command 0=Committed,1=Replayed; lookup 0=Committed,1=Pending.
  if(lookup?data.outcome!==0:data.outcome!==0&&data.outcome!==1)return unknown(intent);
  const r=data.receipt;
  if(!fields(r,["actionId","idempotencyKey","document","stateToken","allocatedLines"])
   ||r.actionId!==`purchase-request.${frozen.action==="saveDraft"?"save-draft":"submit"}`||r.idempotencyKey!==frozen.dto.idempotencyKey
   ||!Array.isArray(r.allocatedLines)||r.allocatedLines.length!==0||typeof r.stateToken!=="string"||!/^prs1\.[a-f0-9]{64}$/.test(r.stateToken)
   ||!equal(r.document,frozen.desired)||!equal(frozen.desired,raw.document)&&r.stateToken===frozen.dto.expectedStateToken)return unknown(intent);
  raw=freeze({document:copy(frozen.desired),stateToken:r.stateToken,commandAccess:raw.commandAccess});pending=null;fresh=false;readEpoch++;
  return {kind:"confirmed",intentId:intent.intentId,action:intent.action,receiptId:frozen.dto.idempotencyKey,snapshot:commandPurchaseSnapshot(raw)};
 }
 async function send(intent:PurchaseRequestIntent,signal:AbortSignal,lookup:boolean):Promise<PurchaseRequestResult>{
  if(retired||signal.aborted)return unknown(intent);
  let frozen:FrozenPurchaseCommand;
  if(lookup){if(!pending||pending.signature!==JSON.stringify(intent))return unknown(intent);frozen=pending;}
  else{
   if(pending||attempted.has(intent.intentId))return unknown(intent);
   try{if(intent.action==="saveDraft"&&!fresh)throw new Error("Fresh authorized read required");frozen=freezePurchaseCommand(raw,intent);}
   catch{return {kind:"rejected",intentId:intent.intentId,message:"Thay đổi chưa thể biểu diễn chính xác hoặc cần đọc lại phiếu. Chưa gửi lệnh.",fieldErrors:{}};}
   // Custody and exact serialized DTO/key are established before the first await.
   pending=frozen;attempted.add(intent.intentId);readEpoch++;
  }
  try{
   const route:PurchaseCommandRoute=frozen.action==="saveDraft"?(lookup?"save/lookup":"save"):(lookup?"submit/lookup":"submit");
   const response=await transport(scopeKey,route,frozen.json,signal);
   if(retired||signal.aborted)return unknown(intent);
   return accept(response,frozen,intent,lookup);
  }catch{return unknown(intent);}
 }
 const adapter:MobileRequestAdapter={execute:(intent,signal)=>send(intent,signal,false),reconcile:(intent,signal)=>send(intent,signal,true),
  lookup:async()=>{throw new Error("Business lookup bindings unavailable");}};
 return {adapter,currentReadback:()=>raw,hasPending:()=>pending!==null,needsFreshRead:()=>!fresh,readVersion:()=>readEpoch,
  adoptReadback(next:PurchaseReadback,startedAt=readEpoch){
   if(retired||pending||startedAt!==readEpoch||next.document.purchaseRequestId!==raw.document.purchaseRequestId||next.document.branchId!==raw.document.branchId)
    throw new Error("Cannot replace retained intent or document");raw=freeze(copy(next));fresh=true;readEpoch++;
  },retire(){retired=true;pending=null;readEpoch++;attempted.clear();}};
}
