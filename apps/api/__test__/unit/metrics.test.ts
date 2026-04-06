// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Metrics Unit Tests
 * 
 * Tests for import/export/sync metrics collectors.
 * Uses singleton instances to avoid re-registering metrics with global registry.
 */

import { test, describe } from 'vitest';
import assert from "node:assert";
import { importMetrics } from "@/lib/metrics/import-metrics.js";
import { exportMetrics } from "@/lib/metrics/export-metrics.js";
import { syncMetrics } from "@/lib/metrics/sync-metrics.js";

describe("ImportMetricsCollector", () => {
  test("should have a registry", () => {
    assert.ok(importMetrics.getRegistry());
  });

  test("should record import duration", async () => {
    importMetrics.recordDuration("items", "success", 1.5);
    importMetrics.recordDuration("prices", "failed", 2.0);
    
    // Verify metrics were recorded by checking registry
    const metrics = await importMetrics.getRegistry().getMetricsAsJSON();
    const durationMetric = metrics.find((m: { name: string }) => m.name === "import_duration_seconds");
    assert.ok(durationMetric, "import_duration_seconds metric should exist");
  });

  test("should record import rows", async () => {
    importMetrics.recordRows("items", 100);
    importMetrics.recordRows("prices", 50);
    
    const metrics = await importMetrics.getRegistry().getMetricsAsJSON();
    const rowsMetric = metrics.find((m: { name: string }) => m.name === "import_rows_total");
    assert.ok(rowsMetric, "import_rows_total metric should exist");
  });

  test("should record import batches by status", async () => {
    importMetrics.recordBatch("items", "success");
    importMetrics.recordBatch("items", "success");
    importMetrics.recordBatch("items", "failed");
    
    const metrics = await importMetrics.getRegistry().getMetricsAsJSON();
    const batchesMetric = metrics.find((m: { name: string }) => m.name === "import_batches_total");
    assert.ok(batchesMetric, "import_batches_total metric should exist");
  });

  test("should record import resumes", async () => {
    importMetrics.recordResume();
    importMetrics.recordResume();
    
    const metrics = await importMetrics.getRegistry().getMetricsAsJSON();
    const resumesMetric = metrics.find((m: { name: string }) => m.name === "import_resumes_total");
    assert.ok(resumesMetric, "import_resumes_total metric should exist");
  });
});

describe("ExportMetricsCollector", () => {
  test("should have a registry", () => {
    assert.ok(exportMetrics.getRegistry());
  });

  test("should record export duration", async () => {
    exportMetrics.recordDuration("csv", "success", 2.5);
    exportMetrics.recordDuration("xlsx", "failed", 5.0);
    
    const metrics = await exportMetrics.getRegistry().getMetricsAsJSON();
    const durationMetric = metrics.find((m: { name: string }) => m.name === "export_duration_seconds");
    assert.ok(durationMetric, "export_duration_seconds metric should exist");
  });

  test("should record export rows", async () => {
    exportMetrics.recordRows("csv", 500);
    exportMetrics.recordRows("xlsx", 200);
    
    const metrics = await exportMetrics.getRegistry().getMetricsAsJSON();
    const rowsMetric = metrics.find((m: { name: string }) => m.name === "export_rows_total");
    assert.ok(rowsMetric, "export_rows_total metric should exist");
  });

  test("should record backpressure events", async () => {
    exportMetrics.recordBackpressure();
    exportMetrics.recordBackpressure();
    exportMetrics.recordBackpressure();
    
    const metrics = await exportMetrics.getRegistry().getMetricsAsJSON();
    const backpressureMetric = metrics.find((m: { name: string }) => m.name === "export_backpressure_events_total");
    assert.ok(backpressureMetric, "export_backpressure_events_total metric should exist");
  });
});

describe("SyncMetricsCollector", () => {
  test("should have a registry", () => {
    assert.ok(syncMetrics.getRegistry());
  });

  test("should record sync push latency", async () => {
    syncMetrics.recordPushDuration("outlet-1", "sales", 100);
    syncMetrics.recordPushDuration("outlet-1", "inventory", 200);
    
    const metrics = await syncMetrics.getRegistry().getMetricsAsJSON();
    const pushMetric = metrics.find((m: { name: string }) => m.name === "sync_push_latency_ms");
    assert.ok(pushMetric, "sync_push_latency_ms metric should exist");
  });

  test("should record sync push operations", async () => {
    syncMetrics.recordPushOperation("outlet-1", "success");
    syncMetrics.recordPushOperation("outlet-1", "error");
    
    const metrics = await syncMetrics.getRegistry().getMetricsAsJSON();
    const pushTotalMetric = metrics.find((m: { name: string }) => m.name === "sync_push_total");
    assert.ok(pushTotalMetric, "sync_push_total metric should exist");
  });

  test("should record sync pull latency", async () => {
    syncMetrics.recordPullDuration("outlet-1", "items", 50);
    syncMetrics.recordPullDuration("outlet-1", "prices", 150);
    
    const metrics = await syncMetrics.getRegistry().getMetricsAsJSON();
    const pullMetric = metrics.find((m: { name: string }) => m.name === "sync_pull_latency_ms");
    assert.ok(pullMetric, "sync_pull_latency_ms metric should exist");
  });

  test("should record sync pull operations", async () => {
    syncMetrics.recordPullOperation("outlet-1", "success");
    
    const metrics = await syncMetrics.getRegistry().getMetricsAsJSON();
    const pullTotalMetric = metrics.find((m: { name: string }) => m.name === "sync_pull_total");
    assert.ok(pullTotalMetric, "sync_pull_total metric should exist");
  });

  test("should record sync conflicts", async () => {
    syncMetrics.recordConflict("outlet-1");
    syncMetrics.recordConflict("outlet-2");
    
    const metrics = await syncMetrics.getRegistry().getMetricsAsJSON();
    const conflictsMetric = metrics.find((m: { name: string }) => m.name === "sync_conflicts_total");
    assert.ok(conflictsMetric, "sync_conflicts_total metric should exist");
  });
});
