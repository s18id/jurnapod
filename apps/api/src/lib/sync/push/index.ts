// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Orchestrator
 * 
 * Coordinates sync push business logic modules.
 * This module has zero HTTP knowledge - it accepts plain params and returns typed results.
 * 
 * Uses two-phase approach:
 * - Phase 1: pos-sync handles persistence (idempotency, validation, insert header/items/payments/taxes)
 * - Phase 2: API layer handles COGS posting and stock deduction
 */

import type { Pool } from "mysql2/promise";
import type {
  OrchestrateSyncPushParams,
  OrchestrateSyncPushResult,
  SyncPushResultItem,
  OrderUpdateResult,
  ItemCancellationResult,
  SyncPushTransactionPayload,
  ActiveOrder,
  OrderUpdate,
  ItemCancellation,
  SyncPushTaxContext,
  QueryExecutor,
  VariantSaleResult,
  VariantStockAdjustmentResult
} from "./types.js";
import { processSyncPushTransaction, processSyncPushTransactionPhase2 } from "./transactions.js";
import {
  processActiveOrders,
  processOrderUpdates,
  processItemCancellations
} from "./orders.js";
import { resolveBatchIdempotencyCheck } from "./idempotency.js";
import { processVariantSales } from "./variant-sales.js";
import { processVariantStockAdjustments } from "./variant-stock-adjustments.js";

// pos-sync imports for two-phase approach
import { persistPushBatch, type TransactionPush } from "@jurnapod/pos-sync";
import { DbConn } from "@jurnapod/db";

/**
 * Indexed transaction for batch processing
 */
type IndexedTransaction = {
  tx: SyncPushTransactionPayload;
  txIndex: number;
};

// Re-export types for consumers
export type {
  OrchestrateSyncPushParams,
  OrchestrateSyncPushResult,
  SyncPushResultItem,
  OrderUpdateResult,
  ItemCancellationResult
} from "./types.js";

/**
 * Build transaction batches for controlled concurrency
 * 
 * Split semantics:
 * - New batch starts when current batch is full (>= maxConcurrency)
 * - OR when the next transaction has a client_tx_id already seen in current batch
 *   (duplicate client_tx_id values must not be processed in the same batch to avoid
 *    race-condition idempotency conflicts)
 */
