// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

/**
 * POS Sync Push Layer
 * 
 * Orchestrates sync push operations using sync-core/data queries.
 * Phase 2 business logic (stock deduction via modules-inventory, COGS posting via modules-accounting)
 * is implemented. Table/reservation release and posting hooks are stubs pending story 27.6.
 * 
 * This module has zero HTTP knowledge - it accepts plain params and returns typed results.
 */

import { createHash } from "node:crypto";
import { sql } from "kysely";

import type { KyselySchema } from "@jurnapod/db";
import type {
  PushSyncParams,
  PushSyncResult,
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
} from "./types.js";

import {
  syncIdempotencyService,
  SyncIdempotencyMetricsCollector,
  type SyncOperationResult,
} from "@jurnapod/sync-core";

import {
  // Transaction queries
  readPosTransactionByClientTxId,
  batchReadPosTransactionsByClientTxIds,
  insertPosTransaction,
  insertPosTransactionItem,
  insertPosTransactionPayment,
  insertPosTransactionTax,
  type PosTransactionInsertInput,
  type PosTransactionItemInsertInput,
  type PosTransactionPaymentInsertInput,
  type PosTransactionTaxInsertInput,
  
  // Order snapshot queries
  upsertOrderSnapshot,
  deleteOrderSnapshotLines,
  insertOrderSnapshotLine,
  
  // Order update queries
  insertOrderUpdate,
  checkOrderUpdateExists,
  batchCheckOrderUpdatesExist,
  
  // Item cancellation queries
  insertItemCancellation,
  checkItemCancellationExists,
  batchCheckItemCancellationsExist,
  
  // Variant sale queries
  insertVariantSale,
  checkVariantSaleExists,
  batchCheckVariantSalesExist,
  deductVariantStock,
  
  // Variant stock adjustment queries
  insertStockAdjustment,
  checkAdjustmentExists,
  getVariantCurrentStock,
  
  // User queries
  isCashierInCompany,
} from "@jurnapod/sync-core";

import { toMysqlDateTime, toUtcInstant, toEpochMs } from "@jurnapod/shared";

// Modules for Phase2 business logic
import { getStockService } from "@jurnapod/modules-inventory";
import { postCogsForSale, type StockCostEntry } from "@jurnapod/modules-accounting/posting/cogs";

// ============================================================================
// Constants
// ============================================================================

const PAYLOAD_HASH_VERSION_CANONICAL_TRX_AT = 2;

// ============================================================================
// Timestamp Helpers
// ============================================================================

function toMysqlDateTimeStrict(value: string, fieldName: string = "datetime"): string {
  try {
    return toMysqlDateTime(value);
  } catch {
    throw new Error(`Invalid ${fieldName}`);
  }
}

function toTimestampMs(value: string, fieldName: string = "datetime"): number {
  return toEpochMs(toUtcInstant(value));
}

function normalizeTrxAtForHash(trxAt: string | number): number {
  if (typeof trxAt === "number") {
    return trxAt > 1e12 ? trxAt : trxAt * 1000;
  }
  try {
    return toEpochMs(toUtcInstant(trxAt));
  } catch {
    throw new Error(`Invalid trx_at: ${trxAt}`);
  }
}

// ============================================================================
// Payload Hashing
// ============================================================================

function canonicalizeTransactionForHash(tx: TransactionPush): string {
  const trxAtMs = normalizeTrxAtForHash(tx.trx_at);
  // Canonical for fallback values - must match what gets stored in DB
  // DB stores: toMysqlDateTimeStrict(tx.trx_at) for null opened_at/closed_at
  // Hash must match: use same canonical string format for consistency
  const trxAtCanonical = toMysqlDateTimeStrict(tx.trx_at);
  const openedAtVal = tx.opened_at ? toMysqlDateTimeStrict(tx.opened_at) : trxAtCanonical;
  const closedAtVal = tx.closed_at ? toMysqlDateTimeStrict(tx.closed_at) : trxAtCanonical;
  return JSON.stringify({
    client_tx_id: tx.client_tx_id,
    company_id: tx.company_id,
    outlet_id: tx.outlet_id,
    cashier_user_id: tx.cashier_user_id,
    status: tx.status,
    service_type: tx.service_type ?? "TAKEAWAY",
    table_id: tx.table_id ?? null,
    reservation_id: tx.reservation_id ?? null,
    guest_count: tx.guest_count ?? null,
    order_status: tx.order_status ?? "COMPLETED",
    opened_at: openedAtVal,
    closed_at: closedAtVal,
    notes: tx.notes ?? null,
    trx_at: trxAtMs,
    items: tx.items.map((item) => ({
      item_id: item.item_id,
      variant_id: item.variant_id ?? null,
      qty: item.qty,
      price_snapshot: item.price_snapshot,
      name_snapshot: item.name_snapshot,
    })),
    payments: tx.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount,
    })),
    taxes: (tx.taxes ?? [])
      .map((tax) => ({
        tax_rate_id: tax.tax_rate_id,
        amount: tax.amount,
      }))
      .sort((a, b) => a.tax_rate_id - b.tax_rate_id),
  });
}

