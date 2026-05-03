// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Metrics Collector
 * 
 * Tracks metrics for sync operations:
 * - Push/pull latency by entity type, company, and outlet (histogram in ms)
 * - Push/pull operation counts by status, company, and outlet (counter)
 * - Per-result outcome counters and latency (OK/DUPLICATE/ERROR)
 * - Conflict counts (counter)
 * 
 * Tenant isolation: All tenant-scoped metrics include {company_id, outlet_id}
 * labels per Story 30.7 / Story 52-9 requirements.
 * 
 * Canonical metric names:
 * - sync_push_latency_ms{company_id, outlet_id, entity_type}
 * - sync_push_total{company_id, outlet_id, status}
 * - sync_pull_latency_ms{company_id, outlet_id, entity_type}
 * - sync_pull_total{company_id, outlet_id, status}
 * - sync_conflicts_total{company_id, outlet_id}
 * - sync_push_results_total{company_id, outlet_id, result}
 * - sync_push_result_latency_ms{company_id, outlet_id, result}
 */

import { Counter, Histogram, register } from "prom-client";

/**
 * Sync result type for per-item outcome tracking
 * 
 * CONFLICT is a valid sync outcome but is mapped to ERROR
 * for Prometheus metrics (prevents silent data loss on
 * unexpected results reaching metric labels).
 */
export type SyncPushResultType = "OK" | "DUPLICATE" | "ERROR";

/**
 * Sync push labels
 */
export interface SyncPushLabels {
  company_id: string;
  outlet_id: string;
  status: "success" | "error" | "timeout";
}

/**
 * Sync pull labels
 */
export interface SyncPullLabels {
  company_id: string;
  outlet_id: string;
  status: "success" | "error" | "timeout";
}

/**
 * Sync conflict labels
 */
export interface SyncConflictLabels {
  company_id: string;
  outlet_id: string;
}

/**
 * Sync metrics collector class
 * 
 * All tenant-scoped metrics use {company_id, outlet_id} labels for
 * tenant isolation per Story 30.7. Company and outlet IDs are numbers
 * in business/domain but Prometheus labels are strings — explicit string
 * conversion is applied at call sites.
 */
export class SyncMetricsCollector {
  private readonly syncPushDuration: Histogram<string>;
  private readonly syncPullDuration: Histogram<string>;
  private readonly syncPushTotal: Counter<string>;
  private readonly syncPullTotal: Counter<string>;
  private readonly syncConflicts: Counter<string>;
  private readonly syncPushResults: Counter<string>;
  private readonly syncPushResultLatency: Histogram<string>;

  constructor() {
    // Sync push latency histogram (in milliseconds) — tenant-isolated
    this.syncPushDuration = new Histogram({
      name: "sync_push_latency_ms",
      help: "Duration of sync push operations in milliseconds per company/outlet",
      labelNames: ["company_id", "outlet_id", "entity_type"],
      buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000],
    });

