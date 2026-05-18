import { beforeEach, describe, expect, it, vi } from "vitest";

const apiClientMock = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  getApiBaseUrl: vi.fn(() => "https://api.example.test"),
}));

const operationsMock = vi.hoisted(() => ({
  fetchOperationsList: vi.fn(),
}));

const auditMock = vi.hoisted(() => ({
  fetchAuditLogs: vi.fn(),
}));

vi.mock("@/lib/api-client", () => apiClientMock);
vi.mock("@/hooks/use-operations-list", () => operationsMock);
vi.mock("@/features/audit/api", () => auditMock);

import {
  NOTIFICATION_POLL_INTERVAL_MS,
  buildNotificationSseUrl,
  deliverDedupedNotifications,
  handleNotificationSseMessage,
  pollAuditNotifications,
  pollHealthNotification,
  pollOperationNotifications,
} from "@/hooks/use-notification-source";
import type { BackofficeNotification } from "@/features/notifications/notification-types";

function makeNotification(overrides: Partial<BackofficeNotification> = {}): BackofficeNotification {
  return {
    id: "polling.operation.op-1.completed",
    title: "Operation completed",
    message: "Operation op-1 completed.",
    type: "success",
    timestamp: 1_800_000_000_000,
    read: false,
    layer: "inbox",
    source: "polling",
    ...overrides,
  };
}

beforeEach(() => {
  apiClientMock.apiRequest.mockReset();
  apiClientMock.getApiBaseUrl.mockReset();
  apiClientMock.getApiBaseUrl.mockReturnValue("https://api.example.test");
  operationsMock.fetchOperationsList.mockReset();
  auditMock.fetchAuditLogs.mockReset();
});

describe("use-notification-source helpers", () => {
  it("uses the canonical polling interval and API base URL for gated SSE", () => {
    expect(NOTIFICATION_POLL_INTERVAL_MS).toBe(15_000);
    expect(buildNotificationSseUrl()).toBe("https://api.example.test/notifications/stream");
  });

  it("normalizes SSE message payloads and discards malformed messages", () => {
    const onNotification = vi.fn();
    handleNotificationSseMessage("not-json", onNotification);
    expect(onNotification).not.toHaveBeenCalled();

    handleNotificationSseMessage(JSON.stringify({
      notificationId: "sse-1",
      title: "Done",
      message: "Import completed",
      type: "success",
      timestamp: 1_800_000_000_000,
      layer: "inbox",
      deepLink: { path: "/operations", params: { operationId: "op-1" } },
    }), onNotification);

    expect(onNotification).toHaveBeenCalledWith(expect.objectContaining({
      id: "sse-1",
      layer: "inbox",
      source: "sse",
    }));
  });

  it("deduplicates non-banner notifications and clears resolved backend banners", () => {
    const seen = new Set<string>();
    const onNotification = vi.fn();
    const onClearBanner = vi.fn();
    const notification = makeNotification();

    deliverDedupedNotifications([notification, notification], seen, onNotification, onClearBanner);

    expect(onNotification).toHaveBeenCalledTimes(1);
    expect(onClearBanner).toHaveBeenCalledWith("polling.banner.backend-unreachable");
  });

  it("keeps active backend-unreachable banners until polling resolves them", () => {
    const onNotification = vi.fn();
    const onClearBanner = vi.fn();
    deliverDedupedNotifications([
      makeNotification({
        id: "polling.banner.backend-unreachable",
        title: "Backend unreachable",
        message: "Backend connection lost — retrying...",
        type: "error",
        layer: "banner",
      }),
    ], new Set(), onNotification, onClearBanner);

    expect(onNotification).toHaveBeenCalledTimes(1);
    expect(onClearBanner).not.toHaveBeenCalled();
  });
});

describe("notification polling sources", () => {
  it("normalizes health failures into a backend-unreachable banner", async () => {
    apiClientMock.apiRequest.mockRejectedValueOnce(new Error("offline"));
    await expect(pollHealthNotification()).resolves.toEqual([
      expect.objectContaining({ id: "polling.banner.backend-unreachable", layer: "banner" }),
    ]);
  });

  it("normalizes completed and failed operations", async () => {
    operationsMock.fetchOperationsList
      .mockResolvedValueOnce({ operations: [{
        operationId: "op-completed",
        type: "import",
        status: "completed",
        updatedAt: "2026-05-19T00:00:00.000Z",
        completedAt: "2026-05-19T00:00:01.000Z",
      }] })
      .mockResolvedValueOnce({ operations: [{
        operationId: "op-failed",
        type: "export",
        status: "failed",
        updatedAt: "2026-05-19T00:00:02.000Z",
        completedAt: null,
      }] });

    await expect(pollOperationNotifications()).resolves.toEqual([
      expect.objectContaining({ id: "polling.operation.op-completed.completed", type: "success" }),
      expect.objectContaining({ id: "polling.operation.op-failed.failed", type: "error" }),
    ]);
  });

  it("sorts audit polling notifications newest-first before normalization", async () => {
    auditMock.fetchAuditLogs.mockResolvedValueOnce({
      logs: [
        { id: 1, action: "UPDATE", entity_type: "items", entity_id: "old", created_at: "2026-05-19T00:00:00.000Z" },
        { id: 2, action: "UPDATE", entity_type: "items", entity_id: "new", created_at: "2026-05-19T00:00:02.000Z" },
      ],
    });

    await expect(pollAuditNotifications()).resolves.toEqual([
      expect.objectContaining({ id: "polling.audit.2" }),
      expect.objectContaining({ id: "polling.audit.1" }),
    ]);
  });
});
