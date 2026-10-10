import {z} from "zod";
import {bindItemDisplayContext,itemDisplayContextSchema,type ItemDisplayBinding} from "./item-display";
const sessionTimestamp=z.string().datetime({offset:true}).refine(value=>Number.isFinite(Date.parse(value)));
export const sessionSchema=z.object({displayName:z.string().min(1).max(250),tenantId:z.string().min(1),companyId:z.string().min(1),companyName:z.string().min(1),authorityVersion:z.number().int().positive(),idleExpiresAt:sessionTimestamp,absoluteExpiresAt:sessionTimestamp,capabilities:z.array(z.string()).max(256)});
export const workspaceSchema=z.object({session:sessionSchema,navigation:z.array(z.object({id:z.string(),label:z.string(),href:z.string()})),branchIds:z.array(z.string()).max(200).default([])});
export const purchaseOrderHeaderSchema = z.object({
  documentId: z.string().min(1).max(30),
  documentDate: z.string(),
  objectId: z.string().min(1).max(100),
  memo: z.string().max(200).nullable(),
  notes: z.string().max(200).nullable(),
  deliverDate: z.string().nullable(),
  currencyId: z.string().min(1).max(3),
  rateExchange: z.number().finite(),
  baseTotal: z.string().nullable(),
  searchField: z.string().max(2000).nullable(),
  isLock: z.boolean(),
  userCreate: z.string().max(50).nullable(),
  userUpdate: z.string().max(50).nullable(),
  dateUpdate: z.string().nullable(),
  dateCreate: z.string().nullable(),
  linkId: z.string().max(50).nullable(),
  contractId: z.string().max(100).nullable(),
  statusId: z.number().int().nullable(),
  branchId: z.string().min(1).max(50)
});

export const purchaseOrderLineFieldsSchema = z.object({
  userAutoId: z.string().min(1).max(40),
  documentId: z.string().min(1).max(30),
  itemId: z.string().min(1).max(50),
  quantity: z.string().nullable(),
  unitPrice: z.string().nullable(),
  sourceAmount: z.string().nullable(),
  amount: z.string().nullable(),
  notes: z.string().max(100).nullable(),
  quantity2: z.string().nullable(),
  property: z.string().max(50).nullable(),
  property2: z.string().max(50).nullable(),
  parentId: z.string().max(50).nullable()
});

export const inboundRequestHeaderSchema = z.object({
  documentId: z.string().min(1).max(50),
  documentDate: z.string(),
  orderNumber: z.string().min(1).max(50),
  branchId: z.string().max(50).nullable(),
  invoiceNo: z.string().min(1).max(50),
  declarationNumber: z.string().max(50).nullable(),
  departurePoint: z.string().max(100),
  destinationPoint: z.string().max(100),
  isRain: z.boolean().nullable(),
  orderTypeId: z.string().max(50),
  objectId: z.string().max(50).nullable(),
  totalPalletQuantityByDocument: z.string().nullable(),
  totalBarrelQuantityByDocument: z.string().nullable(),
  totalPalletQuantityByReal: z.string().nullable(),
  totalBarrelQuantityByReal: z.string().nullable(),
  excessPackageQuantity: z.string().nullable(),
  lackOfPackageQuantity: z.string().nullable(),
  damagedPackageQuantity: z.string().nullable(),
  packageTypeId: z.string().max(50).nullable(),
  isDamageOutsidePackage: z.boolean().nullable(),
  damageDescription: z.string().max(500).nullable(),
  damageInsideStatusId: z.string().max(50).nullable(),
  locationDamageDetectedId: z.string().max(50).nullable(),
  locationDamageDescription: z.string().max(500).nullable(),
  resultDesciption: z.string().nullable(),
  totalQuantityInboundResult: z.string().nullable(),
  goodAwaitingInboundResult: z.string().nullable(),
  resultNote: z.string().max(500).nullable(),
  datetimeRecorded: z.string().nullable(),
  statusId: z.number().int(),
  currencyId: z.string().max(3).nullable(),
  rateExchange: z.string().nullable(),
  imageUrl: z.string().max(255).nullable(),
  bbkcUrl: z.string().max(255).nullable(),
  notes: z.string().max(500).nullable(),
  sendTo: z.string().nullable(),
  qrPrintType: z.string().max(10),
  linkId: z.string().max(50).nullable().optional()
});

