// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Idempotency Service
 * 
 * Provides exactly-once processing semantics for sync operations.
 * Keyed by (company_id, outlet_id, client_tx_id) tuple.
 */

import { z } from "zod";

/**
 * Error classification taxonomy for retry handling
 */
export const ErrorClassificationSchema = z.enum([
  "TRANSIENT",         // Network timeout, DB connection - RETRY
  "BUSINESS_LOGIC",    // Insufficient stock, Invalid data - NO RETRY
  "IDEMPOTENCY",       // Already processed - NO RETRY (return cached)
  "SYSTEM",            // DB down, Disk full - ESCALATE
  "VALIDATION",        // Invalid input data - NO RETRY
  "CONFLICT",          // Version conflict - NO RETRY (conflict response)
]);

export type ErrorClassification = z.infer<typeof ErrorClassificationSchema>;

/**
 * Classification result with retry guidance
 */
export interface RetryGuidance {
  classification: ErrorClassification;
  retryable: boolean;
  message: string;
  retryAfterMs?: number;
}

/**
 * Error classification constants
 */
export const ERROR_CLASSIFICATION = {
  TRANSIENT: "TRANSIENT" as ErrorClassification,
  BUSINESS_LOGIC: "BUSINESS_LOGIC" as ErrorClassification,
  IDEMPOTENCY: "IDEMPOTENCY" as ErrorClassification,
  SYSTEM: "SYSTEM" as ErrorClassification,
  VALIDATION: "VALIDATION" as ErrorClassification,
  CONFLICT: "CONFLICT" as ErrorClassification,
};

/**
 * Default retry delays by error type (milliseconds)
 */
export const DEFAULT_RETRY_DELAYS: Record<ErrorClassification, number | undefined> = {
  TRANSIENT: 100,           // 100ms initial delay
  BUSINESS_LOGIC: undefined, // No retry
  IDEMPOTENCY: undefined,   // No retry
  SYSTEM: undefined,        // No retry (escalate)
  VALIDATION: undefined,     // No retry
  CONFLICT: undefined,       // No retry
};

/**
 * MySQL error codes for classification
 */
export const MYSQL_ERROR_CODES = {
  // Transient errors (retryable)
  LOCK_WAIT_TIMEOUT: 1205,
  DEADLOCK: 1213,
  CONNECT_TIMEOUT: 2006,
  // System errors (escalate)
  NO_SUCH_TABLE: 1146,
  TABLE_CORRUPT: 1356,
  DISK_FULL: 1021,
  // Duplicate key (idempotency)
  DUPLICATE_ENTRY: 1062,
} as const;

/**
 * Sync operation result codes
 */
export const SYNC_RESULT_CODES = {
  OK: "OK",
  DUPLICATE: "DUPLICATE",
  ERROR: "ERROR",
  CONFLICT: "CONFLICT",
} as const;

export type SyncResultCode = (typeof SYNC_RESULT_CODES)[keyof typeof SYNC_RESULT_CODES];

/**
 * Idempotency record structure
 */
export interface IdempotencyRecord {
  pos_transaction_id: number;
  payload_sha256: string | null;
  payload_hash_version: number | null;
  status: "COMPLETED" | "VOID" | "REFUND";
  trx_at: string;
}

/**
 * Idempotency check result
 */
export interface IdempotencyCheckResult {
  is_duplicate: boolean;
  existing_record: IdempotencyRecord | null;
  outcome: "PROCESS" | "RETURN_CACHED" | "CONFLICT";
  classification?: ErrorClassification;
}

/**
 * Payload hash version constants
 */
export const PAYLOAD_HASH_VERSIONS = {
  LEGACY: 1,
  CANONICAL_TRX_AT: 2,
} as const;

/**
 * Idempotency service class
 */
