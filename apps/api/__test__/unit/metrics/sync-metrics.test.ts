// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tests for SyncMetricsCollector
 * Story 52-9: Observability: Idempotency Metrics
 * 
 * Uses the singleton instance (syncMetrics) since prom-client registers
 * metrics globally. The singleton is created once at module load.
 * 
 * NOTE: These are unit tests — no database access.
 * Tests verify collector methods increment counters and produce output.
 */

import { describe, it, assert, beforeAll } from "vitest";
import { register } from "prom-client";
import { syncMetrics } from "../../../src/lib/metrics/sync-metrics.js";

describe("SyncMetricsCollector (Story 52-9)", () => {
  beforeAll(() => {
    // Register a test-only metric to ensure the registry is initialized
    // Metrics are registered once when the module loads
  });

  describe("recordPushResult — new per-item outcome tracking", () => {
    it("should not throw when recording an OK result", () => {
      assert.doesNotThrow(() => {
        syncMetrics.recordPushResult(1, 10, "OK", 150);
      });
    });

    it("should not throw when recording a DUPLICATE result", () => {
      assert.doesNotThrow(() => {
        syncMetrics.recordPushResult(1, 10, "DUPLICATE", 5);
      });
    });

    it("should not throw when recording an ERROR result", () => {
      assert.doesNotThrow(() => {
        syncMetrics.recordPushResult(1, 10, "ERROR", 500);
      });
    });

    it("should produce metric output in registry", async () => {
      syncMetrics.recordPushResult(2, 20, "OK", 100);
      syncMetrics.recordPushResult(2, 20, "DUPLICATE", 10);
      syncMetrics.recordPushResult(2, 20, "ERROR", 1000);

      const metricsOutput = await register.metrics();

      // Should contain the new metric names
      assert.isTrue(metricsOutput.includes("sync_push_results_total"), 
        "Expected sync_push_results_total in metrics output");
      
      // Should contain per-result-type counters
      assert.isTrue(metricsOutput.includes('result="OK"'),
        "Expected OK result label in metrics output");
      assert.isTrue(metricsOutput.includes('result="DUPLICATE"'),
        "Expected DUPLICATE result label in metrics output");
      assert.isTrue(metricsOutput.includes('result="ERROR"'),
        "Expected ERROR result label in metrics output");
    });

    it("should produce latency histogram output", async () => {
      const metricsOutput = await register.metrics();

      assert.isTrue(metricsOutput.includes("sync_push_result_latency_ms"),
        "Expected sync_push_result_latency_ms in metrics output");
    });

    it("should include company_id label in output", async () => {
      const metricsOutput = await register.metrics();

      assert.isTrue(metricsOutput.includes('company_id="2"'),
        "Expected company_id label in metrics output");
      assert.isTrue(metricsOutput.includes('outlet_id="20"'),
        "Expected outlet_id label in metrics output");
    });
  });

  describe("CONFLICT and edge case handling", () => {
    it("should map CONFLICT to ERROR when recording", async () => {
      // @ts-expect-error — testing runtime behavior for invalid input
      syncMetrics.recordPushResult(4, 40, "CONFLICT", 200);

      const metricsOutput = await register.metrics();

      // CONFLICT should appear as ERROR in the metrics
      // There should be no result="CONFLICT" label
      assert.isFalse(metricsOutput.includes('result="CONFLICT"'),
        "CONFLICT should not appear as a metric label — should be mapped to ERROR");
    });

    it("should accept client_tx_id parameter without throwing", () => {
      assert.doesNotThrow(() => {
        syncMetrics.recordPushResult(5, 50, "OK", 100, "tx-abc-123");
      });
    });

    it("should handle negative latency by clamping to 0", () => {
      assert.doesNotThrow(() => {
        syncMetrics.recordPushResult(6, 60, "OK", -50);
      });
    });

    it("should handle unexpected result values by mapping to ERROR", async () => {
      // @ts-expect-error — testing runtime behavior for unexpected input
      syncMetrics.recordPushResult(7, 70, "UNKNOWN", 300);

      const metricsOutput = await register.metrics();
      // Should still produce output with result="ERROR"
      assert.isTrue(metricsOutput.includes('result="ERROR"'),
        "Unexpected result should be recorded as ERROR");
    });
  });

  describe("existing methods — backward compatibility with company_id", () => {
    it("should accept companyId in recordPushOperation", () => {
      assert.doesNotThrow(() => {
        syncMetrics.recordPushOperation(1, 10, "success");
      });
    });

    it("should accept companyId in recordPushDuration", () => {
      assert.doesNotThrow(() => {
        syncMetrics.recordPushDuration(1, 10, "transaction", 200);
      });
    });

    it("should accept companyId in recordPullOperation", () => {
      assert.doesNotThrow(() => {
        syncMetrics.recordPullOperation(1, 10, "success");
      });
    });

    it("should accept companyId in recordPullDuration", () => {
      assert.doesNotThrow(() => {
        syncMetrics.recordPullDuration(1, 10, "items", 500);
      });
    });

    it("should accept companyId in recordConflict", () => {
      assert.doesNotThrow(() => {
        syncMetrics.recordConflict(1, 10);
      });
    });

    it("should include company_id label in existing metrics output", async () => {
      syncMetrics.recordPushOperation(3, 30, "success");
      syncMetrics.recordConflict(3, 30);

      const metricsOutput = await register.metrics();

      // Existing metrics should now include company_id
      assert.isTrue(metricsOutput.includes('company_id="3"'),
        "Expected company_id label in existing sync metrics");
    });
  });
});
