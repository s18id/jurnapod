// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api-client";

export type HealthSubsystemStatus = {
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs?: number;
  message?: string;
};

export type HealthStatusResponse = {
  status: "ok" | "degraded" | "unhealthy";
  timestamp: string;
  subsystems?: {
    database?: HealthSubsystemStatus;
    import?: HealthSubsystemStatus;
    export?: HealthSubsystemStatus;
    sync?: HealthSubsystemStatus;
  };
};

export function getVisibleRefetchInterval(enabled: boolean, intervalMs: number): number | false {
  if (!enabled) return false;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;
  return intervalMs;
}

export async function fetchHealthStatus(): Promise<HealthStatusResponse> {
  return apiRequest<HealthStatusResponse>("/health?detailed=true");
}

export function useHealthStatus(options: { autoRefresh: boolean; intervalMs: number }) {
  return useQuery({
    queryKey: ["dashboard", "health"],
    queryFn: fetchHealthStatus,
    retry: false,
    refetchInterval: () => getVisibleRefetchInterval(options.autoRefresh, options.intervalMs),
    refetchIntervalInBackground: false,
  });
}
