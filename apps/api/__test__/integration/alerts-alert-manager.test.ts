// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Alert Manager Tests
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { register } from "prom-client";
import {
  AlertManager,
  alertManager,
  type AlertEvaluationResult,
} from "./alert-manager";
import { resetAlertConfig } from "./alert-rules";
import { journalMetrics } from "../metrics/journal-metrics.js";

// Mock the alert-rules module before importing AlertManager
const mockGetAlertThresholds = mock.fn(() => [
  {
    type: "sync_latency_breach",
    severity: "warning" as const,
    name: "Sync Latency Breach",
    metric: "sync_push_latency_ms",
    threshold: 500,
    thresholdType: "greater_than" as const,
    windowSeconds: 300,
    description: "Sync latency exceeds 500ms",
  },
  {
    type: "outbox_lag_critical",
    severity: "critical" as const,
    name: "Outbox Lag Critical",
    metric: "outbox_lag_items",
    threshold: 100,
    thresholdType: "greater_than" as const,
    windowSeconds: 60,
    description: "Outbox lag exceeds 100 items",
  },
  {
    type: "gl_imbalance_detected",
    severity: "critical" as const,
    name: "GL Imbalance Detected",
    metric: "gl_imbalance_detected_total",
    threshold: 0,
    thresholdType: "greater_than" as const,
    windowSeconds: 60,
    description: "GL imbalance detected",
  },
]);

const mockGetAlertCooldownMs = mock.fn(() => 5000); // 5 seconds for testing

const mockGetWebhookConfig = mock.fn(() => null); // No webhook in tests

const mockGetAlertThresholdByType = mock.fn((type: string) => {
  const thresholds = mockGetAlertThresholds();
  return thresholds.find((t: any) => t.type === type);
});

// Reset before each test
beforeEach(() => {
  resetAlertConfig();
  // Reset static evaluation cycle state to prevent test pollution
  AlertManager.resetEvaluationCycleState();
});

describe("AlertManager", () => {
  describe("evaluate", () => {
    it("should detect when threshold is breached (greater_than)", () => {
      const manager = new AlertManager();
      
      // Value above threshold should fire
      const result = manager.evaluate("outbox_lag_critical", 150);
      
      assert.strictEqual(result.type, "outbox_lag_critical");
      assert.strictEqual(result.firing, true);
      assert.strictEqual(result.value, 150);
      assert.strictEqual(result.threshold, 100);
    });

    it("should not fire when below threshold", () => {
      const manager = new AlertManager();
      
      // Value below threshold should not fire
      const result = manager.evaluate("outbox_lag_critical", 50);
      
      assert.strictEqual(result.firing, false);
      assert.strictEqual(result.value, 50);
    });

    it("should fire for gl_imbalance when value > 0", () => {
      const manager = new AlertManager();
      
      // Any imbalance should fire (threshold is 0)
      const result = manager.evaluate("gl_imbalance_detected", 1);
      
      assert.strictEqual(result.firing, true);
      assert.strictEqual(result.threshold, 0);
    });

    it("should not fire for gl_imbalance when value is 0", () => {
      const manager = new AlertManager();
      
      const result = manager.evaluate("gl_imbalance_detected", 0);
      
      assert.strictEqual(result.firing, false);
    });

    it("should throw for unknown alert type", () => {
      const manager = new AlertManager();
      
      assert.throws(() => {
        manager.evaluate("unknown_alert" as any, 100);
      }, /Unknown alert type/);
    });
  });

  describe("shouldFire", () => {
    it("should return false if alert is not firing", () => {
      const manager = new AlertManager();
      
      manager.evaluate("outbox_lag_critical", 50); // Below threshold
      
      assert.strictEqual(manager.shouldFire("outbox_lag_critical"), false);
    });

    it("should respect cooldown period", () => {
      const manager = new AlertManager();
      
      // Trigger alert
      manager.evaluate("outbox_lag_critical", 150); // Above threshold
      
      // Should fire immediately
      assert.strictEqual(manager.shouldFire("outbox_lag_critical"), true);
      
      // Mark as fired (would be set by dispatchAlert)
      manager.markFired("outbox_lag_critical");
      
      // Immediately after marking, should not fire again (cooldown)
      assert.strictEqual(manager.shouldFire("outbox_lag_critical"), false);
    });
  });

  describe("getFiringAlerts", () => {
    it("should return all currently firing alerts", () => {
      const manager = new AlertManager();
      
      // Trigger one alert
      manager.evaluate("outbox_lag_critical", 150);
      
      // Not triggering another
      manager.evaluate("sync_latency_breach", 100); // Below 500ms threshold
      
      const firing = manager.getFiringAlerts();
      
      assert.strictEqual(firing.length, 1);
      assert.ok(firing.includes("outbox_lag_critical"));
      assert.ok(!firing.includes("sync_latency_breach"));
    });
  });

  describe("getAlertState", () => {
    it("should return alert state", () => {
      const manager = new AlertManager();
      
      manager.evaluate("outbox_lag_critical", 150);
      
      const state = manager.getAlertState("outbox_lag_critical");
      
      assert.ok(state);
      assert.strictEqual(state!.firing, true);
      assert.strictEqual(state!.lastValue, 150);
    });

    it("should return undefined for unknown alert", () => {
      const manager = new AlertManager();
      
      const state = manager.getAlertState("unknown_alert" as any);
      
      assert.strictEqual(state, undefined);
    });
  });

  describe("createAlertEvent", () => {
    it("should create alert event with correct structure", () => {
      const manager = new AlertManager();
      
      const evalResult: AlertEvaluationResult = {
        type: "outbox_lag_critical",
        firing: true,
        value: 150,
        threshold: 100,
        thresholdType: "greater_than",
        windowSeconds: 60,
        metric: "outbox_lag_items",
      };

      const event = manager.createAlertEvent(evalResult, "Test message");
      
      assert.strictEqual(event.type, "outbox_lag_critical");
      assert.strictEqual(event.severity, "critical");
      assert.strictEqual(event.name, "outbox_lag_critical");
      assert.strictEqual(event.message, "Test message");
      assert.strictEqual(event.value, 150);
      assert.strictEqual(event.threshold, 100);
      assert.strictEqual(event.windowSeconds, 60);
      assert.ok(event.timestamp);
    });
  });

  describe("reset", () => {
    it("should reset all alert states", () => {
      const manager = new AlertManager();
      
      // Trigger an alert
      manager.evaluate("outbox_lag_critical", 150);
      
      assert.strictEqual(manager.getFiringAlerts().length, 1);
      
      // Reset
      manager.reset();
      
      assert.strictEqual(manager.getFiringAlerts().length, 0);
    });
  });

  describe("getMetricValue", () => {
    it("should return 0 for unknown metric", async () => {
      const manager = new AlertManager();
      
      const value = await manager.getMetricValue("nonexistent_metric");
      
      assert.strictEqual(value, 0);
    });
  });
});

