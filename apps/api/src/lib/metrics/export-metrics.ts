// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Export Metrics Collector
 * 
 * Tracks metrics for export operations:
 * - Duration by format and status
 * - Row counts by format
 * - Backpressure events
 */

import { Counter, Histogram, register } from "prom-client";

/**
 * Labels for export metrics
 */
export interface ExportMetricLabels {
  format: "csv" | "xlsx";
  status?: "success" | "failed";
}

/**
 * Export metrics collector class
 */
export class ExportMetricsCollector {
  private readonly exportDuration: Histogram<string>;
  private readonly exportRows: Counter<string>;
  private readonly exportBackpressure: Counter<string>;

  constructor() {
    // Export duration histogram by format and status
    this.exportDuration = new Histogram({
      name: "export_duration_seconds",
      help: "Duration of export operations in seconds",
      labelNames: ["format", "status"],
      buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300],
    });

    // Export rows counter by format
    this.exportRows = new Counter({
      name: "export_rows_total",
      help: "Total number of rows in exports",
      labelNames: ["format"],
    });

    // Backpressure events counter
    this.exportBackpressure = new Counter({
      name: "export_backpressure_events_total",
      help: "Total number of export backpressure events",
    });
  }

  /**
   * Get the metrics registry
   */
  getRegistry() {
    return register;
  }

  /**
   * Record export duration
   */
  recordDuration(format: "csv" | "xlsx", status: "success" | "failed", durationSeconds: number): void {
    this.exportDuration.observe({ format, status }, durationSeconds);
  }

  /**
   * Record rows exported
   */
  recordRows(format: "csv" | "xlsx", rows: number): void {
    this.exportRows.inc({ format }, rows);
  }

  /**
   * Record backpressure event
   */
  recordBackpressure(): void {
    this.exportBackpressure.inc();
  }

}

/**
 * Global singleton instance
 */
export const exportMetrics = new ExportMetricsCollector();
