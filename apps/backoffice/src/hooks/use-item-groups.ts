// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { CacheService } from "../lib/cache-service";
import type { SessionUser } from "../lib/session";

export type ItemGroup = {
  id: number;
  company_id: number;
  parent_id: number | null;
  code: string | null;
  name: string;
  is_active: boolean;
  updated_at: string;
};

export interface UseItemGroupsProps {
  user: SessionUser;
  accessToken: string;
}

export interface UseItemGroupsReturn {
  itemGroups: ItemGroup[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  groupMap: Map<number, ItemGroup>;
}

/**
 * React hook for fetching and caching item groups data.
 *
 * Features:
 * - Automatic caching via CacheService (IndexedDB)
 * - O(1) item group lookup via groupMap
 * - Manual refresh capability
 * - Proper loading and error states
 * - Automatic cleanup on unmount
 *
 * @param {UseItemGroupsProps} props - User and access token
 * @returns {UseItemGroupsReturn} Item groups data, loading state, error, refresh function, and groupMap
 *
 * @example
 * const { itemGroups, loading, error, refresh, groupMap } = useItemGroups({ user, accessToken });
 *
 * // Access group by ID
 * const group = groupMap.get(groupId);
 *
 * // Refresh data
 * await refresh();
 */
export function useItemGroups({ user, accessToken }: UseItemGroupsProps): UseItemGroupsReturn {
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetchItemGroups = useCallback(async () => {
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
      const data = await CacheService.getCachedItemGroups(user.company_id, accessToken);

      if (isMounted.current) {
        setItemGroups(data as ItemGroup[]);
        setLoading(false);
      }
    } catch (err) {
      if (isMounted.current) {
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch item groups";
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
      // Force refresh by calling refreshItemGroups directly (bypasses cache)
      const data = await CacheService.refreshItemGroups(user.company_id, accessToken);

      if (isMounted.current) {
        setItemGroups(data as ItemGroup[]);
        setLoading(false);
      }
    } catch (err) {
      if (isMounted.current) {
        const errorMessage = err instanceof Error ? err.message : "Failed to refresh item groups";
        setError(errorMessage);
        setLoading(false);
      }
    }
  }, [user, accessToken]);

  useEffect(() => {
    fetchItemGroups();

    return () => {
      isMounted.current = false;
    };
  }, [fetchItemGroups]);

  // Create O(1) lookup map
  const groupMap = useMemo(() => {
    const map = new Map<number, ItemGroup>();
    itemGroups.forEach((group) => {
      map.set(group.id, group);
    });
    return map;
  }, [itemGroups]);

  return {
    itemGroups,
    loading,
    error,
    refresh,
    groupMap,
  };
}