function canonicalizeTransactionForLegacyHash(tx: TransactionPush): string {
  return JSON.stringify({
    client_tx_id: tx.client_tx_id,
    company_id: tx.company_id,
    outlet_id: tx.outlet_id,
    cashier_user_id: tx.cashier_user_id,
    status: tx.status,
    trx_at: tx.trx_at,
    items: tx.items.map((item) => ({
      item_id: item.item_id,
      ...(item.variant_id != null ? { variant_id: item.variant_id } : {}),
      qty: item.qty,
      price_snapshot: item.price_snapshot,
      name_snapshot: item.name_snapshot,
    })),
    payments: tx.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount,
    })),
  });
}

function listLegacyEquivalentTrxAtVariants(trxAt: string): string[] {
  const variants = new Set<string>();
  const trimmed = trxAt.trim();
  if (trimmed.length === 0) {
    return [];
  }

  variants.add(trimmed);

  const noMillisIsoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})$/);
  if (noMillisIsoMatch) {
    variants.add(`${noMillisIsoMatch[1]}.000${noMillisIsoMatch[2]}`);
  }

  const zeroMillisIsoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.000(Z|[+-]\d{2}:\d{2})$/);
  if (zeroMillisIsoMatch) {
    variants.add(`${zeroMillisIsoMatch[1]}${zeroMillisIsoMatch[2]}`);
  }

  return Array.from(variants);
}

function computePayloadSha256(canonicalPayload: string): string {
  return createHash("sha256").update(canonicalPayload).digest("hex");
}

// ============================================================================
// Transaction Processing
// ============================================================================

/**
 * Process a single transaction
 */
