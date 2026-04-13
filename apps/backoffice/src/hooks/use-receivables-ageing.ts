// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiRequest, ApiError } from "../lib/api-client";
import {
  type AggregatedCustomer,
  type ReceivablesAgeingFilters,
  type ReceivablesAgeingReport,
  type ReceivablesAgeingResponse,
} from "../types/reports/receivables-ageing";

// ============================================================================
// Hook: useReceivablesAgeing
// ============================================================================

interface UseReceivablesAgeingProps {
  filters: ReceivablesAgeingFilters;
  enabled?: boolean;
}

interface UseReceivablesAgeingReturn {
  data: ReceivablesAgeingReport | null;
  customers: AggregatedCustomer[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook to fetch receivables ageing report data and aggregate by customer
 */
export function useReceivablesAgeing({
  filters,
  enabled = true,
}: UseReceivablesAgeingProps): UseReceivablesAgeingReturn {
  const [data, setData] = useState<ReceivablesAgeingReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("as_of_date", filters.asOfDate);
      if (filters.outletId) {
        params.set("outlet_id", String(filters.outletId));
      }
      if (filters.customerId) {
        params.set("customer_id", String(filters.customerId));
      }

      const response = await apiRequest<ReceivablesAgeingResponse>(
        `/reports/receivables-ageing?${params.toString()}`,
        {}
      );

      setData(response.data);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load receivables ageing report");
      }
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [filters.asOfDate, filters.outletId, filters.customerId, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const timeoutId = globalThis.setTimeout(() => {
      void refetch();
    }, 0);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [refetch, enabled]);

  // Aggregate invoices by customer
  const customers = useMemo<AggregatedCustomer[]>(() => {
    if (!data?.invoices) return [];

    const customerMap = new Map<
      number,
      {
        name: string;
        code: string;
        current: number;
        bucket_1_30: number;
        bucket_31_60: number;
        bucket_61_90: number;
        bucket_90_plus: number;
        total: number;
      }
    >();

    for (const invoice of data.invoices) {
      const existing = customerMap.get(invoice.customer_id);
      const amount = invoice.outstanding_amount;

      if (existing) {
        existing.current += invoice.age_bucket === "current" ? amount : 0;
        existing.bucket_1_30 += invoice.age_bucket === "1_30_days" ? amount : 0;
        existing.bucket_31_60 += invoice.age_bucket === "31_60_days" ? amount : 0;
        existing.bucket_61_90 += invoice.age_bucket === "61_90_days" ? amount : 0;
        existing.bucket_90_plus += invoice.age_bucket === "over_90_days" ? amount : 0;
        existing.total += amount;
      } else {
        customerMap.set(invoice.customer_id, {
          name: invoice.customer_name ?? `Customer #${invoice.customer_id}`,
          code: invoice.customer_code ?? "",
          current: invoice.age_bucket === "current" ? amount : 0,
          bucket_1_30: invoice.age_bucket === "1_30_days" ? amount : 0,
          bucket_31_60: invoice.age_bucket === "31_60_days" ? amount : 0,
          bucket_61_90: invoice.age_bucket === "61_90_days" ? amount : 0,
          bucket_90_plus: invoice.age_bucket === "over_90_days" ? amount : 0,
          total: amount,
        });
      }
    }

    return Array.from(customerMap.entries()).map(([customer_id, values]) => ({
      customer_id,
      customer_name: values.name,
      customer_code: values.code,
      current: values.current,
      bucket_1_30: values.bucket_1_30,
      bucket_31_60: values.bucket_31_60,
      bucket_61_90: values.bucket_61_90,
      bucket_90_plus: values.bucket_90_plus,
      total_outstanding: values.total,
    }));
  }, [data]);

  return {
    data,
    customers,
    isLoading,
    error,
    refetch,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format money for display
 */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Calculate percentage
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}