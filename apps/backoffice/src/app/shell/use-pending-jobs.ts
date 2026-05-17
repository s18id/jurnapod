// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Pending jobs hook — simple count of unresolved sync items.
//
// Uses OutboxService to count failed items for the current user.
// Updated on mount, on user change, and when triggered externally.

import { useEffect, useRef, useState, useCallback } from "react";
import { OutboxService } from "@/lib/outbox-service";

export interface PendingJobsInfo {
  /** Count of pending/failed sync jobs */
  count: number;
  /** Whether the count is being loaded */
  loading: boolean;
  /** Manually trigger a refresh */
  refresh: () => void;
}

/**
 * Hook that monitors pending sync jobs for the shell badge.
 */
export function usePendingJobs(userId: number | null): PendingJobsInfo {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const seqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      seqRef.current += 1;
      if (mountedRef.current) {
        setCount(0);
        setLoading(false);
      }
      return;
    }

    const reqId = ++seqRef.current;
    if (mountedRef.current) setLoading(true);

    try {
      const failedItems = await OutboxService.getAllFailedItems(userId);
      if (mountedRef.current && seqRef.current === reqId) {
        setCount(failedItems.length);
      }
    } catch {
      if (mountedRef.current && seqRef.current === reqId) {
        setCount(0);
      }
    } finally {
      if (mountedRef.current && seqRef.current === reqId) {
        setLoading(false);
      }
    }
  }, [userId]);

  // Auto-refresh on mount/change + every 60s
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { count, loading, refresh };
}
