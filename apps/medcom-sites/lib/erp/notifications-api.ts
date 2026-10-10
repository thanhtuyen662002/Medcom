import { z } from "zod";
import { request, ApiError } from "./api";
import {
  NotificationRowSchema,
  NotificationPageSchema,
  NotificationTargetSchema,
  type NotificationRow,
  type NotificationPage,
  type NotificationTarget,
} from "./notifications-contracts";

let lastKnownReadScope: string | null = null;

export function setNotificationReadScope(scope: string) {
  if (scope && /^[a-f0-9]{64}$/.test(scope)) {
    lastKnownReadScope = scope;
  }
}

export function getNotificationReadScope(): string | null {
  return lastKnownReadScope;
}

const csrfToken = async (): Promise<string> => {
  const result = await request("api/auth/csrf", z.object({ token: z.string().min(1) }));
  return result.token;
};

/**
 * Fetch list of private notifications for the current ERP user (22 columns).
 */
export async function getNotificationsList(
  params?: { page?: number; pageSize?: number; unreadOnly?: boolean },
  signal?: AbortSignal
): Promise<NotificationPage> {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 30;
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  if (params?.unreadOnly !== undefined) {
    query.set("unreadOnly", String(params.unreadOnly));
  }

  const envelope = z.object({
    readScope: z.string(),
    data: NotificationPageSchema,
  });

  const res = await request(
    `api/notifications?${query.toString()}`,
    envelope,
    { signal },
    (response) => {
      const scope = response.headers.get("X-Medcom-Read-Scope");
      if (scope) setNotificationReadScope(scope);
    }
  );

  if (res.readScope) {
    setNotificationReadScope(res.readScope);
  }

  return res.data;
}

/**
 * Fetch detail of a single notification belonging to the current user.
 */
export async function getNotificationDetail(
  id: number,
  signal?: AbortSignal
): Promise<NotificationRow> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, "invalid_notification_id");
  }

  const envelope = z.object({
    readScope: z.string(),
    data: NotificationRowSchema,
  });

  const res = await request(
    `api/notifications/${id}`,
    envelope,
    { signal },
    (response) => {
      const scope = response.headers.get("X-Medcom-Read-Scope");
      if (scope) setNotificationReadScope(scope);
    }
  );

  if (res.readScope) {
    setNotificationReadScope(res.readScope);
  }

  return res.data;
}

/**
 * Verify document authority and resolve target navigation info for a notification.
 */
export async function getNotificationTarget(
  id: number,
  signal?: AbortSignal
): Promise<NotificationTarget> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, "invalid_notification_id");
  }

  const envelope = z.object({
    readScope: z.string(),
    data: NotificationTargetSchema,
  });

  const res = await request(
    `api/notifications/${id}/target`,
    envelope,
    { signal },
    (response) => {
      const scope = response.headers.get("X-Medcom-Read-Scope");
      if (scope) setNotificationReadScope(scope);
    }
  );

  if (res.readScope) {
    setNotificationReadScope(res.readScope);
  }

  return res.data;
}

/**
 * Mark a notification as read (isView=true) or unread (isView=false).
 */
export async function markNotificationRead(
  id: number,
  isView: boolean,
  signal?: AbortSignal
): Promise<NotificationRow> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, "invalid_notification_id");
  }

  const token = await csrfToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "X-CSRF-TOKEN": token,
  };

  const scope = getNotificationReadScope();
  if (scope) {
    headers["X-Medcom-Read-Scope"] = scope;
  }

  const envelope = z.object({
    readScope: z.string(),
    data: NotificationRowSchema,
  });

  const res = await request(
    `api/notifications/${id}/read`,
    envelope,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ isView }),
      signal,
    },
    (response) => {
      const nextScope = response.headers.get("X-Medcom-Read-Scope");
      if (nextScope) setNotificationReadScope(nextScope);
    }
  );

  if (res.readScope) {
    setNotificationReadScope(res.readScope);
  }

  return res.data;
}
