// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Orchestrator
 * 
 * Coordinates sync push business logic modules.
 * This module has zero HTTP knowledge - it accepts plain params and returns typed results.
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
import { processSyncPushTransaction } from "./transactions.js";
import {
  processActiveOrders,
  processOrderUpdates,
  processItemCancellations
} from "./orders.js";
import { resolveBatchIdempotencyCheck } from "./idempotency.js";
import { processVariantSales } from "./variant-sales.js";
import { processVariantStockAdjustments } from "./variant-stock-adjustments.js";

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

  // Process transactions in batches with controlled concurrency
  // Each transaction gets its own connection from the pool
  if (transactions.length > 0) {
    const idempotencyConnection = await dbPool.getConnection();
    let transactionsToProcess: IndexedTransaction[] = transactions.map((tx, txIndex) => ({ tx, txIndex }));

    try {
      const eligibleTransactions = transactions.filter(
        (tx) => tx.company_id === authCompanyId && tx.outlet_id === inputOutletId
      );

      const { newTransactions, cachedResults } = await resolveBatchIdempotencyCheck({
        orderDbConnection: idempotencyConnection,
        companyId: authCompanyId,
        outletId: inputOutletId,
        transactions: eligibleTransactions,
        metricsCollector
      });

      results.push(...cachedResults);

      const newTxIndexes = new Set(newTransactions.map(({ txIndex }) => txIndex));
      transactionsToProcess = transactionsToProcess.filter(
        ({ tx, txIndex }) => tx.company_id !== authCompanyId || tx.outlet_id !== inputOutletId || newTxIndexes.has(txIndex)
      );
    } finally {
      idempotencyConnection.release();
    }

    const batches = buildTransactionBatches(
      transactionsToProcess.map(({ tx }) => tx),
      maxConcurrency
    );

    const originalIndexes = transactionsToProcess.map(({ txIndex }) => txIndex);

    for (const batch of batches) {
      const batchPromises = batch.map((indexedTx: IndexedTransaction) =>
        processSyncPushTransaction({
          dbPool,
          tx: indexedTx.tx,
          txIndex: originalIndexes[indexedTx.txIndex] ?? indexedTx.txIndex,
          inputOutletId,
          authCompanyId,
          authUserId,
          correlationId,
          injectFailureAfterHeaderInsert,
          forcedRetryableErrno,
          taxContext,
          metricsCollector
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
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
