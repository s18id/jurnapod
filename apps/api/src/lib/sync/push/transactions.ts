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

import { createHash } from "node:crypto";
import { sql } from "kysely";
import type { PoolConnection } from "mysql2/promise";
import type { KyselySchema } from "@jurnapod/db";
import { getDb } from "@/lib/db";
import type {
  ProcessTransactionParams,
  SyncPushTransactionPayload,
  SyncPushResultItem,
  SyncPushTaxContext,
  AcceptedSyncPushContext,
  SyncPushResultCode,
  MysqlError,
  LegacyComparablePayload
} from "./types.js";
import {
  isMysqlError,
  isRetryableMysqlError,
  isClientTxIdDuplicateError,
  readDuplicateKeyName,
  toRetryableDbErrorMessage,
  toErrorResult,
  CASHIER_USER_ID_MISMATCH_MESSAGE,
  PAYLOAD_HASH_VERSION_CANONICAL_TRX_AT
} from "./types.js";
import { resolveAndDeductStockForTransaction } from "./stock.js";
import type { StockDeductResult } from "../../stock.js";
import {
  SyncPushPostingHookError,
  type SyncPushPostingHookResult,
  runSyncPushPostingHook
} from "../../sync-push-posting.js";
import { postCogsForSale } from "../../cogs-posting.js";
import {
  syncIdempotencyService,
  type SyncOperationResult,
  SYNC_RESULT_CODES,
  CogsPostingResult
} from "@jurnapod/sync-core";
import { toEpochMs, toMysqlDateTime, toUtcInstant } from "../../date-helpers.js";
import { ModuleSettings } from "@/lib/settings-modules.js";

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

const POS_SALE_DOC_TYPE = "POS_SALE";
const SYNC_PUSH_ACCEPTED_AUDIT_ACTION = "SYNC_PUSH_ACCEPTED";
const SYNC_PUSH_DUPLICATE_AUDIT_ACTION = "SYNC_PUSH_DUPLICATE";
const SYNC_PUSH_POSTING_HOOK_FAIL_AUDIT_ACTION = "SYNC_PUSH_POSTING_HOOK_FAIL";
const IDEMPOTENCY_CONFLICT_MESSAGE = "IDEMPOTENCY_CONFLICT";
const RETRYABLE_DB_LOCK_TIMEOUT_MESSAGE = "RETRYABLE_DB_LOCK_TIMEOUT";
const RETRYABLE_DB_DEADLOCK_MESSAGE = "RETRYABLE_DB_DEADLOCK";

// ============================================================================
// Helper Functions (Local implementations for lib/sync/push context)
// ============================================================================

function toCanonicalUtcInstant(value: string, fieldName: string): string {
  try {
    return toUtcInstant(value);
  } catch {
    throw new Error(`Invalid ${fieldName}`);
  }
}

function toMysqlDateTimeStrict(value: string, fieldName: string = "datetime"): string {
  try {
    return toMysqlDateTime(value);
  } catch {
    throw new Error(`Invalid ${fieldName}`);
  }
}

function toTimestampMs(value: string, fieldName: string = "datetime"): number {
  return toEpochMs(toCanonicalUtcInstant(value, fieldName));
}

function normalizeMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

type TaxLineInput = {
  tax_rate_id: number;
  amount: number;
};

function sumGrossSales(items: Array<{ qty: number; price_snapshot: number }>): number {
  const total = items.reduce((acc, item) => acc + item.qty * item.price_snapshot, 0);
  return normalizeMoney(total);
}

function buildTaxLinesForTransaction(params: {
  taxes: TaxLineInput[] | undefined;
  grossSales: number;
  defaultTaxRates: import("../../taxes.js").TaxRateRecord[];
  taxRateById: Map<number, import("../../taxes.js").TaxRateRecord>;
}): TaxLineInput[] {
  const { taxes, grossSales, defaultTaxRates, taxRateById } = params;
  if (taxes && taxes.length > 0) {
    const normalized = taxes.map((tax) => ({
      tax_rate_id: Number(tax.tax_rate_id),
      amount: normalizeMoney(Number(tax.amount))
    }));

    for (const tax of normalized) {
      if (!Number.isFinite(tax.tax_rate_id) || tax.tax_rate_id <= 0) {
        throw new Error("INVALID_TAX_RATE_ID");
      }
      if (!Number.isFinite(tax.amount) || tax.amount < 0) {
        throw new Error("INVALID_TAX_AMOUNT");
      }
      if (!taxRateById.has(tax.tax_rate_id)) {
        throw new Error("UNKNOWN_TAX_RATE");
      }
    }

    return normalized.filter((tax) => tax.amount > 0);
  }

  if (defaultTaxRates.length === 0) {
    return [];
  }

  const { calculateTaxLines } = require("../../taxes.js");
  return calculateTaxLines({
    grossAmount: grossSales,
    rates: defaultTaxRates
  }).filter((tax: { tax_rate_id: number; amount: number }) => tax.amount > 0);
}

function canonicalizeTransactionForHash(tx: SyncPushTransactionPayload): string {
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
    opened_at: tx.opened_at ? toMysqlDateTimeStrict(tx.opened_at) : null,
    closed_at: tx.closed_at ? toMysqlDateTimeStrict(tx.closed_at) : null,
    notes: tx.notes ?? null,
    trx_at: normalizeTrxAtForHash(tx.trx_at),
    items: tx.items.map((item) => ({
      item_id: item.item_id,
      variant_id: item.variant_id ?? null,
      qty: item.qty,
      price_snapshot: item.price_snapshot,
      name_snapshot: item.name_snapshot
    })),
    payments: tx.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount
    })),
    taxes: (tx.taxes ?? [])
      .map((tax) => ({
        tax_rate_id: tax.tax_rate_id,
        amount: tax.amount
      }))
      .sort((a, b) => a.tax_rate_id - b.tax_rate_id)
  });
}

