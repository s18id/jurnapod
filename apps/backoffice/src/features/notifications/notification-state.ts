// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  isNotificationLayer,
  isNotificationSource,
  isNotificationType,
  sanitizeNotifications,
  trimNotifications,
  type BackofficeNotification,
} from "@/features/notifications/notification-types";

export type NotificationState = {
  notifications: BackofficeNotification[];
  storageKey: string | null;
  bannerAcknowledgements: Record<string, true>;
};

export type NotificationAction =
  | { type: "hydrate"; notifications: BackofficeNotification[]; storageKey: string }
  | { type: "add"; notification: BackofficeNotification }
  | { type: "markRead"; id: string }
  | { type: "markAllRead" }
  | { type: "delete"; id: string }
  | { type: "clear" }
  | { type: "bannerAcknowledge"; id: string }
  | { type: "clearBanner"; id: string };

export const initialNotificationState: NotificationState = {
  notifications: [],
  storageKey: null,
  bannerAcknowledgements: {},
};

export function notificationReducer(
  state: NotificationState,
  action: NotificationAction,
): NotificationState {
  switch (action.type) {
    case "hydrate":
      return {
        notifications: sanitizeNotifications(action.notifications),
        storageKey: action.storageKey,
        bannerAcknowledgements: {},
      };
    case "add":
      return addNotification(state, action.notification);
    case "markRead":
      return {
        ...state,
        notifications: state.notifications.map((notification) =>
          notification.id === action.id ? { ...notification, read: true } : notification,
        ),
      };
    case "markAllRead":
      return {
        ...state,
        notifications: state.notifications.map((notification) => ({ ...notification, read: true })),
      };
    case "delete":
      return {
        ...state,
        notifications: state.notifications.filter((notification) => notification.id !== action.id),
      };
    case "clear":
      return {
        ...state,
        notifications: [],
        bannerAcknowledgements: {},
      };
    case "bannerAcknowledge":
      return {
        ...state,
        bannerAcknowledgements: { ...state.bannerAcknowledgements, [action.id]: true },
        notifications: state.notifications.map((notification) =>
          notification.id === action.id ? { ...notification, read: true } : notification,
        ),
      };
    case "clearBanner":
      return {
        ...state,
        notifications: state.notifications.filter((notification) => notification.id !== action.id),
        bannerAcknowledgements: Object.fromEntries(
          Object.entries(state.bannerAcknowledgements).filter(([id]) => id !== action.id),
        ),
      };
    default:
      return state;
  }
}

function addNotification(state: NotificationState, notification: BackofficeNotification): NotificationState {
  const existing = state.notifications.find((item) => item.id === notification.id);
  if (existing) {
    if (notification.layer !== "banner") return state;
    const notifications = state.notifications.map((item) =>
      item.id === notification.id ? { ...notification, read: false } : item,
    );
    return {
      ...state,
      notifications: trimNotifications(notifications),
      bannerAcknowledgements: Object.fromEntries(
        Object.entries(state.bannerAcknowledgements).filter(([id]) => id !== notification.id),
      ),
    };
  }

  return {
    ...state,
    notifications: trimNotifications([notification, ...state.notifications]),
  };
}

export function getUnreadNotificationCount(notifications: BackofficeNotification[]): number {
  return notifications.filter((notification) => notification.layer === "inbox" && !notification.read).length;
}

export function getActiveBanner(state: NotificationState): BackofficeNotification | null {
  return state.notifications
    .filter((notification) =>
      notification.layer === "banner" && !notification.read && !state.bannerAcknowledgements[notification.id],
    )
    .sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;
}

export function parseStoredNotifications(raw: string | null): BackofficeNotification[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sanitizeNotifications(parsed.filter(isStoredNotification));
  } catch {
    return [];
  }
}

function isStoredNotification(value: unknown): value is BackofficeNotification {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.message === "string" &&
    isNotificationType(record.type) &&
    typeof record.timestamp === "number" &&
    typeof record.read === "boolean" &&
    isNotificationLayer(record.layer) &&
    isNotificationSource(record.source) &&
    isStoredDeepLink(record.deepLink)
  );
}

function isStoredDeepLink(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.path !== "string") return false;
  if (record.params === undefined) return true;
  if (typeof record.params !== "object" || record.params === null) return false;
  return Object.values(record.params as Record<string, unknown>).every((paramValue) => typeof paramValue === "string");
}
