// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  ReservationRowSchema,
  type ReservationRow
} from "@jurnapod/shared";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { z } from "zod";

import { apiRequest } from "../lib/api-client";

const ReservationListApiSchema = z.object({
  success: z.literal(true),
  data: z.array(z.unknown())
});

function extractReservationRowsFromApiPayload(payload: unknown): ReservationRow[] {
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

// Custom event key for cross-page invalidation
const INVALIDATION_KEY = "reservation-invalidation";

/**
 * Broadcast reservation data invalidation to all listening components
 * Call this after any mutation (create, update, cancel)
 */
export function broadcastReservationInvalidation() {
  window.dispatchEvent(new Event(INVALIDATION_KEY));
}

type ReservationQuery = {
  outletId: number | null;
  status: string | null;
  dateFrom: string | null;
  dateTo: string | null;
};

type ReservationContextState = ReservationQuery & {
  data: ReservationRow[];
  loading: boolean;
  error: string | null;
};

type ReservationContextValue = ReservationContextState & {
  setQuery: (query: ReservationQuery) => void;
  refetch: () => Promise<void>;
};

const ReservationContext = createContext<ReservationContextValue | null>(null);

export function ReservationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ReservationContextState>({
    outletId: null,
    status: null,
    dateFrom: null,
    dateTo: null,
    data: [],
    loading: false,
    error: null
  });

  const queryRef = useRef<ReservationQuery>({
    outletId: null,
    status: null,
    dateFrom: null,
    dateTo: null
  });
  const accessTokenRef = useRef<string | null>(null);
  const refetchFnRef = useRef<(() => Promise<void>) | null>(null);

  const refetch = useCallback(async () => {
    const { outletId, status, dateFrom, dateTo } = queryRef.current;

    if (!outletId) {
      setState((prev) => ({ ...prev, data: [], loading: false, error: null }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const params = new URLSearchParams();
      params.set("outlet_id", outletId.toString());
      if (status) params.set("status", status);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);

      const token = accessTokenRef.current;
      if (!token) {
        throw new Error("No access token");
      }

      const response = await apiRequest<unknown>(
        `/reservations?${params.toString()}`,
        {},
        token
      );
      const rows = extractReservationRowsFromApiPayload(response);

      setState((prev) => ({ ...prev, data: rows, loading: false }));
    } catch (e: any) {
      setState((prev) => ({
        ...prev,
        error: e.message || "Failed to fetch reservations",
        loading: false
      }));
    }
  }, []);

  // Store refetch function for external calls
  useEffect(() => {
    refetchFnRef.current = refetch;
  }, [refetch]);

  // Listen for invalidation events from other pages/components
  useEffect(() => {
    const handleInvalidation = () => {
      if (refetchFnRef.current) {
        refetchFnRef.current();
      }
    };
    window.addEventListener(INVALIDATION_KEY, handleInvalidation);
    return () => window.removeEventListener(INVALIDATION_KEY, handleInvalidation);
  }, []);

  const setQuery = useCallback(
    (query: ReservationQuery) => {
      queryRef.current = query;
      setState((prev) => ({
        ...prev,
        outletId: query.outletId,
        status: query.status,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo
      }));
      refetch();
    },
    [refetch]
  );

  const value: ReservationContextValue = {
    ...state,
    setQuery,
    refetch
  };

  return (
    <ReservationContext.Provider value={value}>
      {children}
    </ReservationContext.Provider>
  );
}

// Global access token storage
const accessTokenStorage = {
  token: null as string | null,
  set(token: string | null) {
    this.token = token;
  },
  get(): string | null {
    return this.token;
  }
};

export function setReservationAccessToken(token: string | null) {
  accessTokenStorage.set(token);
}

export function getReservationAccessToken(): string | null {
  return accessTokenStorage.get();
}

/**
 * Hook to get reservation data from shared context
 */
export function useReservationContext() {
  const context = useContext(ReservationContext);
  if (!context) {
    throw new Error("useReservationContext must be used within ReservationProvider");
  }
  return context;
}

/**
 * Hook to sync reservation context with local state
 * Returns refetch function for use in mutations
 */
export function useReservationSync(
  outletId: number | null,
  status: string | null,
  accessToken: string,
  dateFrom?: string | null,
  dateTo?: string | null
) {
  const { setQuery, refetch } = useReservationContext();

  // Update access token ref
  useEffect(() => {
    setReservationAccessToken(accessToken);
  }, [accessToken]);

  // Update context when params change
  useEffect(() => {
    setQuery({ outletId, status, dateFrom: dateFrom ?? null, dateTo: dateTo ?? null });
  }, [outletId, status, dateFrom, dateTo, setQuery]);

  // Return refetch for use in mutations
  return { refetch };
}