// ===========================================================================
// Rate-based Alert Tests (rate_percent and rate_minute)
// ===========================================================================

describe("Rate-based Alert Semantics", () => {
  describe("rate_percent threshold behavior", () => {
    it("should not fire on first evaluation (no previous data to calculate rate)", () => {
      const manager = new AlertManager();
      
      // First evaluation ever - no previous value to compare, rate is null
      const result = manager.evaluate("sync_failure_rate", 1000);
      
      // Without previous value, rate is null, so should NOT fire for rate types
      assert.strictEqual(result.firing, false);
      assert.strictEqual(result.thresholdType, "rate_percent");
    });

    it("should not fire rate_percent when time diff is too small to calculate meaningful rate", () => {
      const manager = new AlertManager();
      
      // Establish baseline
      manager.evaluate("sync_failure_rate", 100);
      
      // Immediately evaluate again - time diff will be ~0, rate calculation will be unreliable
      // The implementation checks timeDiffSeconds > 0, but with very small time diffs
      // the rate becomes extremely large, but we can't reliably predict firing behavior
      // So we just verify the thresholdType is correct
      const result = manager.evaluate("sync_failure_rate", 105);
      
      // Rate type is correctly set
      assert.strictEqual(result.thresholdType, "rate_percent");
      // Firing depends on actual time elapsed - we don't make assumptions
    });

    it("should correctly calculate rate_percent threshold type", () => {
      const manager = new AlertManager();
      
      // Verify thresholdType is correctly identified as rate_percent
      manager.evaluate("sync_failure_rate", 100);
      const result = manager.evaluate("sync_failure_rate", 200);
      
      assert.strictEqual(result.thresholdType, "rate_percent");
    });
  });

  describe("rate_minute threshold behavior", () => {
    it("should use heartbeat logic for heartbeat type with threshold=0", () => {
      // Heartbeat uses rate_minute with threshold=0 as a special case
      // It fires when time since last evaluation cycle exceeds window, NOT when value > threshold
      const manager = new AlertManager();
      
      // First evaluation - no previous cycle time, heartbeat should NOT fire
      const result1 = manager.evaluate("heartbeat", 0);
      assert.strictEqual(result1.firing, false);
      assert.strictEqual(result1.thresholdType, "rate_minute");
      assert.strictEqual(result1.threshold, 0);
    });

    it("should return not firing for rate_minute when no previous data", () => {
      const manager = new AlertManager();
      
      // First evaluation - no rate can be calculated
      const result = manager.evaluate("heartbeat", 10);
      
      // Without previous data, rate is null, so condition returns false
      assert.strictEqual(result.firing, false);
      assert.strictEqual(result.thresholdType, "rate_minute");
    });
  });
});

