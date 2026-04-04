// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Dashboard Snapshot Runtime
 * 
 * Provides metrics snapshot functions for dashboard consumption.
 * These functions read from a prom-client registry and format
 * the data for dashboard display.
 * 
 * This module is designed to be used by both:
 * - The API layer (as thin adapter)
 * - Other packages that need dashboard metrics
 */

import type { Registry } from "prom-client";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Outbox metrics snapshot for sync dashboard
 */
export interface OutboxMetricsSnapshot {
  totalLagItems: number;
  maxRetryDepth: number;
  duplicateSuppressions: number;
  totalFailures: number;
  byOutlet: Array<{
    outletId: string;
    lagItems: number;
    retryDepth: number;
  }>;
  failuresByReason: Record<string, number>;
}

/**
 * Sync health metrics snapshot
 */
export interface SyncHealthMetricsSnapshot {
  pushOperations: number;
  pullOperations: number;
  conflicts: number;
  avgPushDurationMs: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
}

/**
 * Journal health metrics snapshot
 */
export interface JournalHealthMetricsSnapshot {
  totalSuccesses: number;
  totalFailures: number;
  successRate: number;
  glImbalances: number;
  missingJournals: number;
  unbalancedBatches: number;
  postingByDomain: Array<{
    domain: string;
    successes: number;
    failures: number;
    total: number;
    successRate: number;
  }>;
  failuresByReason: Record<string, number>;
  alerts: {
    syncLatencyBreach: boolean;
    outboxLagCritical: boolean;
    journalFailureRate: boolean;
    glImbalance: boolean;
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Helper to filter values by company_id label
 * Domain IDs (company_id) are numbers in business/domain, but Prometheus labels are strings.
 * Explicit string conversion for matching.
 */
function filterByCompany<T extends { labels: Record<string, unknown> }>(
  values: T[],
  companyId?: number
): T[] {
  if (companyId === undefined) return values;
  return values.filter(v => String(v.labels.company_id) === String(companyId));
}

// =============================================================================
// SNAPSHOT FUNCTIONS
// =============================================================================

/**
 * Get outbox metrics snapshot from prom-client registry
 * @param registry - The prom-client registry to read from
 * @param companyId - Optional company ID to filter metrics by tenant.
 */
export async function getOutboxMetricsSnapshot(
  registry: Registry,
  companyId?: number
): Promise<OutboxMetricsSnapshot> {
  const metrics = await registry.getMetricsAsJSON();

  // Find outbox metrics
  const outboxLagItems = metrics.find(m => m.name === "outbox_lag_items");
  const outboxRetryDepth = metrics.find(m => m.name === "outbox_retry_depth");
  const outboxFailures = metrics.find(m => m.name === "outbox_failure_total");
  const clientTxIdDuplicates = metrics.find(m => m.name === "client_tx_id_duplicates_total");

  // Calculate totals filtered by company
  const filteredLagItems = filterByCompany(outboxLagItems?.values ?? [], companyId);
  const filteredRetryDepth = filterByCompany(outboxRetryDepth?.values ?? [], companyId);
  const filteredDuplicates = filterByCompany(clientTxIdDuplicates?.values ?? [], companyId);
  const filteredFailures = filterByCompany(outboxFailures?.values ?? [], companyId);

  const totalLagItems = filteredLagItems.reduce((sum, v) => sum + v.value, 0);
  const maxRetryDepth = filteredRetryDepth.reduce((max, v) => Math.max(max, v.value), 0);
  const duplicateSuppressions = filteredDuplicates.reduce((sum, v) => sum + v.value, 0);

  // Sum failures by reason
  const failuresByReason: Record<string, number> = {};
  let totalFailures = 0;
  
  for (const v of filteredFailures) {
    const reason = (v.labels as Record<string, unknown>)?.reason ?? "unknown";
    failuresByReason[reason as string] = (failuresByReason[reason as string] ?? 0) + v.value;
    totalFailures += v.value;
  }

  // Get by outlet breakdown filtered by company
  const byOutlet: Array<{ outletId: string; lagItems: number; retryDepth: number }> = [];
  const outletMap = new Map<string, { lagItems: number; retryDepth: number }>();

  for (const v of filteredLagItems) {
    const outletId = (v.labels as Record<string, unknown>)?.outlet_id ?? "unknown";
    const existing = outletMap.get(outletId as string) ?? { lagItems: 0, retryDepth: 0 };
    existing.lagItems = v.value;
    outletMap.set(outletId as string, existing);
  }

  for (const v of filteredRetryDepth) {
    const outletId = (v.labels as Record<string, unknown>)?.outlet_id ?? "unknown";
    const existing = outletMap.get(outletId as string) ?? { lagItems: 0, retryDepth: 0 };
    existing.retryDepth = v.value;
    outletMap.set(outletId as string, existing);
  }

  for (const [outletId, data] of outletMap) {
    byOutlet.push({ outletId, ...data });
  }

  return {
    totalLagItems,
    maxRetryDepth,
    duplicateSuppressions,
    totalFailures,
    byOutlet,
    failuresByReason,
  };
}

/**
 * Get sync health metrics snapshot from prom-client registry
 * @param registry - The prom-client registry to read from
 * @param companyId - Optional company ID to filter metrics by tenant.
 */
export async function getSyncHealthMetricsSnapshot(
  registry: Registry,
  companyId?: number
): Promise<SyncHealthMetricsSnapshot> {
  const metrics = await registry.getMetricsAsJSON();

  // Find sync metrics - canonical names per Epic 30
  const syncPushLatency = metrics.find(m => m.name === "sync_push_latency_ms");
  const syncPullLatency = metrics.find(m => m.name === "sync_pull_latency_ms");
  const syncPushTotal = metrics.find(m => m.name === "sync_push_total");
  const syncPullTotal = metrics.find(m => m.name === "sync_pull_total");
  const syncConflicts = metrics.find(m => m.name === "sync_conflicts_total");

  // Filter values by company
  const filteredPushTotal = filterByCompany(syncPushTotal?.values ?? [], companyId);
  const filteredPullTotal = filterByCompany(syncPullTotal?.values ?? [], companyId);
  const filteredConflicts = filterByCompany(syncConflicts?.values ?? [], companyId);

  // Count operations from counters
  let pushOperations = 0;
  let pullOperations = 0;
  
  for (const v of filteredPushTotal) {
    pushOperations += v.value;
  }
  
  for (const v of filteredPullTotal) {
    pullOperations += v.value;
  }
  
  const conflicts = filteredConflicts.reduce((sum, v) => sum + v.value, 0);

  // Calculate latency percentiles from histogram
  // Histogram values are cumulative counts at each bucket boundary
  // We use the bucket values to estimate percentiles
  let p50 = 0, p95 = 0, p99 = 0;
  
  if (syncPushLatency) {
    const allValues = syncPushLatency.values;
    
    // Get total count from +Inf bucket (histogram cumulative count)
    const infEntry = allValues.find(v => v.labels.le === '+Inf');
    const total = infEntry ? infEntry.value : 0;
    
    if (total > 0) {
      // Filter to bucket entries only (exclude _sum, _count, and +Inf)
      // and sort by le numerically
      const buckets = allValues
        .filter(v => !isNaN(Number(v.labels.le)) && v.labels.le !== '+Inf')
        .sort((a, b) => Number(a.labels.le) - Number(b.labels.le));
      
      // Find percentiles by iterating sorted buckets
      let cumsum = 0;
      
      for (let i = 0; i < buckets.length; i++) {
        cumsum += buckets[i].value;
        if (p50 === 0 && cumsum >= total * 0.5) {
          p50 = Number(buckets[i].labels.le);
        }
        if (p95 === 0 && cumsum >= total * 0.95) {
          p95 = Number(buckets[i].labels.le);
        }
        if (p99 === 0 && cumsum >= total * 0.99) {
          p99 = Number(buckets[i].labels.le);
        }
      }
      
      // Fill in any remaining percentiles with the last bucket value
      if (p50 === 0) p50 = buckets.length > 0 ? Number(buckets[buckets.length - 1].labels.le) : 0;
      if (p95 === 0) p95 = buckets.length > 0 ? Number(buckets[buckets.length - 1].labels.le) : 0;
      if (p99 === 0) p99 = buckets.length > 0 ? Number(buckets[buckets.length - 1].labels.le) : 0;
    }
  }

  // Calculate average push latency (use p50 as approximation)
  const avgPushDurationMs = p50;

  return {
    pushOperations,
    pullOperations,
    conflicts,
    avgPushDurationMs,
    latencyP50: p50,
    latencyP95: p95,
    latencyP99: p99,
  };
}

/**
 * Get journal health metrics snapshot from prom-client registry
 * @param registry - The prom-client registry to read from
 * @param companyId - Optional company ID to filter metrics by tenant.
 */
export async function getJournalHealthMetricsSnapshot(
  registry: Registry,
  companyId?: number
): Promise<JournalHealthMetricsSnapshot> {
  const metrics = await registry.getMetricsAsJSON();

  // Find journal metrics
  const journalSuccess = metrics.find(m => m.name === "journal_post_success_total");
  const journalFailure = metrics.find(m => m.name === "journal_post_failure_total");
  const glImbalance = metrics.find(m => m.name === "gl_imbalance_detected_total");
  const missingJournal = metrics.find(m => m.name === "journal_missing_alert_total");

  // Filter values by company
  const filteredSuccess = filterByCompany(journalSuccess?.values ?? [], companyId);
  const filteredFailure = filterByCompany(journalFailure?.values ?? [], companyId);
  const filteredGlImbalance = filterByCompany(glImbalance?.values ?? [], companyId);
  const filteredMissingJournal = filterByCompany(missingJournal?.values ?? [], companyId);

  // Calculate totals
  let totalSuccesses = 0;
  const postingByDomainMap = new Map<string, { successes: number; failures: number }>();
  const failuresByReason: Record<string, number> = {};

  for (const v of filteredSuccess) {
    totalSuccesses += v.value;
    const domain = (v.labels as Record<string, unknown>)?.domain ?? "unknown";
    const existing = postingByDomainMap.get(domain as string) ?? { successes: 0, failures: 0 };
    existing.successes = v.value;
    postingByDomainMap.set(domain as string, existing);
  }

  let totalFailures = 0;
  for (const v of filteredFailure) {
    totalFailures += v.value;
    const domain = (v.labels as Record<string, unknown>)?.domain ?? "unknown";
    const reason = (v.labels as Record<string, unknown>)?.reason ?? "unknown";
    const existing = postingByDomainMap.get(domain as string) ?? { successes: 0, failures: 0 };
    existing.failures += v.value;
    postingByDomainMap.set(domain as string, existing);
    failuresByReason[reason as string] = (failuresByReason[reason as string] ?? 0) + v.value;
  }

  const postingByDomain = Array.from(postingByDomainMap.entries()).map(([domain, data]) => ({
    domain,
    successes: data.successes,
    failures: data.failures,
    total: data.successes + data.failures,
    successRate: data.successes + data.failures > 0 
      ? data.successes / (data.successes + data.failures) 
      : 1.0,
  }));

  const glImbalances = filteredGlImbalance.reduce((sum, v) => sum + v.value, 0);
  const missingJournals = filteredMissingJournal.reduce((sum, v) => sum + v.value, 0);

  // Calculate success rate
  const totalOperations = totalSuccesses + totalFailures;
  const successRate = totalOperations > 0 ? totalSuccesses / totalOperations : 1.0;

  // Determine alert statuses based on thresholds
  const alerts = {
    syncLatencyBreach: false, // Would need sync latency metrics
    outboxLagCritical: false, // Would need outbox lag metrics
    journalFailureRate: successRate < 0.999,
    glImbalance: glImbalances > 0,
  };

  return {
    totalSuccesses,
    totalFailures,
    successRate,
    glImbalances,
    missingJournals,
    unbalancedBatches: 0, // Would need from reconciliation
    postingByDomain,
    failuresByReason,
    alerts,
  };
}
