// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Idempotency Module
 * 
 * Exports idempotency service, error classification, and metrics collection
 * for Epic 11.3: Sync Idempotency and Retry Resilience Hardening
 */

export {
  SyncIdempotencyService,
  syncIdempotencyService,
  ERROR_CLASSIFICATION,
  DEFAULT_RETRY_DELAYS,
  MYSQL_ERROR_CODES,
  SYNC_RESULT_CODES,
  PAYLOAD_HASH_VERSIONS,
  type ErrorClassification,
  type RetryGuidance,
  type IdempotencyRecord,
  type IdempotencyCheckResult,
  type SyncResultCode,
} from "./sync-idempotency.js";

export {
  SyncIdempotencyMetricsCollector,
  syncIdempotencyMetricsCollector,
  DEFAULT_SYNC_IDEMPOTENCY_METRICS,
  type SyncIdempotencyMetrics,
  type SyncOperationResult,
  type SyncBatchMetrics,
} from "./metrics-collector.js";
