// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * @jurnapod/offline-db/dexie
 * 
 * Dexie-based IndexedDB implementation for POS offline storage.
 * This package provides database schema, types, and utilities for POS offline-first operations.
 */

export { PosOfflineDb, createPosOfflineDb, posDb, POS_DB_NAME } from "./db.js";

export type {
  ProductItemType,
  OutletTableStatus,
  LocalSaleStatus,
  SaleSyncStatus,
  OutboxJobType,
  OutboxJobStatus,
  ProductCacheRow,
  OutletTableRow,
  SyncMetadataRow,
  SyncScopeConfigRow,
  SaleRow,
  SaleItemRow,
  PaymentRow,
  OutboxJobRow,
  CreateSaleDraftInput,
  CreateSaleDraftResult,
  CompleteSaleItemInput,
  CompleteSalePaymentInput,
  CompleteSaleTotalsInput,
  CompleteSaleInput,
  CompleteSaleResult,
  EnqueueOutboxJobInput,
  OutboxAttemptToken,
  UpdateOutboxStatusInput,
  ReserveOutboxAttemptInput,
  OutboxStatusUpdateReason,
  OutboxStatusUpdateResult
} from "./types.js";

export {
  OfflineStateError,
  ScopeValidationError,
  RecordNotFoundError,
  InvalidSaleTransitionError,
  SaleCompletionInProgressError,
  ProductSnapshotNotFoundError,
  SaleTotalsMismatchError
} from "./types.js";