export const inboundRequestLineFieldsSchema = z.object({
  userAutoId: z.string().min(1).max(50),
  documentId: z.string().min(1).max(50),
  contractId: z.string().max(100).nullable(),
  itemId: z.string().min(1).max(50),
  hangSX: z.string().max(100).nullable(),
  unitFactor: z.number().finite().nullable(),
  unit2: z.string().max(50).nullable(),
  additional: z.boolean().nullable(),
  lotNumberByDocument: z.string().max(50).nullable(),
  setQuantityByDocument: z.string().nullable(),
  barrelQuantityByDocument: z.string().nullable(),
  expireDateByDocument: z.string().nullable(),
  lotNumberByReal: z.string().max(50).nullable(),
  setQuantityByReal: z.string().nullable(),
  barrelQuantityByReal: z.string().nullable(),
  expireDateByReal: z.string().nullable(),
  sourceAmount: z.string().nullable(),
  unitPrice: z.string().nullable(),
  amount: z.string().nullable(),
  randomTestQuantity: z.string().nullable(),
  testStatus: z.string().max(100).nullable(),
  noPalletNote: z.string().max(500).nullable(),
  palletNote: z.string().max(500).nullable(),
  checkerNote: z.string().max(500).nullable(),
  itemCode: z.string().max(50).nullable(),
  parentId: z.string().max(50).nullable().optional()
});

export const rowSchema=z.object({
  documentId:z.string().min(1).max(50),
  documentDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId:z.string().min(1),
  statusId:z.number().int().nullable(),
  statusName:z.string().max(100).nullable().optional(),
  isLocked:z.boolean().nullable(),
  purchaseOrderHeader:purchaseOrderHeaderSchema.optional(),
  inboundRequestHeader:inboundRequestHeaderSchema.optional()
});
export const pageSchema=z.object({rows:z.array(rowSchema).max(100),page:z.number().int().positive(),pageSize:z.number().int().positive().max(100),hasMore:z.boolean()});
const decimal=z.string().regex(/^-?\d{1,28}(?:\.\d{1,4})?$/).nullable();const line=z.object({lineId:z.string(),itemId:z.string()});
const detailBase=z.object({
  itemDisplayContext:itemDisplayContextSchema.nullable().optional(),
  document:rowSchema,
  purchaseOrderLines:z.array(line.extend({quantity:decimal,quantity2:decimal,fields:purchaseOrderLineFieldsSchema.optional()})).max(100),
  inboundRequestLines:z.array(line.extend({setQuantityByDocument:decimal,barrelQuantityByDocument:decimal,setQuantityByReal:decimal,barrelQuantityByReal:decimal,fields:inboundRequestLineFieldsSchema.optional()})).max(100),
  page:z.number().int().positive(),
  pageSize:z.number().int().positive().max(100),
  hasMore:z.boolean()
}).strict();
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

export type Session=z.infer<typeof sessionSchema>;
export type WorkspaceData=z.infer<typeof workspaceSchema>&{sessionScope?:string;readScope?:string};
export type PurchaseOrderHeader=z.infer<typeof purchaseOrderHeaderSchema>;
export type PurchaseOrderLineFields=z.infer<typeof purchaseOrderLineFieldsSchema>;
export type InboundRequestHeader=z.infer<typeof inboundRequestHeaderSchema>;
export type InboundRequestLineFields=z.infer<typeof inboundRequestLineFieldsSchema>;
export type DocumentRow=z.infer<typeof rowSchema>;
export type DocumentPage=z.infer<typeof pageSchema>;
export type DocumentDetail=z.infer<typeof detailSchema>;
export type DocumentKind="purchase-orders"|"inbound-requests";
