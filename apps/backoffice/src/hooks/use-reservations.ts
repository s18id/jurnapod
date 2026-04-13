// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  ReservationRowSchema,
  type ReservationRow,
  type ReservationCreateRequest,
  type ReservationUpdateRequest,
  type ReservationListQuery
} from "@jurnapod/shared";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

import { apiRequest } from "../lib/api-client";

const ReservationListApiSchema = z.object({
  success: z.literal(true),
  data: z.array(z.unknown())
});

export function extractReservationRowsFromApiPayload(payload: unknown): ReservationRow[] {
  const envelope = ReservationListApiSchema.safeParse(payload);
  if (!envelope.success) {
    return [];
  }

  const rows: ReservationRow[] = [];
  for (const item of envelope.data.data) {
    const parsed = ReservationRowSchema.safeParse(item);
    if (parsed.success) {
      rows.push(parsed.data);
    }
  }

  return rows;
}

/**
 * Hook to fetch reservations with filters and pagination
 */
export function useReservations(
  query: Partial<ReservationListQuery> | null
) {
  const [data, setData] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);

  const outletId = query?.outlet_id ?? null;
  const status = query?.status;
  const dateFrom = query?.date_from;
  const dateTo = query?.date_to;
  const overlapFilter = query?.overlap_filter;
  const from = query?.from;
  const to = query?.to;
  const limit = query?.limit;
  const offset = query?.offset;

  const refetch = useCallback(async () => {
    if (!outletId) {
      setData([]);
      setTotal(0);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("outlet_id", outletId.toString());
      if (status) params.set("status", status);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (overlapFilter !== undefined) params.set("overlap_filter", String(overlapFilter));
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (limit) params.set("limit", limit.toString());
      if (offset) params.set("offset", offset.toString());

      const response = await apiRequest<{
        success: true;
        data: {
          data: unknown[];
          meta: {
            total: number;
            page: number;
            page_size: number;
            total_pages: number;
          };
        };
      }>(
        `/reservations?${params.toString()}`
      );
      
      // Extract reservations and total from nested response
      const reservationData = response.data.data;
      const meta = response.data.meta;
      
      setData(extractReservationRowsFromApiPayload({ data: reservationData, success: true }));
      setTotal(meta?.total ?? reservationData.length);
    } catch (e: any) {
      setError(e.message || "Failed to fetch reservations");
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [outletId, status, dateFrom, dateTo, overlapFilter, from, to, limit, offset]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch, total };
}

/**
 * Create a new reservation
 */
export async function createReservation(
  data: ReservationCreateRequest
): Promise<ReservationRow> {
  const response = await apiRequest<{ success: true; data: ReservationRow }>(
    "/reservations",
    {
      method: "POST",
      body: JSON.stringify(data)
    }
  );
  // Broadcast invalidation to all reservation pages
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("reservation-invalidation"));
  }
  return response.data;
}

/**
 * Update a reservation
 */
export async function updateReservation(
  reservationId: number,
  data: ReservationUpdateRequest
): Promise<ReservationRow> {
  const response = await apiRequest<{ success: true; data: ReservationRow }>(
    `/reservations/${reservationId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data)
    }
  );
  // Broadcast invalidation to all reservation pages
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("reservation-invalidation"));
  }
  return response.data;
}

/**
 * Cancel a reservation (update status to CANCELLED)
 */
export async function cancelReservation(
  reservationId: number
): Promise<ReservationRow> {
  return updateReservation(reservationId, { status: "CANCELLED" });
}
