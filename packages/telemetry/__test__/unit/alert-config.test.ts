// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Alert Configuration Tests
 */

import { describe, it, beforeEach } from "vitest";
import assert from "node:assert";
import {
  loadAlertConfig,
  DEFAULT_ALERT_CONFIG,
  parseWindowToSeconds,
  validateAlertConfig,
  getAlertRuleByName,
  getAlertRulesBySeverity,
  AlertConfigSchema,
} from "../../src/alert-config.js";

describe("Alert Configuration", () => {
  describe("parseWindowToSeconds", () => {
    it("should parse seconds correctly", () => {
      assert.strictEqual(parseWindowToSeconds("30s"), 30);
      assert.strictEqual(parseWindowToSeconds("60s"), 60);
    });

    it("should parse minutes correctly", () => {
      assert.strictEqual(parseWindowToSeconds("1m"), 60);
      assert.strictEqual(parseWindowToSeconds("5m"), 300);
      assert.strictEqual(parseWindowToSeconds("10m"), 600);
    });

    it("should parse hours correctly", () => {
      assert.strictEqual(parseWindowToSeconds("1h"), 3600);
      assert.strictEqual(parseWindowToSeconds("2h"), 7200);
    });

    it("should throw on invalid format", () => {
      assert.throws(() => parseWindowToSeconds("invalid"), /Invalid window format/);
      assert.throws(() => parseWindowToSeconds("1x"), /Invalid window format/);
    });
  });

  describe("AlertConfigSchema", () => {
    it("should validate a correct alert config", () => {
      const config = {
        webhook_url: "https://hooks.slack.com/services/xxx",
        deduplication: {
          cooldown_seconds: 300,
        },
        alerts: [
          {
            name: "sync_latency_breach",
            metric: "sync_push_latency_ms",
            threshold: 500,
            threshold_type: "greater_than",
            severity: "warning",
            window: "5m",
            description: "Sync latency exceeds threshold",
          },
        ],
      };

      const result = AlertConfigSchema.safeParse(config);
      assert.strictEqual(result.success, true);
    });

    it("should reject invalid threshold type", () => {
      const config = {
        alerts: [
          {
            name: "test_alert",
            metric: "test_metric",
            threshold: 100,
            threshold_type: "invalid_type",
            severity: "warning",
            window: "5m",
          },
        ],
      };

      const result = AlertConfigSchema.safeParse(config);
      assert.strictEqual(result.success, false);
    });

    it("should reject invalid severity", () => {
      const config = {
        alerts: [
          {
            name: "test_alert",
            metric: "test_metric",
            threshold: 100,
            threshold_type: "greater_than",
            severity: "P1",
            window: "5m",
          },
        ],
      };

      const result = AlertConfigSchema.safeParse(config);
      assert.strictEqual(result.success, false);
    });
  });

  describe("loadAlertConfig", () => {
    it("should return default config when no file exists", () => {
      // Since we're in test environment, config file likely doesn't exist
      const config = loadAlertConfig();
      
      // Should have the expected number of default alerts
      assert.ok(config.alerts.length >= 5, "Should have at least 5 default alerts");
      
      // Should have required alert types
      const alertNames = config.alerts.map((a) => a.name);
      assert.ok(alertNames.includes("sync_latency_breach"), "Should have sync_latency_breach");
      assert.ok(alertNames.includes("outbox_lag_critical"), "Should have outbox_lag_critical");
      assert.ok(alertNames.includes("gl_imbalance_detected"), "Should have gl_imbalance_detected");
    });
  });

  describe("getAlertRuleByName", () => {
    it("should find alert rule by name", () => {
      const config = DEFAULT_ALERT_CONFIG;
      const rule = getAlertRuleByName(config, "sync_latency_breach");
      
      assert.ok(rule, "Should find sync_latency_breach rule");
      assert.strictEqual(rule!.metric, "sync_push_latency_ms");
      assert.strictEqual(rule!.threshold, 500);
      assert.strictEqual(rule!.severity, "warning");
    });

    it("should return undefined for unknown alert", () => {
      const config = DEFAULT_ALERT_CONFIG;
      const rule = getAlertRuleByName(config, "nonexistent_alert");
      assert.strictEqual(rule, undefined);
    });
  });

  describe("getAlertRulesBySeverity", () => {
    it("should filter alerts by severity", () => {
      const config = DEFAULT_ALERT_CONFIG;
      const criticalAlerts = getAlertRulesBySeverity(config, "critical");
      
      // All critical alerts should have severity = "critical"
      for (const alert of criticalAlerts) {
        assert.strictEqual(alert.severity, "critical");
      }
    });
  });

  describe("validateAlertConfig", () => {
    it("should validate correct config", () => {
      const config = DEFAULT_ALERT_CONFIG;
      const result = validateAlertConfig(config);
      
      assert.strictEqual(result.valid, true);
      assert.ok(result.config);
    });

    it("should reject invalid config", () => {
      const invalidConfig = {
        alerts: [
          {
            name: "test",
            metric: "test_metric",
            threshold: "not_a_number", // Should be number
            threshold_type: "greater_than",
            severity: "warning",
            window: "5m",
          },
        ],
      };

      const result = validateAlertConfig(invalidConfig);
      assert.strictEqual(result.valid, false);
    });
  });
});

describe("Alert Rule Structure", () => {
  it("should have all required fields in default config", () => {
    for (const alert of DEFAULT_ALERT_CONFIG.alerts) {
      assert.ok(alert.name, `Alert should have name`);
      assert.ok(alert.metric, `Alert ${alert.name} should have metric`);
      assert.ok(typeof alert.threshold === "number", `Alert ${alert.name} should have numeric threshold`);
      assert.ok(alert.threshold_type, `Alert ${alert.name} should have threshold_type`);
      assert.ok(alert.severity, `Alert ${alert.name} should have severity`);
      assert.ok(alert.window, `Alert ${alert.name} should have window`);
    }
  });

  it("should have valid threshold types", () => {
    const validTypes = ["greater_than", "less_than", "rate_percent", "rate_minute"];
    
    for (const alert of DEFAULT_ALERT_CONFIG.alerts) {
      assert.ok(
        validTypes.includes(alert.threshold_type),
        `Alert ${alert.name} has invalid threshold_type: ${alert.threshold_type}`
      );
    }
  });

  it("should have valid severities", () => {
    const validSeverities = ["warning", "critical"];
    
    for (const alert of DEFAULT_ALERT_CONFIG.alerts) {
      assert.ok(
        validSeverities.includes(alert.severity),
        `Alert ${alert.name} has invalid severity: ${alert.severity}`
      );
    }
  });
});
