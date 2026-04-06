// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit Tests for Correlation ID Module
 * Story 11.1: Reliability Baseline and SLO Instrumentation
 */

import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  CORRELATION_ID_TYPES,
  CORRELATION_PROPAGATION_MATRIX,
  CorrelationContextSchema,
  generateRequestId,
  generateClientTxId,
  generateJournalBatchId,
  isCorrelationRequired,
} from "../../src/correlation.js";

describe("Correlation ID Module", () => {
  describe("CORRELATION_ID_TYPES", () => {
    it("should contain all required correlation ID types", () => {
      assert.ok(CORRELATION_ID_TYPES.includes("request_id"));
      assert.ok(CORRELATION_ID_TYPES.includes("client_tx_id"));
      assert.ok(CORRELATION_ID_TYPES.includes("journal_batch_id"));
      assert.ok(CORRELATION_ID_TYPES.includes("trace_id"));
    });
  });

  describe("CORRELATION_PROPAGATION_MATRIX", () => {
    it("should define propagation for all critical flows", () => {
      const flows = [
        "payment_capture",
        "offline_local_commit",
        "sync_replay_idempotency",
        "pos_to_gl_posting",
        "trial_balance",
        "general_ledger",
      ];

      for (const flow of flows) {
        assert.ok(
          CORRELATION_PROPAGATION_MATRIX[flow as keyof typeof CORRELATION_PROPAGATION_MATRIX],
          `Missing propagation config for ${flow}`
        );
      }
    });

    it("should have request_id as generated for all flows", () => {
      const flows = [
        "payment_capture",
        "offline_local_commit",
        "sync_replay_idempotency",
        "pos_to_gl_posting",
        "trial_balance",
        "general_ledger",
      ] as const;

      for (const flow of flows) {
        const config = CORRELATION_PROPAGATION_MATRIX[flow];
        assert.strictEqual(config.request_id, "generated");
      }
    });

    it("should require client_tx_id for POS flows", () => {
      const posFlows = ["payment_capture", "offline_local_commit", "sync_replay_idempotency"] as const;

      for (const flow of posFlows) {
        const config = CORRELATION_PROPAGATION_MATRIX[flow];
        assert.strictEqual(config.client_tx_id, "required");
      }
    });

    it("should require journal_batch_id for pos_to_gl_posting", () => {
      const config = CORRELATION_PROPAGATION_MATRIX.pos_to_gl_posting;
      assert.strictEqual(config.journal_batch_id, "required");
    });

    it("should not require client_tx_id for reporting flows", () => {
      const reportFlows = ["trial_balance", "general_ledger"] as const;

      for (const flow of reportFlows) {
        const config = CORRELATION_PROPAGATION_MATRIX[flow];
        assert.strictEqual(config.client_tx_id, "-");
      }
    });
  });

  describe("generateRequestId()", () => {
    it("should generate valid UUID v4 format", () => {
      const uuid = generateRequestId();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(uuid), `Generated ID is not valid UUID: ${uuid}`);
    });

    it("should generate unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateRequestId());
      }
      assert.strictEqual(ids.size, 100);
    });
  });

  describe("generateClientTxId()", () => {
    it("should generate valid UUID v4 format", () => {
      const uuid = generateClientTxId();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(uuid));
    });
  });

  describe("generateJournalBatchId()", () => {
    it("should generate valid UUID v4 format", () => {
      const uuid = generateJournalBatchId();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(uuid));
    });
  });

  describe("isCorrelationRequired()", () => {
    it("should return true for request_id in all flows", () => {
      const flows = [
        "payment_capture",
        "offline_local_commit",
        "sync_replay_idempotency",
        "pos_to_gl_posting",
        "trial_balance",
        "general_ledger",
      ] as const;

      for (const flow of flows) {
        assert.ok(isCorrelationRequired(flow, "request_id"));
      }
    });

    it("should return true for client_tx_id in POS flows", () => {
      const posFlows = ["payment_capture", "offline_local_commit", "sync_replay_idempotency"] as const;

      for (const flow of posFlows) {
        assert.ok(isCorrelationRequired(flow, "client_tx_id"));
      }
    });

    it("should return false for client_tx_id in non-POS flows", () => {
      const nonPosFlows = ["pos_to_gl_posting", "trial_balance", "general_ledger"] as const;

      for (const flow of nonPosFlows) {
        assert.ok(!isCorrelationRequired(flow, "client_tx_id"));
      }
    });

    it("should return true for journal_batch_id in pos_to_gl_posting", () => {
      assert.ok(isCorrelationRequired("pos_to_gl_posting", "journal_batch_id"));
    });

    it("should return false for journal_batch_id in other flows", () => {
      const flows = ["payment_capture", "offline_local_commit", "sync_replay_idempotency", "trial_balance", "general_ledger"] as const;

      for (const flow of flows) {
        assert.ok(!isCorrelationRequired(flow, "journal_batch_id"));
      }
    });
  });

  describe("CorrelationContextSchema", () => {
    it("should validate a complete correlation context", () => {
      const validContext = {
        request_id: "123e4567-e89b-12d3-a456-426614174000",
        client_tx_id: "123e4567-e89b-12d3-a456-426614174001",
        journal_batch_id: "123e4567-e89b-12d3-a456-426614174002",
        trace_id: "123e4567-e89b-12d3-a456-426614174003",
      };

      const result = CorrelationContextSchema.safeParse(validContext);
      assert.strictEqual(result.success, true);
    });

    it("should allow missing optional fields", () => {
      const minimalContext = {
        request_id: "123e4567-e89b-12d3-a456-426614174000",
      };

      const result = CorrelationContextSchema.safeParse(minimalContext);
      assert.strictEqual(result.success, true);
    });

    it("should reject invalid UUID for request_id", () => {
      const invalidContext = {
        request_id: "not-a-uuid",
      };

      const result = CorrelationContextSchema.safeParse(invalidContext);
      assert.strictEqual(result.success, false);
    });
  });
});
