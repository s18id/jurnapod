// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)



/**
 * Sync Push Transaction Processing
 * 
 * This module contains the main transaction processing logic.
 * These functions have zero HTTP knowledge.
 * 
 * Kysely is used for SELECT queries for type safety.
 * Complex operations (batch INSERT, stock deduction, COGS posting) preserve raw SQL.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type {
  SyncPushTransactionPayload,
  SyncPushTaxContext,
  AcceptedSyncPushContext
} from "./types.js";
import { resolveAndDeductStockForTransaction } from "./stock.js";
import type { StockDeductResult } from "../../stock.js";
import {
  SyncPushPostingHookError,
  type SyncPushPostingHookResult,
  runSyncPushPostingHook
} from "@jurnapod/modules-accounting";
import { KyselyPosSyncPushPostingExecutor } from "./posting-executor.js";
import { postCogsForSale } from "@jurnapod/modules-accounting/posting/cogs";
import {
  CogsPostingResult
} from "@jurnapod/sync-core";

// Re-export constants from types
export {
  MYSQL_DUPLICATE_ERROR_CODE,
  MYSQL_LOCK_WAIT_TIMEOUT_ERROR_CODE,
  MYSQL_DEADLOCK_ERROR_CODE,
  CASHIER_USER_ID_MISMATCH_MESSAGE,
  PAYLOAD_HASH_VERSION_CANONICAL_TRX_AT
} from "./types.js";

// Re-export helper functions from types
export {
  isMysqlError,
  isRetryableMysqlError,
  isClientTxIdDuplicateError,
  readDuplicateKeyName,
  toRetryableDbErrorMessage,
  toErrorResult
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const SYNC_PUSH_ACCEPTED_AUDIT_ACTION = "SYNC_PUSH_ACCEPTED";
const SYNC_PUSH_POSTING_HOOK_FAIL_AUDIT_ACTION = "SYNC_PUSH_POSTING_HOOK_FAIL";

// ============================================================================
// Kysely-based SELECT queries
// ============================================================================

/**
 * Check if cashier belongs to company (Kysely)
 */
export async function isCashierInCompany(
  kysely: KyselySchema,
  companyId: number,
  cashierUserId: number
): Promise<boolean> {
  const row = await kysely
    .selectFrom('users')
    .where('id', '=', cashierUserId)
    .where('company_id', '=', companyId)
    .select(['id'])
    .executeTakeFirst();

  return row !== undefined;
}

// ============================================================================
// Audit helper functions
// ============================================================================

async function isCogsFeatureEnabled(
  db: KyselySchema,
  companyId: number
): Promise<boolean> {
  const result = await sql<{ enabled: number; config_json: string | null }>`
    SELECT cm.enabled, cm.config_json
    FROM company_modules cm
    INNER JOIN modules m ON m.id = cm.module_id
    WHERE cm.company_id = ${companyId}
      AND m.code = 'inventory'
    LIMIT 1
  `.execute(db);

  const row = result.rows[0];
  if (!row || Number(row.enabled) !== 1) {
    return false;
  }

  if (typeof row.config_json !== "string" || row.config_json.trim().length === 0) {
    return false;
  }

  try {
    const parsed = JSON.parse(row.config_json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }

    const cogsEnabled = (parsed as Record<string, unknown>).cogs_enabled;
    return cogsEnabled === true || cogsEnabled === 1 || cogsEnabled === "1" || cogsEnabled === "true";
  } catch {
    return false;
  }
}