async function processTransaction(
  db: KyselySchema,
  tx: TransactionPush,
  companyId: number,
  outletId: number,
  correlationId: string,
  metricsCollector?: SyncIdempotencyMetricsCollector
): Promise<SyncPushResultItem> {
  const startedAtMs = Date.now();

  try {
    // Validation: company_id must match
    if (tx.company_id !== companyId) {
      return {
        client_tx_id: tx.client_tx_id,
        result: "ERROR",
        message: "company_id mismatch",
      };
    }

    // Validation: outlet_id must match
    if (tx.outlet_id !== outletId) {
      return {
        client_tx_id: tx.client_tx_id,
        result: "ERROR",
        message: "outlet_id mismatch",
      };
    }

    // Validation: DINE_IN requires table_id
    if ((tx.service_type ?? "TAKEAWAY") === "DINE_IN" && !tx.table_id) {
      return {
        client_tx_id: tx.client_tx_id,
        result: "ERROR",
        message: "DINE_IN requires table_id",
      };
    }

    const payloadSha256 = computePayloadSha256(canonicalizeTransactionForHash(tx));
    const legacyHashVariants = listLegacyEquivalentTrxAtVariants(tx.trx_at).map((trxAtVariant) =>
      computePayloadSha256(canonicalizeTransactionForLegacyHash({ ...tx, trx_at: trxAtVariant }))
    );

    // Check for existing transaction (idempotency)
    const existingRecord = await readPosTransactionByClientTxId(db, tx.client_tx_id, tx.company_id);
    if (existingRecord) {
      const idempotencyResult = syncIdempotencyService.determineReplayOutcome(
        {
          pos_transaction_id: existingRecord.id,
          payload_sha256: existingRecord.payload_sha256,
          payload_hash_version: existingRecord.payload_hash_version,
          status: tx.status as "COMPLETED" | "VOID" | "REFUND",
          trx_at: tx.trx_at,
        },
        payloadSha256,
        existingRecord.payload_sha256,
        existingRecord.payload_hash_version,
        legacyHashVariants
      );

      if (idempotencyResult.outcome === "RETURN_CACHED") {
        return { client_tx_id: tx.client_tx_id, result: "DUPLICATE" };
      } else {
        return { client_tx_id: tx.client_tx_id, result: "ERROR", message: "IDEMPOTENCY_CONFLICT" };
      }
    }

    // Verify cashier belongs to company
    const cashierValid = await isCashierInCompany(db, tx.cashier_user_id, tx.company_id);
    if (!cashierValid) {
      return {
        client_tx_id: tx.client_tx_id,
        result: "ERROR",
        message: "cashier_user_id mismatch",
      };
    }

    // Canonical timestamps
    const trxAtCanonical = toMysqlDateTimeStrict(tx.trx_at);
    const openedAtCanonical = tx.opened_at ? toMysqlDateTimeStrict(tx.opened_at) : trxAtCanonical;
    const closedAtCanonical = tx.closed_at ? toMysqlDateTimeStrict(tx.closed_at) : trxAtCanonical;

    // Insert transaction header
    const txInput: PosTransactionInsertInput = {
      client_tx_id: tx.client_tx_id,
      company_id: tx.company_id,
      outlet_id: tx.outlet_id,
      cashier_user_id: tx.cashier_user_id,
      status: tx.status,
      service_type: tx.service_type ?? "TAKEAWAY",
      table_id: tx.table_id ?? null,
      reservation_id: tx.reservation_id ?? null,
      guest_count: tx.guest_count ?? null,
      order_status: tx.order_status ?? "COMPLETED",
      opened_at: openedAtCanonical,
      closed_at: closedAtCanonical,
      notes: tx.notes ?? null,
      trx_at: trxAtCanonical,
      discount_percent: tx.discount_percent ?? 0,
      discount_fixed: tx.discount_fixed ?? 0,
      discount_code: tx.discount_code ?? null,
      payload_sha256: payloadSha256,
      payload_hash_version: PAYLOAD_HASH_VERSION_CANONICAL_TRX_AT,
    };

    const posTransactionId = await insertPosTransaction(db, txInput);

    // Insert transaction items
    for (let i = 0; i < tx.items.length; i++) {
      const item = tx.items[i];
      const itemInput: PosTransactionItemInsertInput = {
        pos_transaction_id: posTransactionId,
        company_id: tx.company_id,
        outlet_id: tx.outlet_id,
        line_no: i + 1,
        item_id: item.item_id,
        variant_id: item.variant_id ?? null,
        qty: item.qty,
        price_snapshot: item.price_snapshot,
        name_snapshot: item.name_snapshot,
      };
      await insertPosTransactionItem(db, itemInput);
    }

    // Insert transaction payments
    for (let i = 0; i < tx.payments.length; i++) {
      const payment = tx.payments[i];
      const paymentInput: PosTransactionPaymentInsertInput = {
        pos_transaction_id: posTransactionId,
        company_id: tx.company_id,
        outlet_id: tx.outlet_id,
        payment_no: i + 1,
        method: payment.method,
        amount: payment.amount,
      };
      await insertPosTransactionPayment(db, paymentInput);
    }

    // Insert taxes (STUB: using provided taxes directly, no calculation)
    if (tx.taxes && tx.taxes.length > 0) {
      for (const tax of tx.taxes) {
        const taxInput: PosTransactionTaxInsertInput = {
          pos_transaction_id: posTransactionId,
          company_id: tx.company_id,
          outlet_id: tx.outlet_id,
          tax_rate_id: tax.tax_rate_id,
          amount: tax.amount,
        };
        await insertPosTransactionTax(db, taxInput);
      }
    }

    // Phase 2: Stock deduction + COGS + posting hook (after persist transaction)
    // Only for COMPLETED transactions
    if (tx.status === "COMPLETED") {
      // Idempotency check: skip if already deducted (on retry)
      const existingDeduction = await sql`
        SELECT id FROM inventory_transactions
        WHERE company_id = ${tx.company_id}
          AND outlet_id = ${tx.outlet_id}
          AND reference_type = 'SALE'
          AND reference_id = ${tx.client_tx_id}
          AND quantity_delta < 0
        LIMIT 1
      `.execute(db);

      let stockResults = null;
      if (existingDeduction.rows.length === 0) {
        // Deduct stock via modules-inventory
        const stockItems = tx.items
          .filter(item => item.qty > 0)
          .map(item => ({
            variantId: item.variant_id,
            itemId: item.item_id,
            quantity: item.qty,
            trackStock: true
          }));

        if (stockItems.length > 0) {
          stockResults = await getStockService(db).resolveAndDeductForPosTransaction({
            companyId: tx.company_id,
            outletId: tx.outlet_id,
            posTransactionId: String(posTransactionId),
            items: stockItems,
            referenceId: tx.client_tx_id,
            userId: tx.cashier_user_id
          }, db);

          // Post COGS via modules-accounting
          if (stockResults && stockResults.length > 0) {
            const cogsItems = stockResults.map((r: { itemId: number; quantity: number; unitCost: number; totalCost: number }) => ({
              itemId: r.itemId,
              quantity: r.quantity,
              unitCost: r.unitCost,
              totalCost: r.totalCost
            }));
            const deductionCosts: StockCostEntry[] = stockResults.map((r: { stockTxId: number; itemId: number; quantity: number; unitCost: number; totalCost: number }) => ({
              stockTxId: r.stockTxId,
              itemId: r.itemId,
              quantity: r.quantity,
              unitCost: r.unitCost,
              totalCost: r.totalCost
            }));
            await postCogsForSale({
              saleId: String(posTransactionId),
              companyId: tx.company_id,
              outletId: tx.outlet_id,
              items: cogsItems,
              deductionCosts,
              saleDate: new Date(tx.trx_at),
              postedBy: tx.cashier_user_id
            }, db);
          }
        }
      }

      // STUB: Posting hook - requires KyselyPosSyncPushPostingExecutor from API layer
      // This will be implemented in story 27.6
      // await runSyncPushPostingHook(...);
    }

    // Record success metric
    if (metricsCollector) {
      const operationResult: SyncOperationResult = {
        client_tx_id: tx.client_tx_id,
        result: "OK",
        latency_ms: Math.max(0, Date.now() - startedAtMs),
        is_retry: false,
      };
      metricsCollector.recordResults([operationResult]);
    }

    console.info("pos_sync_push_transaction_processed", {
      correlation_id: correlationId,
      client_tx_id: tx.client_tx_id,
      pos_transaction_id: posTransactionId,
    });

    return { client_tx_id: tx.client_tx_id, result: "OK", posTransactionId };
  } catch (error) {
    console.error("pos_sync_push_transaction_failed", {
      correlation_id: correlationId,
      client_tx_id: tx.client_tx_id,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      client_tx_id: tx.client_tx_id,
      result: "ERROR",
      message: error instanceof Error ? error.message : "Processing failed",
    };
  }
}

/**
 * Batch check transactions for duplicates and return new ones
 */
async function filterNewTransactions(
  db: KyselySchema,
  transactions: TransactionPush[],
  companyId: number,
  outletId: number
): Promise<{ newTransactions: TransactionPush[]; duplicateResults: SyncPushResultItem[] }> {
  if (transactions.length === 0) {
    return { newTransactions: [], duplicateResults: [] };
  }

  const clientTxIds = transactions.map((tx) => tx.client_tx_id);
  const existingRecords = await batchReadPosTransactionsByClientTxIds(db, clientTxIds, companyId);

  const newTransactions: TransactionPush[] = [];
  const duplicateResults: SyncPushResultItem[] = [];
  const seenClientTxIds = new Set<string>();

  for (const tx of transactions) {
    // Check for duplicate within current batch first
    if (seenClientTxIds.has(tx.client_tx_id)) {
      duplicateResults.push({ client_tx_id: tx.client_tx_id, result: "DUPLICATE" });
      continue; // Skip - don't add to newTransactions
    }

    const existing = existingRecords.get(tx.client_tx_id);
    if (!existing) {
      // Mark as seen BEFORE adding to newTransactions
      // This ensures the second occurrence is detected as duplicate within the batch
      seenClientTxIds.add(tx.client_tx_id);
      newTransactions.push(tx);
    } else {
      // Check if it's a true duplicate or a conflict
      const payloadSha256 = computePayloadSha256(canonicalizeTransactionForHash(tx));
      const legacyHashVariants = listLegacyEquivalentTrxAtVariants(tx.trx_at).map((trxAtVariant) =>
        computePayloadSha256(canonicalizeTransactionForLegacyHash({ ...tx, trx_at: trxAtVariant }))
      );

      const idempotencyResult = syncIdempotencyService.determineReplayOutcome(
        {
          pos_transaction_id: existing.id,
          payload_sha256: existing.payload_sha256,
          payload_hash_version: existing.payload_hash_version,
          status: tx.status as "COMPLETED" | "VOID" | "REFUND",
          trx_at: tx.trx_at,
        },
        payloadSha256,
        existing.payload_sha256,
        existing.payload_hash_version,
        legacyHashVariants
      );

      if (idempotencyResult.outcome === "RETURN_CACHED") {
        duplicateResults.push({ client_tx_id: tx.client_tx_id, result: "DUPLICATE" });
      } else {
        duplicateResults.push({ client_tx_id: tx.client_tx_id, result: "ERROR", message: "IDEMPOTENCY_CONFLICT" });
      }
    }
  }

  return { newTransactions, duplicateResults };
}

// ============================================================================
// Order Processing
// ============================================================================

/**
 * Process active orders
 */
async function processActiveOrders(
  db: KyselySchema,
  orders: ActiveOrderPush[],
  correlationId: string
): Promise<OrderUpdateResult[]> {
  if (!orders || orders.length === 0) {
    return [];
  }

  console.info("pos_sync_push_processing_active_orders", {
    correlation_id: correlationId,
    count: orders.length,
  });

  const results: OrderUpdateResult[] = [];

  for (const order of orders) {
    try {
      const openedAtMysql = toMysqlDateTimeStrict(order.opened_at, "opened_at");
      const openedAtTs = toTimestampMs(order.opened_at, "opened_at");
      const closedAtMysql = order.closed_at ? toMysqlDateTimeStrict(order.closed_at, "closed_at") : null;
      const closedAtTs = order.closed_at ? toTimestampMs(order.closed_at, "closed_at") : null;
      const updatedAtMysql = toMysqlDateTimeStrict(order.updated_at, "updated_at");
      const updatedAtTs = toTimestampMs(order.updated_at, "updated_at");

      // Upsert order snapshot
      await upsertOrderSnapshot(db, {
        order_id: order.order_id,
        company_id: order.company_id,
        outlet_id: order.outlet_id,
        service_type: order.service_type,
        source_flow: order.source_flow ?? null,
        settlement_flow: order.settlement_flow ?? null,
        table_id: order.table_id ?? null,
        reservation_id: order.reservation_id ?? null,
        guest_count: order.guest_count ?? null,
        is_finalized: order.is_finalized ? 1 : 0,
        order_status: order.order_status,
        order_state: order.order_state,
        paid_amount: order.paid_amount,
        opened_at: openedAtMysql,
        opened_at_ts: openedAtTs,
        closed_at: closedAtMysql,
        closed_at_ts: closedAtTs,
        notes: order.notes ?? null,
        updated_at: updatedAtMysql,
        updated_at_ts: updatedAtTs,
      });

      // Delete existing lines and re-insert
      await deleteOrderSnapshotLines(db, order.order_id);

      for (const line of order.lines) {
        const lineUpdatedAtMysql = toMysqlDateTimeStrict(line.updated_at, "updated_at");
        const lineUpdatedAtTs = toTimestampMs(line.updated_at, "updated_at");

        await insertOrderSnapshotLine(db, {
          order_id: order.order_id,
          company_id: order.company_id,
          outlet_id: order.outlet_id,
          item_id: line.item_id,
          variant_id: line.variant_id ?? null,
          qty: line.qty,
          unit_price_snapshot: line.unit_price_snapshot,
          discount_amount: line.discount_amount,
          name_snapshot: line.name_snapshot,
          item_type_snapshot: line.item_type_snapshot,
          sku_snapshot: line.sku_snapshot ?? null,
          updated_at: lineUpdatedAtMysql,
          updated_at_ts: lineUpdatedAtTs,
        });
      }

      results.push({ update_id: order.order_id, result: "OK" });
    } catch (error) {
      console.error("pos_sync_push_active_order_failed", {
        correlation_id: correlationId,
        order_id: order.order_id,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({
        update_id: order.order_id,
        result: "ERROR",
        message: error instanceof Error ? error.message : "Failed to process order",
      });
    }
  }

  return results;
}

/**
 * Process order updates
 */
async function processOrderUpdates(
  db: KyselySchema,
  updates: OrderUpdatePush[],
  correlationId: string
): Promise<OrderUpdateResult[]> {
  if (!updates || updates.length === 0) {
    return [];
  }

  console.info("pos_sync_push_processing_order_updates", {
    correlation_id: correlationId,
    count: updates.length,
  });

  const results: OrderUpdateResult[] = [];

  for (const update of updates) {
    try {
      // Check if update already exists (idempotency)
      const exists = await checkOrderUpdateExists(db, update.update_id, update.company_id);
      if (exists) {
        results.push({ update_id: update.update_id, result: "DUPLICATE" });
        continue;
      }

      const eventAtMysql = toMysqlDateTimeStrict(update.event_at, "event_at");
      const eventAtTs = toTimestampMs(update.event_at, "event_at");
      const baseOrderUpdatedAtMysql = update.base_order_updated_at
        ? toMysqlDateTimeStrict(update.base_order_updated_at, "base_order_updated_at")
        : null;
      const baseOrderUpdatedAtTs = update.base_order_updated_at
        ? toTimestampMs(update.base_order_updated_at, "base_order_updated_at")
        : null;

      await insertOrderUpdate(db, {
        update_id: update.update_id,
        order_id: update.order_id,
        company_id: update.company_id,
        outlet_id: update.outlet_id,
        base_order_updated_at: baseOrderUpdatedAtMysql,
        base_order_updated_at_ts: baseOrderUpdatedAtTs,
        event_type: update.event_type,
        delta_json: update.delta_json,
        actor_user_id: update.actor_user_id ?? null,
        device_id: update.device_id,
        event_at: eventAtMysql,
        event_at_ts: eventAtTs,
      });

      results.push({ update_id: update.update_id, result: "OK" });
    } catch (error) {
      console.error("pos_sync_push_order_update_failed", {
        correlation_id: correlationId,
        update_id: update.update_id,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({
        update_id: update.update_id,
        result: "ERROR",
        message: error instanceof Error ? error.message : "Failed to process order update",
      });
    }
  }

  return results;
}

// ============================================================================
// Item Cancellation Processing
// ============================================================================

/**
 * Process item cancellations
 */
async function processItemCancellations(
  db: KyselySchema,
  cancellations: ItemCancellationPush[],
  correlationId: string
): Promise<ItemCancellationResult[]> {
  if (!cancellations || cancellations.length === 0) {
    return [];
  }

  console.info("pos_sync_push_processing_item_cancellations", {
    correlation_id: correlationId,
    count: cancellations.length,
  });

  const results: ItemCancellationResult[] = [];

  for (const cancellation of cancellations) {
    try {
      // Check if cancellation already exists (idempotency)
      const exists = await checkItemCancellationExists(db, cancellation.cancellation_id, cancellation.company_id);
      if (exists) {
        results.push({ cancellation_id: cancellation.cancellation_id, result: "DUPLICATE" });
        continue;
      }

      const cancelledAtMysql = toMysqlDateTimeStrict(cancellation.cancelled_at, "cancelled_at");
      const cancelledAtTs = toTimestampMs(cancellation.cancelled_at, "cancelled_at");

      await insertItemCancellation(db, {
        cancellation_id: cancellation.cancellation_id,
        order_id: cancellation.order_id,
        item_id: cancellation.item_id,
        variant_id: cancellation.variant_id ?? null,
        company_id: cancellation.company_id,
        outlet_id: cancellation.outlet_id,
        cancelled_quantity: cancellation.cancelled_quantity,
        reason: cancellation.reason,
        cancelled_by_user_id: cancellation.cancelled_by_user_id ?? null,
        cancelled_at: cancelledAtMysql,
        cancelled_at_ts: cancelledAtTs,
      });

      results.push({ cancellation_id: cancellation.cancellation_id, result: "OK" });
    } catch (error) {
      console.error("pos_sync_push_item_cancellation_failed", {
        correlation_id: correlationId,
        cancellation_id: cancellation.cancellation_id,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({
        cancellation_id: cancellation.cancellation_id,
        result: "ERROR",
        message: error instanceof Error ? error.message : "Failed to process item cancellation",
      });
    }
  }

  return results;
}

// ============================================================================
// Variant Sale Processing
// ============================================================================

/**
 * Process variant sales
 */
async function processVariantSales(
  db: KyselySchema,
  sales: VariantSalePush[],
  companyId: number,
  outletId: number,
  correlationId: string
): Promise<VariantSaleResult[]> {
  if (!sales || sales.length === 0) {
    return [];
  }

  console.info("pos_sync_push_processing_variant_sales", {
    correlation_id: correlationId,
    count: sales.length,
  });

  const results: VariantSaleResult[] = [];

  for (const sale of sales) {
    try {
      // Validation
      if (sale.company_id !== companyId) {
        results.push({ client_tx_id: sale.client_tx_id, result: "ERROR", message: "company_id mismatch" });
        continue;
      }

      if (sale.outlet_id !== outletId) {
        results.push({ client_tx_id: sale.client_tx_id, result: "ERROR", message: "outlet_id mismatch" });
        continue;
      }

      // Check for duplicate using client_tx_id (idempotency key per unique constraint)
      const existed = await checkVariantSaleExists(
        db,
        sale.company_id,
        sale.outlet_id,
        sale.client_tx_id
      );
      if (existed) {
        results.push({ client_tx_id: sale.client_tx_id, result: "DUPLICATE" });
        continue;
      }

      // STUB: Stock deduction would call sync-core/data query here in production
      // For now, we just insert the record

      // Insert variant sale
      await insertVariantSale(db, {
        company_id: sale.company_id,
        outlet_id: sale.outlet_id,
        variant_id: sale.variant_id,
        item_id: sale.item_id,
        client_tx_id: sale.client_tx_id,
        quantity: sale.qty,
        unit_price: sale.unit_price,
        total_price: sale.total_amount,
        occurred_at: toMysqlDateTimeStrict(sale.trx_at, "trx_at"),
      });

      // STUB: COGS posting - would call API layer in production

      console.info("pos_sync_push_variant_sale_processed", {
        correlation_id: correlationId,
        client_tx_id: sale.client_tx_id,
        variant_id: sale.variant_id,
        qty: sale.qty,
      });

      results.push({ client_tx_id: sale.client_tx_id, result: "OK" });
    } catch (error) {
      // Handle MySQL duplicate key error (errno 1062) on insert.
      // The check-before-insert pattern prevents most duplicates, but a TOCTOU race
      // can still hit the unique constraint when two concurrent requests both pass the
      // check and then one inserts first. Map that to DUPLICATE rather than ERROR.
      if (typeof error === "object" && error !== null && "errno" in error && (error as { errno?: number }).errno === 1062) {
        console.warn("pos_sync_push_variant_sale_duplicate_race", {
          correlation_id: correlationId,
          client_tx_id: sale.client_tx_id,
          variant_id: sale.variant_id,
        });
        results.push({ client_tx_id: sale.client_tx_id, result: "DUPLICATE" });
        continue;
      }

      console.error("pos_sync_push_variant_sale_failed", {
        correlation_id: correlationId,
        client_tx_id: sale.client_tx_id,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({
        client_tx_id: sale.client_tx_id,
        result: "ERROR",
        message: error instanceof Error ? error.message : "Processing failed",
      });
    }
  }

  return results;
}

// ============================================================================
// Variant Stock Adjustment Processing
// ============================================================================

/**
 * Process variant stock adjustments
 */
async function processVariantStockAdjustments(
  db: KyselySchema,
  adjustments: VariantStockAdjustmentPush[],
  companyId: number,
  outletId: number,
  correlationId: string
): Promise<VariantStockAdjustmentResult[]> {
  if (!adjustments || adjustments.length === 0) {
    return [];
  }

  console.info("pos_sync_push_processing_variant_stock_adjustments", {
    correlation_id: correlationId,
    count: adjustments.length,
  });

  const results: VariantStockAdjustmentResult[] = [];

  for (const adjustment of adjustments) {
    try {
      // Validation
      if (adjustment.company_id !== companyId) {
        results.push({ client_tx_id: adjustment.client_tx_id, result: "ERROR", message: "company_id mismatch" });
        continue;
      }

      if (adjustment.outlet_id !== outletId) {
        results.push({ client_tx_id: adjustment.client_tx_id, result: "ERROR", message: "outlet_id mismatch" });
        continue;
      }

      // Validate adjustment_type
      if (!["INCREASE", "DECREASE", "SET"].includes(adjustment.adjustment_type)) {
        results.push({ client_tx_id: adjustment.client_tx_id, result: "ERROR", message: "Invalid adjustment_type" });
        continue;
      }

      // Check for duplicate
      const existed = await checkAdjustmentExists(
        db,
        adjustment.company_id,
        adjustment.outlet_id,
        adjustment.client_tx_id
      );
      if (existed) {
        results.push({ client_tx_id: adjustment.client_tx_id, result: "DUPLICATE" });
        continue;
      }

      // Get current stock
      const currentStock = await getVariantCurrentStock(db, adjustment.company_id, adjustment.outlet_id, adjustment.variant_id);
      if (!currentStock) {
        results.push({ client_tx_id: adjustment.client_tx_id, result: "ERROR", message: "Variant not found" });
        continue;
      }

      // Calculate new stock
      let newStock: number;
      switch (adjustment.adjustment_type) {
        case "INCREASE":
          newStock = currentStock.quantity + adjustment.quantity;
          break;
        case "DECREASE":
          newStock = currentStock.quantity - adjustment.quantity;
          if (newStock < 0) {
            results.push({
              client_tx_id: adjustment.client_tx_id,
              result: "ERROR",
              message: `Insufficient stock: ${currentStock.quantity} < ${adjustment.quantity}`,
            });
            continue;
          }
          break;
        case "SET":
          newStock = adjustment.quantity;
          break;
        default:
          results.push({ client_tx_id: adjustment.client_tx_id, result: "ERROR", message: "Invalid adjustment_type" });
          continue;
      }

      // Insert stock adjustment record
      await insertStockAdjustment(db, {
        company_id: adjustment.company_id,
        outlet_id: adjustment.outlet_id,
        client_tx_id: adjustment.client_tx_id,
        variant_id: adjustment.variant_id,
        adjustment_type: adjustment.adjustment_type,
        quantity: adjustment.quantity,
        previous_stock: currentStock.quantity,
        new_stock: newStock,
        reason: adjustment.reason,
        reference: adjustment.reference ?? null,
        adjusted_at: toMysqlDateTimeStrict(adjustment.adjusted_at, "adjusted_at"),
      });

      console.info("pos_sync_push_variant_stock_adjustment_processed", {
        correlation_id: correlationId,
        client_tx_id: adjustment.client_tx_id,
        variant_id: adjustment.variant_id,
        adjustment_type: adjustment.adjustment_type,
        quantity: adjustment.quantity,
        previous_stock: currentStock.quantity,
        new_stock: newStock,
      });

      results.push({ client_tx_id: adjustment.client_tx_id, result: "OK" });
    } catch (error) {
      console.error("pos_sync_push_variant_stock_adjustment_failed", {
        correlation_id: correlationId,
        client_tx_id: adjustment.client_tx_id,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({
        client_tx_id: adjustment.client_tx_id,
        result: "ERROR",
        message: error instanceof Error ? error.message : "Processing failed",
      });
    }
  }

  return results;
}

// ============================================================================
// Batch Processing
// ============================================================================

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
  transactions: TransactionPush[],
  maxConcurrency: number
): TransactionPush[][] {
  const batches: TransactionPush[][] = [];
  let current: TransactionPush[] = [];
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

    current.push(tx);
    seenClientTxIds.add(tx.client_tx_id);
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

/**
 * Persist a batch of transactions with controlled concurrency.
 * 
 * This function processes transactions in batches with:
 * - Configurable concurrency (default 3, max 5)
 * - Idempotency via client_tx_id
 * - Individual transaction error handling (failures don't fail entire batch)
 * 
 * @param db - Database connection
 * @param transactions - Array of transactions to persist
 * @param companyId - Company ID for tenant isolation
 * @param outletId - Outlet ID for tenant isolation
 * @param correlationId - Correlation ID for logging/tracing
 * @param options - Optional configuration
 * @param options.maxConcurrency - Maximum concurrent transactions (default 3, max 5)
 * @param options.metricsCollector - Optional metrics collector
 * @param options.injectFailureAfterPersist - Test hook: when true, throws after successful persistence
 * @returns Array of results per transaction (one per transaction: OK/DUPLICATE/ERROR)
 */
export async function persistPushBatch(
  db: KyselySchema,
  transactions: TransactionPush[],
  companyId: number,
  outletId: number,
  correlationId: string,
  options?: {
    maxConcurrency?: number;
    metricsCollector?: SyncIdempotencyMetricsCollector;
    /** Test hook: when true, throws after successful persistence to simulate failure between phases */
    injectFailureAfterPersist?: boolean;
  }
): Promise<SyncPushResultItem[]> {
  const maxConcurrency = Math.min(options?.maxConcurrency ?? 3, 5);

  // Handle empty batch
  if (transactions.length === 0) {
    return [];
  }

  // Filter to eligible transactions (company_id + outlet_id match)
  const eligibleTransactions = transactions.filter(
    (tx) => tx.company_id === companyId && tx.outlet_id === outletId
  );

  // Batch check idempotency for all transactions
  const { newTransactions, duplicateResults } = await filterNewTransactions(
    db,
    eligibleTransactions,
    companyId,
    outletId
  );

  // Build batches with controlled concurrency
  const batches = buildTransactionBatches(newTransactions, maxConcurrency);

  // Process batches with controlled concurrency
  const newTransactionResults: SyncPushResultItem[] = [];

  for (const batch of batches) {
    const batchPromises = batch.map((tx) =>
      processTransaction(db, tx, companyId, outletId, correlationId, options?.metricsCollector)
    );
    const batchResults = await Promise.all(batchPromises);
    newTransactionResults.push(...batchResults);
  }

  // Test hook: inject failure after successful persistence
  // This simulates the scenario where Phase 1 succeeds but something fails before Phase 2
  if (options?.injectFailureAfterPersist) {
    throw new Error("SYNC_PUSH_TEST_FAIL_AFTER_PERSIST");
  }

  // Combine duplicate results (already processed) with new transaction results
  // Results are returned in original transaction order
  const allResults: SyncPushResultItem[] = [];

  // Build a map of results by client_tx_id for efficient lookup
  const resultMap = new Map<string, SyncPushResultItem>();
  for (const result of duplicateResults) {
    resultMap.set(result.client_tx_id, result);
  }
  for (const result of newTransactionResults) {
    resultMap.set(result.client_tx_id, result);
  }

  // Track which client_tx_id values we've already returned a result for
  // First occurrence uses the result from resultMap, subsequent occurrences get DUPLICATE
  const returnedClientTxIds = new Set<string>();

  // Return results in same order as input transactions
  for (const tx of transactions) {
    const result = resultMap.get(tx.client_tx_id);
    if (result) {
      if (returnedClientTxIds.has(tx.client_tx_id)) {
        // This is a subsequent occurrence - return DUPLICATE
        allResults.push({ client_tx_id: tx.client_tx_id, result: "DUPLICATE" });
      } else {
        // First occurrence - return the actual result
        allResults.push(result);
        returnedClientTxIds.add(tx.client_tx_id);
      }
    }
    // Note: transactions not matching company_id/outlet_id are not included in results
    // (they are filtered out before processing)
  }

  return allResults;
}

// ============================================================================
// Main Orchestration
// ============================================================================

/**
 * Handle push sync for POS client.
 * 
 * This is the canonical entry point for POS data synchronization (push direction).
 * It orchestrates all push operations using sync-core/data queries.
 * 
 * Business logic stubs (tax calculation, COGS posting, stock cost calculation)
 * are left for the API layer to handle.
 * 
 * @param params - Push sync parameters including db connection and all operation types
 * @returns Combined results from all push operations
 */
export async function handlePushSync(
  params: PushSyncParams
): Promise<PushSyncResult> {
  const {
    db,
    companyId,
    outletId,
    transactions,
    activeOrders,
    orderUpdates,
    itemCancellations,
    variantSales,
    variantStockAdjustments,
    correlationId = `pos-push-${Date.now()}`,
    metricsCollector,
  } = params;

  const startTime = Date.now();

  console.info("pos_sync_push_started", {
    correlation_id: correlationId,
    company_id: companyId,
    outlet_id: outletId,
    transaction_count: transactions.length,
    active_order_count: activeOrders.length,
    order_update_count: orderUpdates.length,
    item_cancellation_count: itemCancellations.length,
    variant_sale_count: variantSales.length,
    variant_stock_adjustment_count: variantStockAdjustments.length,
  });

  // Initialize results
  const results: SyncPushResultItem[] = [];
  const orderUpdateResults: OrderUpdateResult[] = [];
  const itemCancellationResults: ItemCancellationResult[] = [];
  const variantSaleResults: VariantSaleResult[] = [];
  const variantStockAdjustmentResults: VariantStockAdjustmentResult[] = [];

  try {
    // ========================================================================
    // Process Transactions
    // ========================================================================
    if (transactions.length > 0) {
      // Filter to eligible transactions and check for duplicates
      const eligibleTransactions = transactions.filter(
        (tx) => tx.company_id === companyId && tx.outlet_id === outletId
      );

      const { newTransactions, duplicateResults } = await filterNewTransactions(
        db,
        eligibleTransactions,
        companyId,
        outletId
      );

      // Add duplicate results
      results.push(...duplicateResults);

      // Process new transactions sequentially to avoid race conditions
      for (const tx of newTransactions) {
        const result = await processTransaction(db, tx, companyId, outletId, correlationId, metricsCollector);
        results.push(result);
      }
    }

    // ========================================================================
    // Process Active Orders
    // ========================================================================
    if (activeOrders.length > 0) {
      const activeOrderResults = await processActiveOrders(db, activeOrders, correlationId);
      orderUpdateResults.push(...activeOrderResults);
    }

    // ========================================================================
    // Process Order Updates
    // ========================================================================
    if (orderUpdates.length > 0) {
      const updateResults = await processOrderUpdates(db, orderUpdates, correlationId);
      orderUpdateResults.push(...updateResults);
    }

    // ========================================================================
    // Process Item Cancellations
    // ========================================================================
    if (itemCancellations.length > 0) {
      const cancellationResults = await processItemCancellations(db, itemCancellations, correlationId);
      itemCancellationResults.push(...cancellationResults);
    }

    // ========================================================================
    // Process Variant Sales
    // ========================================================================
    if (variantSales.length > 0) {
      const salesResults = await processVariantSales(db, variantSales, companyId, outletId, correlationId);
      variantSaleResults.push(...salesResults);
    }

    // ========================================================================
    // Process Variant Stock Adjustments
    // ========================================================================
    if (variantStockAdjustments.length > 0) {
      const adjustmentResults = await processVariantStockAdjustments(
        db,
        variantStockAdjustments,
        companyId,
        outletId,
        correlationId
      );
      variantStockAdjustmentResults.push(...adjustmentResults);
    }

    // Record sync completion latency
    if (metricsCollector) {
      metricsCollector.recordSyncCompletionLatency(Date.now() - startTime);
    }

    console.info("pos_sync_push_completed", {
      correlation_id: correlationId,
      duration_ms: Date.now() - startTime,
      transaction_results: results.length,
      order_update_results: orderUpdateResults.length,
      item_cancellation_results: itemCancellationResults.length,
      variant_sale_results: variantSaleResults.length,
      variant_stock_adjustment_results: variantStockAdjustmentResults.length,
    });

    return {
      results,
      orderUpdateResults,
      itemCancellationResults,
      ...(variantSaleResults.length > 0 && { variantSaleResults }),
      ...(variantStockAdjustmentResults.length > 0 && { variantStockAdjustmentResults }),
    };
  } catch (error) {
    console.error("pos_sync_push_failed", {
      correlation_id: correlationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Record error metric
    if (metricsCollector) {
      metricsCollector.recordSyncCompletionLatency(Date.now() - startTime);
    }

    throw error;
  }
}

// Re-export types
export type {
  PushSyncParams,
  PushSyncResult,
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
} from "./types.js";
