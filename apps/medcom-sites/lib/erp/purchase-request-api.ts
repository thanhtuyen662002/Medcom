import {z} from "zod";
import {bindItemDisplayContext,itemDisplayContextSchema} from "./item-display";
import {ApiError,request} from "./api";
import type {PurchaseCommandRoute} from "./purchase-request-command-adapter";
import type {PurchaseRequestSnapshot} from "@/components/erp/mobile-request";

const id=z.string().min(1).max(100), text=z.string().max(65536), decimal=z.string().regex(/^-?\d+(?:\.\d+)?$/);
const wallClock=z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/).nullable();
const scope=z.string().regex(/^[a-f0-9]{64}$/);
const header=z.object({purchaseDate:wallClock,purposeId:z.number().int().nullable(),personSuggest:text,department:text,
 purposeDescOrClient:text.nullable(),price:decimal.nullable(),notes:text.nullable(),currencyId:id,objectId:id,rateExchange:z.number().finite()}).strict();
const values=z.object({itemId:id,budget:decimal.nullable(),timeRequired:text.nullable(),quantity:decimal,unitPrice:decimal,totalPrice:decimal.nullable(),model:text.nullable()}).strict();
const document=z.object({purchaseRequestId:id,branchId:id,header,statusId:z.number().int(),isLocked:z.boolean().nullable(),
 lines:z.array(z.object({lineId:id,values}).strict()).max(500)}).strict();
const commandAccess=z.object({canSave:z.boolean(),canSubmit:z.boolean(),canLookup:z.boolean(),canAddLines:z.literal(false),reason:z.string().min(1)}).strict();
const snapshot=z.object({document,itemDisplayContext:itemDisplayContextSchema.nullable().optional(),statusName:z.string().max(50).nullable().optional(),commandAccess:commandAccess.nullable().optional(),stateToken:z.string().regex(/^prs1\.[a-f0-9]{64}$/)}).strict().superRefine((value,context)=>{
 if(new Set(value.document.lines.map(line=>line.lineId)).size!==value.document.lines.length)context.addIssue({code:z.ZodIssueCode.custom,message:"Duplicate source line identity"});
 try{bindItemDisplayContext(value.itemDisplayContext,{kind:"purchase-requests",documentId:value.document.purchaseRequestId,
  branchId:value.document.branchId,stateToken:value.stateToken,statusId:value.document.statusId,isLocked:value.document.isLocked,page:null,pageSize:null},
  value.document.lines.map(line=>({lineId:line.lineId,itemId:line.values.itemId})));}
 catch{context.addIssue({code:z.ZodIssueCode.custom,message:"Invalid item display context"});}
}).transform(value=>({...value,itemDisplayContext:bindItemDisplayContext(value.itemDisplayContext,
 {kind:"purchase-requests",documentId:value.document.purchaseRequestId,branchId:value.document.branchId,stateToken:value.stateToken,
  statusId:value.document.statusId,isLocked:value.document.isLocked,page:null,pageSize:null},
 value.document.lines.map(line=>({lineId:line.lineId,itemId:line.values.itemId})))}));
const workspace=z.object({branchIds:z.array(id).min(1).max(200),writeAvailable:z.literal(false),writeReason:z.literal("numbering_journal_runtime_unqualified"),
 lookups:z.array(z.object({kind:z.enum(["branches","items","objects","purposes","currencies"]),available:z.boolean(),reason:z.string().nullable(),evidence:z.string()}).strict()).max(5)}).strict();
const list=z.object({rows:z.array(z.object({documentId:id,purchaseDate:wallClock,branchId:id,personSuggest:text,department:text,statusId:z.number().int(),statusName:z.string().max(50).nullable().optional(),isLocked:z.boolean().nullable()}).strict()).max(50),
 page:z.number().int().min(1).max(1000),pageSize:z.number().int().min(1).max(50),hasMore:z.boolean()}).strict();
