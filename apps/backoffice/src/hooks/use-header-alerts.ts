// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useState, useCallback, useRef } from "react";

import type { OutboxItem, AlertReadHistory } from "../lib/offline-db";
import { OutboxService } from "../lib/outbox-service";

const POLL_INTERVAL_MS = 10000;
const MAX_ITEMS = 10;
const MAX_READ_HISTORY = 20;

export type HeaderAlertData = {
  count: number;
  items: OutboxItem[];
  readItems: AlertReadHistory[];
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
  markAllAsRead: () => Promise<void>;
};

export function useHeaderAlerts(userId: number | null): HeaderAlertData {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [readItems, setReadItems] = useState<AlertReadHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isMountedRef = useRef(true);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      requestSeqRef.current += 1;
      if (isMountedRef.current) {
        setCount(0);
        setItems([]);
        setReadItems([]);
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }

    const requestId = ++requestSeqRef.current;
    if (isMountedRef.current) {
      setLoading(true);
    }

    try {
      const [allFailed, recentRead, readStateIds] = await Promise.all([
        OutboxService.getAllFailedItems(userId),
        OutboxService.getReadAlerts(userId, MAX_READ_HISTORY),
        OutboxService.getReadStateIds(userId)
      ]);

      if (!isMountedRef.current || requestSeqRef.current !== requestId) {
        return;
      }

      const unreadItems = allFailed.filter((item) => !readStateIds.has(item.id));

      setCount(unreadItems.length);
      setItems(unreadItems.slice(0, MAX_ITEMS));
      setReadItems(recentRead);
    } catch {
      if (!isMountedRef.current || requestSeqRef.current !== requestId) {
        return;
      }
      setCount(0);
      setItems([]);
      setReadItems([]);
    } finally {
      if (isMountedRef.current && requestSeqRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [userId]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) {
      return;
    }

    if (!isMountedRef.current) {
      return;
    }

    setRefreshing(true);
    try {
      await OutboxService.markAllFailedAsRead(userId, MAX_READ_HISTORY);
      await refresh();
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) {
      requestSeqRef.current += 1;
      setCount(0);
      setItems([]);
      setReadItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    refresh();
    const intervalId = window.setInterval(refresh, POLL_INTERVAL_MS);

    let focusDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleFocus = () => {
      // Debounce focus events to prevent rapid-fire refreshes
      if (focusDebounceTimer) return;
      focusDebounceTimer = setTimeout(() => {
        focusDebounceTimer = null;
        refresh();
      }, 1000);
    };
    const handleOnline = () => refresh();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      if (focusDebounceTimer) clearTimeout(focusDebounceTimer);
    };
  }, [userId, refresh]);

  return { count, items, readItems, loading, refreshing, refresh, markAllAsRead };
}
