// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Health Check Metrics Integration
 * 
 * Provides metric snapshots for health check endpoint.
 * These are derived from the prom-client metrics.
 */

import { register } from "prom-client";

/**
 * Import metrics snapshot
 */
export interface ImportMetricsSnapshot {
  rowsProcessed: number;
  batchesCompleted: number;
  batchesFailed: number;
  resumes: number;
  recentFailures: number;
}

/**
 * Export metrics snapshot
 */
export interface ExportMetricsSnapshot {
  rowsExported: number;
  backpressureEvents: number;
  recentFailures: number;
}

/**
 * Sync metrics snapshot
 */
export interface SyncMetricsSnapshot {
  conflicts: number;
  pushOperations: number;
  pullOperations: number;
}

/**
 * Get import metrics snapshot from prom-client registry
 */
export async function getImportMetricsSnapshot(): Promise<ImportMetricsSnapshot> {
  const metrics = await register.getMetricsAsJSON();
  
  // Find import metrics
  const importRows = metrics.find(m => m.name === "import_rows_total");
  const importBatches = metrics.find(m => m.name === "import_batches_total");
  const importResumes = metrics.find(m => m.name === "import_resumes_total");
  
  // Sum all values for rows
  const rowsProcessed = importRows?.values.reduce((sum, v) => sum + v.value, 0) ?? 0;
  
  // Count batches by status
  const batchesCompleted = importBatches?.values
    .filter(v => v.labels.status === "success")
    .reduce((sum, v) => sum + v.value, 0) ?? 0;
  
  const batchesFailed = importBatches?.values
    .filter(v => v.labels.status === "failed")
    .reduce((sum, v) => sum + v.value, 0) ?? 0;
  
  const resumes = importResumes?.values.reduce((sum, v) => sum + v.value, 0) ?? 0;
  
  return {
    rowsProcessed,
    batchesCompleted,
    batchesFailed,
    resumes,
    recentFailures: batchesFailed,
  };
}

/**
 * Get export metrics snapshot from prom-client registry
 */
export async function getExportMetricsSnapshot(): Promise<ExportMetricsSnapshot> {
  const metrics = await register.getMetricsAsJSON();
  
  // Find export metrics
  const exportRows = metrics.find(m => m.name === "export_rows_total");
  const exportBackpressure = metrics.find(m => m.name === "export_backpressure_events_total");
  
  const rowsExported = exportRows?.values.reduce((sum, v) => sum + v.value, 0) ?? 0;
  const backpressureEvents = exportBackpressure?.values.reduce((sum, v) => sum + v.value, 0) ?? 0;
  
  return {
    rowsExported,
    backpressureEvents,
    recentFailures: 0,
  };
}

/**
 * Get sync metrics snapshot from prom-client registry
 */
export async function getSyncMetricsSnapshot(): Promise<SyncMetricsSnapshot> {
  const metrics = await register.getMetricsAsJSON();
  
  // Find sync metrics
  const syncPushDuration = metrics.find(m => m.name === "sync_push_duration_seconds");
  const syncPullDuration = metrics.find(m => m.name === "sync_pull_duration_seconds");
  const syncConflicts = metrics.find(m => m.name === "sync_conflicts_total");
  
  // Count operations from histogram counts (each observation increments by 1)
  const pushOperations = syncPushDuration?.values.reduce((sum, v) => sum + v.value, 0) ?? 0;
  const pullOperations = syncPullDuration?.values.reduce((sum, v) => sum + v.value, 0) ?? 0;
  const conflicts = syncConflicts?.values.reduce((sum, v) => sum + v.value, 0) ?? 0;
  
  return {
    conflicts,
    pushOperations,
    pullOperations,
  };
}

/**
 * Get memory usage in MB
 */
export function getMemoryUsageMB(): number {
  const usage = process.memoryUsage();
  return Math.round(usage.heapUsed / 1024 / 1024);
}

/**
 * Get system memory info
 */
export function getSystemMemoryInfo(): {
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  rssMB: number;
} {
  const usage = process.memoryUsage();
  return {
    heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
    externalMB: Math.round(usage.external / 1024 / 1024),
    rssMB: Math.round(usage.rss / 1024 / 1024),
  };
}
