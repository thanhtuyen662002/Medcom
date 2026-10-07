import { z } from "zod";

export const sessionSchema = z.object({
  displayName: z.string().min(1).max(250), tenantId: z.string().min(1).max(250),
  companyId: z.string().min(1).max(250), companyName: z.string().min(1).max(250),
  authorityVersion: z.number().int().positive(), idleExpiresAt: z.string().datetime({ offset: true }),
  absoluteExpiresAt: z.string().datetime({ offset: true }), capabilities: z.array(z.string().max(100)).max(256),
}).strict();
export const workspaceSchema = z.object({ session: sessionSchema,
  navigation: z.array(z.object({ id: z.string(), label: z.string(), href: z.enum(["/workspace/", "/workspace/?screen=purchase-orders", "/workspace/?screen=purchase-requests", "/workspace/?screen=inbound-requests"]) }).strict()),
  branchIds: z.array(z.string().min(1).max(50)).max(200).default([]),
}).strict();
export const healthSchema = z.object({ status: z.literal("not_ready"), checks: z.array(
  z.object({ component: z.enum(["process", "database", "legacy_adapter", "business_release"]),
    status: z.enum(["healthy", "not_configured", "unavailable"]) }).strict()),
}).strict();
export type Session = z.infer<typeof sessionSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type Health = z.infer<typeof healthSchema>;

export const documentPageSchema = z.object({
  rows: z.array(z.object({ documentId: z.string().min(1).max(50), documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    branchId: z.string().min(1).max(50), statusId: z.number().int().nullable(), statusName: z.string().max(100).nullable().optional(), isLocked: z.boolean().nullable() }).strict()).max(100),
  page: z.number().int().min(1).max(1000), pageSize: z.number().int().min(1).max(100), hasMore: z.boolean(),
}).strict();
export type DocumentKind = "purchase-orders" | "inbound-requests";
const quantitySchema = z.string().regex(/^-?\d{1,28}(?:\.\d{1,4})?$/).max(34).nullable();
const lineSchema = z.object({ lineId: z.string().min(1).max(50), itemId: z.string().min(1).max(50) });
export const documentDetailSchema = z.object({
  document: documentPageSchema.shape.rows.element,
  purchaseOrderLines: z.array(lineSchema.extend({ quantity: quantitySchema, quantity2: quantitySchema }).strict()).max(100),
  inboundRequestLines: z.array(lineSchema.extend({ setQuantityByDocument: quantitySchema, barrelQuantityByDocument: quantitySchema,
    setQuantityByReal: quantitySchema, barrelQuantityByReal: quantitySchema }).strict()).max(100),
  page: z.number().int().min(1).max(1000), pageSize: z.number().int().min(1).max(100), hasMore: z.boolean(),
}).strict().refine(value => value.purchaseOrderLines.length === 0 || value.inboundRequestLines.length === 0);