async function postCogsFromStockResults(
  db: KyselySchema,
  tx: SyncPushTransactionPayload,
  posTransactionId: number,
  stockResults: StockDeductResult[] | null,
  postingMode: string
): Promise<CogsPostingResult | null> {
  if (!stockResults || stockResults.length === 0) {
    return null;
  }

  if (postingMode !== "active") {
    return null;
  }

  const cogsEnabled = await isCogsFeatureEnabled(db, tx.company_id);
  if (!cogsEnabled) {
    return null;
  }

  const cogsItems = stockResults.map((result) => ({
    itemId: result.itemId,
    quantity: result.quantity,
    unitCost: result.unitCost,
    totalCost: result.totalCost
  }));

  const deductionCosts = stockResults.map((result) => ({
    stockTxId: result.transactionId,
    itemId: result.itemId,
    quantity: result.quantity,
    unitCost: result.unitCost,
    totalCost: result.totalCost
  }));

  // postCogsForSale expects DbConn (Kysely<DB>) - pass db directly
  // It will use its own connection since we don't pass a specific one
  const cogsResult = await postCogsForSale({
    saleId: String(posTransactionId),
    companyId: tx.company_id,
    outletId: tx.outlet_id,
    items: cogsItems,
    deductionCosts,
    saleDate: new Date(tx.trx_at),
    postedBy: tx.cashier_user_id
  });

  if (!cogsResult.success) {
    throw new Error(`COGS posting failed: ${(cogsResult.errors ?? []).join(", ")}`);
  }

  if (cogsResult.journalBatchId) {
    const inventoryTransactionIds = stockResults.map((r) => r.transactionId);
    await sql`
      UPDATE inventory_transactions 
      SET journal_batch_id = ${cogsResult.journalBatchId}
      WHERE id IN (${sql.join(inventoryTransactionIds.map(id => sql`${id}`))})
    `.execute(db);
  }

  return cogsResult;
}

// ============================================================================
// Audit Functions (Raw SQL for reliability)
// ============================================================================


async function recordSyncPushPostingHookFailure(
  db: KyselySchema,
  context: AcceptedSyncPushContext,
  error: unknown
): Promise<void> {
  const mode = error instanceof SyncPushPostingHookError ? error.mode : "unknown";
  const message = error instanceof Error ? error.message : "SYNC_PUSH_POSTING_HOOK_FAILED";

  console.error("POST /sync/push posting hook failed", {
    correlation_id: context.correlationId,
    client_tx_id: context.clientTxId,
    mode,
    error
  });

  try {
    await sql`
      INSERT INTO audit_logs (
        company_id,
        outlet_id,
        user_id,
        action,
        result,
        success,
        ip_address,
        payload_json
      ) VALUES (
        ${context.companyId},
        ${context.outletId},
        ${context.userId},
        ${SYNC_PUSH_POSTING_HOOK_FAIL_AUDIT_ACTION},
        'FAIL',
        0,
        NULL,
        ${JSON.stringify({
          correlation_id: context.correlationId,
          pos_transaction_id: context.posTransactionId,
          client_tx_id: context.clientTxId,
          posting_mode: mode,
          journal_batch_id: null,
          balance_ok: false,
          reason: message
        })}
      )
    `.execute(db);
  } catch (auditError) {
    console.error("POST /sync/push posting hook failure audit insert failed", {
      correlation_id: context.correlationId,
      client_tx_id: context.clientTxId,
      error: auditError
    });
  }
}

async function runAcceptedSyncPushHook(
  db: KyselySchema,
  context: AcceptedSyncPushContext,
  posting: SyncPushPostingHookResult
): Promise<void> {
  await sql`
    INSERT INTO audit_logs (
      company_id,
      outlet_id,
      user_id,
      action,
      result,
      success,
      ip_address,
      payload_json
    ) VALUES (
      ${context.companyId},
      ${context.outletId},
      ${context.userId},
      ${SYNC_PUSH_ACCEPTED_AUDIT_ACTION},
      'SUCCESS',
      1,
      NULL,
      ${JSON.stringify({
        pos_transaction_id: context.posTransactionId,
        client_tx_id: context.clientTxId,
        trx_at: context.trxAt,
        correlation_id: context.correlationId,
        posting_mode: posting.mode,
        journal_batch_id: posting.journalBatchId,
        balance_ok: posting.balanceOk,
        reason: posting.reason
      })}
    )
  `.execute(db);
}

// ============================================================================
// Phase 2: Post-Persistence Business Logic
// ============================================================================

/**
 * Parameters for Phase 2 processing (COGS + stock + table release + reservation update + posting hook)
 */
