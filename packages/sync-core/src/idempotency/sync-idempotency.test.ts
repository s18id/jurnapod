// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tests for Sync Idempotency Service
 * Story: Epic 11.3 - Sync Idempotency and Retry Resilience Hardening
 */

import { describe, it, assert, beforeEach } from "vitest";
import {
  SyncIdempotencyService,
  syncIdempotencyService,
  ERROR_CLASSIFICATION,
  MYSQL_ERROR_CODES,
  SYNC_RESULT_CODES,
  type IdempotencyRecord,
} from "./sync-idempotency.js";

describe("SyncIdempotencyService", () => {
  let service: SyncIdempotencyService;

  beforeEach(() => {
    service = new SyncIdempotencyService();
  });

  describe("classifyError", () => {
    it("should classify lock wait timeout as TRANSIENT (retryable)", () => {
      const error = { errno: MYSQL_ERROR_CODES.LOCK_WAIT_TIMEOUT, message: "Lock wait timeout" };
      const result = service.classifyError(error);

      assert.strictEqual(result.classification, ERROR_CLASSIFICATION.TRANSIENT);
      assert.isTrue(result.retryable);
      assert.isNumber(result.retryAfterMs);
    });

    it("should classify deadlock as TRANSIENT (retryable)", () => {
      const error = { errno: MYSQL_ERROR_CODES.DEADLOCK, message: "Deadlock found" };
      const result = service.classifyError(error);

      assert.strictEqual(result.classification, ERROR_CLASSIFICATION.TRANSIENT);
      assert.isTrue(result.retryable);
    });

    it("should classify duplicate entry as IDEMPOTENCY (not retryable)", () => {
      const error = { errno: MYSQL_ERROR_CODES.DUPLICATE_ENTRY, message: "Duplicate entry" };
      const result = service.classifyError(error);

      assert.strictEqual(result.classification, ERROR_CLASSIFICATION.IDEMPOTENCY);
      assert.isFalse(result.retryable);
    });

    it("should classify NO_SUCH_TABLE as SYSTEM (escalate)", () => {
      const error = { errno: MYSQL_ERROR_CODES.NO_SUCH_TABLE, message: "Table not found" };
      const result = service.classifyError(error);

      assert.strictEqual(result.classification, ERROR_CLASSIFICATION.SYSTEM);
      assert.isFalse(result.retryable);
    });

    it("should classify validation errors as VALIDATION (not retryable)", () => {
      const error = { message: "Invalid outlet_id mismatch" };
      const result = service.classifyError(error);

      assert.strictEqual(result.classification, ERROR_CLASSIFICATION.VALIDATION);
      assert.isFalse(result.retryable);
    });

    it("should classify business logic errors as BUSINESS_LOGIC (not retryable)", () => {
      const error = { message: "Insufficient stock for item" };
      const result = service.classifyError(error);

      assert.strictEqual(result.classification, ERROR_CLASSIFICATION.BUSINESS_LOGIC);
      assert.isFalse(result.retryable);
    });

    it("should classify idempotency conflicts as CONFLICT (not retryable)", () => {
      const error = { message: "IDEMPOTENCY_CONFLICT: payload hash mismatch" };
      const result = service.classifyError(error);

      assert.strictEqual(result.classification, ERROR_CLASSIFICATION.CONFLICT);
      assert.isFalse(result.retryable);
    });

    it("should default to SYSTEM for unknown errors", () => {
      const error = { message: "Some unknown error" };
      const result = service.classifyError(error);

      assert.strictEqual(result.classification, ERROR_CLASSIFICATION.SYSTEM);
      assert.isFalse(result.retryable);
    });

    it("should handle null/undefined errors", () => {
      const result1 = service.classifyError(null);
      assert.strictEqual(result1.classification, ERROR_CLASSIFICATION.SYSTEM);

      const result2 = service.classifyError(undefined);
      assert.strictEqual(result2.classification, ERROR_CLASSIFICATION.SYSTEM);
    });
  });

  describe("isIdempotencyDuplicateError", () => {
    it("should return true for duplicate entry error", () => {
      const error = { errno: MYSQL_ERROR_CODES.DUPLICATE_ENTRY };
      assert.isTrue(service.isIdempotencyDuplicateError(error));
    });

    it("should return false for other errors", () => {
      const error = { errno: MYSQL_ERROR_CODES.LOCK_WAIT_TIMEOUT };
      assert.isFalse(service.isIdempotencyDuplicateError(error));
    });

    it("should return false for non-object errors", () => {
      assert.isFalse(service.isIdempotencyDuplicateError("string error"));
      assert.isFalse(service.isIdempotencyDuplicateError(123));
    });
  });

  describe("isRetryableError", () => {
    it("should return true for transient errors", () => {
      const error = { errno: MYSQL_ERROR_CODES.LOCK_WAIT_TIMEOUT };
      assert.isTrue(service.isRetryableError(error));
    });

    it("should return false for non-retryable errors", () => {
      const error = { errno: MYSQL_ERROR_CODES.DUPLICATE_ENTRY };
      assert.isFalse(service.isRetryableError(error));
    });
  });

  describe("determineReplayOutcome", () => {
    const existingRecord: IdempotencyRecord = {
      pos_transaction_id: 123,
      payload_sha256: "abc123",
      payload_hash_version: 2,
      status: "COMPLETED",
      trx_at: "2026-03-22T10:00:00Z",
    };

    it("should return PROCESS when no existing record", () => {
      const result = service.determineReplayOutcome(null, "hash123", null, null);

      assert.isFalse(result.is_duplicate);
      assert.isNull(result.existing_record);
      assert.strictEqual(result.outcome, "PROCESS");
    });

    it("should return RETURN_CACHED for exact hash match", () => {
      const result = service.determineReplayOutcome(
        existingRecord,
        "abc123", // same as existingRecord.payload_sha256
        "abc123",
        2
      );

      assert.isTrue(result.is_duplicate);
      assert.strictEqual(result.existing_record?.pos_transaction_id, 123);
      assert.strictEqual(result.outcome, "RETURN_CACHED");
      assert.strictEqual(result.classification, ERROR_CLASSIFICATION.IDEMPOTENCY);
    });

    it("should return RETURN_CACHED for legacy record (no hash)", () => {
      const legacyRecord: IdempotencyRecord = {
        ...existingRecord,
        payload_sha256: null,
        payload_hash_version: null,
      };

      const result = service.determineReplayOutcome(legacyRecord, "anyhash", null, null);

      assert.isTrue(result.is_duplicate);
      assert.strictEqual(result.outcome, "RETURN_CACHED");
    });

    it("should return CONFLICT for hash mismatch", () => {
      const result = service.determineReplayOutcome(
        existingRecord,
        "different_hash",
        "abc123",
        2
      );

      assert.isFalse(result.is_duplicate);
      assert.strictEqual(result.outcome, "CONFLICT");
      assert.strictEqual(result.classification, ERROR_CLASSIFICATION.CONFLICT);
    });

    it("should return RETURN_CACHED for legacy hash version match", () => {
      const result = service.determineReplayOutcome(
        existingRecord,
        "legacy_hash",
        "legacy_hash",
        1 // legacy version
      );

      assert.isTrue(result.is_duplicate);
      assert.strictEqual(result.outcome, "RETURN_CACHED");
    });
  });

  describe("getResultCode", () => {
    it("should return OK for PROCESS outcome", () => {
      assert.strictEqual(service.getResultCode("PROCESS"), SYNC_RESULT_CODES.OK);
    });

    it("should return DUPLICATE for RETURN_CACHED outcome", () => {
      assert.strictEqual(service.getResultCode("RETURN_CACHED"), SYNC_RESULT_CODES.DUPLICATE);
    });

    it("should return CONFLICT for CONFLICT outcome", () => {
      assert.strictEqual(service.getResultCode("CONFLICT"), SYNC_RESULT_CODES.CONFLICT);
    });
  });

  describe("createErrorResult", () => {
    it("should create error result with classification prefix", () => {
      const result = service.createErrorResult(
        "tx-123",
        "something went wrong",
        ERROR_CLASSIFICATION.BUSINESS_LOGIC
      );

      assert.strictEqual(result.client_tx_id, "tx-123");
      assert.strictEqual(result.result, SYNC_RESULT_CODES.ERROR);
      assert.isTrue(result.message.startsWith("BUSINESS_LOGIC:"));
    });
  });
});

describe("Singleton instance", () => {
  it("should export a singleton instance", () => {
    assert.instanceOf(syncIdempotencyService, SyncIdempotencyService);
  });
});
