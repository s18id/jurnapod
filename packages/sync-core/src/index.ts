// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Export types
export type * from "./types/index.js";
export type * from "./types/module.js";

// Export core classes
export { SyncModuleRegistry, syncModuleRegistry } from "./registry/module-registry.js";
export { SyncAuthenticator, syncAuthenticator } from "./auth/sync-auth.js";
export type { AuthUser, AuthResult } from "./auth/sync-auth.js";
export { SyncAuditor, syncAuditor } from "./audit/sync-audit.js";
export type { SyncAuditEvent } from "./audit/sync-audit.js";
export { SyncVersionManager, syncVersionManager, getSyncVersionManager, setSyncVersionManagerPool } from "./versioning/version-manager.js";
export type { VersionInfo } from "./versioning/version-manager.js";
export { RetryTransport, defaultRetryTransport } from "./transport/retry-transport.js";
export type { 
  RetryConfig, 
  TransportRequest, 
  TransportResponse 
} from "./transport/retry-transport.js";

// Export WebSocket types and utilities
export type * from "./websocket/types.js";
export { createEventPayload, isWebSocketEventType } from "./websocket/publisher.js";
export type { EventPublisher, EventSubscriber } from "./websocket/publisher.js";

// Export data retention job
export {
  DataRetentionJob,
  runDataRetentionJob,
  getDataRetentionJob,
  setDataRetentionJobPool,
  DEFAULT_RETENTION_POLICIES,
} from "./jobs/data-retention.job.js";
export type {
  RetentionPolicy,
  PurgeResult,
  RetentionResult,
} from "./jobs/data-retention.job.js";

// Export rate limiting middleware
export {
  createRateLimitMiddleware,
  withRateLimit,
  createExpressRateLimitMiddleware,
  getRateLimitStatus,
  resetRateLimit,
  getRateLimitStoreSize,
  clearRateLimitStore,
  defaultAuthContextExtractor,
  rateLimitStore,
  RATE_LIMITS,
  RATE_LIMIT_HEADERS,
} from "./middleware/rate-limit.js";
export type {
  RateLimitConfig,
  RateLimitInfo,
  RateLimitTier,
  RateLimitAuthContext,
  AuthContextExtractor,
} from "./middleware/rate-limit.js";