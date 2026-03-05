// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "../lib/api-client";
import { CacheService, type CachedModuleConfig } from "../lib/cache-service";
import { useOnlineStatus } from "../lib/connection";

type ModuleRow = {
  code: string;
  enabled: boolean;
  config_json: string | null;
};

type ModulesResponse = {
  success: true;
  data: {
    modules: ModuleRow[];
  };
};

export type ModuleConfig = CachedModuleConfig;

type ModuleSource = "live" | "cached" | "empty";

/**
 * Hook: useModules
 * Fetches enabled modules for the company
 */
export function useModules(accessToken: string | null, companyId: number | null) {
  const [modules, setModules] = useState<ModuleConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<ModuleSource>("empty");
  const isOnline = useOnlineStatus();

  const refetch = useCallback(async () => {
    if (!accessToken || !companyId) {
      setModules([]);
      setLoading(false);
      setError(null);
      setSource("empty");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (!isOnline) {
        const cachedModules = await CacheService.getCachedModules(companyId, { allowStale: true });
        setModules(cachedModules ?? []);
        setSource(cachedModules ? "cached" : "empty");
        return;
      }

      const response = await apiRequest<ModulesResponse>(
        "/settings/modules",
        {},
        accessToken
      );

      const parsed = response.data.modules.map((row) => ({
        code: row.code,
        enabled: row.enabled,
        config: row.config_json ? JSON.parse(row.config_json) : {}
      }));

      setModules(parsed);
      setSource("live");
      await CacheService.cacheModules(companyId, parsed);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load modules");
      }
      const cachedModules = await CacheService.getCachedModules(companyId, { allowStale: true });
      setModules(cachedModules ?? []);
      setSource(cachedModules ? "cached" : "empty");
    } finally {
      setLoading(false);
    }
  }, [accessToken, companyId, isOnline]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const enabledByCode = modules.reduce<Record<string, boolean>>((acc, mod) => {
    acc[mod.code] = mod.enabled;
    return acc;
  }, {});

  return { modules, enabledByCode, loading, error, refetch, source };
}