export class SyncIdempotencyService {
  /**
   * Classify an error for retry guidance
   */
  classifyError(error: unknown): RetryGuidance {
    if (!error || typeof error !== "object") {
      return {
        classification: ERROR_CLASSIFICATION.SYSTEM,
        retryable: false,
        message: "Unknown error",
      };
    }

    const mysqlError = error as { errno?: number; code?: string; sqlMessage?: string; message?: string };

    // MySQL-specific classification
    if (mysqlError.errno) {
      switch (mysqlError.errno) {
        case MYSQL_ERROR_CODES.LOCK_WAIT_TIMEOUT:
        case MYSQL_ERROR_CODES.DEADLOCK:
        case MYSQL_ERROR_CODES.CONNECT_TIMEOUT:
          return {
            classification: ERROR_CLASSIFICATION.TRANSIENT,
            retryable: true,
            message: `Transient database error: ${mysqlError.errno}`,
            retryAfterMs: DEFAULT_RETRY_DELAYS.TRANSIENT,
          };

        case MYSQL_ERROR_CODES.DUPLICATE_ENTRY:
          return {
            classification: ERROR_CLASSIFICATION.IDEMPOTENCY,
            retryable: false,
            message: "Duplicate entry detected - already processed",
          };

        case MYSQL_ERROR_CODES.NO_SUCH_TABLE:
        case MYSQL_ERROR_CODES.TABLE_CORRUPT:
        case MYSQL_ERROR_CODES.DISK_FULL:
          return {
            classification: ERROR_CLASSIFICATION.SYSTEM,
            retryable: false,
            message: `System error requiring intervention: ${mysqlError.errno}`,
          };
      }
    }

    // String-based error classification
    const errorMessage = mysqlError.message ?? mysqlError.sqlMessage ?? String(error);
    const upperMessage = errorMessage.toUpperCase();

    // Idempotency conflicts (check BEFORE validation - "IDEMPOTENCY_CONFLICT" contains "CONFLICT")
    if (upperMessage.includes("IDEMPOTENCY_CONFLICT") || upperMessage.includes("CONFLICT")) {
      return {
        classification: ERROR_CLASSIFICATION.CONFLICT,
        retryable: false,
        message: errorMessage,
      };
    }

    // Validation errors (check after idempotency to avoid "mismatch" being caught here)
    if (
      upperMessage.includes("INVALID") ||
      upperMessage.includes("MISMATCH") ||
      upperMessage.includes("REQUIRED") ||
      upperMessage.includes("NOT FOUND")
    ) {
      return {
        classification: ERROR_CLASSIFICATION.VALIDATION,
        retryable: false,
        message: errorMessage,
      };
    }

    // Business logic errors
    if (
      upperMessage.includes("INSUFFICIENT") ||
      upperMessage.includes("STOCK") ||
      upperMessage.includes("BALANCE") ||
      upperMessage.includes("UNSUPPORTED")
    ) {
      return {
        classification: ERROR_CLASSIFICATION.BUSINESS_LOGIC,
        retryable: false,
        message: errorMessage,
      };
    }

    // Default to system error
    return {
      classification: ERROR_CLASSIFICATION.SYSTEM,
      retryable: false,
      message: errorMessage,
    };
  }

  /**
   * Check if a duplicate error is an idempotency conflict
   */
  isIdempotencyDuplicateError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const mysqlError = error as { errno?: number };
    return mysqlError.errno === MYSQL_ERROR_CODES.DUPLICATE_ENTRY;
  }

  /**
   * Check if an error is retryable
   */
  isRetryableError(error: unknown): boolean {
    const guidance = this.classifyError(error);
    return guidance.retryable;
  }

  /**
   * Determine the idempotency outcome for a replay
   */
  determineReplayOutcome(
    existingRecord: IdempotencyRecord | null,
    incomingPayloadHash: string,
    existingPayloadHash: string | null,
    existingHashVersion: number | null,
    legacyPayloadHash?: string
  ): IdempotencyCheckResult {
    if (!existingRecord) {
      return {
        is_duplicate: false,
        existing_record: null,
        outcome: "PROCESS",
      };
    }

    // No existing hash - legacy record, need to compare full payload
    if (!existingPayloadHash || existingPayloadHash.trim().length === 0) {
      return {
        is_duplicate: true,
        existing_record: existingRecord,
        outcome: "RETURN_CACHED", // Legacy records are treated as duplicates
        classification: ERROR_CLASSIFICATION.IDEMPOTENCY,
      };
    }

    // Exact hash match
    if (existingPayloadHash === incomingPayloadHash) {
      return {
        is_duplicate: true,
        existing_record: existingRecord,
        outcome: "RETURN_CACHED",
        classification: ERROR_CLASSIFICATION.IDEMPOTENCY,
      };
    }

    // Legacy hash version: compare against legacy hash if provided
    const normalizedExistingHash = existingPayloadHash.trim();
    if ((existingHashVersion ?? 1) <= 1 && legacyPayloadHash && normalizedExistingHash === legacyPayloadHash.trim()) {
      return {
        is_duplicate: true,
        existing_record: existingRecord,
        outcome: "RETURN_CACHED",
        classification: ERROR_CLASSIFICATION.IDEMPOTENCY,
      };
    }

    // Hash mismatch = conflict
    return {
      is_duplicate: false,
      existing_record: existingRecord,
      outcome: "CONFLICT",
      classification: ERROR_CLASSIFICATION.CONFLICT,
    };
  }

  /**
   * Get sync result code from idempotency outcome
   */
  getResultCode(outcome: IdempotencyCheckResult["outcome"]): SyncResultCode {
    switch (outcome) {
      case "PROCESS":
        return SYNC_RESULT_CODES.OK;
      case "RETURN_CACHED":
        return SYNC_RESULT_CODES.DUPLICATE;
      case "CONFLICT":
        return SYNC_RESULT_CODES.CONFLICT;
    }
  }

  /**
   * Create an error result
   */
  createErrorResult(clientTxId: string, message: string, classification: ErrorClassification): { client_tx_id: string; result: SyncResultCode; message: string } {
    return {
      client_tx_id: clientTxId,
      result: SYNC_RESULT_CODES.ERROR,
      message: `${classification}:${message}`,
    };
  }
}

/**
 * Singleton instance
 */
export const syncIdempotencyService = new SyncIdempotencyService();
