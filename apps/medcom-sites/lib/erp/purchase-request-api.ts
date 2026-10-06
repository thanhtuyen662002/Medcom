import {z} from "zod";
import {ApiError,request} from "./api";
import type {PurchaseRequestSnapshot} from "@/components/erp/mobile-request";

const id=z.string().min(1).max(100), text=z.string().max(65536), decimal=z.string().regex(/^-?\d+(?:\.\d+)?$/);
const wallClock=z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/).nullable();
const scope=z.string().regex(/^[a-f0-9]{64}$/);
const header=z.object({purchaseDate:wallClock,purposeId:z.number().int().nullable(),personSuggest:text,department:text,
 purposeDescOrClient:text.nullable(),price:decimal.nullable(),notes:text.nullable(),currencyId:id,objectId:id,rateExchange:z.number().finite()}).strict();
const values=z.object({itemId:id,budget:decimal.nullable(),timeRequired:text.nullable(),quantity:decimal,unitPrice:decimal,totalPrice:decimal.nullable(),model:text.nullable()}).strict();
const document=z.object({purchaseRequestId:id,branchId:id,header,statusId:z.number().int(),isLocked:z.boolean().nullable(),
 lines:z.array(z.object({lineId:id,values}).strict()).max(500)}).strict();
const snapshot=z.object({document,stateToken:z.string().regex(/^prs1\.[a-f0-9]{64}$/)}).strict().superRefine((value,context)=>{
 if(new Set(value.document.lines.map(line=>line.lineId)).size!==value.document.lines.length)context.addIssue({code:z.ZodIssueCode.custom,message:"Duplicate source line identity"});
});
const workspace=z.object({branchIds:z.array(id).min(1).max(200),writeAvailable:z.literal(false),writeReason:z.literal("numbering_journal_runtime_unqualified"),
 lookups:z.array(z.object({kind:z.enum(["branches","items","objects","purposes","currencies"]),available:z.boolean(),reason:z.string().nullable(),evidence:z.string()}).strict()).max(5)}).strict();
const list=z.object({rows:z.array(z.object({documentId:id,purchaseDate:wallClock,branchId:id,personSuggest:text,department:text,statusId:z.number().int(),isLocked:z.boolean().nullable()}).strict()).max(50),
 page:z.number().int().min(1).max(1000),pageSize:z.number().int().min(1).max(50),hasMore:z.boolean()}).strict();
const lookup=z.object({available:z.boolean(),reason:z.string().nullable(),items:z.array(z.object({id,label:z.string()}).strict()).max(20),page:z.number().int().min(1).max(1000),hasMore:z.boolean()}).strict();
const envelope=<S extends z.ZodTypeAny>(data:S)=>z.object({scopeKey:scope,data}).strict();
export type PurchaseReadback=z.infer<typeof snapshot>;
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
export async function getPurchaseLookup(scopeKey:string,kind:"branches"|"items"|"objects"|"purposes"|"currencies",search:string,page:number,signal?:AbortSignal){
 const response=await request(`api/purchase-requests/lookup?${new URLSearchParams({kind,search,page:String(page)})}`,envelope(lookup),{signal});assertScope(response.scopeKey,scopeKey);
 if(response.data.page!==page||!response.data.available&&(response.data.items.length>0||response.data.hasMore))throw new ApiError(502,"invalid_api_response");return response.data;
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
