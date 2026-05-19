// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useQueries } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api-client";
import { fetchOperationsList, type OperationsListResult } from "@/hooks/use-operations-list";
import { getVisibleRefetchInterval } from "@/hooks/use-health-status";

export type ApiGap = { apiGap: true; message: string };

export interface InventorySummary {
  totalItems: number;
  activeItems: number;
  lowStockAlerts: number;
  outletScoped: boolean;
  recentStockMovements: ApiGap;
}

export interface AccountingSummary {
  pendingReconciliations: ApiGap;
  openFiscalYears: number;
  closedFiscalYears: number;
  journalEntryCount: number;
}

export interface PurchasingSummary {
  overdueInvoices: number;
  openPurchaseOrders: number;
  pendingApprovals: ApiGap;
}

export interface PendingExceptionsSummary {
  total: number;
  apExceptions: number;
  reconciliationMismatches: ApiGap;
  syncErrors: number;
}

type Envelope<T> = { success: true; data: T };

async function fetchDashboardEnvelope<T>(path: string): Promise<T> {
  const payload = await apiRequest<Envelope<T>>(path);
  return payload.data;
}

function appendOutletQuery(path: string, outletId: number | null | undefined): string {
  if (outletId == null) return path;
  return `${path}?outlet_id=${encodeURIComponent(String(outletId))}`;
}

function resolveCardInterval(defaultMs: number, selectedMs: number): number {
  return selectedMs === 60_000 ? defaultMs : selectedMs;
}

export const dashboardQueryKeys = {
  failedJobs: ["dashboard", "failed-jobs"] as const,
  recentJobs: ["dashboard", "company-recent-jobs"] as const,
  inventory: (outletId: number | null | undefined) => ["dashboard", "inventory-summary", outletId ?? "company"] as const,
  accounting: ["dashboard", "accounting-summary"] as const,
  purchasing: ["dashboard", "purchasing-summary"] as const,
  pendingExceptions: ["dashboard", "pending-exceptions"] as const,
};

export function useDashboardData(options: {
  autoRefresh: boolean;
  intervalMs: number;
  outletId?: number | null;
  permissions: {
    canReadOperations: boolean;
    canViewInventory: boolean;
    canViewAccounting: boolean;
    canViewPurchasing: boolean;
    canViewPendingExceptions: boolean;
  };
}) {
  const failedJobsIntervalMs = resolveCardInterval(30_000, options.intervalMs);
  const recentJobsIntervalMs = resolveCardInterval(60_000, options.intervalMs);
  const pendingExceptionsIntervalMs = resolveCardInterval(60_000, options.intervalMs);
  const domainIntervalMs = resolveCardInterval(300_000, options.intervalMs);

  const queries = useQueries({
    queries: [
      {
        queryKey: dashboardQueryKeys.failedJobs,
        queryFn: () => fetchOperationsList({ status: "failed", limit: 5, offset: 0 }),
        enabled: options.permissions.canReadOperations,
        refetchInterval: () => getVisibleRefetchInterval(options.autoRefresh, failedJobsIntervalMs),
      },
      {
        queryKey: dashboardQueryKeys.recentJobs,
        queryFn: () => fetchOperationsList({ limit: 5, offset: 0 }),
        enabled: options.permissions.canReadOperations,
        refetchInterval: () => getVisibleRefetchInterval(options.autoRefresh, recentJobsIntervalMs),
      },
      {
        queryKey: dashboardQueryKeys.inventory(options.outletId),
        queryFn: () => fetchDashboardEnvelope<InventorySummary>(appendOutletQuery("/dashboard/inventory-summary", options.outletId)),
        enabled: options.permissions.canViewInventory && options.outletId != null,
        refetchInterval: () => getVisibleRefetchInterval(options.autoRefresh, domainIntervalMs),
      },
      {
        queryKey: dashboardQueryKeys.accounting,
        queryFn: () => fetchDashboardEnvelope<AccountingSummary>("/dashboard/accounting-summary"),
        enabled: options.permissions.canViewAccounting,
        refetchInterval: () => getVisibleRefetchInterval(options.autoRefresh, domainIntervalMs),
      },
      {
        queryKey: dashboardQueryKeys.purchasing,
        queryFn: () => fetchDashboardEnvelope<PurchasingSummary>("/dashboard/purchasing-summary"),
        enabled: options.permissions.canViewPurchasing,
        refetchInterval: () => getVisibleRefetchInterval(options.autoRefresh, domainIntervalMs),
      },
      {
        queryKey: dashboardQueryKeys.pendingExceptions,
        queryFn: () => fetchDashboardEnvelope<PendingExceptionsSummary>("/dashboard/pending-exceptions"),
        enabled: options.permissions.canViewPendingExceptions,
        refetchInterval: () => getVisibleRefetchInterval(options.autoRefresh, pendingExceptionsIntervalMs),
      },
    ],
  });

  return {
    failedJobs: queries[0] as typeof queries[number] & { data?: OperationsListResult },
    recentJobs: queries[1] as typeof queries[number] & { data?: OperationsListResult },
    inventory: queries[2] as typeof queries[number] & { data?: InventorySummary },
    accounting: queries[3] as typeof queries[number] & { data?: AccountingSummary },
    purchasing: queries[4] as typeof queries[number] & { data?: PurchasingSummary },
    pendingExceptions: queries[5] as typeof queries[number] & { data?: PendingExceptionsSummary },
  };
}
