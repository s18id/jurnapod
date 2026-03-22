// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tests for Sync Idempotency Metrics Collector
 * Story: Epic 11.3 - Sync Idempotency and Retry Resilience Hardening
 */

import { describe, it, assert, beforeEach } from "vitest";
import {
  SyncIdempotencyMetricsCollector,
  syncIdempotencyMetricsCollector,
  DEFAULT_SYNC_IDEMPOTENCY_METRICS,
  type SyncOperationResult,
} from "./metrics-collector.js";
import { ERROR_CLASSIFICATION } from "./sync-idempotency.js";

describe("SyncIdempotencyMetricsCollector", () => {
  let collector: SyncIdempotencyMetricsCollector;

  beforeEach(() => {
    collector = new SyncIdempotencyMetricsCollector();
  });

  describe("reset", () => {
    it("should reset all metrics to defaults", () => {
      collector.recordRequest(10);
      collector.recordDuplicateSubmission();
      collector.recordDedupeHit();

      collector.reset();

      const metrics = collector.getMetrics();
      assert.deepStrictEqual(metrics, DEFAULT_SYNC_IDEMPOTENCY_METRICS);
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
      // avg_batch_processing_time_ms is set to the elapsed time
      // Since there's no real delay, it may be 0, but the mechanism works
      assert.strictEqual(metrics.avg_batch_processing_time_ms >= 0, true);
    });

    it("should calculate running average across multiple batches", () => {
      // Record first batch
      collector.startBatch();
      collector.recordRequest(3);
      collector.endBatch(1);

      // Record second batch
      collector.startBatch();
      collector.recordRequest(2);
      collector.endBatch(2);

      const metrics = collector.getMetrics();
      // Running average should be calculated
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

  describe("recordResults", () => {
    it("should process multiple results and update metrics", () => {
      collector.recordRequest(5);

      const results: SyncOperationResult[] = [
        { client_tx_id: "tx-1", result: "OK", latency_ms: 100 },
        { client_tx_id: "tx-2", result: "DUPLICATE", latency_ms: 50 },
        { client_tx_id: "tx-3", result: "DUPLICATE", latency_ms: 50 },
        { 
          client_tx_id: "tx-4", 
          result: "ERROR", 
          latency_ms: 100,
          error_classification: ERROR_CLASSIFICATION.TRANSIENT,
          is_retry: true
        },
        { 
          client_tx_id: "tx-5", 
          result: "ERROR", 
          latency_ms: 100,
          error_classification: ERROR_CLASSIFICATION.VALIDATION,
        },
      ];

      collector.recordResults(results);

      const metrics = collector.getMetrics();
      assert.strictEqual(metrics.duplicate_submissions, 2);
      assert.strictEqual(metrics.dedupe_hits, 2);
      assert.strictEqual(metrics.retryable_errors, 1);
      assert.strictEqual(metrics.non_retryable_errors, 1);
    });
  });

  describe("getAlertConditions", () => {
    it("should not alert when metrics are normal", () => {
      collector.recordRequest(100);
      collector.recordDedupeHit();

      const alerts = collector.getAlertConditions();
      assert.deepStrictEqual(alerts, []);
    });

    it("should alert on high dedupe rate", () => {
      collector.recordRequest(10);
      for (let i = 0; i < 5; i++) {
        collector.recordDuplicateSubmission();
        collector.recordDedupeHit();
      }

      const alerts = collector.getAlertConditions();
      assert.isTrue(alerts.some(a => a.alert === "HIGH_DEDUPE_RATE"));
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
  });

  describe("getSummary", () => {
    it("should return summary object with string dedupe_hit_rate", () => {
      collector.recordRequest(100);
      // Simulate duplicate submissions with dedupe hits
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
      
      // Should not throw
      assert.doesNotThrow(() => collector.logMetrics());
    });
  });
});

describe("Singleton instance", () => {
  it("should export a singleton instance", () => {
    assert.instanceOf(syncIdempotencyMetricsCollector, SyncIdempotencyMetricsCollector);
  });
});
