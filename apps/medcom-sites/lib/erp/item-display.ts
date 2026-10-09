import {z} from "zod";
import type {DocumentDetail,DocumentKind} from "./contracts";
import type {PurchaseReadback} from "./purchase-request-api";

const sourceText=(max:number,min=0)=>z.string().min(min).max(max).refine(value=>!value.includes("\0")&&!/[\uD800-\uDFFF]/u.test(value),"Invalid source text");
const identity=sourceText(100,1);
const referenceKey=sourceText(50,1);
export const itemDisplayLineSchema=z.object({lineId:identity,itemId:z.string(),
 manufacturerItemCode:sourceText(100).nullable(),manufacturerCodeSource:z.enum(["master","document","unavailable"]),
 itemName:sourceText(65536).nullable(),unit:sourceText(50).nullable(),
 referenceState:z.enum(["available","missing","ambiguous","unavailable","invalid"])}).strict().superRefine((line,ctx)=>{
 // ItemID belongs to the original read; reference-key qualification applies only to enrichment.
 if(!referenceKey.safeParse(line.itemId).success&&(line.referenceState!=="unavailable"
   ||line.manufacturerCodeSource!=="unavailable"||line.manufacturerItemCode!==null||line.itemName!==null||line.unit!==null))
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"Unqualified display reference"});
 if(line.referenceState!=="available"&&(line.itemName!==null||line.unit!==null)
   ||line.manufacturerCodeSource==="unavailable"&&line.manufacturerItemCode!==null
   ||line.manufacturerCodeSource==="master"&&line.referenceState!=="available")
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"Incoherent display availability"});
});
export const itemDisplayContextSchema=z.object({kind:z.enum(["purchase-orders","purchase-requests","inbound-requests"]),
 documentId:identity,branchId:identity,stateToken:z.string().min(1).max(100).nullable(),
 statusId:z.number().int().nullable(),isLocked:z.boolean().nullable(),
 page:z.number().int().min(1).max(1000).nullable(),pageSize:z.number().int().min(1).max(100).nullable(),
 lines:z.array(itemDisplayLineSchema).max(500)}).strict().superRefine((value,ctx)=>{
 if(new Set(value.lines.map(line=>line.lineId)).size!==value.lines.length
   ||value.lines.reduce((bytes,line)=>bytes+6*((line.itemName?.length??0)+(line.unit?.length??0)+(line.manufacturerItemCode?.length??0)),0)>262144)
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"Invalid display cardinality or budget"});
});
export type ItemDisplayLine=z.infer<typeof itemDisplayLineSchema>;
export type ItemDisplayContext=z.infer<typeof itemDisplayContextSchema>;
export type ItemDisplayBinding=Omit<ItemDisplayContext,"lines">;
/** Read-only presentation input; never put this in an editor snapshot or command. */
export type ItemDisplayPresentation={binding:ItemDisplayBinding;context?:ItemDisplayContext|null};
export function purchaseItemDisplayBinding(readback:PurchaseReadback):ItemDisplayBinding{
 const {document,stateToken}=readback;
 return {kind:"purchase-requests",documentId:document.purchaseRequestId,branchId:document.branchId,
  stateToken,statusId:document.statusId,isLocked:document.isLocked,page:null,pageSize:null};
}
export function pagedItemDisplayBinding(kind:DocumentKind,detail:DocumentDetail):ItemDisplayBinding{
 const {document,page,pageSize}=detail;
 return {kind,documentId:document.documentId,branchId:document.branchId,stateToken:null,
  statusId:document.statusId,isLocked:document.isLocked,page,pageSize};
}
export type ItemDisplaySourceLine={lineId:string;itemId:string};
const sameBinding=(context:ItemDisplayContext,binding:ItemDisplayBinding)=>
 (["kind","documentId","branchId","stateToken","statusId","isLocked","page","pageSize"] as const).every(key=>context[key]===binding[key]);

/** Decode at the enclosing read boundary. Older/null metadata becomes explicit unknowns.
 * No cache, lookup request, fallback catalog or write-data transformation. */
export function bindItemDisplayContext(raw:unknown,binding:ItemDisplayBinding,lines:readonly ItemDisplaySourceLine[]):ItemDisplayContext{
 // Supplied context must have a unique, qualified original row binding. This does not
 // change document/editor line schemas or the R1 unavailable ItemID representation.
 if(raw!=null&&(new Set(lines.map(line=>line.lineId)).size!==lines.length
  ||lines.some(line=>!referenceKey.safeParse(line.lineId).success)))throw new Error("Invalid original display binding");
 const context=itemDisplayContextSchema.parse(raw==null?{...binding,lines:lines.map(line=>({lineId:line.lineId,itemId:line.itemId,
  manufacturerItemCode:null,manufacturerCodeSource:"unavailable",itemName:null,unit:null,referenceState:"unavailable"}))}:raw);
 if(!sameBinding(context,binding)||context.lines.length!==lines.length
  ||context.lines.some((line,index)=>line.lineId!==lines[index].lineId||line.itemId!==lines[index].itemId
    ||binding.kind==="inbound-requests"&&(line.manufacturerCodeSource==="master"||(line.manufacturerItemCode?.length??0)>50)
    ||binding.kind!=="inbound-requests"&&line.manufacturerCodeSource==="document"))throw new Error("Invalid document display binding");
 return context;
}
/** Only pass the context belonging to the current authorized read. A retired scope's
 * read must be discarded by the caller's existing scope/selection fences. */
export function itemDisplayFor(context:ItemDisplayContext|null|undefined,binding:ItemDisplayBinding,line:ItemDisplaySourceLine):ItemDisplayLine{
 const unknown:ItemDisplayLine={...line,manufacturerItemCode:null,manufacturerCodeSource:"unavailable",itemName:null,unit:null,referenceState:"unavailable"};
 if(!context||!sameBinding(context,binding)||!referenceKey.safeParse(line.itemId).success)return unknown;
 const matches=context.lines.filter(value=>value.lineId===line.lineId);
 return matches.length===1&&matches[0].itemId===line.itemId?matches[0]:unknown;
}
export function itemDisplayValue(value:string|null|undefined):string{
 return value==null?"Chưa có thông tin":value===""?"Trống":value;
}
