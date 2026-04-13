// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { OutletFullResponse } from "@jurnapod/shared";
import { useCallback, useEffect, useState } from "react";

import { apiRequest, ApiError } from "../lib/api-client";

/**
 * API Response Types
 */
type OutletsListResponse = {
  success: true;
  data: OutletFullResponse[];
};

type OutletSingleResponse = {
  success: true;
  data: OutletFullResponse;
};

/**
 * Hook: useOutletsFull
 * Fetches list of outlets for a company with full details
 */
export function useOutletsFull(companyId: number | null) {
  const [data, setData] = useState<OutletFullResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!companyId) {
      setData([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ company_id: String(companyId) });
      const response = await apiRequest<OutletsListResponse>(
        `/outlets?${params.toString()}`
      );
      setData(response.data);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load outlets");
      }
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Hook: useOutletFull
 * Fetches a single outlet by ID with full details
 */
export function useOutletFull(
  outletId: number | null
) {
  const [data, setData] = useState<OutletFullResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!outletId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<OutletSingleResponse>(
        `/outlets/${outletId}`
      );
      setData(response.data);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load outlet");
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [outletId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export type OutletCreateInput = {
  company_id: number;
  code: string;
  name: string;
  city?: string;
  address_line1?: string;
  address_line2?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  timezone?: string;
};

export type OutletUpdateInput = {
  name?: string;
  city?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
  is_active?: boolean;
};

/**
 * Mutation: createOutlet
 * Creates a new outlet
 */
export async function createOutlet(
  data: OutletCreateInput
): Promise<OutletFullResponse> {
  const response = await apiRequest<OutletSingleResponse>(
    "/outlets",
    {
      method: "POST",
      body: JSON.stringify(data)
    }
  );
  return response.data;
}

/**
 * Mutation: updateOutlet
 * Updates an existing outlet
 */
export async function updateOutlet(
  outletId: number,
  data: OutletUpdateInput
): Promise<OutletFullResponse> {
  const response = await apiRequest<OutletSingleResponse>(
    `/outlets/${outletId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data)
    }
  );
  return response.data;
}

/**
 * Mutation: deleteOutlet
 * Deletes an outlet
 */
export async function deleteOutlet(
  outletId: number
): Promise<void> {
  await apiRequest<{ success: true; data: null }>(
    `/outlets/${outletId}`,
    {
      method: "DELETE"
    }
  );
}