// These read-only choices preserve the qualified source values. In particular,
// NULL purpose names and finite zero/negative currency rates are not defaults.
const purposeId=z.string().max(11).regex(/^(?:0|-?[1-9]\d*)$/).refine(value=>{
 const number=Number(value);return Number.isInteger(number)&&number>=-2147483648&&number<=2147483647;
},"Expected a canonical Int32 identity");
const branchChoice=z.object({id,label:z.string().max(100)}).strict();
const sourceText=(value:string)=>!value.includes("\0")&&!/[\uD800-\uDFFF]/u.test(value);
const purposeChoice=z.object({id:purposeId,label:z.string().max(50).refine(sourceText).nullable()}).strict();
const currencyId=z.string().min(1).max(3).refine(value=>sourceText(value)&&!/\p{White_Space}$/u.test(value)&&!/\p{Cc}/u.test(value));
const currencyChoice=z.object({id:currencyId,label:z.string().min(1).max(3),
 currencyName:z.string().max(100).refine(sourceText),rateExchange:z.number().finite()}).strict().refine(value=>value.label===value.id,"Currency display identity must match its source identity");
const lookupPage=<S extends z.ZodTypeAny>(choice:S)=>z.object({available:z.boolean(),reason:z.string().min(1).max(100).nullable(),
 items:z.array(choice).max(20),page:z.number().int().min(1).max(1000),hasMore:z.boolean()}).strict().superRefine((value,context)=>{
 if(value.available?value.reason!==null:value.reason===null||value.items.length>0||value.hasMore)
  context.addIssue({code:z.ZodIssueCode.custom,message:"Incoherent lookup availability"});
 if(new Set(value.items.map(item=>item.id)).size!==value.items.length)
  context.addIssue({code:z.ZodIssueCode.custom,message:"Duplicate lookup identity"});
});
const unavailableLookup=z.object({available:z.literal(false),reason:z.string().min(1).max(100),items:z.array(z.never()).max(0),
 page:z.number().int().min(1).max(1000),hasMore:z.literal(false)}).strict();
const lookups={branches:lookupPage(branchChoice),items:unavailableLookup,objects:unavailableLookup,purposes:lookupPage(purposeChoice),currencies:lookupPage(currencyChoice)};
export type PurchaseLookupKind=keyof typeof lookups;
export type PurchaseLookupPage=z.infer<(typeof lookups)[PurchaseLookupKind]>;
const envelope=<S extends z.ZodTypeAny>(data:S)=>z.object({scopeKey:scope,data}).strict();
export type PurchaseReadback=Omit<z.infer<typeof snapshot>,"itemDisplayContext">&{itemDisplayContext?:import("./item-display").ItemDisplayContext};
export type PurchaseWorkspace=z.infer<typeof workspace>;
export type PurchasePage=z.infer<typeof list>;
function assertScope(actual:string,expected:string){if(actual!==expected)throw new ApiError(409,"purchase_scope_changed");}
export const getPurchaseWorkspace=(signal?:AbortSignal)=>request("api/purchase-requests/workspace",envelope(workspace),{signal});
export async function getPurchaseList(scopeKey:string,page:number,search:string,branchId:string,signal?:AbortSignal){
 const response=await request(`api/purchase-requests?${new URLSearchParams({page:String(page),pageSize:"20",search,branchId})}`,envelope(list),{signal});assertScope(response.scopeKey,scopeKey);
 if(response.data.page!==page||response.data.pageSize!==20||branchId&&response.data.rows.some(row=>row.branchId!==branchId))throw new ApiError(502,"invalid_api_response");return response.data;
}
export async function getPurchaseDetail(scopeKey:string,documentId:string,signal?:AbortSignal){
 const response=await request(`api/purchase-requests/detail?${new URLSearchParams({documentId})}`,envelope(snapshot),{signal});assertScope(response.scopeKey,scopeKey);
 if(response.data.document.purchaseRequestId!==documentId)throw new ApiError(502,"invalid_api_response");return response.data;
}
export async function getPurchaseLookup(scopeKey:string,kind:PurchaseLookupKind,search:string,page:number,signal?:AbortSignal){
 if(!Object.hasOwn(lookups,kind))throw new ApiError(400,"invalid_purchase_lookup");
 signal?.throwIfAborted();
 const response=await request(`api/purchase-requests/lookup?${new URLSearchParams({kind,search,page:String(page)})}`,envelope(lookups[kind]),{signal});assertScope(response.scopeKey,scopeKey);
 if(response.data.page!==page)throw new ApiError(502,"invalid_api_response");return response.data;
}

