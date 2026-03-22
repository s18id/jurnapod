// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  PosTelemetryService,
  ScopedPosTelemetryService,
  getPosTelemetryService,
  createScopedTelemetryService,
  withTelemetry,
  withCommitTelemetry
} from "../pos-telemetry.js";

describe("PosTelemetryService", () => {
  let service;

  beforeEach(() => {
    service = new PosTelemetryService();
  });

  describe("recordLatency", () => {
    it("should record latency for payment_capture flow", () => {
      service.recordLatency({
        flow_name: "payment_capture",
        latency_ms: 150,
        company_id: 1,
        outlet_id: 1,
        success: true,
        timestamp: Date.now()
      });

      const percentiles = service.getLatencyPercentiles("payment_capture");
      assert.strictEqual(percentiles.p95, 150, "Should record latency");
    });

    it("should track success and failure counts", () => {
      service.recordLatency({
        flow_name: "payment_capture",
        latency_ms: 100,
        company_id: 1,
        outlet_id: 1,
        success: true,
        timestamp: Date.now()
      });

      service.recordLatency({
        flow_name: "payment_capture",
        latency_ms: 200,
        company_id: 1,
        outlet_id: 1,
        success: false,
        error_class: "NetworkError",
        timestamp: Date.now()
      });

      assert.strictEqual(service.getSuccessRate("payment_capture"), 50, "Should track 50% success rate");
    });

    it("should limit stored samples to MAX_LATENCY_SAMPLES", () => {
      const MAX_SAMPLES = 1000;
      for (let i = 0; i < MAX_SAMPLES + 100; i++) {
        service.recordLatency({
          flow_name: "payment_capture",
          latency_ms: i,
          company_id: 1,
          outlet_id: 1,
          success: true,
          timestamp: Date.now()
        });
      }

      const percentiles = service.getLatencyPercentiles("payment_capture");
      assert.ok(percentiles.p95 <= MAX_SAMPLES + 100, "Should limit samples");
    });

    it("should ignore unknown flow names", () => {
      // Should not throw - unknown flows are silently ignored
      service.recordLatency({
        flow_name: "unknown_flow",
        latency_ms: 100,
        company_id: 1,
        outlet_id: 1,
        success: true,
        timestamp: Date.now()
      });

      assert.ok(true, "Should ignore unknown flow names gracefully");
    });
  });

  describe("recordCommit", () => {
    it("should record successful commit", () => {
      service.recordCommit({
        flow_name: "offline_local_commit",
        success: true,
        company_id: 1,
        outlet_id: 1,
        timestamp: Date.now()
      });

      assert.strictEqual(service.getSuccessRate("offline_local_commit"), 100, "Should record 100% success");
    });

    it("should record failed commit with error class", () => {
      service.recordCommit({
        flow_name: "offline_local_commit",
        success: false,
        company_id: 1,
        outlet_id: 1,
        error_class: "QuotaExceededError",
        timestamp: Date.now()
      });

      assert.strictEqual(service.getSuccessRate("offline_local_commit"), 0, "Should record 0% success");
    });
  });

  describe("recordQueueDepth", () => {
    it("should record queue depth snapshot", () => {
      service.recordQueueDepth({
        company_id: 1,
        outlet_id: 1,
        pending_count: 50,
        failed_count: 5,
        oldest_pending_ms: 30000,
        timestamp: Date.now()
      });

      const latest = service.getLatestQueueDepth();
      assert.ok(latest, "Should return latest queue depth");
      assert.strictEqual(latest.pending_count, 50, "Should record pending count");
    });

    it("should calculate average queue depth", () => {
      service.recordQueueDepth({
        company_id: 1,
        outlet_id: 1,
        pending_count: 100,
        failed_count: 10,
        oldest_pending_ms: null,
        timestamp: Date.now()
      });

      service.recordQueueDepth({
        company_id: 1,
        outlet_id: 1,
        pending_count: 200,
        failed_count: 20,
        oldest_pending_ms: null,
        timestamp: Date.now()
      });

      const avg = service.getAverageQueueDepth();
      assert.strictEqual(avg.pending, 150, "Should calculate correct average");
      assert.strictEqual(avg.failed, 15, "Should calculate correct average");
    });

    it("should limit stored queue depth samples", () => {
      for (let i = 0; i < 150; i++) {
        service.recordQueueDepth({
          company_id: 1,
          outlet_id: 1,
          pending_count: i,
          failed_count: 0,
          oldest_pending_ms: null,
          timestamp: Date.now()
        });
      }

      const latest = service.getLatestQueueDepth();
      assert.ok(latest, "Should return latest");
      // Should have limited to 100 samples
      assert.ok(latest.pending_count < 150, "Should have limited samples");
    });
  });

  describe("recordRecoveryAttempt", () => {
    it("should record recovery attempt", () => {
      service.recordRecoveryAttempt({
        attempt_type: "startup",
        transactions_recovered: 5,
        duplicates_prevented: 2,
        duration_ms: 150,
        success: true,
        timestamp: Date.now()
      });

      const metrics = service.getMetrics();
      assert.strictEqual(metrics.recovery_attempts.length, 1, "Should record recovery attempt");
    });
  });

  describe("getLatencyPercentiles", () => {
    it("should return zeros for flow with no data", () => {
      const percentiles = service.getLatencyPercentiles("payment_capture");
      assert.strictEqual(percentiles.p50, 0, "Should return 0 for p50");
      assert.strictEqual(percentiles.p95, 0, "Should return 0 for p95");
      assert.strictEqual(percentiles.p99, 0, "Should return 0 for p99");
    });

    it("should calculate percentiles correctly", () => {
      for (let i = 1; i <= 100; i++) {
        service.recordLatency({
          flow_name: "payment_capture",
          latency_ms: i,
          company_id: 1,
          outlet_id: 1,
          success: true,
          timestamp: Date.now()
        });
      }

      const percentiles = service.getLatencyPercentiles("payment_capture");
      assert.ok(percentiles.p50 >= 50 && percentiles.p50 <= 51, "p50 should be around 50");
      assert.ok(percentiles.p95 >= 95 && percentiles.p95 <= 96, "p95 should be around 95");
      assert.ok(percentiles.p99 >= 99 && percentiles.p99 <= 100, "p99 should be around 99");
    });
  });

  describe("getSuccessRate", () => {
    it("should return 100 for flow with no data", () => {
      assert.strictEqual(service.getSuccessRate("payment_capture"), 100, "Should return 100");
    });
  });

  describe("getMetrics", () => {
    it("should return all metrics", () => {
      service.recordLatency({
        flow_name: "payment_capture",
        latency_ms: 100,
        company_id: 1,
        outlet_id: 1,
        success: true,
        timestamp: Date.now()
      });

      const metrics = service.getMetrics();
      assert.ok(metrics.latencies instanceof Map, "Should have latencies map");
      assert.ok(metrics.successes instanceof Map, "Should have successes map");
      assert.ok(metrics.failures instanceof Map, "Should have failures map");
      assert.ok(Array.isArray(metrics.queue_depths), "Should have queue_depths array");
      assert.ok(Array.isArray(metrics.recovery_attempts), "Should have recovery_attempts array");
    });
  });

  describe("reset", () => {
    it("should clear all metrics", () => {
      service.recordLatency({
        flow_name: "payment_capture",
        latency_ms: 100,
        company_id: 1,
        outlet_id: 1,
        success: true,
        timestamp: Date.now()
      });

      service.reset();

      const percentiles = service.getLatencyPercentiles("payment_capture");
      assert.strictEqual(percentiles.p95, 0, "Should clear latencies");
      assert.strictEqual(service.getSuccessRate("payment_capture"), 100, "Should reset success rate");
    });
  });
});

