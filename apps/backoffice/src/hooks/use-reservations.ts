// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api-client";
import {
  ReservationRowSchema,
  type ReservationRow,
  type ReservationCreateRequest,
  type ReservationUpdateRequest,
  type ReservationListQuery
} from "@jurnapod/shared";
import { z } from "zod";

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
 * Hook to fetch reservations with filters
 */
export function useReservations(
  query: Partial<ReservationListQuery> | null,
  accessToken: string
) {
  const [data, setData] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outletId = query?.outlet_id ?? null;
  const status = query?.status;
  const dateFrom = query?.date_from;
  const dateTo = query?.date_to;
  const from = query?.from;
  const to = query?.to;
  const limit = query?.limit;
  const offset = query?.offset;

  const refetch = useCallback(async () => {
    if (!outletId) {
      setData([]);
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
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (limit) params.set("limit", limit.toString());
      if (offset) params.set("offset", offset.toString());

      const response = await apiRequest<unknown>(
        `/reservations?${params.toString()}`,
        {},
        accessToken
      );
      setData(extractReservationRowsFromApiPayload(response));
    } catch (e: any) {
      setError(e.message || "Failed to fetch reservations");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, outletId, status, dateFrom, dateTo, from, to, limit, offset]);

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
