import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "../lib/api-client";
import type {
  JournalBatchResponse,
  ManualJournalEntryCreateRequest,
  JournalListQuery
} from "@jurnapod/shared";

/**
 * API Response Types
 */
type JournalBatchListResponse = {
  success: true;
  data: JournalBatchResponse[];
};

type JournalBatchSingleResponse = {
  success: true;
  data: JournalBatchResponse;
};

/**
 * Hook: useJournalBatches
 * Fetches list of journal batches with optional filters
 */
export function useJournalBatches(
  companyId: number,
  accessToken: string,
  filters?: Partial<Omit<JournalListQuery, "company_id">>
) {
  const [data, setData] = useState<JournalBatchResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
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
        {},
        accessToken
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
    accessToken, 
    filters?.outlet_id,
    filters?.start_date,
    filters?.end_date,
    filters?.doc_type,
    filters?.account_id,
    filters?.limit,
    filters?.offset
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
  batchId: number | null,
  accessToken: string
) {
  const [data, setData] = useState<JournalBatchResponse | null>(null);
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
        {},
        accessToken
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
  }, [batchId, accessToken]);

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
  data: ManualJournalEntryCreateRequest,
  accessToken: string
): Promise<JournalBatchResponse> {
  const response = await apiRequest<JournalBatchSingleResponse>(
    `/journals`,
    {
      method: "POST",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}