function normalizeTrxAtForHash(trxAt: string | number): number {
  if (typeof trxAt === 'number') {
    return trxAt > 1e12 ? trxAt : trxAt * 1000;
  }

  try {
    return toEpochMs(toUtcInstant(trxAt));
  } catch {
    throw new Error(`Invalid trx_at: ${trxAt}`);
  }
}

function canonicalizeTransactionForLegacyHash(tx: SyncPushTransactionPayload): string {
  return JSON.stringify({
    client_tx_id: tx.client_tx_id,
    company_id: tx.company_id,
    outlet_id: tx.outlet_id,
    cashier_user_id: tx.cashier_user_id,
    status: tx.status,
    trx_at: tx.trx_at,
    items: tx.items.map((item) => ({
      item_id: item.item_id,
      // Omit variant_id if null to match legacy hash computation
      ...(item.variant_id != null ? { variant_id: item.variant_id } : {}),
      qty: item.qty,
      price_snapshot: item.price_snapshot,
      name_snapshot: item.name_snapshot
    })),
    payments: tx.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount
    }))
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

  // postCogsForSale expects DbConn (Kysely<DB>) - pass db directly
  // It will use its own connection since we don't pass a specific one
  const cogsResult = await postCogsForSale({
    saleId: String(posTransactionId),
    companyId: tx.company_id,
    outletId: tx.outlet_id,
    items: cogsItems,
    saleDate: new Date(tx.trx_at),
    postedBy: tx.cashier_user_id
  });

  if (!cogsResult.success) {
    throw new Error(`COGS posting failed: ${(cogsResult.errors ?? []).join(", ")}`);
  }

  if (cogsResult.journalBatchId) {
    const inventoryTransactionIds = stockResults.map((r) => r.transactionId);
    const idsPlaceholder = inventoryTransactionIds.map(() => "?").join(", ");
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

async function recordSyncPushDuplicateReplayAudit(
  db: KyselySchema,
  params: {
    authUserId: number;
    correlationId: string;
    companyId: number;
    outletId: number;
    clientTxId: string;
    posTransactionId: number;
  }
): Promise<void> {
  const metadata = await readAcceptedPostingAuditMetadata(db, params.companyId, params.outletId, params.clientTxId);
  const fallbackJournalBatchId = await readJournalBatchIdByPosTransactionId(db, params.posTransactionId);
  const journalBatchId = metadata.journalBatchId ?? fallbackJournalBatchId;

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
      ${params.companyId},
      ${params.outletId},
      ${params.authUserId},
      ${SYNC_PUSH_DUPLICATE_AUDIT_ACTION},
      'SUCCESS',
      1,
      NULL,
      ${JSON.stringify({
        correlation_id: params.correlationId,
        pos_transaction_id: params.posTransactionId,
        client_tx_id: params.clientTxId,
        posting_mode: metadata.postingMode,
        journal_batch_id: journalBatchId,
        balance_ok: metadata.balanceOk,
        reason: "DUPLICATE_REPLAY"
      })}
    )
  `.execute(db);
}

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
// Metadata read functions (Raw SQL)
// ============================================================================

async function readAcceptedPostingAuditMetadata(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  _clientTxId: string
): Promise<{ journalBatchId: string | null; postingMode: string | null; balanceOk: boolean }> {
  const result = await sql<{ payload_json: string | null }>`
    SELECT payload_json
    FROM audit_logs
    WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND action = ${SYNC_PUSH_ACCEPTED_AUDIT_ACTION} AND result = 'SUCCESS'
    ORDER BY id DESC
    LIMIT 1
  `.execute(db);

  const row = result.rows[0];
  if (!row || !row.payload_json) {
    return { journalBatchId: null, postingMode: null, balanceOk: false };
  }

  try {
    const payload = JSON.parse(row.payload_json);
    return {
      journalBatchId: payload.journal_batch_id ?? null,
      postingMode: payload.posting_mode ?? null,
      balanceOk: payload.balance_ok ?? false
    };
  } catch {
    return { journalBatchId: null, postingMode: null, balanceOk: false };
  }
}

async function readJournalBatchIdByPosTransactionId(
  db: KyselySchema,
  posTransactionId: number
): Promise<string | null> {
  const result = await sql<{ journal_batch_id: number | null }>`
    SELECT journal_batch_id
    FROM pos_transactions
    WHERE id = ${posTransactionId}
    LIMIT 1
  `.execute(db);

  const row = result.rows[0];
  if (!row || !row.journal_batch_id) {
    return null;
  }

  return String(row.journal_batch_id);
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
    // Deduct stock for COMPLETED transactions
    let stockDeductResults: StockDeductResult[] | null = null;
    if (tx.status === "COMPLETED") {
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
      postingResult = await runSyncPushPostingHook(db, acceptedContext);
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

// Re-export types
export type {
  ProcessTransactionParams,
  SyncPushTransactionPayload,
  SyncPushResultItem,
  SyncPushTaxContext,
  AcceptedSyncPushContext
} from "./types.js";
