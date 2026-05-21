// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type {
  JournalEntryResponse,
  ManualJournalEntryCreateRequest,
  ManualJournalEntryUpdateRequest,
  JournalListQuery
} from "@jurnapod/shared";
import { useCallback, useEffect, useState } from "react";

import { apiRequest, ApiError } from "../lib/api-client";

/**
 * API Response Types
 */
type JournalBatchListResponse = {
  success: true;
  data: JournalEntryResponse[];
};

type JournalBatchSingleResponse = {
  success: true;
  data: JournalEntryResponse;
};

/**
 * Hook: useJournalBatches
 * Fetches list of journal batches with optional filters
 */
export function useJournalBatches(
  companyId: number,
  filters?: Partial<Omit<JournalListQuery, "company_id">>,
  options?: { enabled?: boolean }
) {
  const [data, setData] = useState<JournalEntryResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (options?.enabled === false) {
      setData([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ company_id: String(companyId) });
      
      if (filters?.outlet_id !== undefined) {
        params.set("outlet_id", String(filters.outlet_id));
      }
      if (filters?.start_date) {
        params.set("start_date", filters.start_date);
      }
      if (filters?.end_date) {
        params.set("end_date", filters.end_date);
      }
      if (filters?.doc_type) {
        params.set("doc_type", filters.doc_type);
      }
      if (filters?.account_id !== undefined) {
        params.set("account_id", String(filters.account_id));
      }
      if (filters?.limit !== undefined) {
        params.set("limit", String(filters.limit));
      }
      if (filters?.offset !== undefined) {
        params.set("offset", String(filters.offset));
      }

      const response = await apiRequest<JournalBatchListResponse>(
        `/journals?${params.toString()}`,
        {}
      );
      setData(response.data);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load journal entries");
      }
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [
    companyId, 
    filters?.outlet_id,
    filters?.start_date,
    filters?.end_date,
    filters?.doc_type,
    filters?.account_id,
    filters?.limit,
    filters?.offset,
    options?.enabled
  ]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Hook: useJournalBatch
 * Fetches a single journal batch by ID
 */
export function useJournalBatch(
  batchId: number | null
) {
  const [data, setData] = useState<JournalEntryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!batchId) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<JournalBatchSingleResponse>(
        `/journals/${batchId}`,
        {}
      );
      setData(response.data);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load journal entry");
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Mutation: createManualJournalEntry
 * Creates a manual journal entry (expense, transfer, adjustment, etc.)
 */
export async function createManualJournalEntry(
  data: ManualJournalEntryCreateRequest
): Promise<JournalEntryResponse> {
  const response = await apiRequest<JournalBatchSingleResponse>(
    `/journals`,
    {
      method: "POST",
      body: JSON.stringify(data)
    }
  );
  return response.data;
}

export async function updateManualJournalEntry(
  journalId: number,
  data: ManualJournalEntryUpdateRequest
): Promise<JournalEntryResponse> {
  const response = await apiRequest<JournalBatchSingleResponse>(
    `/journals/${journalId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data)
    }
  );
  return response.data;
}

export async function postManualJournalEntry(
  journalId: number
): Promise<JournalEntryResponse> {
  const response = await apiRequest<JournalBatchSingleResponse>(
    `/journals/${journalId}/post`,
    { method: "POST" }
  );
  return response.data;
}

export async function voidManualJournalEntry(
  journalId: number,
  reason: string
): Promise<JournalEntryResponse> {
  const response = await apiRequest<JournalBatchSingleResponse>(
    `/journals/${journalId}/void`,
    {
      method: "POST",
      body: JSON.stringify({ reason })
    }
  );
  return response.data;
}
