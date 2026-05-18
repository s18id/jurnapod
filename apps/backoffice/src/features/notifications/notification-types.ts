// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export const NOTIFICATION_TYPES = ["info", "success", "warning", "error"] as const;
export const NOTIFICATION_LAYERS = ["toast", "inbox", "banner"] as const;
export const NOTIFICATION_SOURCES = ["sse", "polling", "client"] as const;
export const MAX_PERSISTED_NOTIFICATIONS = 100;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationLayer = (typeof NOTIFICATION_LAYERS)[number];
export type NotificationSource = (typeof NOTIFICATION_SOURCES)[number];

export type NotificationDeepLink = {
  path: string;
  params?: Record<string, string>;
};

export interface BackofficeNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  timestamp: number;
  read: boolean;
  layer: NotificationLayer;
  source: NotificationSource;
  deepLink?: NotificationDeepLink;
}

export interface NotificationEventPayload {
  notificationId: string;
  title: string;
  message: string;
  type: NotificationType;
  timestamp: number;
  layer: NotificationLayer;
  deepLink?: NotificationDeepLink;
}

export type OperationStatusForNotification = "completed" | "failed" | "cancelled";

export type OperationNotificationInput = {
  operationId: string;
  type?: string;
  status: OperationStatusForNotification;
  updatedAt?: string | null;
  completedAt?: string | null;
};

export type AuditNotificationInput = {
  id: number | string;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  created_at?: string | null;
};

export type HealthNotificationInput = {
  reachable: boolean;
  status?: string;
  timestamp?: number;
};

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function isNotificationLayer(value: unknown): value is NotificationLayer {
  return typeof value === "string" && (NOTIFICATION_LAYERS as readonly string[]).includes(value);
}

export function isNotificationSource(value: unknown): value is NotificationSource {
  return typeof value === "string" && (NOTIFICATION_SOURCES as readonly string[]).includes(value);
}

export function makeNotificationStorageKey(companyId: number, userId: number): string {
  return `jurnapod.notifications.${companyId}.${userId}`;
}

export function currentUiEpochMs(): number {
  const performanceClock = globalThis.performance;
  if (performanceClock && Number.isFinite(performanceClock.timeOrigin)) {
    return Math.floor(performanceClock.timeOrigin + performanceClock.now());
  }

  // UI-only fallback for representational notification timestamps.
  return Date.now();
}

export function parseNotificationTimestamp(value: unknown, fallbackMs: number = currentUiEpochMs()): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallbackMs;
}

export function sanitizeNotification(notification: BackofficeNotification): BackofficeNotification {
  return {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    timestamp: notification.timestamp,
    read: notification.read,
    layer: notification.layer,
    source: notification.source,
    deepLink: notification.deepLink
      ? {
          path: notification.deepLink.path,
          params: notification.deepLink.params ? { ...notification.deepLink.params } : undefined,
        }
      : undefined,
  };
}

export function sanitizeNotifications(notifications: BackofficeNotification[]): BackofficeNotification[] {
  return trimNotifications(notifications.map(sanitizeNotification));
}

export function trimNotifications(
  notifications: BackofficeNotification[],
  maxEntries: number = MAX_PERSISTED_NOTIFICATIONS,
): BackofficeNotification[] {
  if (notifications.length <= maxEntries) return notifications;

  const sorted = [...notifications].sort((left, right) => right.timestamp - left.timestamp);
  const unread = sorted.filter((notification) => !notification.read);
  const read = sorted.filter((notification) => notification.read);

  if (unread.length >= maxEntries) {
    return unread.slice(0, maxEntries);
  }

  return [...unread, ...read.slice(0, maxEntries - unread.length)].sort(
    (left, right) => right.timestamp - left.timestamp,
  );
}

export function buildNotificationHash(deepLink: NotificationDeepLink): string {
  const path = deepLink.path.startsWith("#") ? deepLink.path.slice(1) : deepLink.path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const params = new URLSearchParams(deepLink.params ?? {});
  const query = params.toString();
  return query ? `#${normalizedPath}?${query}` : `#${normalizedPath}`;
}

export function buildAuditDeepLink(entityType: string, entityId: string): NotificationDeepLink {
  return {
    path: "/audit",
    params: {
      objectType: entityType,
      objectId: entityId,
    },
  };
}

export function normalizeNotificationEvent(value: unknown): BackofficeNotification | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.notificationId !== "string" ||
    typeof record.title !== "string" ||
    typeof record.message !== "string" ||
    !isNotificationType(record.type) ||
    !isNotificationLayer(record.layer)
  ) {
    return null;
  }

  const deepLink = normalizeDeepLink(record.deepLink);
  return {
    id: record.notificationId,
    title: record.title,
    message: record.message,
    type: record.type,
    timestamp: parseNotificationTimestamp(record.timestamp),
    read: false,
    layer: record.layer,
    source: "sse",
    deepLink: deepLink ?? undefined,
  };
}

function normalizeDeepLink(value: unknown): NotificationDeepLink | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.path !== "string") return null;
  const params: Record<string, string> = {};
  if (typeof record.params === "object" && record.params !== null) {
    for (const [key, paramValue] of Object.entries(record.params as Record<string, unknown>)) {
      if (typeof paramValue === "string") params[key] = paramValue;
    }
  }
  return { path: record.path, params: Object.keys(params).length > 0 ? params : undefined };
}

export function normalizeOperationNotification(input: OperationNotificationInput): BackofficeNotification {
  const operationLabel = input.type ? `${input.type} operation` : "Operation";
  const statusLabel = input.status === "completed" ? "completed" : input.status;
  return {
    id: `polling.operation.${input.operationId}.${input.status}`,
    title: `${operationLabel} ${statusLabel}`,
    message: `${operationLabel} ${input.operationId} ${statusLabel}.`,
    type: input.status === "completed" ? "success" : "error",
    timestamp: parseNotificationTimestamp(input.completedAt ?? input.updatedAt),
    read: false,
    layer: "inbox",
    source: "polling",
    deepLink: {
      path: "/operations",
      params: { operationId: input.operationId },
    },
  };
}

export function normalizeAuditNotification(input: AuditNotificationInput): BackofficeNotification | null {
  if (!input.entity_type || !input.entity_id) return null;
  return {
    id: `polling.audit.${input.id}`,
    title: "Audit entry created",
    message: `${input.action} recorded for ${input.entity_type} ${input.entity_id}.`,
    type: "info",
    timestamp: parseNotificationTimestamp(input.created_at),
    read: false,
    layer: "inbox",
    source: "polling",
    deepLink: buildAuditDeepLink(input.entity_type, input.entity_id),
  };
}

export function normalizeHealthNotification(input: HealthNotificationInput): BackofficeNotification | null {
  if (input.reachable && input.status !== "unhealthy") return null;
  return {
    id: "polling.banner.backend-unreachable",
    title: "Backend unreachable",
    message: "Backend connection lost — retrying...",
    type: "error",
    timestamp: input.timestamp ?? currentUiEpochMs(),
    read: false,
    layer: "banner",
    source: "polling",
  };
}
