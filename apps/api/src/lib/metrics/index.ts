// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Metrics Index
 * 
 * Central exports for all metrics collectors.
 * Use this module to access shared metrics instances.
 */

import { collectDefaultMetrics, register } from "prom-client";

export { ImportMetricsCollector, importMetrics } from "./import-metrics";
export { ExportMetricsCollector, exportMetrics } from "./export-metrics";
export { SyncMetricsCollector, syncMetrics } from "./sync-metrics";

/**
 * Default metrics labels
 */
export const METRICS_DEFAULT_LABELS = {
  service: "jurnapod-api",
  version: process.env.npm_package_version ?? "0.1.0",
};

/**
 * Initialize default system metrics (memory, CPU, event loop, etc.)
 */
export function initializeDefaultMetrics(): void {
  // Set default labels
  register.setDefaultLabels(METRICS_DEFAULT_LABELS);

  // Collect default metrics (process CPU, memory, event loop, etc.)
  collectDefaultMetrics({
    register,
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  });
}

/**
 * Get all registered metrics as string
 */
export async function getMetricsOutput(): Promise<string> {
  return register.metrics();
}

/**
 * Get content type for metrics response
 */
export function getMetricsContentType(): string {
  return register.contentType;
}

// Re-export the global register for direct access
export { register };

/**
 * Labels type for all metrics
 */
export interface MetricsLabels {
  service?: string;
  version?: string;
  entity_type?: string;
  format?: string;
  status?: string;
  direction?: string;
}