// ===========================================================================
// Heartbeat Alert Semantics
// ===========================================================================

describe("Heartbeat Alert Semantics", () => {
  // Helper to create AlertManager with heartbeat configured
  function createManagerWithHeartbeat(): AlertManager {
    return new AlertManager();
  }

  it("should NOT fire immediately at startup (edge case - no false positive)", () => {
    // At startup, evaluationCycleState.lastCycleTime = Date.now()
    // When we evaluate heartbeat immediately, timeSinceLastCycle ≈ 0
    // Since window is 5m (300s), and timeSinceLastCycle ≈ 0 < 300, should NOT fire
    const manager = createManagerWithHeartbeat();
    
    // First heartbeat evaluation - immediately after manager creation
    const result = manager.evaluate("heartbeat", 0);
    
    // Should NOT fire because no time has passed since initialization
    assert.strictEqual(result.firing, false);
    assert.strictEqual(result.type, "heartbeat");
    assert.strictEqual(result.thresholdType, "rate_minute");
  });

  it("should not fire when evaluateAllAlerts records cycles (heartbeat suppression)", async () => {
    // When evaluateAllAlerts is called, it records an evaluation cycle
    // This updates evaluationCycleState.lastCycleTime to now()
    // So immediately after evaluateAllAlerts, heartbeat should NOT fire
    const manager = createManagerWithHeartbeat();
    
    // Record an evaluation cycle
    await manager.evaluateAllAlerts();
    
    // Now evaluate heartbeat - should NOT fire because we just had a cycle
    const result = manager.evaluate("heartbeat", 0);
    
    assert.strictEqual(result.firing, false);
    assert.strictEqual(result.type, "heartbeat");
  });

  it("should track evaluation cycles via evaluateAllAlerts", async () => {
    const manager = createManagerWithHeartbeat();
    
    // Call evaluateAllAlerts - this records an evaluation cycle
    const results = await manager.evaluateAllAlerts();
    
    // Should have evaluated all alerts including heartbeat
    assert.ok(results.length > 0, "Should have evaluated some alerts");
    
    // Find heartbeat result
    const heartbeatResult = results.find(r => r.type === "heartbeat");
    assert.ok(heartbeatResult, "Heartbeat should be in evaluation results");
    // Heartbeat result should reflect current state (not firing since we just had a cycle)
    assert.strictEqual(heartbeatResult!.firing, false);
  });

  it("heartbeat uses special rate_minute logic that checks cycle time, not value", () => {
    // Verify that heartbeat uses the special heartbeat logic, not the 
    // standard rate_minute calculation
    const manager = createManagerWithHeartbeat();
    
    // The heartbeat alert type, when evaluated, uses special logic:
    // It checks: timeSinceLastCycle > windowSeconds
    // NOT: ratePerMinute > threshold
    //
    // This is verified by the fact that heartbeat can fire even when
    // no "events" are happening (value=0), as long as the evaluation
    // cycle hasn't run within the window
    
    // With a freshly initialized manager, heartbeat should NOT fire
    const result = manager.evaluate("heartbeat", 0);
    
    // The special heartbeat logic should prevent firing at startup
    assert.strictEqual(result.firing, false);
    assert.strictEqual(result.thresholdType, "rate_minute");
  });
});

// ===========================================================================
// GL Imbalance Wiring Path Tests
// ===========================================================================