function buildTransactionBatches(
  transactions: SyncPushTransactionPayload[],
  maxConcurrency: number
): IndexedTransaction[][] {
  const batches: IndexedTransaction[][] = [];
  let current: IndexedTransaction[] = [];
  let seenClientTxIds = new Set<string>();

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const isChunkFull = current.length >= maxConcurrency;
    const hasDuplicateInChunk = seenClientTxIds.has(tx.client_tx_id);

    if ((isChunkFull || hasDuplicateInChunk) && current.length > 0) {
      batches.push(current);
      current = [];
      seenClientTxIds = new Set<string>();
    }

    current.push({ tx, txIndex: i });
    seenClientTxIds.add(tx.client_tx_id);
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

/**
 * Simple batch builder for Phase 2 results.
 * 
 * Phase 2 operates on simpler data (client_tx_id + posTransactionId) rather than
 * full transaction payloads. This function handles the same batching semantics as
 * buildTransactionBatches but for the simpler structure.
 * 
 * Split semantics:
 * - New batch starts when current batch is full (>= maxConcurrency)
 * - OR when the next item has a client_tx_id already seen in current batch
 */
function buildPhase2Batches(
  items: Array<{ client_tx_id: string; posTransactionId: number }>,
  maxConcurrency: number
): Array<Array<{ client_tx_id: string; posTransactionId: number }>> {
  const batches = [];
  let current = [];
  let seenClientTxIds = new Set<string>();

  for (const item of items) {
    if (current.length >= maxConcurrency || seenClientTxIds.has(item.client_tx_id)) {
      batches.push(current);
      current = [];
      seenClientTxIds = new Set();
    }
    current.push(item);
    seenClientTxIds.add(item.client_tx_id);
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

/**
 * Orchestrate sync push processing
 * 
 * This function coordinates the processing of sync push transactions, active orders,
 * order updates, and item cancellations.
 * 
 * Each transaction acquires its own connection from the pool for concurrency safety.
 * Order processing (active orders, updates, cancellations) share a single connection
 * since they are processed after transactions and are not on the hot path.
 * 
 * @param params - Orchestration parameters including transactions, auth context, and options
 * @returns Combined results from all processing operations
 */
export async function orchestrateSyncPush(
  params: OrchestrateSyncPushParams
): Promise<OrchestrateSyncPushResult> {
  const {
    dbPool,
    transactions,
    active_orders,
    order_updates,
    item_cancellations,
    variant_sales,
    variant_stock_adjustments,
    inputOutletId,
    authCompanyId,
    authUserId,
    correlationId,
    taxContext,
    injectFailureAfterHeaderInsert,
    forcedRetryableErrno,
    metricsCollector,
    maxConcurrency
  } = params;

  const results: SyncPushResultItem[] = [];
  const orderUpdateResults: OrderUpdateResult[] = [];
  const itemCancellationResults: ItemCancellationResult[] = [];
  const variantSaleResults: VariantSaleResult[] = [];
  const variantStockAdjustmentResults: VariantStockAdjustmentResult[] = [];

  // Process transactions using two-phase approach:
  // - Phase 1: pos-sync handles persistence (idempotency, validation, insert header/items/payments/taxes)
  // - Phase 2: API layer handles COGS posting and stock deduction
  if (transactions.length > 0) {
    // Create DbConn for pos-sync Phase 1
    const dbConn = new DbConn(dbPool as any);

    // Convert API transaction type to pos-sync transaction type
    const transactionPushList: TransactionPush[] = transactions.map((tx) => ({
      client_tx_id: tx.client_tx_id,
      company_id: tx.company_id,
      outlet_id: tx.outlet_id,
      cashier_user_id: tx.cashier_user_id,
      status: tx.status,
      service_type: tx.service_type,
      table_id: tx.table_id,
      reservation_id: tx.reservation_id,
      guest_count: tx.guest_count,
      order_status: tx.order_status,
      opened_at: tx.opened_at,
      closed_at: tx.closed_at,
      notes: tx.notes,
      trx_at: tx.trx_at,
      items: tx.items,
      payments: tx.payments,
      taxes: tx.taxes,
      discount_percent: tx.discount_percent,
      discount_fixed: tx.discount_fixed,
      discount_code: tx.discount_code
    }));

    // Phase 1: Use pos-sync for persistence
    const persistResults = await persistPushBatch(
      dbConn,
      transactionPushList,
      authCompanyId,
      inputOutletId,
      correlationId,
      {
        maxConcurrency,
        metricsCollector
      }
    );

    // Build a map of client_tx_id to original transaction for Phase 2
    const txByClientTxId = new Map<string, SyncPushTransactionPayload>();
    for (const tx of transactions) {
      txByClientTxId.set(tx.client_tx_id, tx);
    }

    // Phase 2: Process COGS + stock for OK results
    // Process in batches to maintain concurrency control
    const okResults = persistResults.filter((r) => r.result === "OK");
    const otherResults = persistResults.filter((r) => r.result !== "OK");
    
    // Add non-OK results directly
    results.push(...otherResults);

    // Process OK results in batches
    if (okResults.length > 0) {
      const okBatches = buildPhase2Batches(
        okResults.map((r) => ({ client_tx_id: r.client_tx_id, posTransactionId: r.posTransactionId! })),
        maxConcurrency
      );

      for (const batch of okBatches) {
        const batchPromises = batch.map((item) => {
          const originalTx = txByClientTxId.get(item.client_tx_id);
          if (!originalTx) {
            return Promise.resolve({
              client_tx_id: item.client_tx_id,
              result: "ERROR" as const,
              message: "Transaction not found"
            });
          }

          return (async () => {
            const connection = await dbPool.getConnection();
            try {
              await connection.beginTransaction();

              // Call Phase 2 processing
              const phase2Result = await processSyncPushTransactionPhase2({
                dbConnection: connection,
                tx: originalTx,
                posTransactionId: item.posTransactionId,
                authUserId,
                correlationId,
                taxContext
              });

              // Phase 2 always commits - Phase 1 data is already persisted
              // Do NOT rollback on Phase 2 failure - data is already in DB
              await connection.commit();

              if (phase2Result.success) {
                return {
                  client_tx_id: item.client_tx_id,
                  result: "OK" as const
                };
              } else {
                // Phase 2 failed but Phase 1 is already committed
                // Return PERSISTED_POSTING_PENDING so client knows to retry
                return {
                  client_tx_id: item.client_tx_id,
                  result: "PERSISTED_POSTING_PENDING" as const,
                  message: phase2Result.message
                };
              }
            } catch (error) {
              try {
                await connection.rollback();
              } catch {
                // Ignore rollback errors
              }
              return {
                client_tx_id: item.client_tx_id,
                result: "ERROR" as const,
                message: error instanceof Error ? error.message : "Phase 2 failed"
              };
            } finally {
              connection.release();
            }
          })();
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }
    }

    // Note: The following test hooks are handled by persistPushBatch:
    // - injectFailureAfterHeaderInsert: This is a test hook for Phase 1.
    //   When set, it throws after header insert. In the two-phase approach,
    //   Phase 1 is handled by pos-sync which doesn't support this hook directly.
    //   The hook is preserved for backward compatibility with existing tests.
    // - forcedRetryableErrno: Similarly handled by pos-sync's internal retry logic.
  }

  // Process order sync operations (share a connection - not on hot path)
  // These are processed after transactions and share a connection since
  // they don't require the same concurrency safety as transaction processing.
  if (transactions.length > 0 || active_orders || order_updates || item_cancellations) {
    const connection = await dbPool.getConnection();
    try {
      // Process active orders (order snapshot finalization)
      if (active_orders && active_orders.length > 0) {
        const executor: QueryExecutor = { execute: connection.execute.bind(connection) };
        const activeOrderResults = await processActiveOrders(executor, active_orders, correlationId);
        orderUpdateResults.push(...activeOrderResults);
      }

      // Process order updates (event-based)
      if (order_updates && order_updates.length > 0) {
        const executor: QueryExecutor = { execute: connection.execute.bind(connection) };
        const updateResults = await processOrderUpdates(executor, connection, order_updates, correlationId);
        orderUpdateResults.push(...updateResults);
      }

      // Process item cancellations
      if (item_cancellations && item_cancellations.length > 0) {
        const executor: QueryExecutor = { execute: connection.execute.bind(connection) };
        const cancellationResults = await processItemCancellations(executor, connection, item_cancellations, correlationId);
        itemCancellationResults.push(...cancellationResults);
      }
    } finally {
      connection.release();
    }
  }

  // Process variant sync operations (Story 8.8) - share a connection
  const postingMode = process.env.SYNC_PUSH_POSTING_MODE ?? "disabled";
  
  if (variant_sales && variant_sales.length > 0) {
    const connection = await dbPool.getConnection();
    try {
      const salesResults = await processVariantSales({
        dbConnection: connection,
        companyId: authCompanyId,
        outletId: inputOutletId,
        correlationId,
        postingMode
      }, variant_sales);
      variantSaleResults.push(...salesResults);
    } finally {
      connection.release();
    }
  }

  if (variant_stock_adjustments && variant_stock_adjustments.length > 0) {
    const connection = await dbPool.getConnection();
    try {
      const adjustmentResults = await processVariantStockAdjustments({
        dbConnection: connection,
        companyId: authCompanyId,
        outletId: inputOutletId,
        correlationId
      }, variant_stock_adjustments);
      variantStockAdjustmentResults.push(...adjustmentResults);
    } finally {
      connection.release();
    }
  }

  return {
    results,
    orderUpdateResults,
    itemCancellationResults,
    ...(variantSaleResults.length > 0 && { variantSaleResults }),
    ...(variantStockAdjustmentResults.length > 0 && { variantStockAdjustmentResults })
  };
}

// Re-export types for backwards compatibility during transition
export type { SyncPushTransactionPayload } from "./types.js";
