// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { CacheService } from "../lib/cache-service";
import type { SessionUser } from "../lib/session";

export type ItemType = "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";

export type Item = {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  type: ItemType;
  item_group_id: number | null;
  cogs_account_id: number | null;
  inventory_asset_account_id: number | null;
  is_active: boolean;
  updated_at: string;
};

export interface UseItemsProps {
  user: SessionUser;
  accessToken: string;
}

export interface UseItemsReturn {
  items: Item[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  itemMap: Map<number, Item>;
}

/**
 * React hook for fetching and caching items data.
 *
 * Features:
 * - Automatic caching via CacheService (IndexedDB)
 * - O(1) item lookup via itemMap
 * - Manual refresh capability
 * - Proper loading and error states
 * - Automatic cleanup on unmount
 *
 * @param {UseItemsProps} props - User and access token
 * @returns {UseItemsReturn} Items data, loading state, error, refresh function, and itemMap
 *
 * @example
 * const { items, loading, error, refresh, itemMap } = useItems({ user, accessToken });
 *
 * // Access item by ID
 * const item = itemMap.get(itemId);
 *
 * // Refresh data
 * await refresh();
 */
export function useItems({ user, accessToken }: UseItemsProps): UseItemsReturn {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetchItems = useCallback(async () => {
    if (!user || !accessToken) {
      if (isMounted.current) {
        setError("User not authenticated");
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await CacheService.getCachedItems(user.company_id, accessToken);

      if (isMounted.current) {
        setItems(data as Item[]);
        setLoading(false);
      }
    } catch (err) {
      if (isMounted.current) {
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch items";
        setError(errorMessage);
        setLoading(false);
      }
    }
  }, [user, accessToken]);

  const refresh = useCallback(async () => {
    if (!user || !accessToken) {
      setError("User not authenticated");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Force refresh by calling refreshItems directly (bypasses cache)
      const data = await CacheService.refreshItems(user.company_id, accessToken);

      if (isMounted.current) {
        setItems(data as Item[]);
        setLoading(false);
      }
    } catch (err) {
      if (isMounted.current) {
        const errorMessage = err instanceof Error ? err.message : "Failed to refresh items";
        setError(errorMessage);
        setLoading(false);
      }
    }
  }, [user, accessToken]);

  useEffect(() => {
    fetchItems();

    return () => {
      isMounted.current = false;
    };
  }, [fetchItems]);

  // Create O(1) lookup map
  const itemMap = useMemo(() => {
    const map = new Map<number, Item>();
    items.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [items]);

  return {
    items,
    loading,
    error,
    refresh,
    itemMap,
  };
}
