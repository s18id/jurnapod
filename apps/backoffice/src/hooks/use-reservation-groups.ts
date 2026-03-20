// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useCallback, useEffect } from "react";
import { apiRequest } from "../lib/api-client";
import type {
  ReservationGroupCreateRequest,
  ReservationGroupDetail,
  ReservationGroupUpdateRequest,
  TableSuggestion,
  TableSuggestionQuery
} from "@jurnapod/shared";

/**
 * Create a multi-table reservation group
 */
export async function createReservationGroup(
  data: ReservationGroupCreateRequest,
  accessToken: string
): Promise<{ group_id: number; reservation_ids: number[] }> {
  const response = await apiRequest<{
    success: true;
    data: { group_id: number; reservation_ids: number[] };
  }>(
    "/reservation-groups",
    {
      method: "POST",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Get reservation group details including all linked reservations
 */
export async function getReservationGroup(
  groupId: number,
  accessToken: string
): Promise<ReservationGroupDetail> {
  const response = await apiRequest<{
    success: true;
    data: ReservationGroupDetail;
  }>(
    `/reservation-groups/${groupId}`,
    {},
    accessToken
  );
  return response.data;
}

/**
 * Cancel a reservation group (ungroup reservations and delete group)
 */
export async function cancelReservationGroup(
  groupId: number,
  accessToken: string
): Promise<{ deleted: boolean; ungrouped_count: number }> {
  const response = await apiRequest<{
    success: true;
    data: { deleted: boolean; ungrouped_count: number };
  }>(
    `/reservation-groups/${groupId}`,
    {
      method: "DELETE"
    },
    accessToken
  );
  return response.data;
}

/**
 * Update an existing reservation group
 */
export async function updateReservationGroup(
  groupId: number,
  data: ReservationGroupUpdateRequest,
  accessToken: string
): Promise<{ group_id: number; reservation_ids: number[]; updated_tables: number[]; removed_tables: number[] }> {
  const response = await apiRequest<{
    success: true;
    data: { group_id: number; reservation_ids: number[]; updated_tables: number[]; removed_tables: number[] };
  }>(
    `/reservation-groups/${groupId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Hook to fetch table suggestions for large party reservation
 */
export function useTableSuggestions(
  query: TableSuggestionQuery | null,
  accessToken: string
) {
  const [suggestions, setSuggestions] = useState<TableSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (!query) {
      setSuggestions([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("outlet_id", query.outlet_id.toString());
      params.set("guest_count", query.guest_count.toString());
      params.set("reservation_at", query.reservation_at);
      params.set("duration_minutes", query.duration_minutes.toString());

      const response = await apiRequest<{
        success: true;
        data: { suggestions: TableSuggestion[] };
      }>(
        `/reservation-groups/suggest-tables?${params.toString()}`,
        {},
        accessToken
      );

      setSuggestions(response.data.suggestions);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch suggestions";
      setError(message);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [query, accessToken]);

  // Auto-fetch when query or access token changes
  useEffect(() => {
    void fetchSuggestions();
  }, [fetchSuggestions]);

  return { suggestions, loading, error, refetch: fetchSuggestions };
}

/**
 * Hook to manage reservation group operations
 */
export function useReservationGroups(accessToken: string) {
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const createGroup = useCallback(
    async (data: ReservationGroupCreateRequest): Promise<{ group_id: number; reservation_ids: number[] } | null> => {
      setCreating(true);
      setCreateError(null);

      try {
        const result = await createReservationGroup(data, accessToken);
        return result;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to create reservation group";
        setCreateError(message);
        return null;
      } finally {
        setCreating(false);
      }
    },
    [accessToken]
  );

  const updateGroup = useCallback(
    async (groupId: number, data: ReservationGroupUpdateRequest): Promise<{ 
      group_id: number; 
      reservation_ids: number[]; 
      updated_tables: number[]; 
      removed_tables: number[];
    } | null> => {
      setUpdating(true);
      setUpdateError(null);

      try {
        const result = await updateReservationGroup(groupId, data, accessToken);
        return result;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to update reservation group";
        setUpdateError(message);
        return null;
      } finally {
        setUpdating(false);
      }
    },
    [accessToken]
  );

  return {
    createGroup,
    creating,
    createError,
    updateGroup,
    updating,
    updateError
  };
}