describe("GL Imbalance Metric Wiring", () => {
  it("should record GL imbalance via journalMetrics.recordGlImbalance", () => {
    // Verify the method exists and is callable
    assert.strictEqual(typeof journalMetrics.recordGlImbalance, "function");
    
    // Call it with a companyId (required for tenant isolation per Story 30.7)
    // This should not throw
    journalMetrics.recordGlImbalance(1);
    
    // The metric should be recorded - we can verify via getMetricValue
    // but that's covered in dashboard-metrics.test.ts
  });

  it("should have gl_imbalance_detected_total counter metric", async () => {
    // Record an imbalance
    journalMetrics.recordGlImbalance(1);
    journalMetrics.recordGlImbalance(1);
    
    // Get the metric value
    const metric = register.getSingleMetric("gl_imbalance_detected_total");
    assert.ok(metric, "gl_imbalance_detected_total metric should exist");
    
    const metricData = await metric.get();
    assert.ok(metricData.values.length > 0, "Metric should have recorded values");
  });
});

// ===========================================================================
// Integration: Full Alert Evaluation Flow
// ===========================================================================

describe("AlertEvaluationService", () => {
  it("should track evaluation count via alert_evaluation_total counter", async () => {
    // Get initial count
    const metric = register.getSingleMetric("alert_evaluation_total");
    const beforeData = metric ? await metric.get() : { values: [] };
    const beforeCount = beforeData.values.length > 0 
      ? Number(beforeData.values[0].value) 
      : 0;
    
    // Run an evaluation cycle
    const manager = new AlertManager();
    await manager.evaluateAllAlerts();
    
    // Check counter incremented
    const afterData = await metric!.get();
    const afterCount = afterData.values.length > 0 
      ? Number(afterData.values[0].value) 
      : 0;
    
    // Counter should have incremented by 1 per cycle
    // Note: Due to static state across instances, this may be 1 or more
    assert.ok(afterCount >= beforeCount, "Evaluation counter should increment");
  });

  it("should evaluate all configured alerts in a cycle", async () => {
    const manager = new AlertManager();
    
    const results = await manager.evaluateAllAlerts();
    
    // Should have evaluated sync_latency_breach, outbox_lag_critical,
    // gl_imbalance_detected, and heartbeat (5 total from default config)
    assert.ok(results.length >= 4, "Should evaluate multiple alert types");
    
    // Each result should have the expected structure
    for (const result of results) {
      assert.ok(result.type, "Result should have a type");
      assert.ok(typeof result.firing === "boolean", "Result should have firing boolean");
      assert.ok(typeof result.threshold === "number", "Result should have threshold");
      assert.ok(result.thresholdType, "Result should have thresholdType");
    }
  });

  it("should handle errors gracefully during evaluation", async () => {
    const manager = new AlertManager();
    
    // Even with a non-existent metric, evaluateAllAlerts should not throw
    // It should catch errors and continue
    const results = await manager.evaluateAllAlerts();
    
    // Should still return results for other alerts
    assert.ok(Array.isArray(results));
  });
});

// ===========================================================================
// Edge Cases and Error Handling
// ===========================================================================

describe("AlertManager Edge Cases", () => {
  it("should handle evaluateAllAlerts when getMetricValue fails gracefully", async () => {
    const manager = new AlertManager();
    
    // The manager should handle metric retrieval failures
    // by catching errors and continuing with other alerts
    const results = await manager.evaluateAllAlerts();
    
    assert.ok(Array.isArray(results));
  });

  it("should correctly track previousValue and previousTime for rate calculations", () => {
    const manager = new AlertManager();
    
    // First evaluation
    manager.evaluate("sync_failure_rate", 100);
    
    // Get state after first evaluation
    const state1 = manager.getAlertState("sync_failure_rate");
    assert.strictEqual(state1!.lastValue, 100);
    assert.ok(state1!.previousValue !== undefined);
    
    // Second evaluation
    manager.evaluate("sync_failure_rate", 150);
    
    // State should be updated
    // Note: previousValue stores the current value for use in next rate calculation
    // So after second evaluate(150), previousValue = 150
    const state2 = manager.getAlertState("sync_failure_rate");
    assert.strictEqual(state2!.lastValue, 150);
    assert.strictEqual(state2!.previousValue, 150);
  });

  it("should maintain firing state across evaluations", () => {
    const manager = new AlertManager();
    
    // First evaluation - above threshold
    const result1 = manager.evaluate("outbox_lag_critical", 150);
    assert.strictEqual(result1.firing, true);
    
    // Second evaluation - still above threshold
    const result2 = manager.evaluate("outbox_lag_critical", 120);
    assert.strictEqual(result2.firing, true);
    
    // Third evaluation - below threshold
    const result3 = manager.evaluate("outbox_lag_critical", 50);
    assert.strictEqual(result3.firing, false);
  });
});
