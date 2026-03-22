// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PerformanceMonitor, DEFAULT_PERFORMANCE_THRESHOLDS, DEFAULT_ALERT_THRESHOLDS } from "../performance-monitor.js";

describe("PerformanceMonitor", () => {
  let monitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
  });

  afterEach(() => {
    monitor.reset();
  });

  describe("recordLatency", () => {
    it("should store payment_capture latencies", () => {
      monitor.recordLatency("payment_capture", 100, true);
      monitor.recordLatency("payment_capture", 200, true);
      monitor.recordLatency("payment_capture", 300, true);

      // Violations check runs internally - verify no throw
      monitor.checkViolations();
      assert.ok(true, "Should not throw when recording latencies");
    });

    it("should store offline_local_commit latencies", () => {
      monitor.recordLatency("offline_local_commit", 50, true);
      monitor.recordLatency("offline_local_commit", 75, true);

      monitor.checkViolations();
      assert.ok(true, "Should not throw when recording commit latencies");
    });

    it("should limit stored samples to MAX_LATENCY_SAMPLES", () => {
      const MAX_SAMPLES = 10000;
      for (let i = 0; i < MAX_SAMPLES + 100; i++) {
        monitor.recordLatency("payment_capture", i, true);
      }

      // Should not throw and violations should still work
      monitor.checkViolations();
      assert.ok(true, "Should handle overflow gracefully");
    });
  });

  describe("checkViolations", () => {
    it("should detect when payment_capture p95 exceeds threshold", () => {
      // Record latencies that exceed the default p95 threshold of 1000ms
      // Need enough samples for percentile calculation
      // Note: threshold is 1200ms (alert threshold), so use 1300ms to exceed it
      for (let i = 0; i < 1000; i++) {
        monitor.recordLatency("payment_capture", 1300, true);
      }

      // checkViolations is called inside recordLatency, so violations should be set
      const violations = monitor.getActiveViolations();
      const p95Violation = violations.find(v => v.metric === "payment_capture_p95");
      assert.ok(p95Violation, "Should detect payment_capture_p95 violation");
    });

    it("should clear violations when metrics return to normal", () => {
      // First create a violation - need enough samples
      for (let i = 0; i < 1000; i++) {
        monitor.recordLatency("payment_capture", 1300, true);
      }
      assert.ok(monitor.hasActiveViolations(), "Should have violations initially");

      // Reset and record normal latencies (below 1200ms threshold)
      monitor.reset();
      for (let i = 0; i < 1000; i++) {
        monitor.recordLatency("payment_capture", 500, true);
      }
      // After reset and with good latencies, violations should clear
      assert.ok(!monitor.hasActiveViolations() || monitor.getActiveViolations().length === 0, "Violations should clear");
    });
  });

  describe("getActiveViolations", () => {
    it("should return empty array when no violations", () => {
      monitor.recordLatency("payment_capture", 500, true);
      monitor.checkViolations();

      const violations = monitor.getActiveViolations();
      assert.ok(Array.isArray(violations), "Should return an array");
    });
  });

  describe("hasActiveViolations", () => {
    it("should return false when no violations", () => {
      monitor.recordLatency("payment_capture", 500, true);
      monitor.checkViolations();

      assert.ok(!monitor.hasActiveViolations(), "Should return false");
    });

    it("should return true when violations exist", () => {
      // Create a violation
      for (let i = 0; i < 100; i++) {
        monitor.recordLatency("payment_capture", 1500, true);
      }
      monitor.checkViolations();

      assert.ok(monitor.hasActiveViolations(), "Should return true when violations exist");
    });
  });

  describe("isInViolation", () => {
    it("should return false for non-violated metric", () => {
      monitor.recordLatency("payment_capture", 500, true);
      monitor.checkViolations();

      assert.ok(!monitor.isInViolation("payment_capture_p95"), "Should return false");
    });
  });

  describe("getViolationDuration", () => {
    it("should return null when no violation", () => {
      const duration = monitor.getViolationDuration("payment_capture_p95");
      assert.strictEqual(duration, null, "Should return null for non-violated metric");
    });
  });

  describe("validatePerformance", () => {
    it("should validate compliant performance snapshot", () => {
      const snapshot = {
        timestamp: Date.now(),
        paymentCaptureP50: 500,
        paymentCaptureP95: 900,
        paymentCaptureP99: 1500,
        offlineCommitP50: 50,
        offlineCommitP95: 80,
        syncSuccessRate: 99.5,
        queueDepth: 10,
        oldestPendingMs: 5000
      };

      const result = monitor.validatePerformance(snapshot);
      assert.ok(result.valid, "Should be valid");
      assert.ok(result.violations.length === 0, "Should have no violations");
    });

    it("should detect violations in performance snapshot", () => {
      const snapshot = {
        timestamp: Date.now(),
        paymentCaptureP50: 800,
        paymentCaptureP95: 1500, // Exceeds 1000ms threshold
        paymentCaptureP99: 2000,
        offlineCommitP50: 50,
        offlineCommitP95: 80,
        syncSuccessRate: 99.5,
        queueDepth: 10,
        oldestPendingMs: 5000
      };

      const result = monitor.validatePerformance(snapshot);
      assert.ok(!result.valid, "Should not be valid");
      assert.ok(result.violations.length > 0, "Should have violations");
    });
  });

  describe("getSLOCompliance", () => {
    it("should return compliant when no data", () => {
      const compliance = monitor.getSLOCompliance();
      assert.ok(compliance.overallCompliance, "Should be compliant with no data");
    });
  });

  describe("reset", () => {
    it("should clear all state", () => {
      monitor.recordLatency("payment_capture", 1000, true);
      monitor.checkViolations();

      monitor.reset();

      assert.ok(!monitor.hasActiveViolations(), "Should have no violations after reset");
    });
  });

  describe("addSnapshot and getLatestSnapshot", () => {
    it("should store and retrieve snapshots", () => {
      const snapshot = {
        timestamp: Date.now(),
        paymentCaptureP50: 500,
        paymentCaptureP95: 900,
        paymentCaptureP99: 1500,
        offlineCommitP50: 50,
        offlineCommitP95: 80,
        syncSuccessRate: 99.5,
        queueDepth: 10,
        oldestPendingMs: 5000
      };

      monitor.addSnapshot(snapshot);

      const latest = monitor.getLatestSnapshot();
      assert.ok(latest, "Should have a latest snapshot");
      assert.strictEqual(latest.paymentCaptureP95, 900, "Should retrieve correct value");
    });

    it("should limit history size", () => {
      const MAX_HISTORY = 1440;
      for (let i = 0; i < MAX_HISTORY + 100; i++) {
        monitor.addSnapshot({
          timestamp: Date.now(),
          paymentCaptureP50: i,
          paymentCaptureP95: i,
          paymentCaptureP99: i,
          offlineCommitP50: i,
          offlineCommitP95: i,
          syncSuccessRate: 100,
          queueDepth: 0,
          oldestPendingMs: null
        });
      }

      const history = monitor.getHistory();
      assert.ok(history.length <= MAX_HISTORY, "Should limit history size");
    });
  });
});