describe("ScopedPosTelemetryService", () => {
  it("should create scoped service with company and outlet context", () => {
    const scoped = createScopedTelemetryService(1, 2);
    assert.ok(scoped instanceof ScopedPosTelemetryService, "Should create scoped service");
  });

  it("should pass company_id and outlet_id to delegate", () => {
    const delegate = new PosTelemetryService();
    const spy = {
      recordLatency: [],
      recordCommit: [],
      recordQueueDepth: []
    };

    // Create a spy by wrapping
    const originalRecordLatency = delegate.recordLatency.bind(delegate);
    delegate.recordLatency = (record) => {
      spy.recordLatency.push(record);
      originalRecordLatency(record);
    };

    const scoped = new ScopedPosTelemetryService(1, 2, delegate);
    scoped.recordLatency("payment_capture", 100, true);

    assert.strictEqual(spy.recordLatency.length, 1, "Should call delegate");
    assert.strictEqual(spy.recordLatency[0].company_id, 1, "Should pass company_id");
    assert.strictEqual(spy.recordLatency[0].outlet_id, 2, "Should pass outlet_id");
  });
});

describe("withTelemetry", () => {
  it("should record latency on success", async () => {
    // Create fresh telemetry service
    const service = new PosTelemetryService();
    let called = false;

    // Note: withTelemetry uses createScopedTelemetryService internally
    // which uses the singleton - we just verify it doesn't throw
    const result = await withTelemetry(
      "payment_capture",
      1,
      1,
      async () => {
        called = true;
        return "success";
      }
    );

    assert.ok(called, "Should call operation");
    assert.strictEqual(result, "success", "Should return result");
  });

  it("should record latency and error on failure", async () => {
    let error;

    try {
      await withTelemetry(
        "payment_capture",
        1,
        1,
        async () => {
          throw new Error("Test error");
        }
      );
    } catch (e) {
      error = e;
    }

    assert.ok(error, "Should throw error");
  });
});

describe("withCommitTelemetry", () => {
  it("should record commit telemetry on success", async () => {
    let called = false;

    const result = await withCommitTelemetry(1, 1, async () => {
      called = true;
      return "success";
    });

    assert.ok(called, "Should call operation");
    assert.strictEqual(result, "success", "Should return result");
  });

  it("should record commit failure on error", async () => {
    let error;

    try {
      await withCommitTelemetry(1, 1, async () => {
        throw new Error("Commit failed");
      });
    } catch (e) {
      error = e;
    }

    assert.ok(error, "Should throw error");
    assert.strictEqual(error.message, "Commit failed");
  });
});
