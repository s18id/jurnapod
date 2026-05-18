// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useRef } from "react";

import { fetchAuditLogs } from "@/features/audit/api";
import {
  currentUiEpochMs,
  normalizeAuditNotification,
  normalizeHealthNotification,
  normalizeNotificationEvent,
  normalizeOperationNotification,
  parseNotificationTimestamp,
  type AuditNotificationInput,
  type BackofficeNotification,
} from "@/features/notifications/notification-types";
import { fetchOperationsList, type OperationListItem } from "@/hooks/use-operations-list";
import { apiRequest, getApiBaseUrl } from "@/lib/api-client";

export const NOTIFICATION_POLL_INTERVAL_MS = 15_000;

type UseNotificationSourceOptions = {
  enabled: boolean;
  pollIntervalMs?: number;
  onNotification: (notification: BackofficeNotification) => void;
  onClearBanner: (id: string) => void;
};

type HealthResponse = {
  status?: string;
  data?: { status?: string };
};

export function isNotificationSseEnabled(): boolean {
  return import.meta.env.VITE_BACKOFFICE_NOTIFICATION_SSE === "1";
}

export function useNotificationSource({
  enabled,
  pollIntervalMs = NOTIFICATION_POLL_INTERVAL_MS,
  onNotification,
  onClearBanner,
}: UseNotificationSourceOptions) {
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    async function poll() {
      const notifications = await pollNotificationSources();
      if (disposed) return;
      deliverDedupedNotifications(notifications, seenRef.current, onNotification, onClearBanner);
    }

    void poll();
    const intervalId = window.setInterval(() => void poll(), pollIntervalMs);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [enabled, pollIntervalMs, onNotification, onClearBanner]);

  useEffect(() => {
    if (!enabled || !isNotificationSseEnabled()) return;
    const eventSource = new EventSource(buildNotificationSseUrl(), { withCredentials: true });
    eventSource.addEventListener("message", (event) => {
      handleNotificationSseMessage(event.data, onNotification);
    });
    eventSource.addEventListener("error", () => {
      onNotification({
        id: "sse.banner.connection-lost",
        title: "Notification system unavailable",
        message: "Notification stream disconnected. Polling fallback remains active.",
        type: "warning",
        timestamp: currentUiEpochMs(),
        read: false,
        layer: "banner",
        source: "sse",
      });
    });
    return () => eventSource.close();
  }, [enabled, onNotification]);
}

export function buildNotificationSseUrl(): string {
  return `${getApiBaseUrl()}/notifications/stream`;
}

export function handleNotificationSseMessage(
  data: string,
  onNotification: (notification: BackofficeNotification) => void,
): void {
  const parsed = safeParseJson(data);
  const notification = normalizeNotificationEvent(parsed);
  if (notification) onNotification(notification);
}

export function deliverDedupedNotifications(
  notifications: BackofficeNotification[],
  seen: Set<string>,
  onNotification: (notification: BackofficeNotification) => void,
  onClearBanner: (id: string) => void,
): void {
  for (const notification of notifications) {
    if (notification.layer !== "banner" && seen.has(notification.id)) continue;
    seen.add(notification.id);
    onNotification(notification);
  }
  if (!notifications.some((notification) => notification.id === "polling.banner.backend-unreachable")) {
    onClearBanner("polling.banner.backend-unreachable");
  }
}

export async function pollNotificationSources(): Promise<BackofficeNotification[]> {
  const results = await Promise.allSettled([
    pollHealthNotification(),
    pollOperationNotifications(),
    pollAuditNotifications(),
  ]);

  return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

export async function pollHealthNotification(): Promise<BackofficeNotification[]> {
  try {
    const response = await apiRequest<HealthResponse>("/health", {}, { skipAuth: true });
    const status = response.data?.status ?? response.status;
    const notification = normalizeHealthNotification({ reachable: true, status });
    return notification ? [notification] : [];
  } catch {
    const notification = normalizeHealthNotification({ reachable: false });
    return notification ? [notification] : [];
  }
}

export async function pollOperationNotifications(): Promise<BackofficeNotification[]> {
  const [completed, failed] = await Promise.all([
    fetchOperationsList({ status: "completed", limit: 5, offset: 0 }).catch(() => null),
    fetchOperationsList({ status: "failed", limit: 5, offset: 0 }).catch(() => null),
  ]);

  return [...(completed?.operations ?? []), ...(failed?.operations ?? [])]
    .filter(isCompletedOrFailedOperation)
    .map((operation) => normalizeOperationNotification({
      operationId: operation.operationId,
      type: operation.type,
      status: operation.status,
      updatedAt: operation.updatedAt,
      completedAt: operation.completedAt,
    }));
}

export async function pollAuditNotifications(): Promise<BackofficeNotification[]> {
  const logs = await fetchAuditLogs({ limit: 5, offset: 0 }).catch(() => null);
  return (logs?.logs ?? [])
    .slice()
    .sort((left, right) => getAuditTimestamp(right) - getAuditTimestamp(left))
    .map((log) => normalizeAuditNotification(log))
    .filter((notification): notification is BackofficeNotification => notification !== null);
}

function getAuditTimestamp(input: AuditNotificationInput): number {
  return parseNotificationTimestamp(input.created_at, 0);
}

function isCompletedOrFailedOperation(
  operation: OperationListItem,
): operation is OperationListItem & { status: "completed" | "failed" } {
  return operation.status === "completed" || operation.status === "failed";
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
