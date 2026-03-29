// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Export data access functions (shared between pos-sync and backoffice-sync)
export * from "./data/index.js";

// Export types
export type * from "./types/index.js";
export type * from "./types/module.js";

// Export core classes
export { SyncModuleRegistry, syncModuleRegistry } from "./registry/module-registry.js";
export { SyncAuthenticator, syncAuthenticator } from "./auth/sync-auth.js";
export type { AuthUser, AuthResult } from "./auth/sync-auth.js";
export { SyncAuditor, syncAuditor } from "./audit/sync-audit.js";
export type { SyncAuditEvent } from "./audit/sync-audit.js";
export { RetryTransport, defaultRetryTransport } from "./transport/retry-transport.js";
export type { 
  RetryConfig, 
  TransportRequest, 
  TransportResponse 
} from "./transport/retry-transport.js";

// Export sync idempotency services (Epic 11.3)
export {
  SyncIdempotencyService,
  syncIdempotencyService,
  ERROR_CLASSIFICATION,
  DEFAULT_RETRY_DELAYS,
  MYSQL_ERROR_CODES,
  SYNC_RESULT_CODES,
  PAYLOAD_HASH_VERSIONS,
} from "./idempotency/index.js";
export type {
  ErrorClassification,
  RetryGuidance,
  IdempotencyRecord,
  IdempotencyCheckResult,
  SyncResultCode,
} from "./idempotency/index.js";

export {
  SyncIdempotencyMetricsCollector,
  syncIdempotencyMetricsCollector,
  DEFAULT_SYNC_IDEMPOTENCY_METRICS,
} from "./idempotency/index.js";
export type {
  SyncIdempotencyMetrics,
  SyncOperationResult,
  SyncBatchMetrics,
} from "./idempotency/index.js";

// Export WebSocket types and utilities
export type * from "./websocket/types.js";
export { createEventPayload, isWebSocketEventType } from "./websocket/publisher.js";
export type { EventPublisher, EventSubscriber } from "./websocket/publisher.js";

// Export data retention job
export {
  DataRetentionJob,
  runDataRetentionJob,
  getDataRetentionJob,
  setDataRetentionJobDb,
  DEFAULT_RETENTION_POLICIES,
} from "./jobs/data-retention.job.js";
export type {
  RetentionPolicy,
  PurgeResult,
  RetentionResult,
} from "./jobs/data-retention.job.js";

