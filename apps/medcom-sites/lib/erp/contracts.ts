import {z} from "zod";
import {bindItemDisplayContext,itemDisplayContextSchema,type ItemDisplayBinding} from "./item-display";
const sessionTimestamp=z.string().datetime({offset:true}).refine(value=>Number.isFinite(Date.parse(value)));
export const sessionSchema=z.object({displayName:z.string().min(1).max(250),tenantId:z.string().min(1),companyId:z.string().min(1),companyName:z.string().min(1),authorityVersion:z.number().int().positive(),idleExpiresAt:sessionTimestamp,absoluteExpiresAt:sessionTimestamp,capabilities:z.array(z.string()).max(256)});
export const workspaceSchema=z.object({session:sessionSchema,navigation:z.array(z.object({id:z.string(),label:z.string(),href:z.string()})),branchIds:z.array(z.string()).max(200).default([])});
export const rowSchema=z.object({documentId:z.string().min(1).max(50),documentDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),branchId:z.string().min(1),statusId:z.number().int().nullable(),statusName:z.string().max(100).nullable().optional(),isLocked:z.boolean().nullable()});
export const pageSchema=z.object({rows:z.array(rowSchema).max(100),page:z.number().int().positive(),pageSize:z.number().int().positive().max(100),hasMore:z.boolean()});
const decimal=z.string().regex(/^-?\d{1,28}(?:\.\d{1,4})?$/).nullable();const line=z.object({lineId:z.string(),itemId:z.string()});
const detailBase=z.object({itemDisplayContext:itemDisplayContextSchema.nullable().optional(),document:rowSchema,purchaseOrderLines:z.array(line.extend({quantity:decimal,quantity2:decimal})).max(100),inboundRequestLines:z.array(line.extend({setQuantityByDocument:decimal,barrelQuantityByDocument:decimal,setQuantityByReal:decimal,barrelQuantityByReal:decimal})).max(100),page:z.number().int().positive(),pageSize:z.number().int().positive().max(100),hasMore:z.boolean()}).strict();
function detailBinding(value:z.infer<typeof detailBase>):ItemDisplayBinding{
 return {kind:value.inboundRequestLines.length?"inbound-requests":value.purchaseOrderLines.length?"purchase-orders":value.itemDisplayContext?.kind??"purchase-orders",
  documentId:value.document.documentId,branchId:value.document.branchId,stateToken:null,statusId:value.document.statusId,
  isLocked:value.document.isLocked,page:value.page,pageSize:value.pageSize};
}
export const detailSchema=detailBase.superRefine((value,ctx)=>{
 const lines=[...value.purchaseOrderLines,...value.inboundRequestLines];
 try{if(value.itemDisplayContext?.kind==="purchase-requests")throw Error("Invalid document kind");if(value.purchaseOrderLines.length&&value.inboundRequestLines.length)throw Error("Mixed document kind");
  // Absence is already unavailable. Never synthesize/requalify an optional paged supplement.
  if(value.itemDisplayContext!=null)bindItemDisplayContext(value.itemDisplayContext,detailBinding(value),lines);}
 catch{ctx.addIssue({code:z.ZodIssueCode.custom,message:"Invalid item display context"});}
}); // Older absent/null supplements are explicitly unavailable to itemDisplayFor; keep their wire shape.

export type Session=z.infer<typeof sessionSchema>;export type WorkspaceData=z.infer<typeof workspaceSchema>&{sessionScope?:string;readScope?:string};export type DocumentRow=z.infer<typeof rowSchema>;export type DocumentPage=z.infer<typeof pageSchema>;export type DocumentDetail=z.infer<typeof detailSchema>;export type DocumentKind="purchase-orders"|"inbound-requests";
