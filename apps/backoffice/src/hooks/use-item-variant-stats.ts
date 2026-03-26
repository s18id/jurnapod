// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useEffect, useCallback, useRef } from "react";

import { apiRequest } from "../lib/api-client";
import type { SessionUser } from "../lib/session";

export type ItemVariantStats = {
  item_id: number;
  variant_count: number;
  total_stock: number;
  has_variants: boolean;
};

export interface UseItemVariantStatsProps {
  user: SessionUser;
  accessToken: string;
  itemIds: number[];
}

export interface UseItemVariantStatsReturn {
  stats: Map<number, ItemVariantStats>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * React hook for fetching variant statistics for multiple items.
 * Lightweight endpoint that returns stock rollup info for parent items.
 *
 * @param {UseItemVariantStatsProps} props - User, access token, and item IDs
 * @returns {UseItemVariantStatsReturn} Variant stats map and loading state
 *
 * @deprecated This hook makes N API calls for N items (N+1 issue).
 * For catalogs with many items, this creates unnecessary network overhead.
 * TODO: Replace with a batched endpoint when available (Story 4.7-follow-up).
 * Recommended: Add `/api/inventory/variants/stats?item_ids=1,2,3` endpoint
 * that returns aggregated stats for multiple items in a single request.
 */
export function useItemVariantStats({
  user,
  accessToken,
  itemIds,
}: UseItemVariantStatsProps): UseItemVariantStatsReturn {
  const [stats, setStats] = useState<Map<number, ItemVariantStats>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetchStats = useCallback(async () => {
    if (!user || !accessToken || itemIds.length === 0) {
      setStats(new Map());
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch variant stats for all items in a single bulk request
      const itemIdsParam = itemIds.join(',');
      const response = await apiRequest<{ success: boolean; data: ItemVariantStats[] }>(
        `/inventory/variant-stats?item_ids=${itemIdsParam}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (response.success && Array.isArray(response.data)) {
        const statsMap = new Map<number, ItemVariantStats>();
        response.data.forEach((stat) => {
          statsMap.set(stat.item_id, stat);
        });

        if (isMounted.current) {
          setStats(statsMap);
          setLoading(false);
        }
      } else {
        throw new Error("Invalid response from variant stats API");
      }
    } catch (err) {
      if (isMounted.current) {
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch variant stats";
        setError(errorMessage);
        setLoading(false);
      }
    }
  }, [user, accessToken, itemIds]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  return {
    stats,
    loading,
    error,
    refresh: fetchStats,
  };
}
