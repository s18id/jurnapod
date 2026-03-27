// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Metrics Collector
 * 
 * Tracks metrics for sync operations:
 * - Push duration by entity type
 * - Pull duration by entity type
 * - Conflict counts
 */

import { Counter, Histogram, register } from "prom-client";

/**
 * Labels for sync metrics
 */
export interface SyncMetricLabels {
  entity_type: string;
  direction?: "push" | "pull";
}

/**
 * Sync metrics collector class
 */
export class SyncMetricsCollector {
  private readonly syncPushDuration: Histogram<string>;
  private readonly syncPullDuration: Histogram<string>;
  private readonly syncConflicts: Counter<string>;

  constructor() {
    // Sync push duration histogram
    this.syncPushDuration = new Histogram({
      name: "sync_push_duration_seconds",
      help: "Duration of sync push operations in seconds",
      labelNames: ["entity_type"],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    });

    // Sync pull duration histogram
    this.syncPullDuration = new Histogram({
      name: "sync_pull_duration_seconds",
      help: "Duration of sync pull operations in seconds",
      labelNames: ["entity_type"],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    });

    // Sync conflicts counter
    this.syncConflicts = new Counter({
      name: "sync_conflicts_total",
      help: "Total number of sync conflicts",
    });
  }

  /**
   * Get the metrics registry
   */
  getRegistry() {
    return register;
  }

  /**
   * Record sync push duration
   */
  recordPushDuration(entityType: string, durationSeconds: number): void {
    this.syncPushDuration.observe({ entity_type: entityType }, durationSeconds);
  }

  /**
   * Record sync pull duration
   */
  recordPullDuration(entityType: string, durationSeconds: number): void {
    this.syncPullDuration.observe({ entity_type: entityType }, durationSeconds);
  }

  /**
   * Record sync conflict
   */
  recordConflict(): void {
    this.syncConflicts.inc();
  }

}

/**
 * Global singleton instance
 */
export const syncMetrics = new SyncMetricsCollector();
