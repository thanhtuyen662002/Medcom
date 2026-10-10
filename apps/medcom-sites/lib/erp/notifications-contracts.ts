import { z } from "zod";

/**
 * All 22 current SY_NotifyMsgTbl columns, including nullable values.
 * Calendar timestamps retain SQL wall-clock values (yyyy-MM-ddTHH:mm:ss).
 */
export const NotificationRowSchema = z.object({
  id: z.number().int().positive(),
  fromUserId: z.string(),
  toUserId: z.string(),
  title: z.string(),
  message: z.string(),
  msgTime: z.string(),
  notifyType: z.string(),
  colorHex: z.string().nullable(),
  sourceSystem: z.string(),
  erpFormName: z.string().nullable(),
  webFormName: z.string().nullable(),
  webRoute: z.string().nullable(),
  documentId: z.string().nullable(),
  orderNo: z.string().nullable(),
  statusId: z.number().int().nullable(),
  isView: z.boolean(),
  viewDate: z.string().nullable(),
  isActive: z.boolean(),
  showErp: z.boolean(),
  showWeb: z.boolean(),
  expireAt: z.string().nullable(),
  eventKey: z.string().nullable(),
});

export type NotificationRow = z.infer<typeof NotificationRowSchema>;

export const NotificationPageSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalRows: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
  rows: z.array(NotificationRowSchema),
});

export type NotificationPage = z.infer<typeof NotificationPageSchema>;

export const NotificationTargetSchema = z.object({
  canOpen: z.boolean(),
  reason: z.string().nullable(),
  moduleId: z.string().nullable(),
  formId: z.string().nullable(),
  documentId: z.string().nullable(),
  branchId: z.string().nullable(),
  detailApi: z.string().nullable(),
});

export type NotificationTarget = z.infer<typeof NotificationTargetSchema>;

export const NotificationReadRequestSchema = z.object({
  isView: z.boolean(),
});

export type NotificationReadRequest = z.infer<typeof NotificationReadRequestSchema>;
