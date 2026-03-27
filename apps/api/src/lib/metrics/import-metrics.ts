// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Metrics Collector
 * 
 * Tracks metrics for import operations:
 * - Duration by entity type and status
 * - Row counts by entity type
 * - Batch counts by status
 * - Resume counts
 */

import { Counter, Histogram, register } from "prom-client";

/**
 * Labels for import metrics
 */
export interface ImportMetricLabels {
  entity_type: "items" | "prices";
  status?: "success" | "failed";
}

/**
 * Import metrics collector class
 */
export class ImportMetricsCollector {
  private readonly importDuration: Histogram<string>;
  private readonly importRows: Counter<string>;
  private readonly importBatches: Counter<string>;
  private readonly importResumes: Counter<string>;

  constructor() {
    // Import duration histogram by entity type and status
    this.importDuration = new Histogram({
      name: "import_duration_seconds",
      help: "Duration of import operations in seconds",
      labelNames: ["entity_type", "status"],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
    });

    // Import rows counter by entity type
    this.importRows = new Counter({
      name: "import_rows_total",
      help: "Total number of rows processed in imports",
      labelNames: ["entity_type"],
    });

    // Import batches counter by status
    this.importBatches = new Counter({
      name: "import_batches_total",
      help: "Total number of import batches by status",
      labelNames: ["entity_type", "status"],
    });

    // Import resumes counter
    this.importResumes = new Counter({
      name: "import_resumes_total",
      help: "Total number of import resumptions",
    });
  }

  /**
   * Get the metrics registry
   */
  getRegistry() {
    return register;
  }

  /**
   * Record import duration
   */
  recordDuration(entityType: "items" | "prices", status: "success" | "failed", durationSeconds: number): void {
    this.importDuration.observe({ entity_type: entityType, status }, durationSeconds);
  }

  /**
   * Record rows processed
   */
  recordRows(entityType: "items" | "prices", rows: number): void {
    this.importRows.inc({ entity_type: entityType }, rows);
  }

  /**
   * Record batch completion
   */
  recordBatch(entityType: "items" | "prices", status: "success" | "failed"): void {
    this.importBatches.inc({ entity_type: entityType, status });
  }

  /**
   * Record import resume
   */
  recordResume(): void {
    this.importResumes.inc();
  }

  /**
   * Get current metric values (for testing/debugging)
   */
  getMetricsSnapshot(): {
    duration: Record<string, number>;
    rows: Record<string, number>;
    batches: Record<string, number>;
    resumes: number;
  } {
    return {
      duration: {},
      rows: {},
      batches: {},
      resumes: 0,
    };
  }

}

/**
 * Global singleton instance
 */
export const importMetrics = new ImportMetricsCollector();
