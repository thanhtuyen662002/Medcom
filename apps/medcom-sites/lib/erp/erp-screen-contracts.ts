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

// Quyền màn hình theo phiên ERP hiện tại (GET /api/erp/permissions).
// Không có enabled theo chứng từ: enabled lấy theo từng phiếu ở /actions.
export const erpCrudPermissionSchema = z.object({
  canRead: z.boolean(),
  canCreate: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
}).strict();
export type ErpCrudPermission = z.infer<typeof erpCrudPermissionSchema>;
export const erpActionPermissionSchema = z.object({
  id: z.string(),
  caption: z.string(),
  visible: z.boolean(),
  requiresSavedDocument: z.boolean(),
  route: z.string().nullable(),
}).strict();
export type ErpActionPermission = z.infer<typeof erpActionPermissionSchema>;
export const erpScreenPermissionSchema = z.object({
  module: z.string(),
  caption: z.string(),
  canView: z.boolean(),
  crud: erpCrudPermissionSchema,
  actions: z.array(erpActionPermissionSchema),
}).strict();
export type ErpScreenPermission = z.infer<typeof erpScreenPermissionSchema>;
export const erpPermissionsSchema = z.object({
  branchId: z.string(),
  screens: z.array(erpScreenPermissionSchema),
}).strict();
export type ErpPermissions = z.infer<typeof erpPermissionsSchema>;

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

