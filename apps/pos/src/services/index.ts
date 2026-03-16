// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * POS Services
 * 
 * Platform-agnostic business logic services.
 * These services use port interfaces and do not directly depend on platform APIs.
 */

export { RuntimeService } from "./runtime-service.js";
export type {
  RuntimeSyncBadgeState,
  RuntimeOutletScope,
  RuntimeOfflineSnapshot,
  RuntimeCheckoutConfig,
  RuntimeProductCatalogItem
} from "./runtime-service.js";

export { SyncService } from "./sync-service.js";
export type { SyncPullOptions, SyncPullResult } from "./sync-service.js";

export { SyncOrchestrator } from "./sync-orchestrator.js";
export type {
  SyncPushReason,
  SyncPushResult,
  SyncPullResult as OrchestratorSyncPullResult,
  SyncOrchestratorConfig
} from "./sync-orchestrator.js";

export { OutboxService } from "./outbox-service.js";
export type {
  OutboxStats,
  OutboxJobSummary
} from "./outbox-service.js";

export { PrintService } from "./print-service.js";
export type { PrintSaleReceiptInput } from "./print-service.js";

export {
  checkStockAvailability,
  validateStockForItems,
  reserveStock,
  releaseStock,
  releaseExpiredReservations,
  updateStockFromSync,
  batchUpdateStockFromSync,
  getStockStatus
} from "./stock.js";
export type {
  CheckStockAvailabilityInput,
  CheckStockAvailabilityResult,
  ValidateStockForItemsInput,
  ReserveStockInput,
  ReleaseStockInput,
  UpdateStockFromSyncInput
} from "./stock.js";
