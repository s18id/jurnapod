// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Sync health hook — provides sync health status and last sync timestamp.
//
// Reads from the offline-db syncHistory table to determine:
//   - Whether sync is healthy (last sync succeeded)
//   - When the last successful sync occurred
//   - A human-readable label for the last sync time

import { useEffect, useState, useRef } from "react";
import { db } from "@/lib/offline-db";

export interface SyncHealthInfo {
  /** Whether sync is currently in a healthy state */
  healthy: boolean;
  /** Last successful sync timestamp (epoch ms), or null */
  lastSyncTimestamp: number | null;
  /** Human-readable label for the last sync time */
  lastSyncLabel: string;
}

function currentEpochMs(): number {
  const performanceClock = globalThis.performance;
  if (performanceClock && Number.isFinite(performanceClock.timeOrigin)) {
    return Math.floor(performanceClock.timeOrigin + performanceClock.now());
  }

  // UI display fallback only. This value MUST NOT be persisted as a business timestamp.
  return Date.now();
}

export function formatTimeAgo(epochMs: number, nowMs: number = currentEpochMs()): string {
  const diff = Math.max(0, nowMs - epochMs);
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) {
    const min = Math.floor(diff / 60_000);
    return `${min}m ago`;
  }
  if (diff < 86_400_000) {
    const hrs = Math.floor(diff / 3600_000);
    return `${hrs}h ago`;
  }
  const days = Math.floor(diff / 86_400_000);
  return `${days}d ago`;
}

/**
 * Hook that tracks sync health and last sync timestamp.
 *
 * Reads the most recent syncHistory entry with action "sync_success"
 * to determine the last successful sync timestamp.
 */
export function useSyncHealth(userId: number | null): SyncHealthInfo {
  const [info, setInfo] = useState<SyncHealthInfo>({
    healthy: true,
    lastSyncTimestamp: null,
    lastSyncLabel: "Never",
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function fetch() {
      if (!userId) {
        setInfo({
          healthy: true,
          lastSyncTimestamp: null,
          lastSyncLabel: "Never",
        });
        return;
      }

      try {
        const entries = (await db.syncHistory
          .where("userId")
          .equals(userId)
          .toArray())
          .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
          .slice(0, 10);

        if (!mountedRef.current) return;

        const lastSuccess = entries.find((e) => e.action === "sync_success");
        const lastFailed = entries.find((e) => e.action === "sync_failed");

        const lastSyncTimestamp = lastSuccess ? lastSuccess.timestamp.getTime() : null;
        const lastFailedTimestamp = lastFailed ? lastFailed.timestamp.getTime() : null;

        // Healthy if last sync succeeded, or no failures in last entries
        const healthy = lastFailedTimestamp !== null
          ? lastSyncTimestamp !== null && lastSyncTimestamp >= lastFailedTimestamp
          : true;

        setInfo({
          healthy,
          lastSyncTimestamp,
          lastSyncLabel: lastSyncTimestamp ? formatTimeAgo(lastSyncTimestamp) : "Never",
        });
      } catch {
        if (mountedRef.current) {
          setInfo({
            healthy: true,
            lastSyncTimestamp: null,
            lastSyncLabel: "Unknown",
          });
        }
      }
    }

    fetch();
    const id = setInterval(fetch, 60_000);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [userId]);

  return info;
}
