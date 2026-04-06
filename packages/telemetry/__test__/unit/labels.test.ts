// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit Tests for Telemetry Labels Module
 * Story 11.1: Reliability Baseline and SLO Instrumentation
 * 
 * Tests that verify label cardinality validation and PII detection.
 */

import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  TELEMETRY_LABELS,
  FORBIDDEN_LABELS,
  validateLabelName,
  validateLabelValue,
  validateLabelSet,
  type TelemetryLabelName,
} from "../../src/labels.js";

describe("Telemetry Labels Module", () => {
  describe("SAFE_METRIC_LABELS", () => {
    it("should include company_id and outlet_id", () => {
      assert.ok("company_id" in TELEMETRY_LABELS);
      assert.ok("outlet_id" in TELEMETRY_LABELS);
    });

    it("should include flow_name with fixed cardinality", () => {
      assert.ok("flow_name" in TELEMETRY_LABELS);
      assert.strictEqual(TELEMETRY_LABELS.flow_name.cardinality, "fixed");
    });

    it("should include status labels", () => {
      assert.ok("status" in TELEMETRY_LABELS);
      assert.ok("error_class" in TELEMETRY_LABELS);
    });
  });

  describe("FORBIDDEN_LABELS", () => {
    it("should include high-cardinality identifiers", () => {
      assert.ok(FORBIDDEN_LABELS.includes("user_id"));
      assert.ok(FORBIDDEN_LABELS.includes("transaction_id"));
      assert.ok(FORBIDDEN_LABELS.includes("item_id"));
      assert.ok(FORBIDDEN_LABELS.includes("customer_id"));
    });

    it("should include PII fields", () => {
      assert.ok(FORBIDDEN_LABELS.includes("email"));
      assert.ok(FORBIDDEN_LABELS.includes("name"));
      assert.ok(FORBIDDEN_LABELS.includes("card_number"));
      assert.ok(FORBIDDEN_LABELS.includes("phone"));
      assert.ok(FORBIDDEN_LABELS.includes("address"));
    });
  });

  describe("validateLabelName()", () => {
    it("should accept safe label names", () => {
      const safeLabels = ["company_id", "outlet_id", "flow_name", "status", "error_class"];

      for (const label of safeLabels) {
        const result = validateLabelName(label);
        assert.strictEqual(result.valid, true, `Label ${label} should be valid`);
      }
    });

    it("should reject forbidden label names", () => {
      const forbiddenLabels = ["user_id", "transaction_id", "email", "card_number", "phone"];

      for (const label of forbiddenLabels) {
        const result = validateLabelName(label);
        assert.strictEqual(result.valid, false, `Label ${label} should be forbidden`);
        assert.ok(result.reason?.includes("forbidden"));
      }
    });

    it("should reject unknown label names", () => {
      const result = validateLabelName("unknown_label");
      assert.strictEqual(result.valid, false);
      assert.ok(result.reason?.includes("not in the allowed"));
    });
  });

  describe("validateLabelValue()", () => {
    it("should accept numeric IDs", () => {
      const numericIds = ["123", "456789", "999999999"];

      for (const value of numericIds) {
        const result = validateLabelValue("company_id", value);
        assert.strictEqual(result.valid, true, `Numeric ID ${value} should be valid`);
      }
    });

    it("should accept fixed set values", () => {
      const result = validateLabelValue("status", "success");
      assert.strictEqual(result.valid, true);

      const errorResult = validateLabelValue("error_class", "timeout");
      assert.strictEqual(errorResult.valid, true);
    });

    it("should reject email addresses as label values", () => {
      const emails = [
        "user@example.com",
        "test.email+tag@gmail.com",
        "admin@company.org",
      ];

      for (const email of emails) {
        const result = validateLabelValue("company_id", email);
        assert.strictEqual(result.valid, false, `Email ${email} should be rejected`);
        assert.ok(result.reason?.includes("email"));
      }
    });

    it("should reject credit card numbers as label values", () => {
      const cards = [
        "4111111111111111",
        "4111 1111 1111 1111",
        "5500-0000-0000-0004",
      ];

      for (const card of cards) {
        const result = validateLabelValue("company_id", card);
        assert.strictEqual(result.valid, false, `Card number should be rejected`);
        assert.ok(result.reason?.includes("credit card"));
      }
    });

    it("should reject phone numbers as label values", () => {
      const phones = [
        "+1234567890",
        "1234567890",
        "123-456-7890",
      ];

      for (const phone of phones) {
        const result = validateLabelValue("company_id", phone);
        assert.strictEqual(result.valid, false, `Phone number should be rejected`);
        assert.ok(result.reason?.includes("phone"));
      }
    });

    it("should accept alphanumeric codes that look like IDs", () => {
      // These are not PII, just alphanumeric identifiers
      const codes = ["ABC123", "COMPANY-001", "OUTLET_99"];

      for (const code of codes) {
        const result = validateLabelValue("company_id", code);
        assert.strictEqual(result.valid, true, `Code ${code} should be valid`);
      }
    });
  });

  describe("validateLabelSet()", () => {
    it("should accept a valid label set", () => {
      const validLabels = {
        company_id: "123",
        outlet_id: "456",
        flow_name: "payment_capture",
        status: "success",
      };

      const result = validateLabelSet(validLabels);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it("should return errors for invalid label names", () => {
      const invalidLabels = {
        company_id: "123",
        user_id: "456", // Forbidden
        email: "test@example.com", // Forbidden
      };

      const result = validateLabelSet(invalidLabels);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length, 2);
    });

    it("should return errors for PII in label values", () => {
      const piiLabels = {
        company_id: "123",
        outlet_id: "test@example.com", // PII
      };

      const result = validateLabelSet(piiLabels);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });
  });
});
