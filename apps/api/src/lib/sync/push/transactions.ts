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
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { Kysely } from "kysely";
import type { DB } from "@jurnapod/db";
import { newKyselyConnection } from "@jurnapod/db";
import type {
  ProcessTransactionParams,
  SyncPushTransactionPayload,
  SyncPushResultItem,
  SyncPushTaxContext,
  AcceptedSyncPushContext,
  ExistingIdempotencyRecord,
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
import { readExistingIdempotencyRecordByClientTxId } from "./idempotency.js";
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
  SYNC_RESULT_CODES
} from "@jurnapod/sync-core";
import { toEpochMs, toMysqlDateTime, toUtcInstant } from "../../date-helpers.js";

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
  kysely: Kysely<DB>,
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
  dbConnection: PoolConnection,
  companyId: number
): Promise<boolean> {
  const [rows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT cm.enabled, cm.config_json
     FROM company_modules cm
     INNER JOIN modules m ON m.id = cm.module_id
     WHERE cm.company_id = ?
       AND m.code = 'inventory'
     LIMIT 1`,
    [companyId]
  );

  const moduleRow = rows[0];
  if (!moduleRow || Number(moduleRow.enabled) !== 1) {
    return false;
  }

  if (typeof moduleRow.config_json !== "string" || moduleRow.config_json.trim().length === 0) {
    return false;
  }

  try {
    const parsed = JSON.parse(moduleRow.config_json) as unknown;
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
  dbConnection: PoolConnection,
  tx: SyncPushTransactionPayload,
  posTransactionId: number,
  stockResults: StockDeductResult[] | null,
  postingMode: string
): Promise<import("../../../lib/cogs-posting.js").CogsPostingResult | null> {
  if (!stockResults || stockResults.length === 0) {
    return null;
  }

  if (postingMode !== "active") {
    return null;
  }

  const cogsEnabled = await isCogsFeatureEnabled(dbConnection, tx.company_id);
  if (!cogsEnabled) {
    return null;
  }

  const cogsItems = stockResults.map((result) => ({
    itemId: result.itemId,
    quantity: result.quantity,
    unitCost: result.unitCost,
    totalCost: result.totalCost
  }));

  const cogsResult = await postCogsForSale(
    {
      saleId: String(posTransactionId),
      companyId: tx.company_id,
      outletId: tx.outlet_id,
      items: cogsItems,
      saleDate: new Date(tx.trx_at),
      postedBy: tx.cashier_user_id
    },
    dbConnection
  );

  if (!cogsResult.success) {
    throw new Error(`COGS posting failed: ${(cogsResult.errors ?? []).join(", ")}`);
  }

  if (cogsResult.journalBatchId) {
    const inventoryTransactionIds = stockResults.map((r) => r.transactionId);
    await dbConnection.execute(
      `UPDATE inventory_transactions 
       SET journal_batch_id = ? 
       WHERE id IN (${inventoryTransactionIds.map(() => "?").join(", ")})`,
      [cogsResult.journalBatchId, ...inventoryTransactionIds]
    );
  }

  return cogsResult;
}

async function rollbackQuietly(dbConnection: PoolConnection): Promise<void> {
  try {
    await dbConnection.rollback();
  } catch {
    // Ignore rollback errors to preserve root cause handling.
  }
}

// ============================================================================
// Audit Functions (Raw SQL for reliability)
// ============================================================================

async function recordSyncPushDuplicateReplayAudit(
  dbConnection: PoolConnection,
  params: {
    authUserId: number;
    correlationId: string;
    companyId: number;
    outletId: number;
    clientTxId: string;
    posTransactionId: number;
  }
): Promise<void> {
  const metadata = await readAcceptedPostingAuditMetadata(dbConnection, params.companyId, params.outletId, params.clientTxId);
  const fallbackJournalBatchId = await readJournalBatchIdByPosTransactionId(dbConnection, params.posTransactionId);
  const journalBatchId = metadata.journalBatchId ?? fallbackJournalBatchId;

  await dbConnection.execute(
    `INSERT INTO audit_logs (
       company_id,
       outlet_id,
       user_id,
       action,
       result,
       success,
       ip_address,
       payload_json
     ) VALUES (?, ?, ?, ?, 'SUCCESS', 1, NULL, ?)`,
    [
      params.companyId,
      params.outletId,
      params.authUserId,
      SYNC_PUSH_DUPLICATE_AUDIT_ACTION,
      JSON.stringify({
        correlation_id: params.correlationId,
        pos_transaction_id: params.posTransactionId,
        client_tx_id: params.clientTxId,
        posting_mode: metadata.postingMode,
        journal_batch_id: journalBatchId,
        balance_ok: metadata.balanceOk,
        reason: "DUPLICATE_REPLAY"
      })
    ]
  );
}

async function recordSyncPushPostingHookFailure(
  dbConnection: PoolConnection,
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
    await dbConnection.execute(
      `INSERT INTO audit_logs (
         company_id,
         outlet_id,
         user_id,
         action,
         result,
         success,
         ip_address,
         payload_json
       ) VALUES (?, ?, ?, ?, 'FAIL', 0, NULL, ?)`,
      [
        context.companyId,
        context.outletId,
        context.userId,
        SYNC_PUSH_POSTING_HOOK_FAIL_AUDIT_ACTION,
        JSON.stringify({
          correlation_id: context.correlationId,
          pos_transaction_id: context.posTransactionId,
          client_tx_id: context.clientTxId,
          posting_mode: mode,
          journal_batch_id: null,
          balance_ok: false,
          reason: message
        })
      ]
    );
  } catch (auditError) {
    console.error("POST /sync/push posting hook failure audit insert failed", {
      correlation_id: context.correlationId,
      client_tx_id: context.clientTxId,
      error: auditError
    });
  }
}

async function runAcceptedSyncPushHook(
  dbConnection: PoolConnection,
  context: AcceptedSyncPushContext,
  posting: SyncPushPostingHookResult
): Promise<void> {
  await dbConnection.execute(
    `INSERT INTO audit_logs (
       company_id,
       outlet_id,
       user_id,
       action,
       result,
       success,
       ip_address,
       payload_json
     ) VALUES (?, ?, ?, ?, 'SUCCESS', 1, NULL, ?)`,
    [
      context.companyId,
      context.outletId,
      context.userId,
      SYNC_PUSH_ACCEPTED_AUDIT_ACTION,
      JSON.stringify({
        pos_transaction_id: context.posTransactionId,
        client_tx_id: context.clientTxId,
        trx_at: context.trxAt,
        correlation_id: context.correlationId,
        posting_mode: posting.mode,
        journal_batch_id: posting.journalBatchId,
        balance_ok: posting.balanceOk,
        reason: posting.reason
      })
    ]
  );
}

// ============================================================================
// Metadata read functions (Raw SQL)
// ============================================================================

async function readAcceptedPostingAuditMetadata(
  dbConnection: PoolConnection,
  companyId: number,
  outletId: number,
  clientTxId: string
): Promise<{ journalBatchId: string | null; postingMode: string | null; balanceOk: boolean }> {
  const [rows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT payload_json
     FROM audit_logs
     WHERE company_id = ? AND outlet_id = ? AND action = ? AND result = 'SUCCESS'
     ORDER BY id DESC
     LIMIT 1`,
    [companyId, outletId, SYNC_PUSH_ACCEPTED_AUDIT_ACTION]
  );

  if (rows.length === 0) {
    return { journalBatchId: null, postingMode: null, balanceOk: false };
  }

  try {
    const payload = JSON.parse(rows[0].payload_json);
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
  dbConnection: PoolConnection,
  posTransactionId: number
): Promise<string | null> {
  const [rows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT journal_batch_id
     FROM pos_transactions
     WHERE id = ?
     LIMIT 1`,
    [posTransactionId]
  );

  if (rows.length === 0 || !rows[0].journal_batch_id) {
    return null;
  }

  return String(rows[0].journal_batch_id);
}

// ============================================================================
// Main Transaction Processing
// ============================================================================

/**
 * Process a single sync push transaction
 * 
 * @param params - Processing parameters including db pool
 * @returns Result item with client_tx_id, result, and optional message
 */
export async function processSyncPushTransaction(
  params: ProcessTransactionParams
): Promise<SyncPushResultItem> {
  const {
    dbPool,
    tx,
    txIndex,
    inputOutletId,
    authCompanyId,
    authUserId,
    correlationId,
    injectFailureAfterHeaderInsert,
    forcedRetryableErrno,
    taxContext,
    metricsCollector
  } = params;
  const { defaultTaxRates, taxRateById } = taxContext;

  // Each transaction gets its own connection - critical for concurrency safety
  const dbConnection = await dbPool.getConnection();
  // Create Kysely instance bound to this transaction's connection
  const kysely = newKyselyConnection(dbConnection);

  const attempt = txIndex + 1;
  const startedAtMs = Date.now();

  const logTransactionResult = (result: SyncPushResultCode) => {
    console.info("sync_push_transaction_result", {
      correlation_id: correlationId,
      client_tx_id: tx.client_tx_id,
      attempt,
      latency_ms: Math.max(0, Date.now() - startedAtMs),
      result
    });
  };

  try {
    // Validation: company_id must match auth
    if (tx.company_id !== authCompanyId) {
      const operationResult: SyncOperationResult = {
        client_tx_id: tx.client_tx_id,
        result: "ERROR",
        latency_ms: Math.max(0, Date.now() - startedAtMs),
        error_classification: "VALIDATION",
        is_retry: false
      };
      metricsCollector.recordResults([operationResult]);
      
      const result = toErrorResult(tx.client_tx_id, "company_id mismatch");
      logTransactionResult("ERROR");
      return result;
    }

    // Validation: outlet_id must match input
    if (tx.outlet_id !== inputOutletId) {
      const operationResult: SyncOperationResult = {
        client_tx_id: tx.client_tx_id,
        result: "ERROR",
        latency_ms: Math.max(0, Date.now() - startedAtMs),
        error_classification: "VALIDATION",
        is_retry: false
      };
      metricsCollector.recordResults([operationResult]);
      
      const result = toErrorResult(tx.client_tx_id, "outlet_id mismatch");
      logTransactionResult("ERROR");
      return result;
    }

    // Validation: DINE_IN requires table_id
    if ((tx.service_type ?? "TAKEAWAY") === "DINE_IN" && !tx.table_id) {
      const operationResult: SyncOperationResult = {
        client_tx_id: tx.client_tx_id,
        result: "ERROR",
        latency_ms: Math.max(0, Date.now() - startedAtMs),
        error_classification: "VALIDATION",
        is_retry: false
      };
      metricsCollector.recordResults([operationResult]);
      
      const result = toErrorResult(tx.client_tx_id, "DINE_IN requires table_id");
      logTransactionResult("ERROR");
      return result;
    }

    const trxAtCanonical = toMysqlDateTimeStrict(tx.trx_at);
    const openedAtCanonical = tx.opened_at ? toMysqlDateTimeStrict(tx.opened_at) : trxAtCanonical;
    const closedAtCanonical = tx.closed_at ? toMysqlDateTimeStrict(tx.closed_at) : trxAtCanonical;
    const payloadSha256 = computePayloadSha256(canonicalizeTransactionForHash(tx));

    // Compute legacy hash variants to handle trx_at format differences (.000Z vs Z)
    const legacyHashVariants: string[] = [];
    for (const trxAtVariant of listLegacyEquivalentTrxAtVariants(tx.trx_at)) {
      const txWithVariant = { ...tx, trx_at: trxAtVariant };
      legacyHashVariants.push(computePayloadSha256(canonicalizeTransactionForLegacyHash(txWithVariant)));
    }

    let acceptedContextForFailureAudit: AcceptedSyncPushContext | null = null;

    // Check for existing transaction (idempotency) - uses Kysely
    const existingRecord = await readExistingIdempotencyRecordByClientTxId(
      dbConnection,
      tx.company_id,
      tx.outlet_id,
      tx.client_tx_id
    );
    if (existingRecord) {
      const idempotencyResult = syncIdempotencyService.determineReplayOutcome(
        {
          pos_transaction_id: existingRecord.posTransactionId,
          payload_sha256: existingRecord.payloadSha256,
          payload_hash_version: existingRecord.payloadHashVersion,
          status: tx.status,
          trx_at: tx.trx_at
        },
        payloadSha256,
        existingRecord.payloadSha256,
        existingRecord.payloadHashVersion,
        legacyHashVariants
      );

      if (idempotencyResult.outcome === "RETURN_CACHED") {
        const operationResult: SyncOperationResult = {
          client_tx_id: tx.client_tx_id,
          result: "DUPLICATE",
          latency_ms: Math.max(0, Date.now() - startedAtMs),
          error_classification: idempotencyResult.classification,
          is_retry: false
        };
        metricsCollector.recordResults([operationResult]);

        await recordSyncPushDuplicateReplayAudit(dbConnection, {
          authUserId,
          correlationId,
          companyId: tx.company_id,
          outletId: tx.outlet_id,
          clientTxId: tx.client_tx_id,
          posTransactionId: existingRecord.posTransactionId
        });
        logTransactionResult("DUPLICATE");
        return { client_tx_id: tx.client_tx_id, result: "DUPLICATE" };
      } else {
        const operationResult: SyncOperationResult = {
          client_tx_id: tx.client_tx_id,
          result: "ERROR",
          latency_ms: Math.max(0, Date.now() - startedAtMs),
          error_classification: idempotencyResult.classification ?? "CONFLICT",
          is_retry: false
        };
        metricsCollector.recordResults([operationResult]);

        logTransactionResult("ERROR");
        return { client_tx_id: tx.client_tx_id, result: "ERROR", message: "IDEMPOTENCY_CONFLICT" };
      }
    }

    // Verify cashier belongs to company - uses Kysely
    const cashierInCompany = await isCashierInCompany(kysely, tx.company_id, tx.cashier_user_id);
    if (!cashierInCompany) {
      const operationResult: SyncOperationResult = {
        client_tx_id: tx.client_tx_id,
        result: "ERROR",
        latency_ms: Math.max(0, Date.now() - startedAtMs),
        error_classification: "VALIDATION",
        is_retry: false
      };
      metricsCollector.recordResults([operationResult]);
      
      const result = toErrorResult(tx.client_tx_id, CASHIER_USER_ID_MISMATCH_MESSAGE);
      logTransactionResult("ERROR");
      return result;
    }

    try {
      await dbConnection.beginTransaction();

      // Inject test failure if requested
      if (forcedRetryableErrno !== null) {
        throw {
          errno: forcedRetryableErrno
        } satisfies MysqlError;
      }

      // Insert pos_transaction header - raw SQL (dynamic INSERT)
      const [insertResult] = await dbConnection.execute<ResultSetHeader>(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           cashier_user_id,
           client_tx_id,
           status,
           service_type,
           table_id,
           reservation_id,
           guest_count,
           order_status,
           opened_at,
           closed_at,
           notes,
           trx_at,
           discount_percent,
           discount_fixed,
           discount_code,
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tx.company_id,
          tx.outlet_id,
          tx.cashier_user_id,
          tx.client_tx_id,
          tx.status,
          tx.service_type ?? "TAKEAWAY",
          tx.table_id ?? null,
          tx.reservation_id ?? null,
          tx.guest_count ?? null,
          tx.order_status ?? "COMPLETED",
          openedAtCanonical,
          closedAtCanonical,
          tx.notes ?? null,
          trxAtCanonical,
          tx.discount_percent ?? 0,
          tx.discount_fixed ?? 0,
          tx.discount_code ?? null,
          payloadSha256,
          PAYLOAD_HASH_VERSION_CANONICAL_TRX_AT
        ]
      );

      const posTransactionId = Number(insertResult.insertId);

      // Inject test failure after header insert if requested
      if (injectFailureAfterHeaderInsert) {
        throw new Error("SYNC_PUSH_TEST_FAIL_AFTER_HEADER_INSERT");
      }

      // Insert transaction items - raw SQL (dynamic batch INSERT)
      if (tx.items.length > 0) {
        const itemPlaceholders = tx.items.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const itemValues = (tx.items as SyncPushTransactionPayload["items"]).flatMap((item, index) => [
          posTransactionId,
          tx.company_id,
          tx.outlet_id,
          index + 1,
          item.item_id,
          item.variant_id ?? null,
          item.qty,
          item.price_snapshot,
          item.name_snapshot
        ]);

        await dbConnection.execute(
          `INSERT INTO pos_transaction_items (
             pos_transaction_id,
             company_id,
             outlet_id,
             line_no,
             item_id,
             variant_id,
             qty,
             price_snapshot,
             name_snapshot
           ) VALUES ${itemPlaceholders}`,
          itemValues
        );
      }

      // Insert transaction payments - raw SQL (dynamic batch INSERT)
      if (tx.payments.length > 0) {
        const paymentPlaceholders = tx.payments.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
        const paymentValues = (tx.payments as SyncPushTransactionPayload["payments"]).flatMap((payment, index) => [
          posTransactionId,
          tx.company_id,
          tx.outlet_id,
          index + 1,
          payment.method,
          payment.amount
        ]);

        await dbConnection.execute(
          `INSERT INTO pos_transaction_payments (
             pos_transaction_id,
             company_id,
             outlet_id,
             payment_no,
             method,
             amount
           ) VALUES ${paymentPlaceholders}`,
          paymentValues
        );
      }

      // Calculate and insert taxes - raw SQL (dynamic batch INSERT)
      const grossSales = sumGrossSales(tx.items);
      const taxLines = buildTaxLinesForTransaction({
        taxes: tx.taxes,
        grossSales,
        defaultTaxRates,
        taxRateById
      });

      if (taxLines.length > 0) {
        const taxPlaceholders = taxLines.map(() => "(?, ?, ?, ?, ?)").join(", ");
        const taxValues = taxLines.flatMap((tax) => [
          posTransactionId,
          tx.company_id,
          tx.outlet_id,
          tax.tax_rate_id,
          tax.amount
        ]);

        await dbConnection.execute(
          `INSERT INTO pos_transaction_taxes (
             pos_transaction_id,
             company_id,
             outlet_id,
             tax_rate_id,
             amount
           ) VALUES ${taxPlaceholders}`,
          taxValues
        );
      }

      // Deduct stock for COMPLETED transactions - raw SQL (financial-critical)
      let stockDeductResults: StockDeductResult[] | null = null;
      if (tx.status === "COMPLETED") {
        stockDeductResults = await resolveAndDeductStockForTransaction(
          dbConnection,
          tx,
          posTransactionId
        );
      }

      // Post COGS journal entries - raw SQL (financial-critical)
      const postingMode = process.env.SYNC_PUSH_POSTING_MODE ?? "disabled";
      if (stockDeductResults && stockDeductResults.length > 0) {
        await postCogsFromStockResults(
          dbConnection,
          tx,
          posTransactionId,
          stockDeductResults,
          postingMode
        );
      }

      // Release table for DINE_IN - raw SQL
      if ((tx.service_type ?? "TAKEAWAY") === "DINE_IN" && tx.table_id) {
        await dbConnection.execute(
          `UPDATE outlet_tables
           SET status = 'AVAILABLE', status_id = 1, updated_at = CURRENT_TIMESTAMP
           WHERE company_id = ? AND outlet_id = ? AND id = ?`,
          [tx.company_id, tx.outlet_id, tx.table_id]
        );
      }

      // Update reservation if linked - raw SQL
      if (tx.reservation_id) {
        await dbConnection.execute(
          `UPDATE reservations
           SET linked_order_id = ?,
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
           WHERE company_id = ? AND outlet_id = ? AND id = ?`,
          [tx.client_tx_id, tx.company_id, tx.outlet_id, tx.reservation_id]
        );
      }

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
      acceptedContextForFailureAudit = acceptedContext;

      // Run posting hook
      let postingResult: SyncPushPostingHookResult;
      try {
        postingResult = await runSyncPushPostingHook(dbConnection, acceptedContext);
      } catch (postingHookError) {
        if (
          postingHookError instanceof SyncPushPostingHookError
          && postingHookError.mode === "shadow"
        ) {
          await recordSyncPushPostingHookFailure(dbConnection, acceptedContext, postingHookError);
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

      await runAcceptedSyncPushHook(dbConnection, acceptedContext, postingResult);

      await dbConnection.commit();

      // Record successful operation
      const operationResult: SyncOperationResult = {
        client_tx_id: tx.client_tx_id,
        result: "OK",
        latency_ms: Math.max(0, Date.now() - startedAtMs),
        is_retry: false
      };
      metricsCollector.recordResults([operationResult]);

      logTransactionResult("OK");
      return {
        client_tx_id: tx.client_tx_id,
        result: "OK"
      };
    } catch (error) {
      // Handle duplicate key error (race condition)
      if (isClientTxIdDuplicateError(error)) {
        await rollbackQuietly(dbConnection);

        // The conflicting row may not be visible yet (race: original tx not yet committed).
        // Retry with backoff to give the original transaction time to commit.
        let existingRecord: ExistingIdempotencyRecord | null = null;
        for (let retryAttempt = 0; retryAttempt < 10 && !existingRecord; retryAttempt++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          existingRecord = await readExistingIdempotencyRecordByClientTxId(
            dbConnection,
            tx.company_id,
            tx.outlet_id,
            tx.client_tx_id
          );
        }

        if (!existingRecord) {
          // Row exists (caused the unique constraint violation) but is still not readable
          // after retries. The unique constraint guarantees it was the same client_tx_id,
          // so treating this as DUPLICATE is correct and safe.
          const operationResult: SyncOperationResult = {
            client_tx_id: tx.client_tx_id,
            result: "DUPLICATE",
            latency_ms: Math.max(0, Date.now() - startedAtMs),
            is_retry: false
          };
          metricsCollector.recordResults([operationResult]);
          logTransactionResult("DUPLICATE");
          return { client_tx_id: tx.client_tx_id, result: "DUPLICATE" };
        }

        const idempotencyResult = syncIdempotencyService.determineReplayOutcome(
          {
            pos_transaction_id: existingRecord.posTransactionId,
            payload_sha256: existingRecord.payloadSha256,
            payload_hash_version: existingRecord.payloadHashVersion,
            status: tx.status,
            trx_at: tx.trx_at
          },
          payloadSha256,
          existingRecord.payloadSha256,
          existingRecord.payloadHashVersion,
          legacyHashVariants
        );

        if (idempotencyResult.outcome === "RETURN_CACHED") {
          const operationResult: SyncOperationResult = {
            client_tx_id: tx.client_tx_id,
            result: "DUPLICATE",
            latency_ms: Math.max(0, Date.now() - startedAtMs),
            error_classification: idempotencyResult.classification,
            is_retry: false
          };
          metricsCollector.recordResults([operationResult]);

          await recordSyncPushDuplicateReplayAudit(dbConnection, {
            authUserId,
            correlationId,
            companyId: tx.company_id,
            outletId: tx.outlet_id,
            clientTxId: tx.client_tx_id,
            posTransactionId: existingRecord.posTransactionId
          });
          logTransactionResult("DUPLICATE");
          return { client_tx_id: tx.client_tx_id, result: "DUPLICATE" };
        } else {
          const operationResult: SyncOperationResult = {
            client_tx_id: tx.client_tx_id,
            result: "ERROR",
            latency_ms: Math.max(0, Date.now() - startedAtMs),
            error_classification: idempotencyResult.classification ?? "CONFLICT",
            is_retry: false
          };
          metricsCollector.recordResults([operationResult]);

          logTransactionResult("ERROR");
          return { client_tx_id: tx.client_tx_id, result: "ERROR", message: "IDEMPOTENCY_CONFLICT" };
        }
      }

      // Handle retryable DB errors
      if (isRetryableMysqlError(error)) {
        await rollbackQuietly(dbConnection);
        
        const retryGuidance = syncIdempotencyService.classifyError(error);
        const operationResult: SyncOperationResult = {
          client_tx_id: tx.client_tx_id,
          result: "ERROR",
          latency_ms: Math.max(0, Date.now() - startedAtMs),
          error_classification: retryGuidance.classification,
          is_retry: false
        };
        metricsCollector.recordResults([operationResult]);
        
        const result = toErrorResult(tx.client_tx_id, toRetryableDbErrorMessage(error));
        logTransactionResult("ERROR");
        return result;
      }

      // Handle foreign key constraint errors (cashier)
      if (isMysqlError(error) && error.errno === 1452) {
        const sqlMessage = error.sqlMessage ?? "";
        if (sqlMessage.includes("fk_pos_transactions_cashier_user") || sqlMessage.includes("cashier_user_id")) {
          await rollbackQuietly(dbConnection);
          
          const operationResult: SyncOperationResult = {
            client_tx_id: tx.client_tx_id,
            result: "ERROR",
            latency_ms: Math.max(0, Date.now() - startedAtMs),
            error_classification: "VALIDATION",
            is_retry: false
          };
          metricsCollector.recordResults([operationResult]);
          
          const result = toErrorResult(tx.client_tx_id, CASHIER_USER_ID_MISMATCH_MESSAGE);
          logTransactionResult("ERROR");
          return result;
        }
      }

      await rollbackQuietly(dbConnection);

      // Record non-shadow posting hook failure for audit using a fresh connection
      // (original dbConnection was already rolled back and will be released in finally)
      if (
        acceptedContextForFailureAudit
        && error instanceof SyncPushPostingHookError
        && error.mode !== "shadow"
      ) {
        const auditConnection = await dbPool.getConnection();
        try {
          await recordSyncPushPostingHookFailure(auditConnection, acceptedContextForFailureAudit, error);
        } finally {
          auditConnection.release();
        }
      }

      // Classify and record general error
      const errorGuidance = syncIdempotencyService.classifyError(error);
      const operationResult: SyncOperationResult = {
        client_tx_id: tx.client_tx_id,
        result: "ERROR",
        latency_ms: Math.max(0, Date.now() - startedAtMs),
        error_classification: errorGuidance.classification,
        is_retry: false
      };
      metricsCollector.recordResults([operationResult]);

      console.error("POST /sync/push transaction insert failed", {
        correlation_id: correlationId,
        client_tx_id: tx.client_tx_id,
        error
      });
      const result = toErrorResult(tx.client_tx_id, "insert failed");
      logTransactionResult("ERROR");
      return result;
    }
  } finally {
    dbConnection.release();
  }
}

// ============================================================================
// Phase 2: Post-Persistence Business Logic
// ============================================================================

/**
 * Parameters for Phase 2 processing (COGS + stock + table release + reservation update + posting hook)
 */
export type ProcessTransactionPhase2Params = {
  dbConnection: PoolConnection;
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
    dbConnection,
    tx,
    posTransactionId,
    authUserId,
    correlationId,
    taxContext
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
        dbConnection,
        tx,
        posTransactionId
      );
    }

    // Post COGS journal entries
    const postingMode = process.env.SYNC_PUSH_POSTING_MODE ?? "disabled";
    if (stockDeductResults && stockDeductResults.length > 0) {
      await postCogsFromStockResults(
        dbConnection,
        tx,
        posTransactionId,
        stockDeductResults,
        postingMode
      );
    }

    // Release table for DINE_IN
    if ((tx.service_type ?? "TAKEAWAY") === "DINE_IN" && tx.table_id) {
      await dbConnection.execute(
        `UPDATE outlet_tables
         SET status = 'AVAILABLE', status_id = 1, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ? AND outlet_id = ? AND id = ?`,
        [tx.company_id, tx.outlet_id, tx.table_id]
      );
    }

    // Update reservation if linked
    if (tx.reservation_id) {
      await dbConnection.execute(
        `UPDATE reservations
         SET linked_order_id = ?,
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
         WHERE company_id = ? AND outlet_id = ? AND id = ?`,
        [tx.client_tx_id, tx.company_id, tx.outlet_id, tx.reservation_id]
      );
    }

    // Run posting hook
    let postingResult: SyncPushPostingHookResult;
    try {
      postingResult = await runSyncPushPostingHook(
        { execute: dbConnection.execute.bind(dbConnection) },
        acceptedContext
      );
    } catch (postingHookError) {
      if (
        postingHookError instanceof SyncPushPostingHookError
        && postingHookError.mode === "shadow"
      ) {
        await recordSyncPushPostingHookFailure(dbConnection, acceptedContext, postingHookError);
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
      dbConnection,
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
  AcceptedSyncPushContext,
  ExistingIdempotencyRecord
} from "./types.js";
