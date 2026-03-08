// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api-client";
import type {
  ReservationRow,
  ReservationCreateRequest,
  ReservationUpdateRequest,
  ReservationListQuery
} from "@jurnapod/shared";

/**
 * Hook to fetch reservations with filters
 */
export function useReservations(
  query: Partial<ReservationListQuery> | null,
  accessToken: string
) {
  const [data, setData] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!query?.outlet_id) {
      setData([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("outlet_id", query.outlet_id.toString());
      if (query.status) params.set("status", query.status);
      if (query.from) params.set("from", query.from);
      if (query.to) params.set("to", query.to);
      if (query.limit) params.set("limit", query.limit.toString());
      if (query.offset) params.set("offset", query.offset.toString());

      const response = await apiRequest<{ success: true; data: ReservationRow[] }>(
        `/reservations?${params.toString()}`,
        {},
        accessToken
      );
      setData(response.data);
    } catch (e: any) {
      setError(e.message || "Failed to fetch reservations");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [query, accessToken]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Create a new reservation
 */
export async function createReservation(
  data: ReservationCreateRequest,
  accessToken: string
): Promise<ReservationRow> {
  const response = await apiRequest<{ success: true; data: ReservationRow }>(
    "/reservations",
    {
      method: "POST",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Update a reservation
 */
export async function updateReservation(
  reservationId: number,
  data: ReservationUpdateRequest,
  accessToken: string
): Promise<ReservationRow> {
  const response = await apiRequest<{ success: true; data: ReservationRow }>(
    `/reservations/${reservationId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Cancel a reservation (update status to CANCELLED)
 */
export async function cancelReservation(
  reservationId: number,
  accessToken: string
): Promise<ReservationRow> {
  return updateReservation(reservationId, { status: "CANCELLED" }, accessToken);
}
