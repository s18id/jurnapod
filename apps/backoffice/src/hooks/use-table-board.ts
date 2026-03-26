// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest } from "../lib/api-client";

export type TableBoardRow = {
  tableId: string;
  tableCode: string;
  tableName: string;
  capacity: number | null;
  zone: string | null;
  occupancyStatusId: number;
  availableNow: boolean;
  currentSessionId: string | null;
  currentReservationId: string | null;
  nextReservationStartAt: string | null;
  guestCount: number | null;
  version: number;
  updatedAt: string;
};

type TableBoardEnvelope = {
  success: boolean;
  data?: {
    tables?: TableBoardRow[];
  };
};

type RawTableBoardRow = {
  tableId: string | number;
  tableCode: string;
  tableName: string;
  capacity: number | string | null;
  zone: string | null;
  occupancyStatusId: number | string;
  availableNow: boolean;
  currentSessionId: string | number | null;
  currentReservationId: string | number | null;
  nextReservationStartAt: string | null;
  guestCount: number | string | null;
  version: number | string;
  updatedAt: string;
};

type MinimalVersionRow = {
  tableId: string;
  version: number;
};

export function buildTableBoardPath(outletId: number): string {
  return `/dinein/tables/board?outletId=${encodeURIComponent(String(outletId))}`;
}

export function extractTableBoardRows(payload: unknown): TableBoardRow[] {
  const envelope = payload as TableBoardEnvelope;
  if (!envelope || typeof envelope !== "object") {
    return [];
  }
  if (!envelope.data || !Array.isArray(envelope.data.tables)) {
    return [];
  }

  return (envelope.data.tables as RawTableBoardRow[]).map((row) => ({
    tableId: String(row.tableId),
    tableCode: row.tableCode,
    tableName: row.tableName,
    capacity: row.capacity === null ? null : Number(row.capacity),
    zone: row.zone,
    occupancyStatusId: Number(row.occupancyStatusId),
    availableNow: Boolean(row.availableNow),
    currentSessionId: row.currentSessionId === null ? null : String(row.currentSessionId),
    currentReservationId: row.currentReservationId === null ? null : String(row.currentReservationId),
    nextReservationStartAt: row.nextReservationStartAt,
    guestCount: row.guestCount === null ? null : Number(row.guestCount),
    version: Number(row.version),
    updatedAt: row.updatedAt
  }));
}

export function calculateRecentChangeIds(
  previousRows: readonly MinimalVersionRow[],
  nextRows: readonly MinimalVersionRow[]
): Set<string> {
  const previousVersionByTableId = new Map<string, number>();
  for (const row of previousRows) {
    previousVersionByTableId.set(row.tableId, row.version);
  }

  const changed = new Set<string>();
  for (const row of nextRows) {
    const previousVersion = previousVersionByTableId.get(row.tableId);
    if (previousVersion !== undefined && previousVersion !== row.version) {
      changed.add(row.tableId);
    }
  }
  return changed;
}

export function startPolling(callback: () => void, pollMs: number): () => void {
  const interval = setInterval(callback, pollMs);
  return () => clearInterval(interval);
}

export function useTableBoard(
  outletId: number | null,
  accessToken: string,
  pollMs = 8000
) {
  const [data, setData] = useState<TableBoardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [recentChangeIds, setRecentChangeIds] = useState<Set<string>>(new Set());

  const rowsRef = useRef<TableBoardRow[]>([]);

  const refetch = useCallback(async () => {
    if (!outletId) {
      rowsRef.current = [];
      setData([]);
      setError(null);
      setLastUpdatedAt(null);
      setRecentChangeIds(new Set());
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await apiRequest<TableBoardEnvelope>(
        buildTableBoardPath(outletId),
        {},
        accessToken
      );
      const rows = extractTableBoardRows(payload);
      const nextRecentChangeIds = calculateRecentChangeIds(rowsRef.current, rows);
      rowsRef.current = rows;
      setData(rows);
      setRecentChangeIds(nextRecentChangeIds);
      setLastUpdatedAt(new Date());
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch table board";
      setError(message);
      setData([]);
      setRecentChangeIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [outletId, accessToken]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!outletId) {
      return;
    }
    const stopPolling = startPolling(() => {
      void refetch();
    }, pollMs);
    return stopPolling;
  }, [outletId, pollMs, refetch]);

  return { data, loading, error, refetch, lastUpdatedAt, recentChangeIds };
}
