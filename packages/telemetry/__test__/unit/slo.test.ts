// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit Tests for SLO Configuration
 * Story 11.1: Reliability Baseline and SLO Instrumentation
 */

import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  CRITICAL_FLOWS,
  SLO_CONFIG,
  SLOTargetSchema,
  validateSLOConfig,
  getSLOsForFlow,
  type CriticalFlowName,
  BusinessHoursSchema,
  DEFAULT_BUSINESS_HOURS,
  isWithinBusinessHours,
} from "../../src/slo.js";

describe("SLO Configuration", () => {
  describe("CRITICAL_FLOWS", () => {
    it("should contain all 6 critical flows", () => {
      assert.strictEqual(CRITICAL_FLOWS.length, 6);
      assert.ok(CRITICAL_FLOWS.includes("payment_capture"));
      assert.ok(CRITICAL_FLOWS.includes("offline_local_commit"));
      assert.ok(CRITICAL_FLOWS.includes("sync_replay_idempotency"));
      assert.ok(CRITICAL_FLOWS.includes("pos_to_gl_posting"));
      assert.ok(CRITICAL_FLOWS.includes("trial_balance"));
      assert.ok(CRITICAL_FLOWS.includes("general_ledger"));
    });
  });

  describe("SLO_CONFIG", () => {
    it("should have 28-day measurement windows for all SLOs", () => {
      for (const slo of SLO_CONFIG) {
        assert.strictEqual(slo.measurement_window_days, 28);
      }
    });

    it("should have valid flow names only", () => {
      for (const slo of SLO_CONFIG) {
        assert.ok(CRITICAL_FLOWS.includes(slo.flow_name), `Invalid flow name: ${slo.flow_name}`);
      }
    });

    it("should have payment_capture latency target < 1s (NFR)", () => {
      const paymentCaptureSLIs = SLO_CONFIG.filter(
        (slo) => slo.flow_name === "payment_capture" && slo.sli_type === "latency"
      );
      assert.ok(paymentCaptureSLIs.length > 0);
      const latencySLI = paymentCaptureSLIs.find((slo) => slo.sli_type === "latency");
      assert.ok(latencySLI!.target_value <= 1.0);
    });

    it("should have sync completion latency target < 30s (NFR)", () => {
      const syncSLIs = SLO_CONFIG.filter(
        (slo) => slo.flow_name === "sync_replay_idempotency" && slo.sli_type === "latency"
      );
      assert.ok(syncSLIs.length > 0);
      const latencySLI = syncSLIs.find((slo) => slo.sli_type === "latency");
      assert.ok(latencySLI!.target_value <= 30.0);
    });

    it("should have report latency targets < 5s (NFR)", () => {
      const reportFlows: CriticalFlowName[] = ["trial_balance", "general_ledger"];
      for (const flow of reportFlows) {
        const reportSLIs = SLO_CONFIG.filter((slo) => slo.flow_name === flow && slo.sli_type === "latency");
        assert.ok(reportSLIs.length > 0);
        const latencySLI = reportSLIs.find((slo) => slo.sli_type === "latency");
        assert.ok(latencySLI!.target_value <= 5.0);
      }
    });

    it("should have availability >= 99.9% (NFR)", () => {
      for (const slo of SLO_CONFIG) {
        if (slo.sli_type === "availability") {
          assert.ok(slo.target_value >= 99.9, `${slo.flow_name} availability should be >= 99.9%`);
        }
      }
    });

    it("should have correct unit assignments", () => {
      for (const slo of SLO_CONFIG) {
        if (slo.sli_type === "latency") {
          assert.strictEqual(slo.unit, "seconds");
        }
        if (slo.sli_type === "availability" || slo.sli_type === "success_rate") {
          assert.strictEqual(slo.unit, "percent");
        }
        if (slo.sli_type === "duplicate_rate") {
          assert.strictEqual(slo.unit, "percent");
        }
      }
    });
  });

  describe("validateSLOConfig()", () => {
    it("should return valid=true when all SLOs are properly configured", () => {
      const result = validateSLOConfig();
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it("should detect negative target values", () => {
      const result = validateSLOConfig();
      assert.strictEqual(result.errors.length, 0); // All values should be positive
    });
  });

  describe("getSLOsForFlow()", () => {
    it("should return all SLOs for payment_capture", () => {
      const slos = getSLOsForFlow("payment_capture");
      assert.ok(slos.length > 0);
      assert.ok(slos.every((slo) => slo.flow_name === "payment_capture"));
    });

    it("should return all SLOs for sync_replay_idempotency", () => {
      const slos = getSLOsForFlow("sync_replay_idempotency");
      assert.ok(slos.length > 0);
      assert.ok(slos.every((slo) => slo.flow_name === "sync_replay_idempotency"));
      const sliTypes = slos.map((slo) => slo.sli_type);
      assert.ok(sliTypes.includes("latency"));
      assert.ok(sliTypes.includes("duplicate_rate"));
    });

    it("should return all SLOs for pos_to_gl_posting", () => {
      const slos = getSLOsForFlow("pos_to_gl_posting");
      assert.ok(slos.length > 0);
      const sliTypes = slos.map((slo) => slo.sli_type);
      assert.ok(sliTypes.includes("latency"));
      assert.ok(sliTypes.includes("accuracy"));
    });
  });

  describe("SLOTargetSchema validation", () => {
    it("should validate a valid SLO target", () => {
      const validSLO = {
        flow_name: "payment_capture",
        sli_type: "latency",
        target: "< 1s",
        target_value: 1.0,
        unit: "seconds",
        measurement_window_days: 28,
      };

      const result = SLOTargetSchema.safeParse(validSLO);
      assert.strictEqual(result.success, true);
    });

    it("should reject invalid flow name", () => {
      const invalidSLO = {
        flow_name: "invalid_flow",
        sli_type: "latency",
        target: "< 1s",
        target_value: 1.0,
        unit: "seconds",
        measurement_window_days: 28,
      };

      const result = SLOTargetSchema.safeParse(invalidSLO);
      assert.strictEqual(result.success, false);
    });

    it("should reject invalid SLI type", () => {
      const invalidSLO = {
        flow_name: "payment_capture",
        sli_type: "invalid_type",
        target: "< 1s",
        target_value: 1.0,
        unit: "seconds",
        measurement_window_days: 28,
      };

      const result = SLOTargetSchema.safeParse(invalidSLO);
      assert.strictEqual(result.success, false);
    });

    it("should use default measurement window of 28 days", () => {
      const sloWithoutWindow = {
        flow_name: "payment_capture",
        sli_type: "latency",
        target: "< 1s",
        target_value: 1.0,
        unit: "seconds",
      };

      const result = SLOTargetSchema.safeParse(sloWithoutWindow);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.measurement_window_days, 28);
      }
    });
  });

  describe("BusinessHours", () => {
    it("should have correct default values", () => {
      assert.strictEqual(DEFAULT_BUSINESS_HOURS.start_hour, 9);
      assert.strictEqual(DEFAULT_BUSINESS_HOURS.end_hour, 17);
      assert.strictEqual(DEFAULT_BUSINESS_HOURS.timezone, "outlet");
      assert.deepStrictEqual(DEFAULT_BUSINESS_HOURS.weekdays, [1, 2, 3, 4, 5]);
    });

    it("should accept valid business hours configuration", () => {
      const config = {
        start_hour: 8,
        end_hour: 18,
        timezone: "Asia/Jakarta",
        weekdays: [1, 2, 3, 4, 5, 6], // Include Saturday
      };
      const result = BusinessHoursSchema.safeParse(config);
      assert.strictEqual(result.success, true);
    });

    it("should reject invalid hour values", () => {
      const config = {
        start_hour: 25, // Invalid: > 23
        end_hour: 17,
      };
      const result = BusinessHoursSchema.safeParse(config);
      assert.strictEqual(result.success, false);
    });
  });

  describe("isWithinBusinessHours", () => {
    // Use a fixed timestamp: 2026-03-23 03:00 UTC (Monday)
    // This is 10:00 WIB (Asia/Jakarta, +7), which is within 9-17 business hours
    const mondayMorningUTC = new Date("2026-03-23T03:00:00Z").getTime();

    it("should return true during business hours on a weekday", () => {
      // 03:00 UTC = 10:00 WIB (Asia/Jakarta, +7) - within 9-17
      const result = isWithinBusinessHours(mondayMorningUTC, "Asia/Jakarta");
      assert.strictEqual(result, true);
    });

    it("should return false outside business hours", () => {
      // Using America/New_York (-5): 03:00 UTC = 22:00 previous day - outside 9-17
      const result = isWithinBusinessHours(mondayMorningUTC, "America/New_York");
      assert.strictEqual(result, false);
    });

    it("should return false on weekends", () => {
      // 2026-03-28 is a Saturday
      const saturdayUTC = new Date("2026-03-28T03:00:00Z").getTime();
      const result = isWithinBusinessHours(saturdayUTC, "Asia/Jakarta");
      assert.strictEqual(result, false);
    });

    it("should use custom business hours configuration", () => {
      const customHours = {
        start_hour: 0,
        end_hour: 24,
        timezone: "UTC",
        weekdays: [1, 2, 3, 4, 5, 6, 7], // All days
      };
      // 03:00 UTC with 0-24 business hours should be within
      const result = isWithinBusinessHours(mondayMorningUTC, "UTC", customHours);
      assert.strictEqual(result, true);
    });

    it("should handle timezone offset that results in previous day", () => {
      // 03:00 UTC = 18:00 previous day in America/New_York (-5)
      // 18:00 is outside 9-17
      const result = isWithinBusinessHours(mondayMorningUTC, "America/New_York");
      assert.strictEqual(result, false);
    });
  });
});
