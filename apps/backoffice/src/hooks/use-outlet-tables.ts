// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type {
  OutletTableResponse,
  OutletTableCreateRequest,
  OutletTableBulkCreateRequest,
  OutletTableUpdateRequest
} from "@jurnapod/shared";
import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "../lib/api-client";

/**
 * Hook to fetch outlet tables for a specific outlet
 */
export function useOutletTables(outletId: number | null) {
  const [data, setData] = useState<OutletTableResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!outletId) {
      setData([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<{ success: true; data: OutletTableResponse[] }>(
        `/outlets/${outletId}/tables`
      );
      setData(response.data);
    } catch (e: any) {
      setError(e.message || "Failed to fetch outlet tables");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [outletId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Hook to fetch a single outlet table
 */
export function useOutletTable(
  outletId: number | null,
  tableId: number | null
) {
  const [data, setData] = useState<OutletTableResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!outletId || !tableId) {
      setData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<{ success: true; data: OutletTableResponse }>(
        `/outlets/${outletId}/tables/${tableId}`
      );
      setData(response.data);
    } catch (e: any) {
      setError(e.message || "Failed to fetch outlet table");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [outletId, tableId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Create a new outlet table
 */
export async function createOutletTable(
  outletId: number,
  data: OutletTableCreateRequest
): Promise<OutletTableResponse> {
  const response = await apiRequest<{ success: true; data: OutletTableResponse }>(
    `/outlets/${outletId}/tables`,
    {
      method: "POST",
      body: JSON.stringify(data)
    }
  );
  return response.data;
}

/**
 * Create outlet tables in bulk
 */
export async function createOutletTablesBulk(
  outletId: number,
  data: OutletTableBulkCreateRequest
): Promise<{ created_count: number; tables: OutletTableResponse[] }> {
  const response = await apiRequest<{
    success: true;
    data: { created_count: number; tables: OutletTableResponse[] };
  }>(
    `/outlets/${outletId}/tables/bulk`,
    {
      method: "POST",
      body: JSON.stringify(data)
    }
  );
  return response.data;
}

/**
 * Update an outlet table
 */
export async function updateOutletTable(
  outletId: number,
  tableId: number,
  data: OutletTableUpdateRequest
): Promise<OutletTableResponse> {
  const response = await apiRequest<{ success: true; data: OutletTableResponse }>(
    `/outlets/${outletId}/tables/${tableId}`,
    {
      method: "PUT",
      body: JSON.stringify(data)
    }
  );
  return response.data;
}

/**
 * Deactivate an outlet table
 */
export async function deactivateOutletTable(
  outletId: number,
  tableId: number
): Promise<void> {
  await apiRequest<{ success: true }>(
    `/outlets/${outletId}/tables/${tableId}`,
    {
      method: "PATCH"
    }
  );
}

export const deleteOutletTable = deactivateOutletTable;
