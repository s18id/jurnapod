// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stock Sync Module
 *
 * Exports all stock synchronization functionality for POS
 */

export {
  syncStockFromServer,
  isStockStale,
  type StockSyncContext,
  type StockSyncResult,
  type StockSyncItem
} from "./stock.js";

export {
  createStockReservationJob,
  createStockReleaseJob,
  parseStockOperationPayload,
  validateStockReservation,
  processStockReservation,
  processStockRelease,
  isStockOperation,
  getStockOperationPriority,
  sortOutboxJobsByPriority,
  type StockOperationPayload,
  type StockReservationResult
} from "./outbox-stock.js";