export type ProcessTransactionPhase2Params = {
  db: KyselySchema;
  tx: SyncPushTransactionPayload;
  posTransactionId: number;
  authUserId: number;
  correlationId: string;
  taxContext: SyncPushTaxContext;
};

/**
 * Result from Phase 2 processing.
 * Phase 2 processes COGS posting and stock deduction after successful persistence.
 */
export type ProcessTransactionPhase2Result =
  | { success: true }
  | { success: false; result: "PERSISTED_POSTING_PENDING"; message: string };

/**
 * Process Phase 2 business logic after successful persistence.
 * 
 * This function handles:
 * - Stock deduction for COMPLETED transactions
 * - COGS posting
 * - Table release for DINE_IN
 * - Reservation update
 * - Posting hook
 * 
 * If Phase 2 fails (e.g., COGS/stock), it returns { success: false, result: "PERSISTED_POSTING_PENDING" }
 * instead of throwing, to allow the API layer to return an appropriate result to the client.
 * Phase 1 data is already persisted and should not be rolled back.
 * 
 * @param params - Phase 2 parameters
 */
export async function processSyncPushTransactionPhase2(
  params: ProcessTransactionPhase2Params
): Promise<ProcessTransactionPhase2Result> {
  const {
    db,
    tx,
    posTransactionId,
    authUserId,
    correlationId
  } = params;

  const acceptedContext: AcceptedSyncPushContext = {
    correlationId,
    companyId: tx.company_id,
    outletId: tx.outlet_id,
    userId: authUserId,
    clientTxId: tx.client_tx_id,
    status: tx.status,
    trxAt: tx.trx_at,
    posTransactionId
  };

  try {
    // Idempotency guard: check if SALE deductions already exist for this transaction
    let alreadyStockDeducted = false;
    if (tx.status === "COMPLETED") {
      const existingDeduction = await db
        .selectFrom("inventory_transactions")
        .where("company_id", "=", tx.company_id)
        .where("outlet_id", "=", tx.outlet_id)
        .where("reference_type", "=", "SALE")
        .where("reference_id", "=", tx.client_tx_id)
        .where(sql`quantity_delta`, "<", 0)
        .select(["id"])
        .executeTakeFirst();

      alreadyStockDeducted = existingDeduction !== undefined;
    }

    // Deduct stock for COMPLETED transactions (skip if already deducted on retry)
    let stockDeductResults: StockDeductResult[] | null = null;
    if (tx.status === "COMPLETED" && !alreadyStockDeducted) {
      stockDeductResults = await resolveAndDeductStockForTransaction(
        db,
        tx,
        posTransactionId
      );
    }

    // Post COGS journal entries
    const postingMode = process.env.SYNC_PUSH_POSTING_MODE ?? "disabled";
    if (stockDeductResults && stockDeductResults.length > 0) {
      await postCogsFromStockResults(
        db,
        tx,
        posTransactionId,
        stockDeductResults,
        postingMode
      );
    }

    // Release table for DINE_IN
    if ((tx.service_type ?? "TAKEAWAY") === "DINE_IN" && tx.table_id) {
      await sql`
        UPDATE outlet_tables
        SET status = 'AVAILABLE', status_id = 1, updated_at = CURRENT_TIMESTAMP
        WHERE company_id = ${tx.company_id} AND outlet_id = ${tx.outlet_id} AND id = ${tx.table_id}
      `.execute(db);
    }

    // Update reservation if linked
    if (tx.reservation_id) {
      await sql`
        UPDATE reservations
        SET linked_order_id = ${tx.client_tx_id},
            status = CASE
              WHEN status IN ('CANCELLED', 'NO_SHOW', 'COMPLETED') THEN status
              ELSE 'COMPLETED'
            END,
            status_id = CASE
              WHEN status IN ('CANCELLED', 'NO_SHOW', 'COMPLETED') THEN status_id
              ELSE 6
            END,
            seated_at = COALESCE(seated_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = ${tx.company_id} AND outlet_id = ${tx.outlet_id} AND id = ${tx.reservation_id}
      `.execute(db);
    }

    // Run posting hook
    let postingResult: SyncPushPostingHookResult;
    try {
      const executor = new KyselyPosSyncPushPostingExecutor(db, acceptedContext);
      postingResult = await runSyncPushPostingHook(db, executor, acceptedContext);
    } catch (postingHookError) {
      if (
        postingHookError instanceof SyncPushPostingHookError
        && postingHookError.mode === "shadow"
      ) {
        await recordSyncPushPostingHookFailure(db, acceptedContext, postingHookError);
        postingResult = {
          mode: postingHookError.mode,
          journalBatchId: null,
          balanceOk: false,
          reason: postingHookError.message
        };
      } else {
        throw postingHookError;
      }
    }

    await runAcceptedSyncPushHook(
      db,
      acceptedContext,
      postingResult
    );

    return { success: true };
  } catch (error) {
    // Phase 2 failed but Phase 1 data is already persisted.
    // Return PERSISTED_POSTING_PENDING so the client knows Phase 1 succeeded but Phase 2 needs retry.
    // Do NOT rollback Phase 1 - the data is already committed.
    console.error("Phase 2 processing failed", {
      correlation_id: correlationId,
      client_tx_id: tx.client_tx_id,
      pos_transaction_id: posTransactionId,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      result: "PERSISTED_POSTING_PENDING",
      message: error instanceof Error ? error.message : "Phase 2 failed"
    };
  }
}

// ============================================================================
// Phase 2 Orchestration
// ============================================================================

/**
 * Parameters for Phase 2 orchestration.
 * Orchestration handles iterating Phase 1 results and calling per-transaction Phase 2.
 */
export type OrchestrateSyncPushPhase2Params = {
  db: KyselySchema;
  /** Phase 1 results - only OK results with posTransactionId are processed */
  phase1Results: Array<{
    client_tx_id: string;
    result: "OK" | "DUPLICATE" | "ERROR";
    posTransactionId?: number;
  }>;
  /** Map of client_tx_id to original transaction payload */
  txByClientTxId: Map<string, SyncPushTransactionPayload>;
  authUserId: number;
  correlationId: string;
  taxContext: SyncPushTaxContext;
};

/**
 * Orchestrate Phase 2 processing for all Phase 1 OK results.
 * 
 * This function iterates Phase 1 results and calls the per-transaction
 * Phase 2 function for each OK result. Phase 2 handles:
 * - Stock deduction for COMPLETED transactions
 * - COGS posting
 * - Table release for DINE_IN
 * - Reservation update
 * - Posting hook
 * 
 * Errors in Phase 2 are logged but do not throw - the function continues
 * processing other transactions. Phase 1 data is already committed.
 * 
 * @param params - Orchestration parameters
 */
export async function orchestrateSyncPushPhase2(
  params: OrchestrateSyncPushPhase2Params
): Promise<void> {
  const {
    db,
    phase1Results,
    txByClientTxId,
    authUserId,
    correlationId,
    taxContext
  } = params;

  // Process OK results from Phase 1
  const okResults = phase1Results.filter((r) => r.result === "OK" && r.posTransactionId !== undefined);
  
  for (const result of okResults) {
    const originalTx = txByClientTxId.get(result.client_tx_id);
    if (!originalTx) {
      console.warn("Phase 2: Original transaction not found", {
        correlation_id: correlationId,
        client_tx_id: result.client_tx_id
      });
      continue;
    }

    try {
      await processSyncPushTransactionPhase2({
        db: db,
        tx: originalTx,
        posTransactionId: result.posTransactionId!,
        authUserId: authUserId,
        correlationId,
        taxContext
      });
    } catch (phase2Error) {
      // Phase 2 failed but Phase 1 data is already committed
      // Log the error but don't fail the entire request
      console.error("Phase 2 processing failed for transaction", {
        correlation_id: correlationId,
        client_tx_id: result.client_tx_id,
        pos_transaction_id: result.posTransactionId,
        error: phase2Error instanceof Error ? phase2Error.message : String(phase2Error)
      });
    }
  }
}

// Re-export types
export type {
  ProcessTransactionParams,
  SyncPushTransactionPayload,
  SyncPushResultItem,
  SyncPushTaxContext,
  AcceptedSyncPushContext
} from "./types.js";
