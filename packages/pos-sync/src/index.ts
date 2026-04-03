// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export { PosSyncModule } from "./pos-sync-module.js";
export { PosDataService } from "./core/pos-data-service.js";
export * from "./types/pos-data.js";
export * from "./endpoints/pos-sync-endpoints.js";

// Export persistPushBatch for API layer usage (Phase 2 of Story 17-5)
export { persistPushBatch, handlePushSync } from "./push/index.js";
export type {
  TransactionPush,
  ActiveOrderPush,
  OrderUpdatePush,
  ItemCancellationPush,
  VariantSalePush,
  VariantStockAdjustmentPush,
  SyncPushResultItem,
  OrderUpdateResult,
  ItemCancellationResult,
  VariantSaleResult,
  VariantStockAdjustmentResult,
  PushSyncParams,
  PushSyncResult,
  // Domain result types (Story 27.1)
  StockDeductResult,
  SyncPushVariantSaleResult,
  SyncVariantStockAdjustResult,
  PostPushResult,
  StockConflict,
} from "./push/types.js";

// Export domain errors (Story 27.1)
export {
  SyncStockConflictError,
  SyncStockOverflowError,
  SyncStockNotFoundError,
  SyncValidationError,
} from "./push/types.js";

// Export pull types
export type {
  PullSyncParams,
  PullSyncResult
} from "./pull/types.js";