import { describe, expect, it } from "vitest";

import {
  getActiveBanner,
  getUnreadNotificationCount,
  initialNotificationState,
  notificationReducer,
  parseStoredNotifications,
} from "@/features/notifications/notification-state";
import {
  buildAuditDeepLink,
  buildNotificationHash,
  makeNotificationStorageKey,
  normalizeAuditNotification,
  normalizeHealthNotification,
  normalizeNotificationEvent,
  normalizeOperationNotification,
  sanitizeNotifications,
  trimNotifications,
  type BackofficeNotification,
} from "@/features/notifications/notification-types";

function makeNotification(overrides: Partial<BackofficeNotification> = {}): BackofficeNotification {
  return {
    id: "n-1",
    title: "Saved",
    message: "Record saved",
    type: "success",
    timestamp: 1_800_000_000_000,
    read: false,
    layer: "inbox",
    source: "client",
    ...overrides,
  };
}

describe("notification utilities", () => {
  it("scopes storage by company_id and user_id", () => {
    expect(makeNotificationStorageKey(10, 20)).toBe("jurnapod.notifications.10.20");
  });

  it("sanitizes persisted notifications to canonical non-PII fields", () => {
    const notification = makeNotification() as BackofficeNotification & { token: string; password: string };
    notification.token = "secret";
    notification.password = "secret";

    const [sanitized] = sanitizeNotifications([notification]);
    expect(sanitized).toEqual(makeNotification());
    expect("token" in sanitized!).toBe(false);
    expect("password" in sanitized!).toBe(false);
  });

  it("evicts oldest read notifications before unread notifications", () => {
    const notifications = Array.from({ length: 102 }, (_, index) => makeNotification({
      id: `n-${index}`,
      timestamp: 1_800_000_000_000 + index,
      read: index < 50,
    }));

    const trimmed = trimNotifications(notifications, 100);
    expect(trimmed).toHaveLength(100);
    expect(trimmed.some((notification) => notification.id === "n-0")).toBe(false);
    expect(trimmed.filter((notification) => !notification.read)).toHaveLength(52);
  });

  it("builds operation, audit, and hash deep links", () => {
    const operation = normalizeOperationNotification({
      operationId: "op-68-3",
      type: "import",
      status: "completed",
      completedAt: "2026-05-19T00:00:00.000Z",
    });
    expect(operation.deepLink).toEqual({ path: "/operations", params: { operationId: "op-68-3" } });

    expect(buildAuditDeepLink("items", "42")).toEqual({
      path: "/audit",
      params: { objectType: "items", objectId: "42" },
    });
    expect(buildNotificationHash({ path: "/audit", params: { objectType: "items", objectId: "42" } }))
      .toBe("#/audit?objectType=items&objectId=42");
  });

  it("normalizes SSE payloads and discards malformed events", () => {
    expect(normalizeNotificationEvent({ notificationId: "sse-1" })).toBeNull();
    expect(normalizeNotificationEvent({
      notificationId: "sse-1",
      title: "Done",
      message: "Completed",
      type: "success",
      timestamp: 1_800_000_000_000,
      layer: "toast",
      deepLink: { path: "/operations", params: { operationId: "op" } },
    })).toMatchObject({ id: "sse-1", source: "sse", layer: "toast" });
  });

  it("normalizes polling health and audit notifications", () => {
    expect(normalizeHealthNotification({ reachable: true, status: "ok" })).toBeNull();
    expect(normalizeHealthNotification({ reachable: false, timestamp: 1_800_000_000_000 }))
      .toMatchObject({ id: "polling.banner.backend-unreachable", layer: "banner", type: "error" });

    expect(normalizeAuditNotification({ id: 7, action: "UPDATE", entity_type: "items", entity_id: "42" }))
      .toMatchObject({ id: "polling.audit.7", deepLink: { path: "/audit" } });
  });
});

describe("notification state reducer", () => {
  it("adds, deduplicates, marks read, deletes, and clears notifications", () => {
    const added = notificationReducer(initialNotificationState, { type: "add", notification: makeNotification() });
    expect(added.notifications).toHaveLength(1);
    expect(notificationReducer(added, { type: "add", notification: makeNotification() }).notifications).toHaveLength(1);
    expect(getUnreadNotificationCount(added.notifications)).toBe(1);

    const read = notificationReducer(added, { type: "markRead", id: "n-1" });
    expect(getUnreadNotificationCount(read.notifications)).toBe(0);

    const deleted = notificationReducer(read, { type: "delete", id: "n-1" });
    expect(deleted.notifications).toHaveLength(0);

    const cleared = notificationReducer(added, { type: "clear" });
    expect(cleared.notifications).toHaveLength(0);
  });

  it("marks all inbox notifications read", () => {
    const state = {
      ...initialNotificationState,
      notifications: [makeNotification({ id: "a" }), makeNotification({ id: "b" })],
    };

    expect(notificationReducer(state, { type: "markAllRead" }).notifications.every((notification) => notification.read)).toBe(true);
  });

  it("acknowledges banners and reopens them when polling reports persistence", () => {
    const banner = makeNotification({ id: "banner-1", layer: "banner", type: "error" });
    const withBanner = notificationReducer(initialNotificationState, { type: "add", notification: banner });
    expect(getActiveBanner(withBanner)?.id).toBe("banner-1");

    const acknowledged = notificationReducer(withBanner, { type: "bannerAcknowledge", id: "banner-1" });
    expect(getActiveBanner(acknowledged)).toBeNull();

    const reopened = notificationReducer(acknowledged, { type: "add", notification: { ...banner, timestamp: banner.timestamp + 1 } });
    expect(getActiveBanner(reopened)?.id).toBe("banner-1");
  });

  it("hydrates from valid persisted JSON and ignores invalid storage", () => {
    expect(parseStoredNotifications("not-json")).toEqual([]);
    expect(parseStoredNotifications(JSON.stringify([makeNotification()]))).toHaveLength(1);
  });

  it("rejects persisted notifications with malformed enum or deep-link fields", () => {
    expect(parseStoredNotifications(JSON.stringify([
      makeNotification({ layer: "invalid" as BackofficeNotification["layer"] }),
      makeNotification({ deepLink: { path: undefined } as unknown as BackofficeNotification["deepLink"] }),
    ]))).toEqual([]);
  });
});
