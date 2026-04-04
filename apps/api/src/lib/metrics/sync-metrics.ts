// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Metrics Collector
 * 
 * Tracks metrics for sync operations:
 * - Push/pull latency by entity type and outlet (histogram in ms)
 * - Push/pull operation counts by status and outlet (counter)
 * - Conflict counts (counter)
 * 
 * Canonical metric names aligned with Epic 30 spec:
 * - sync_push_latency_ms{outlet_id, entity_type}
 * - sync_push_total{outlet_id, status}
 * - sync_pull_latency_ms{outlet_id, entity_type}
 * - sync_pull_total{outlet_id, status}
 * - sync_conflicts_total{outlet_id}
 */

import { Counter, Histogram, register } from "prom-client";

/**
 * Sync push labels
 */
export interface SyncPushLabels {
  outlet_id: string;
  status: "success" | "error" | "timeout";
}

/**
 * Sync pull labels
 */
export interface SyncPullLabels {
  outlet_id: string;
  status: "success" | "error" | "timeout";
}

/**
 * Sync conflict labels
 */
export interface SyncConflictLabels {
  outlet_id: string;
}

/**
 * Sync metrics collector class
 */
export class SyncMetricsCollector {
  private readonly syncPushDuration: Histogram<string>;
  private readonly syncPullDuration: Histogram<string>;
  private readonly syncPushTotal: Counter<string>;
  private readonly syncPullTotal: Counter<string>;
  private readonly syncConflicts: Counter<string>;

  constructor() {
    // Sync push latency histogram (in milliseconds)
    this.syncPushDuration = new Histogram({
      name: "sync_push_latency_ms",
      help: "Duration of sync push operations in milliseconds",
      labelNames: ["outlet_id", "entity_type"],
      buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000],
    });

    // Sync pull latency histogram (in milliseconds)
    this.syncPullDuration = new Histogram({
      name: "sync_pull_latency_ms",
      help: "Duration of sync pull operations in milliseconds",
      labelNames: ["outlet_id", "entity_type"],
      buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000],
    });

    // Sync push operation counter
    this.syncPushTotal = new Counter({
      name: "sync_push_total",
      help: "Total sync push operations by outlet and status",
      labelNames: ["outlet_id", "status"],
    });

    // Sync pull operation counter
    this.syncPullTotal = new Counter({
      name: "sync_pull_total",
      help: "Total sync pull operations by outlet and status",
      labelNames: ["outlet_id", "status"],
    });

    // Sync conflicts counter (duplicates)
    this.syncConflicts = new Counter({
      name: "sync_conflicts_total",
      help: "Total number of sync conflicts (duplicates suppressed) by outlet",
      labelNames: ["outlet_id"],
    });
  }

  /**
   * Get the metrics registry
   */
  getRegistry() {
    return register;
  }

  /**
   * Record sync push latency in milliseconds
   */
  recordPushDuration(outletId: string, entityType: string, durationMs: number): void {
    this.syncPushDuration.observe({ outlet_id: String(outletId), entity_type: entityType }, durationMs);
  }

  /**
   * Record sync push operation (for success/failure counting)
   */
  recordPushOperation(outletId: string, status: "success" | "error" | "timeout"): void {
    this.syncPushTotal.inc({ outlet_id: String(outletId), status });
  }

  /**
   * Record sync pull latency in milliseconds
   */
  recordPullDuration(outletId: string, entityType: string, durationMs: number): void {
    this.syncPullDuration.observe({ outlet_id: String(outletId), entity_type: entityType }, durationMs);
  }

  /**
   * Record sync pull operation (for success/failure counting)
   */
  recordPullOperation(outletId: string, status: "success" | "error" | "timeout"): void {
    this.syncPullTotal.inc({ outlet_id: String(outletId), status });
  }

  /**
   * Record sync conflict
   */
  recordConflict(outletId: string): void {
    this.syncConflicts.inc({ outlet_id: String(outletId) });
  }

}

/**
 * Global singleton instance
 */
export const syncMetrics = new SyncMetricsCollector();
