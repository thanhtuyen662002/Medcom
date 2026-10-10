import { z } from "zod";

export const erpFieldDefinitionSchema = z.object({
  name: z.string(),
  column: z.string(),
  sqlType: z.string(),
  typeArguments: z.string().nullable().optional(),
  nullable: z.boolean(),
  ordinal: z.number().int(),
  hasDefault: z.boolean(),
  writable: z.boolean(),
});
export type ErpFieldDefinition = z.infer<typeof erpFieldDefinitionSchema>;

export const erpLookupDefinitionSchema = z.object({
  id: z.string(),
  grid: z.string().nullable().optional(),
  field: z.string(),
  valueField: z.string(),
  displayField: z.string(),
  linkedFields: z.string().nullable().optional(),
  parameters: z.string().nullable().optional(),
  requiredParameters: z.string().nullable().optional(),
  multiSelect: z.boolean(),
  disabled: z.boolean(),
  sourceHash: z.string(),
});
export type ErpLookupDefinition = z.infer<typeof erpLookupDefinitionSchema>;

export const erpActionDefinitionSchema = z.object({
  id: z.string(),
  caption: z.string(),
  control: z.string(),
  operation: z.string(),
  lockExpression: z.string().nullable().optional(),
  nativeVisible: z.boolean(),
  requiresSavedDocument: z.boolean(),
  evidence: z.string(),
});
export type ErpActionDefinition = z.infer<typeof erpActionDefinitionSchema>;

export const erpActionStateSchema = z.object({
  id: z.string(),
  caption: z.string(),
  visible: z.boolean(),
  enabled: z.boolean(),
  reason: z.string().nullable().optional(),
  requiresSavedDocument: z.boolean(),
  route: z.string().nullable().optional(),
});
export type ErpActionState = z.infer<typeof erpActionStateSchema>;

export const erpScreenDescriptionSchema = z.object({
  id: z.string(),
  caption: z.string(),
  menuId: z.string(),
  formId: z.string(),
  fields: z.record(z.string(), z.array(erpFieldDefinitionSchema)),
  actions: z.array(erpActionDefinitionSchema),
  lookups: z.array(erpLookupDefinitionSchema),
  evidence: z.string(),
});
export type ErpScreenDescription = z.infer<typeof erpScreenDescriptionSchema>;

export const erpDocumentRowSchema = z.object({
  documentId: z.string().min(1),
  header: z.record(z.string(), z.unknown()),
});
export type ErpDocumentRow = z.infer<typeof erpDocumentRowSchema>;

export const erpDocumentPageSchema = z.object({
  rows: z.array(erpDocumentRowSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  hasMore: z.boolean(),
});
export type ErpDocumentPage = z.infer<typeof erpDocumentPageSchema>;

export const erpLineRowSchema = z.object({
  lineId: z.string(),
  fields: z.record(z.string(), z.unknown()),
});
export type ErpLineRow = z.infer<typeof erpLineRowSchema>;

export const erpLinePageSchema = z.object({
  rows: z.array(erpLineRowSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  hasMore: z.boolean(),
});
export type ErpLinePage = z.infer<typeof erpLinePageSchema>;

export const erpDocumentDetailSchema = z.object({
  documentId: z.string().min(1),
  branchId: z.string(),
  stateToken: z.string(),
  header: z.record(z.string(), z.unknown()),
  lines: erpLinePageSchema,
  history: erpLinePageSchema.nullable().optional(),
  comparison: erpLinePageSchema.nullable().optional(),
  actions: z.array(erpActionStateSchema),
});
export type ErpDocumentDetail = z.infer<typeof erpDocumentDetailSchema>;

export const erpChoiceSchema = z.object({
  id: z.string(),
  label: z.string().nullable().optional(),
  fields: z.record(z.string(), z.unknown()),
});
export type ErpChoice = z.infer<typeof erpChoiceSchema>;

export const erpChoicePageSchema = z.object({
  items: z.array(erpChoiceSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  hasMore: z.boolean(),
  requiredParameters: z.array(z.string()),
});
export type ErpChoicePage = z.infer<typeof erpChoicePageSchema>;

export const erpAllocatedLineSchema = z.object({
  clientLineKey: z.string(),
  lineId: z.string(),
});
export type ErpAllocatedLine = z.infer<typeof erpAllocatedLineSchema>;

export const erpCommandReceiptSchema = z.object({
  module: z.string(),
  operation: z.string(),
  idempotencyKey: z.string(),
  documentId: z.string(),
  stateToken: z.string().nullable().optional(),
  auditId: z.string(),
  deleted: z.boolean(),
  allocatedLines: z.array(erpAllocatedLineSchema),
});
export type ErpCommandReceipt = z.infer<typeof erpCommandReceiptSchema>;

export const erpCommandOutcomeSchema = z.enum([
  "Committed",
  "Replayed",
  "InvalidInput",
  "Denied",
  "Conflict",
  "QualificationRequired",
  "Unavailable",
  "OutcomeUnknown",
  "Cancelled",
]);
export type ErpCommandOutcome = z.infer<typeof erpCommandOutcomeSchema>;

export const erpCommandResultSchema = z.object({
  outcome: erpCommandOutcomeSchema,
  code: z.string().nullable().optional(),
  receipt: erpCommandReceiptSchema.nullable().optional(),
});
export type ErpCommandResult = z.infer<typeof erpCommandResultSchema>;

export const erpDraftSelectionSchema = z.object({
  lines: z.array(
    z.object({
      clientLineKey: z.string(),
      values: z.record(z.string(), z.unknown()),
    })
  ),
  headerPatch: z.record(z.string(), z.unknown()),
  sourceEvidence: z.string(),
  revalidatedOnSave: z.boolean(),
});
export type ErpDraftSelection = z.infer<typeof erpDraftSelectionSchema>;

export const erpContractInfoSchema = z.object({
  contractId: z.string(),
  contractNo: z.string().nullable().optional(),
  contractDate: z.string().nullable().optional(),
  objectId: z.string().nullable().optional(),
  objectName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  totalAmount: z.string().nullable().optional(),
}).passthrough();
export type ErpContractInfo = z.infer<typeof erpContractInfoSchema>;

export const erpCommandObservationSchema = z.object({
  outcome: z.string(),
  receipt: erpCommandReceiptSchema.nullable().optional(),
});
export type ErpCommandObservation = z.infer<typeof erpCommandObservationSchema>;
