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
  ReservationStatus,
  LocalSaleStatus,
  SaleSyncStatus,
  OrderServiceType,
  SourceFlow,
  SettlementFlow,
  OrderStatus,
  ActiveOrderState,
  OrderUpdateEventType,
  OrderUpdateSyncStatus,
  OutboxJobType,
  OutboxJobStatus,
  ProductCacheRow,
  OutletTableRow,
  ReservationRow,
  ActiveOrderRow,
  ActiveOrderLineRow,
  ActiveOrderUpdateRow,
  ItemCancellationRow,
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
  OutboxStatusUpdateResult,
  InventoryStockRow,
  StockReservationRow,
  CheckStockInput,
  CheckStockResult
} from "./types.js";

export {
  OfflineStateError,
  ScopeValidationError,
  RecordNotFoundError,
  InvalidSaleTransitionError,
  SaleCompletionInProgressError,
  ProductSnapshotNotFoundError,
  SaleTotalsMismatchError,
  InsufficientStockError,
  StockValidationError
} from "./types.js";