export const erpDocumentRowSchema = z
  .object({
    documentId: z.string().optional(),
    header: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
  .transform((data) => {
    const raw = data as Record<string, unknown>;
    const docId =
      data.documentId ||
      String(
        raw.documentId ||
          raw.purchaseRequestId ||
          raw.batchId ||
          raw.orderNumber ||
          raw.voucherNo ||
          raw.documentNo ||
          raw.id ||
          ""
      );
    const header: Record<string, unknown> = data.header ? { ...raw, ...data.header } : { ...raw };
    return {
      ...raw,
      documentId: docId,
      header,
    };
  });
export type ErpDocumentRow = z.infer<typeof erpDocumentRowSchema>;

export const erpDocumentPageSchema = z
  .object({
    rows: z.array(erpDocumentRowSchema).default([]),
    page: z.number().int().default(1),
    pageSize: z.number().int().default(20),
    hasMore: z.boolean().default(false),
  })
  .passthrough();
export type ErpDocumentPage = z.infer<typeof erpDocumentPageSchema>;

export const erpLineRowSchema = z
  .object({
    lineId: z.string().optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
  .transform((data) => {
    const raw = data as Record<string, unknown>;
    const lineId = data.lineId || String(raw.lineId || raw.id || raw.itemCode || raw.itemId || "");
    const fields: Record<string, unknown> = data.fields ? { ...raw, ...data.fields } : { ...raw };
    return {
      ...raw,
      lineId,
      fields,
    };
  });
export type ErpLineRow = z.infer<typeof erpLineRowSchema>;

export const erpLinePageSchema = z
  .object({
    rows: z.array(erpLineRowSchema).default([]),
    page: z.number().int().default(1),
    pageSize: z.number().int().default(20),
    hasMore: z.boolean().default(false),
  })
  .passthrough();
export type ErpLinePage = z.infer<typeof erpLinePageSchema>;

export const erpDocumentDetailSchema = z
  .object({
    documentId: z.string().optional(),
    branchId: z.string().optional(),
    stateToken: z.string().nullable().optional(),
    header: z.record(z.string(), z.unknown()).optional(),
    lines: erpLinePageSchema.default({ rows: [], page: 1, pageSize: 20, hasMore: false }),
    history: erpLinePageSchema.nullable().optional(),
    comparison: erpLinePageSchema.nullable().optional(),
    // Tổng toàn chứng từ do BE bổ sung (19/10/2026). Giữ dạng record để không
    // làm hỏng phần đọc nếu BE thay đổi kiểu số/chuỗi của từng trường tổng.
    summary: z.record(z.string(), z.unknown()).nullable().optional(),
    actions: z.array(erpActionStateSchema).default([]),
    sections: z.record(z.string(), erpLinePageSchema).nullable().optional(),
    documentName: z.string().nullable().optional(),
    documentReferenceState: z.string().nullable().optional(),
    branchName: z.string().nullable().optional(),
    branchReferenceState: z.string().nullable().optional(),
  })
  .passthrough()
  .transform((data) => {
    const raw = data as Record<string, unknown>;
    const structuralKeys = new Set([
      "lines",
      "actions",
      "sections",
      "header",
      "stateToken",
      "history",
      "comparison",
      "documentName",
      "documentReferenceState",
      "branchName",
      "branchReferenceState",
    ]);
    const sourceHeader = (data.header ?? {}) as Record<string, unknown>;
    const cleanHeader: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sourceHeader)) {
      if (!structuralKeys.has(k)) {
        cleanHeader[k] = v;
      }
    }
    if (!data.header) {
      for (const [k, v] of Object.entries(raw)) {
        if (!structuralKeys.has(k) && (typeof v !== "object" || v === null)) {
          cleanHeader[k] = v;
        }
      }
    }
    const docId =
      data.documentId ||
      String(
        cleanHeader.documentId ||
          cleanHeader.purchaseRequestId ||
          cleanHeader.batchId ||
          cleanHeader.orderNumber ||
          raw.documentId ||
          ""
      );
    const brId =
      data.branchId ||
      String(
        cleanHeader.branchId ||
          cleanHeader.fromBranchId ||
          raw.branchId ||
          ""
      );
    cleanHeader.documentId = docId;
    cleanHeader.branchId = brId;

    return {
      ...data,
      documentId: docId,
      branchId: brId,
      stateToken: data.stateToken ?? "",
      header: cleanHeader,
    };
  });
export type ErpDocumentDetail = z.infer<typeof erpDocumentDetailSchema>;

export const erpItemPriceSchema = z
  .object({
    itemId: z.string().optional(),
    itemCode: z.string().nullable().optional(),
    itemName: z.string().nullable().optional(),
    unit: z.string().nullable().optional(),
    unitPrice: z.union([z.string(), z.number()]).nullable().optional(),
    unitPriceDisplay: z.string().nullable().optional(),
    currencyId: z.string().nullable().optional(),
  })
  .passthrough();
export type ErpItemPrice = z.infer<typeof erpItemPriceSchema>;

export const erpChoiceSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable().optional(),
    label: z.string().nullable().optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
  .transform((data) => {
    const raw = data as Record<string, unknown>;
    const name = data.name || data.label || data.id;
    const label = data.label || data.name || data.id;
    const fields: Record<string, unknown> = data.fields ? { ...raw, ...data.fields } : { ...raw };
    return {
      ...raw,
      id: data.id,
      name,
      label,
      fields,
    };
  });
export type ErpChoice = z.infer<typeof erpChoiceSchema>;

export const erpChoicePageSchema = z.object({
  items: z.array(erpChoiceSchema),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().default(20),
  hasMore: z.boolean().default(false),
  requiredParameters: z.array(z.string()).default([]),
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

export const erpContractInfoSchema = z
  .object({
    documentId: z.string().optional(),
    contract: z.record(z.string(), z.unknown()).optional(),
    contractId: z.string().optional(),
    contractNo: z.string().nullable().optional(),
    contractDate: z.string().nullable().optional(),
    objectId: z.string().nullable().optional(),
    objectName: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    totalAmount: z.string().nullable().optional(),
  })
  .passthrough()
  .transform((data) => {
    const raw = data as Record<string, unknown>;
    const c = (data.contract || {}) as Record<string, unknown>;
    const contractId =
      data.contractId ||
      (c.documentId as string) ||
      (c.contractId as string) ||
      (raw.documentId as string) ||
      "";
    const contractNo =
      data.contractNo ||
      (c.contractNo as string) ||
      (c.ContractName as string) ||
      (c.contractName as string) ||
      contractId;
    const objectName =
      data.objectName ||
      (c.objectName as string) ||
      (c.ObjectName as string) ||
      (c.customerName as string) ||
      null;
    const notes =
      data.notes ||
      (c.notes as string) ||
      (c.Notes as string) ||
      (c.memo as string) ||
      null;
    const totalAmount =
      data.totalAmount ||
      (c.totalAmount as string) ||
      (c.TotalAmount as string) ||
      null;
    return {
      ...raw,
      contractId,
      contractNo,
      objectName,
      notes,
      totalAmount,
      contract: data.contract || raw,
    };
  });
export type ErpContractInfo = z.infer<typeof erpContractInfoSchema>;

export const erpCommandObservationSchema = z.object({
  outcome: z.string(),
  receipt: erpCommandReceiptSchema.nullable().optional(),
});
export type ErpCommandObservation = z.infer<typeof erpCommandObservationSchema>;
