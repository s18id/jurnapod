// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  POSLoadTestRunner,
  NetworkChaosController,
  createLoadTestConfig
} from "../load-test-framework.js";
import {
  NetworkChaosManager,
  PREDEFINED_SCENARIOS
} from "../network-chaos.js";

describe("POSLoadTestRunner", () => {
  describe("constructor", () => {
    it("should create instance with valid config", () => {
      const config = createLoadTestConfig({ concurrency: 10 });
      const runner = new POSLoadTestRunner(config);
      assert.ok(runner, "Should create runner");
      assert.ok(!runner.getIsRunning(), "Should not be running initially");
    });
  });

  describe("createLoadTestConfig", () => {
    it("should create config with defaults", () => {
      const config = createLoadTestConfig();
      assert.strictEqual(config.concurrency, 10, "Should have default concurrency");
      assert.strictEqual(config.durationSeconds, 60, "Should have default duration");
      assert.strictEqual(config.rampUpSeconds, 5, "Should have default ramp-up");
    });

    it("should accept overrides", () => {
      const config = createLoadTestConfig({
        concurrency: 50,
        durationSeconds: 120,
        thinkTimeMs: 2000
      });
      assert.strictEqual(config.concurrency, 50, "Should use override");
      assert.strictEqual(config.durationSeconds, 120, "Should use override");
      assert.strictEqual(config.thinkTimeMs, 2000, "Should use override");
    });

    it("should include companyId and outletId", () => {
      const config = createLoadTestConfig({ companyId: 5, outletId: 10 });
      assert.strictEqual(config.companyId, 5, "Should include companyId");
      assert.strictEqual(config.outletId, 10, "Should include outletId");
    });
  });
});

describe("NetworkChaosController", () => {
  describe("constructor", () => {
    it("should create instance with config", () => {
      const controller = new NetworkChaosController({
        packetLossPercent: 10,
        latencyMs: 100,
        latencyVarianceMs: 50,
        connectionDropPercent: 5
      });
      assert.ok(controller, "Should create controller");
    });
  });
});

describe("PREDEFINED_SCENARIOS", () => {
  it("should include mild_instability scenario", () => {
    const scenario = PREDEFINED_SCENARIOS.find(s => s.name === "mild_instability");
    assert.ok(scenario, "Should have mild_instability scenario");
    assert.strictEqual(scenario.settings.packetLossPercent, 10, "Should have 10% packet loss");
  });

  it("should include moderate_instability scenario", () => {
    const scenario = PREDEFINED_SCENARIOS.find(s => s.name === "moderate_instability");
    assert.ok(scenario, "Should have moderate_instability scenario");
    assert.strictEqual(scenario.settings.packetLossPercent, 20, "Should have 20% packet loss");
  });

  it("should include severe_instability scenario", () => {
    const scenario = PREDEFINED_SCENARIOS.find(s => s.name === "severe_instability");
    assert.ok(scenario, "Should have severe_instability scenario");
    assert.strictEqual(scenario.settings.packetLossPercent, 30, "Should have 30% packet loss");
  });

  it("should include latency_only scenario", () => {
    const scenario = PREDEFINED_SCENARIOS.find(s => s.name === "latency_only");
    assert.ok(scenario, "Should have latency_only scenario");
    assert.strictEqual(scenario.settings.packetLossPercent, 0, "Should have 0% packet loss");
    assert.strictEqual(scenario.settings.averageLatencyMs, 500, "Should have 500ms latency");
  });

  it("should include timeout_prone scenario", () => {
    const scenario = PREDEFINED_SCENARIOS.find(s => s.name === "timeout_prone");
    assert.ok(scenario, "Should have timeout_prone scenario");
    assert.strictEqual(scenario.settings.timeoutPercent, 10, "Should have 10% timeout");
  });

  it("should have descriptions for all scenarios", () => {
    for (const scenario of PREDEFINED_SCENARIOS) {
      assert.ok(scenario.description, `Scenario ${scenario.name} should have description`);
    }
  });
});

describe("NetworkChaosManager", () => {
  describe("constructor", () => {
    it("should create instance with default settings", () => {
      const manager = new NetworkChaosManager();
      assert.ok(manager, "Should create manager");
      const settings = manager.getSettings();
      assert.strictEqual(settings.enabled, false, "Should be disabled by default");
    });
  });

  describe("getSettings", () => {
    it("should return current settings", () => {
      const manager = new NetworkChaosManager();
      const settings = manager.getSettings();
      assert.ok(typeof settings.enabled === "boolean", "Should have enabled flag");
      assert.ok(typeof settings.packetLossPercent === "number", "Should have packetLossPercent");
      assert.ok(typeof settings.averageLatencyMs === "number", "Should have averageLatencyMs");
    });
  });

  describe("getStats", () => {
    it("should return chaos statistics", () => {
      const manager = new NetworkChaosManager();
      const stats = manager.getStats();
      assert.ok(typeof stats.enabled === "boolean", "Should have enabled flag");
      assert.ok(Array.isArray(stats.scenarios), "Should have scenarios array");
      assert.ok(stats.scenarios.length > 0, "Should have at least one scenario");
      assert.ok(stats.activeScenario === null, "Should have no active scenario initially");
    });
  });
});

describe("LoadTestResult shape", () => {
  it("should have correct structure", () => {
    const result = {
      success: true,
      totalRequests: 100,
      successfulRequests: 98,
      failedRequests: 2,
      durationMs: 5000,
      latencyPercentiles: { p50: 100, p95: 500, p99: 800 },
      throughput: 20,
      errors: [],
      sloCompliance: {
        paymentCaptureP95Compliant: true,
        paymentCaptureP99Compliant: true,
        successRateCompliant: true,
        overallCompliant: true,
        details: []
      }
    };

    assert.ok(typeof result.success === "boolean", "success should be boolean");
    assert.ok(typeof result.totalRequests === "number", "totalRequests should be number");
    assert.ok(result.latencyPercentiles.p50, "should have p50");
    assert.ok(result.latencyPercentiles.p95, "should have p95");
    assert.ok(result.latencyPercentiles.p99, "should have p99");
    assert.ok(Array.isArray(result.errors), "errors should be array");
    assert.ok(result.sloCompliance.overallCompliant, "should have overallCompliant");
  });
});

describe("SLOComplianceResult shape", () => {
  it("should define compliance for each metric", () => {
    const compliance = {
      paymentCaptureP95Compliant: true,
      paymentCaptureP99Compliant: true,
      successRateCompliant: false,
      overallCompliant: false,
      details: ["success rate below threshold"]
    };

    assert.ok(typeof compliance.paymentCaptureP95Compliant === "boolean", "p95 compliance should be boolean");
    assert.ok(typeof compliance.paymentCaptureP99Compliant === "boolean", "p99 compliance should be boolean");
    assert.ok(typeof compliance.successRateCompliant === "boolean", "successRate compliance should be boolean");
    assert.ok(typeof compliance.overallCompliant === "boolean", "overallCompliance should be boolean");
    assert.ok(Array.isArray(compliance.details), "details should be array");
  });
});
