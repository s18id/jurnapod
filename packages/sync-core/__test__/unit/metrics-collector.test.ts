// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tests for Sync Idempotency Metrics Collector
 * Story: Epic 11.3 — Sync Idempotency and Retry Resilience Hardening
 * Story: Epic 52.9 — Observability: Idempotency Metrics
 */

import { describe, it, assert, beforeEach } from "vitest";
import {
  SyncIdempotencyMetricsCollector,
  syncIdempotencyMetricsCollector,
  DEFAULT_SYNC_IDEMPOTENCY_METRICS,
  getLatencyPercentiles,
  type SyncOperationResult,
  type TenantMetrics,
} from "../../src/idempotency/metrics-collector.js";
import { ERROR_CLASSIFICATION } from "../../src/idempotency/sync-idempotency.js";

describe("SyncIdempotencyMetricsCollector", () => {
  let collector: SyncIdempotencyMetricsCollector;

  beforeEach(() => {
    collector = new SyncIdempotencyMetricsCollector();
  });

  // ========================================================================
  // Existing tests (backward compatibility)
  // ========================================================================

  describe("reset", () => {
    it("should reset all metrics to defaults", () => {
      collector.recordRequest(10);
      collector.recordDuplicateSubmission();
      collector.recordDedupeHit();

      collector.reset();

      const metrics = collector.getMetrics();
      assert.deepStrictEqual(metrics, DEFAULT_SYNC_IDEMPOTENCY_METRICS);
    });

    it("should clear per-tenant metrics on reset", () => {
      collector.recordResults(1, [{ client_tx_id: "tx-1", result: "OK", latency_ms: 100 }]);
      assert.isDefined(collector.getTenantMetrics(1));

      collector.reset();

      assert.isUndefined(collector.getTenantMetrics(1));
    });
  });

  describe("getMetrics", () => {
    it("should return a copy of metrics", () => {
      collector.recordRequest(5);

      const metrics1 = collector.getMetrics();
      const metrics2 = collector.getMetrics();

      assert.notStrictEqual(metrics1, metrics2);
      assert.deepStrictEqual(metrics1, metrics2);
    });
  });

  describe("recordRequest", () => {
    it("should increment total_requests and total_transactions", () => {
      collector.recordRequest(3);

      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.total_requests, 1);
      assert.strictEqual(metrics.total_transactions, 3);
    });

    it("should default to 1 transaction if not specified", () => {
      collector.recordRequest();

      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.total_transactions, 1);
    });
  });

  describe("recordDuplicateSubmission", () => {
    it("should increment duplicate_submissions counter", () => {
      collector.recordDuplicateSubmission();
      collector.recordDuplicateSubmission();

      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.duplicate_submissions, 2);
    });
  });

  describe("recordDedupeHit", () => {
    it("should increment dedupe_hits and calculate dedupe_hit_rate", () => {
      collector.recordRequest(10);
      collector.recordDedupeHit();
      collector.recordDedupeHit();
      collector.recordDedupeHit();

      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.dedupe_hits, 3);
      assert.strictEqual(metrics.dedupe_hit_rate, 0.3);
    });

    it("should handle zero transactions", () => {
      collector.recordDedupeHit();

      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.dedupe_hit_rate, 0);
    });
  });

  describe("recordError", () => {
    it("should increment retryable_errors for TRANSIENT", () => {
      collector.recordError(ERROR_CLASSIFICATION.TRANSIENT, true);

      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.retryable_errors, 1);
      assert.deepStrictEqual(metrics.retries_by_class.TRANSIENT, 1);
    });

    it("should increment non_retryable_errors for VALIDATION", () => {
      collector.recordError(ERROR_CLASSIFICATION.VALIDATION, false);

      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.non_retryable_errors, 1);
      assert.deepStrictEqual(metrics.retries_by_class.VALIDATION, 1);
    });

    it("should increment appropriate counter based on isRetryable flag", () => {
      collector.recordError(ERROR_CLASSIFICATION.BUSINESS_LOGIC, false);
      collector.recordError(ERROR_CLASSIFICATION.SYSTEM, false);
      collector.recordError(ERROR_CLASSIFICATION.TRANSIENT, true);

      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.non_retryable_errors, 2);
      assert.strictEqual(metrics.retryable_errors, 1);
    });
  });

  describe("recordSyncCompletionLatency", () => {
    it("should record sync completion latency", () => {
      collector.recordSyncCompletionLatency(15000);

      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.sync_completion_latency_ms, 15000);
    });
  });

  describe("recordQueueDrainTime", () => {
    it("should record queue drain time", () => {
      collector.recordQueueDrainTime(5000);

      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.queue_drain_time_ms, 5000);
    });
  });

  describe("recordOldestQueueItemAge", () => {
    it("should record oldest queue item age", () => {
      collector.recordOldestQueueItemAge(60000);

      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.oldest_queue_item_age_ms, 60000);
    });

    it("should handle zero age", () => {
      collector.recordOldestQueueItemAge(0);

      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.oldest_queue_item_age_ms, 0);
    });
  });

  describe("recordBatchProcessingTime", () => {
    it("should calculate incremental average", () => {
      collector.recordBatchProcessingTime(100, 1);
      collector.recordBatchProcessingTime(200, 2);

      const metrics = collector.getMetrics();
      // Average should be (100 + 200) / 2 = 150
      assert.strictEqual(metrics.avg_batch_processing_time_ms, 150);
    });
  });

  describe("batch timing", () => {
    it("should track batch start and end times", () => {
      collector.startBatch();
      
      // Simulate some work
      collector.recordRequest(5);
      
      collector.endBatch(5);

      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.avg_batch_processing_time_ms >= 0, true);
    });

    it("should calculate running average across multiple batches", () => {
      collector.startBatch();
      collector.recordRequest(3);
      collector.endBatch(1);

      collector.startBatch();
      collector.recordRequest(2);
      collector.endBatch(2);

      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.avg_batch_processing_time_ms >= 0, true);
    });
  });

  describe("queue item tracking", () => {
    it("should track enqueued and dequeued items", () => {
      collector.enqueueItem("tx-1");
      collector.enqueueItem("tx-2");
      collector.enqueueItem("tx-3");

      collector.updateOldestQueueItemAge();
      
      let metrics = collector.getMetrics();
      assert.strictEqual(metrics.oldest_queue_item_age_ms >= 0, true);

      collector.dequeueItem("tx-2");

      metrics = collector.getMetrics();
      assert.strictEqual(metrics.oldest_queue_item_age_ms >= 0, true);
    });
  });

  // ========================================================================
  // Updated recordResults (Story 52-9 — now takes companyId)
  // ========================================================================

  describe("recordResults", () => {
    it("should process multiple results with companyId and update both global and per-tenant metrics", () => {
      const results: SyncOperationResult[] = [
        { client_tx_id: "tx-1", result: "OK", latency_ms: 100 },
        { client_tx_id: "tx-2", result: "DUPLICATE", latency_ms: 50 },
        { client_tx_id: "tx-3", result: "DUPLICATE", latency_ms: 50 },
        { 
          client_tx_id: "tx-4", 
          result: "ERROR", 
          latency_ms: 100,
          error_classification: ERROR_CLASSIFICATION.TRANSIENT,
          is_retry: true,
        },
        { 
          client_tx_id: "tx-5", 
          result: "ERROR", 
          latency_ms: 100,
          error_classification: ERROR_CLASSIFICATION.VALIDATION,
        },
      ];

      collector.recordResults(42, results);

      // Global metrics
      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.duplicate_submissions, 2);
      assert.strictEqual(metrics.dedupe_hits, 2);
      assert.strictEqual(metrics.retryable_errors, 1);
      assert.strictEqual(metrics.non_retryable_errors, 1);

      // Per-tenant metrics
      const tenantMetrics = collector.getTenantMetrics(42);
      assert.isDefined(tenantMetrics);
      assert.strictEqual(tenantMetrics!.totalRequests, 5);
      assert.strictEqual(tenantMetrics!.okCount, 1);
      assert.strictEqual(tenantMetrics!.duplicateCount, 2);
      assert.strictEqual(tenantMetrics!.errorCount, 2);
    });

    it("should track OK results in per-tenant metrics (new in Story 52-9)", () => {
      const results: SyncOperationResult[] = [
        { client_tx_id: "tx-1", result: "OK", latency_ms: 10 },
        { client_tx_id: "tx-2", result: "OK", latency_ms: 20 },
        { client_tx_id: "tx-3", result: "OK", latency_ms: 30 },
      ];

      collector.recordResults(7, results);

      const tm = collector.getTenantMetrics(7);
      assert.strictEqual(tm!.okCount, 3);
      assert.strictEqual(tm!.duplicateCount, 0);
      assert.strictEqual(tm!.errorCount, 0);
    });

    it("should maintain separate per-tenant state per company", () => {
      collector.recordResults(1, [
        { client_tx_id: "tx-1", result: "OK", latency_ms: 10 },
        { client_tx_id: "tx-2", result: "DUPLICATE", latency_ms: 5 },
      ]);
      collector.recordResults(2, [
        { client_tx_id: "tx-3", result: "ERROR", latency_ms: 50 },
      ]);

      const tm1 = collector.getTenantMetrics(1);
      const tm2 = collector.getTenantMetrics(2);

      assert.strictEqual(tm1!.totalRequests, 2);
      assert.strictEqual(tm1!.okCount, 1);
      assert.strictEqual(tm1!.duplicateCount, 1);

      assert.strictEqual(tm2!.totalRequests, 1);
      assert.strictEqual(tm2!.errorCount, 1);
      assert.strictEqual(tm2!.okCount, 0);
    });

    it("should treat CONFLICT as error in per-tenant tracking", () => {
      collector.recordResults(5, [
        { client_tx_id: "tx-1", result: "CONFLICT", latency_ms: 100 },
      ]);

      const tm = collector.getTenantMetrics(5);
      assert.strictEqual(tm!.errorCount, 1);
    });
  });

  // ========================================================================
  // Per-Tenant Metrics (Story 52-9)
  // ========================================================================

  describe("getTenantMetrics", () => {
    it("should return undefined for untracked company", () => {
      const tm = collector.getTenantMetrics(999);
      assert.isUndefined(tm);
    });

    it("should return a snapshot (immutable copy) of tenant metrics", () => {
      collector.recordResults(3, [
        { client_tx_id: "tx-1", result: "OK", latency_ms: 10 },
      ]);

      const tm1 = collector.getTenantMetrics(3);
      const tm2 = collector.getTenantMetrics(3);

      assert.notStrictEqual(tm1, tm2);
      assert.notStrictEqual(tm1!.latencies, tm2!.latencies);
      assert.deepStrictEqual(tm1, tm2);

      // Verify deep copy: mutating returned arrays does NOT affect internal state
      tm1!.latencies.ok.push(9999);
      const tm3 = collector.getTenantMetrics(3);
      assert.strictEqual(tm3!.latencies.ok.length, 1, "Internal ok array should not be affected by mutation of returned copy");
      assert.notInclude(tm3!.latencies.ok, 9999, "Internal ok array should not contain pushed value");
    });

    it("should calculate correct duplicate rate and error rate", () => {
      collector.recordResults(10, [
        { client_tx_id: "tx-1", result: "OK", latency_ms: 10 },
        { client_tx_id: "tx-2", result: "OK", latency_ms: 10 },
        { client_tx_id: "tx-3", result: "DUPLICATE", latency_ms: 5 },
        { client_tx_id: "tx-4", result: "ERROR", latency_ms: 50 },
      ]);

      const tm = collector.getTenantMetrics(10);
      // 2 OK + 1 DUPLICATE + 1 ERROR = 4 total
      assert.strictEqual(tm!.duplicateRate, 1 / 4);  // 0.25
      assert.strictEqual(tm!.errorRate, 1 / 4);       // 0.25
    });
  });

  // ========================================================================
  // Percentile Computation (Story 52-9)
  // ========================================================================

  describe("getLatencyPercentiles", () => {
    it("should return 0/0 for empty array", () => {
      const result = getLatencyPercentiles([]);
      assert.strictEqual(result.p50, 0);
      assert.strictEqual(result.p95, 0);
    });

    it("should return correct p50 and p95 for known input", () => {
      // 100 values from 1 to 100
      const latencies = Array.from({ length: 100 }, (_, i) => i + 1);
      const result = getLatencyPercentiles(latencies);
      // Nearest-rank p50 of 1-100: index = ceil(0.5 * 100) - 1 = 49 -> value 50
      assert.strictEqual(result.p50, 50);
      // Nearest-rank p95 of 1-100: index = ceil(0.95 * 100) - 1 = 94 -> value 95
      assert.strictEqual(result.p95, 95);
    });
  });

  describe("getTenantLatencyPercentiles", () => {
    it("should return 0/0 for untracked company", () => {
      const result = collector.getTenantLatencyPercentiles(999, "ok");
      assert.strictEqual(result.p50, 0);
      assert.strictEqual(result.p95, 0);
    });

    it("should compute per-tenant latencies by result type", () => {
      const okResults: SyncOperationResult[] = Array.from({ length: 100 }, (_, i) => ({
        client_tx_id: `ok-${i}`,
        result: "OK" as const,
        latency_ms: i + 1,
      }));
      collector.recordResults(1, okResults);

      const result = collector.getTenantLatencyPercentiles(1, "ok");
      // Nearest-rank p50 of 1-100: index = ceil(0.5 * 100) - 1 = 49 -> value 50
      assert.strictEqual(result.p50, 50);
      // Nearest-rank p95 of 1-100: index = ceil(0.95 * 100) - 1 = 94 -> value 95
      assert.strictEqual(result.p95, 95);
    });
  });

  // ========================================================================
  // Alert Conditions with Updated Thresholds (Story 52-9)
  // ========================================================================

  describe("getAlertConditions", () => {
    it("should not alert when metrics are normal", () => {
      collector.recordRequest(100);
      collector.recordDedupeHit();

      const alerts = collector.getAlertConditions();
      assert.deepStrictEqual(alerts, []);
    });

    it("should alert on high dedupe rate (>5%)", () => {
      collector.recordRequest(20);
      for (let i = 0; i < 5; i++) {
        collector.recordDuplicateSubmission();
        collector.recordDedupeHit();
      }
      // 5 duplicates / 20 transactions = 25% > 5%

      const alerts = collector.getAlertConditions();
      const dedupeAlert = alerts.find(a => a.alert === "HIGH_DEDUPE_RATE");
      assert.isDefined(dedupeAlert);
      assert.strictEqual(dedupeAlert!.threshold, 0.05);
    });

    it("should NOT alert on dedupe rate below 5%", () => {
      collector.recordRequest(100);
      collector.recordDuplicateSubmission();
      // 1 duplicate / 100 transactions = 1% < 5%

      const alerts = collector.getAlertConditions();
      const dedupeAlert = alerts.find(a => a.alert === "HIGH_DEDUPE_RATE");
      assert.isUndefined(dedupeAlert);
    });

    it("should alert on high error rate (>1%)", () => {
      collector.recordRequest(50);
      collector.recordError(ERROR_CLASSIFICATION.VALIDATION, false);
      // 1 error / 50 transactions = 2% > 1%

      const alerts = collector.getAlertConditions();
      const errorAlert = alerts.find(a => a.alert === "HIGH_ERROR_RATE");
      assert.isDefined(errorAlert);
      assert.strictEqual(errorAlert!.threshold, 0.01);
    });

    it("should NOT alert on error rate below 1%", () => {
      collector.recordRequest(200);
      collector.recordError(ERROR_CLASSIFICATION.VALIDATION, false);
      // 1 error / 200 transactions = 0.5% < 1%

      const alerts = collector.getAlertConditions();
      const errorAlert = alerts.find(a => a.alert === "HIGH_ERROR_RATE");
      assert.isUndefined(errorAlert);
    });

    it("should alert on stale queue", () => {
      collector.recordOldestQueueItemAge(6 * 60 * 1000); // 6 minutes

      const alerts = collector.getAlertConditions();
      assert.isTrue(alerts.some(a => a.alert === "STALE_QUEUE"));
    });

    it("should alert on high sync latency", () => {
      collector.recordSyncCompletionLatency(35000); // 35 seconds

      const alerts = collector.getAlertConditions();
      assert.isTrue(alerts.some(a => a.alert === "HIGH_SYNC_LATENCY"));
    });

    it("should alert on high retry rate", () => {
      // Record enough errors to establish base
      collector.recordRequest(10);
      collector.recordError(ERROR_CLASSIFICATION.VALIDATION, false); // 1 non-retryable
      collector.recordError(ERROR_CLASSIFICATION.TRANSIENT, true);   // 1 retryable
      // 1/2 errors are retries = 50% exactly -> not > 50%
      // Need more retryable
      collector.recordError(ERROR_CLASSIFICATION.TRANSIENT, true);   // 2 retryable

      const alerts = collector.getAlertConditions();
      assert.isTrue(alerts.some(a => a.alert === "HIGH_RETRY_RATE"));
    });
  });

  describe("getTenantAlertConditions", () => {
    it("should return empty for untracked tenant", () => {
      const alerts = collector.getTenantAlertConditions(999);
      assert.deepStrictEqual(alerts, []);
    });

    it("should alert on per-tenant duplicate rate > 5%", () => {
      collector.recordResults(1, [
        { client_tx_id: "tx-1", result: "OK", latency_ms: 10 },
        { client_tx_id: "tx-2", result: "DUPLICATE", latency_ms: 5 },
      ]);
      // 1/2 = 50% > 5%

      const alerts = collector.getTenantAlertConditions(1);
      assert.isTrue(alerts.some(a => a.alert === "TENANT_HIGH_DEDUPE_RATE"));
    });

    it("should alert on per-tenant error rate > 1%", () => {
      collector.recordResults(2, [
        { client_tx_id: "tx-1", result: "ERROR", latency_ms: 50 },
      ]);
      // 1/1 = 100% > 1%

      const alerts = collector.getTenantAlertConditions(2);
      assert.isTrue(alerts.some(a => a.alert === "TENANT_HIGH_ERROR_RATE"));
    });

    it("should not alert for normal per-tenant rates", () => {
      collector.recordResults(3, [
        { client_tx_id: "tx-1", result: "OK", latency_ms: 10 },
        { client_tx_id: "tx-2", result: "OK", latency_ms: 10 },
        { client_tx_id: "tx-3", result: "OK", latency_ms: 10 },
      ]);

      const alerts = collector.getTenantAlertConditions(3);
      assert.deepStrictEqual(alerts, []);
    });
  });

  describe("getSummary", () => {
    it("should return summary object with string dedupe_hit_rate", () => {
      collector.recordRequest(100);
      collector.recordDuplicateSubmission();
      collector.recordDedupeHit();
      collector.recordDuplicateSubmission();
      collector.recordDedupeHit();
      collector.recordSyncCompletionLatency(15000);

      const summary = collector.getSummary();

      assert.strictEqual(summary.total_requests, 1);
      assert.strictEqual(summary.total_transactions, 100);
      assert.strictEqual(summary.duplicate_submissions, 2);
      assert.strictEqual(summary.dedupe_hit_rate, "0.0200");
      assert.strictEqual(summary.sync_completion_latency_ms, 15000);
    });
  });

  describe("logMetrics", () => {
    it("should not throw when logging metrics", () => {
      collector.recordRequest(5);
      
      assert.doesNotThrow(() => collector.logMetrics());
    });

    it("should not throw with per-tenant data", () => {
      collector.recordResults(1, [
        { client_tx_id: "tx-1", result: "OK", latency_ms: 10 },
        { client_tx_id: "tx-2", result: "DUPLICATE", latency_ms: 5 },
      ]);

      assert.doesNotThrow(() => collector.logMetrics());
    });
  });
});

describe("Singleton instance", () => {
  it("should export a singleton instance", () => {
    assert.instanceOf(syncIdempotencyMetricsCollector, SyncIdempotencyMetricsCollector);
  });

  it("should have per-tenant capability", () => {
    assert.isFunction(syncIdempotencyMetricsCollector.recordResults);
    assert.isFunction(syncIdempotencyMetricsCollector.getTenantMetrics);
    assert.isFunction(syncIdempotencyMetricsCollector.getTenantLatencyPercentiles);
  });
});