type PurchaseOpenResult={detail?:PurchaseReadback;detailError?:unknown};
/** A missing/unavailable selected document must not erase a freshly authorized list.
 * Authentication, authority/scope changes and malformed responses still fail closed. */
export async function getPurchaseDocuments(scopeKey:string,branches:readonly string[],page:number,search:string,branchId:string,selected:string|null,signal?:AbortSignal):Promise<{list:PurchasePage}&PurchaseOpenResult>{
 const opening:Promise<PurchaseOpenResult>=selected?getPurchaseDetail(scopeKey,selected,signal).then(detail=>({detail})).catch((error:unknown)=>{
  if(signal?.aborted||error instanceof ApiError&&([401,403,409].includes(error.status)||error.code==="invalid_api_response"))throw error;
  return {detailError:error};
 }):Promise.resolve({});
 const [list,opened]=await Promise.all([getPurchaseList(scopeKey,page,search,branchId,signal),opening]);
 if(list.rows.some(row=>!branches.includes(row.branchId))||opened.detail&&!branches.includes(opened.detail.document.branchId))throw new ApiError(502,"invalid_api_response");
 return {list,...opened};
}

// Read-only projection. The complete original readback remains separately visible.
export function mobilePurchaseSnapshot(readback:PurchaseReadback):PurchaseRequestSnapshot|null{
 const {document:source,stateToken}=readback, h=source.header;
 if(source.lines.length>100||h.purchaseDate===null)return null;
 return {documentId:source.purchaseRequestId,version:stateToken,confirmation:source.statusId===1?"draft":source.statusId===2?"submitted":null,
  status:{id:String(source.statusId),label:`Trạng thái ERP: ${source.statusId}`},values:{purchaseDate:h.purchaseDate.slice(0,10),personSuggest:h.personSuggest,
   department:h.department,purposeId:h.purposeId===null?"":String(h.purposeId),purposeDescOrClient:h.purposeDescOrClient??"",notes:h.notes??"",branchId:source.branchId,
   currencyId:h.currencyId,objectId:h.objectId,lines:source.lines.map(line=>({localKey:line.lineId,lineId:line.lineId,itemId:line.values.itemId,
    quantity:line.values.quantity,unitPrice:line.values.unitPrice,budget:line.values.budget??"",timeRequired:line.values.timeRequired??"",model:line.values.model??""}))}};
}

/** The body is frozen once by the adapter. Never rebuild it for reconciliation. */
export async function postPurchaseCommand(scopeKey:string,route:PurchaseCommandRoute,body:string,signal:AbortSignal):Promise<unknown>{
 if(!["save","submit","save/lookup","submit/lookup"].includes(route))throw new ApiError(400,"invalid_purchase_command");
 if(new TextEncoder().encode(body).byteLength>1048576)throw new ApiError(413,"payload_too_large");
 signal.throwIfAborted();
 const csrf=await request("api/auth/csrf",z.object({token:z.string().min(1)}),{signal});
 signal.throwIfAborted();
 const response=await request(`api/purchase-requests/${route}`,envelope(z.object({outcome:z.number().int().min(0).max(8),receipt:z.unknown()}).strict()),{
  method:"POST",signal,headers:{"Content-Type":"application/json","X-CSRF-TOKEN":csrf.token,"X-Purchase-Scope":scopeKey},body});
 assertScope(response.scopeKey,scopeKey);return response;
}