    // Sync pull latency histogram (in milliseconds) — tenant-isolated
    this.syncPullDuration = new Histogram({
      name: "sync_pull_latency_ms",
      help: "Duration of sync pull operations in milliseconds per company/outlet",
      labelNames: ["company_id", "outlet_id", "entity_type"],
      buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000],
    });

    // Sync push operation counter — tenant-isolated
    this.syncPushTotal = new Counter({
      name: "sync_push_total",
      help: "Total sync push operations by company, outlet, and status",
      labelNames: ["company_id", "outlet_id", "status"],
    });

    // Sync pull operation counter — tenant-isolated
    this.syncPullTotal = new Counter({
      name: "sync_pull_total",
      help: "Total sync pull operations by company, outlet, and status",
      labelNames: ["company_id", "outlet_id", "status"],
    });

    // Sync conflicts counter (duplicates) — tenant-isolated
    this.syncConflicts = new Counter({
      name: "sync_conflicts_total",
      help: "Total number of sync conflicts (duplicates suppressed) by company/outlet",
      labelNames: ["company_id", "outlet_id"],
    });

    // Sync push per-item result counter — tenant-isolated (Story 52-9)
    this.syncPushResults = new Counter({
      name: "sync_push_results_total",
      help: "Total sync push result items by company, outlet, and result type (OK/DUPLICATE/ERROR)",
      labelNames: ["company_id", "outlet_id", "result"],
    });

    // Sync push per-item result latency histogram — tenant-isolated (Story 52-9)
    this.syncPushResultLatency = new Histogram({
      name: "sync_push_result_latency_ms",
      help: "Latency of individual sync push result items in milliseconds by company, outlet, and result type",
      labelNames: ["company_id", "outlet_id", "result"],
      buckets: [5, 10, 25, 50, 100, 200, 500, 1000, 2000, 5000],
    });
  }

  /**
   * Get the metrics registry
   */
  getRegistry() {
    return register;
  }

  /**
   * Record sync push latency in milliseconds — tenant-isolated
   * 
   * @param companyId - Company ID (converted to string for Prometheus label)
   * @param outletId - Outlet ID (converted to string for Prometheus label)
   * @param entityType - Entity type label (e.g., "transaction", "order")
   * @param durationMs - Duration in milliseconds
   */
  recordPushDuration(companyId: number, outletId: number, entityType: string, durationMs: number): void {
    this.syncPushDuration.observe({
      company_id: String(companyId),
      outlet_id: String(outletId),
      entity_type: entityType,
    }, durationMs);
  }

  /**
   * Record sync push operation (for success/failure counting) — tenant-isolated
   * 
   * @param companyId - Company ID (converted to string for Prometheus label)
   * @param outletId - Outlet ID (converted to string for Prometheus label)
   * @param status - Operation status
   */
  recordPushOperation(companyId: number, outletId: number, status: "success" | "error" | "timeout"): void {
    this.syncPushTotal.inc({
      company_id: String(companyId),
      outlet_id: String(outletId),
      status,
    });
  }

  /**
   * Record sync pull latency in milliseconds — tenant-isolated
   * 
   * @param companyId - Company ID (converted to string for Prometheus label)
   * @param outletId - Outlet ID (converted to string for Prometheus label)
   * @param entityType - Entity type label (e.g., "items", "variants")
   * @param durationMs - Duration in milliseconds
   */
  recordPullDuration(companyId: number, outletId: number, entityType: string, durationMs: number): void {
    this.syncPullDuration.observe({
      company_id: String(companyId),
      outlet_id: String(outletId),
      entity_type: entityType,
    }, durationMs);
  }

  /**
   * Record sync pull operation (for success/failure counting) — tenant-isolated
   * 
   * @param companyId - Company ID (converted to string for Prometheus label)
   * @param outletId - Outlet ID (converted to string for Prometheus label)
   * @param status - Operation status
   */
  recordPullOperation(companyId: number, outletId: number, status: "success" | "error" | "timeout"): void {
    this.syncPullTotal.inc({
      company_id: String(companyId),
      outlet_id: String(outletId),
      status,
    });
  }

  /**
   * Record sync conflict — tenant-isolated
   * 
   * @param companyId - Company ID (converted to string for Prometheus label)
   * @param outletId - Outlet ID (converted to string for Prometheus label)
   */
  recordConflict(companyId: number, outletId: number): void {
    this.syncConflicts.inc({
      company_id: String(companyId),
      outlet_id: String(outletId),
    });
  }

  /**
   * Record a sync push per-item outcome — tenant-isolated (Story 52-9)
   * 
   * Records individual result items from a sync push batch.
   * Latency represents the total push batch processing time applied
   * uniformly to all items in the batch (not per-item wall-clock).
   * 
   * NOTE: `client_tx_id` is accepted for structured logging ONLY —
   * it is NEVER used as a Prometheus label (high cardinality —
   * forbidden by telemetry policy).
   * 
   * @param companyId - Company ID (converted to string for Prometheus label)
   * @param outletId - Outlet ID (converted to string for Prometheus label)
   * @param result - Result type: "OK" | "DUPLICATE" | "ERROR"
   * @param latencyMs - Total push batch processing time in milliseconds
   * @param clientTxId - Optional client transaction ID for structured logging only
   */
  recordPushResult(
    companyId: number,
    outletId: number,
    result: SyncPushResultType,
    latencyMs: number,
    _clientTxId?: string,
  ): void {
    // Map unexpected result values to ERROR so they are not silently dropped
    const VALID_RESULTS = new Set(["OK", "DUPLICATE", "ERROR"] as const);
    const safeResult = VALID_RESULTS.has(result) ? result as "OK" | "DUPLICATE" | "ERROR" : "ERROR";

    // Guard against negative or zero latencies (clock skew protection)
    const safeLatency = Math.max(0, latencyMs);

    const labels = {
      company_id: String(companyId),
      outlet_id: String(outletId),
      result: safeResult,
    };
    this.syncPushResults.inc(labels);
    this.syncPushResultLatency.observe(labels, safeLatency);
  }
}

/**
 * Global singleton instance
 */
export const syncMetrics = new SyncMetricsCollector();
