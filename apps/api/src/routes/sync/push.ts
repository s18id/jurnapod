// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Routes
 *
 * POST /sync/push - Push transactions to server
 *
 * Handles batch transaction processing from POS devices with:
 * - Deduplication via client_tx_id
 * - Stock deduction
 * - COGS posting
 * - Tax calculation
 * - Audit logging
 * - Idempotency handling
 */

import { Hono } from "hono";
import { z } from "zod";
import { createHash } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import {
  NumericIdSchema,
  PosOrderServiceTypeSchema,
  PosOrderStatusSchema,
  PosSourceFlowSchema,
  PosSettlementFlowSchema,
  SyncPushPayloadSchema,
  SyncPushRequestSchema,
  SyncPushResultItemSchema,
  type SyncPushRequest,
  type SyncPushResultItem,
  UUID
} from "@jurnapod/shared";
import { authenticateRequest, requireAccess, type AuthContext } from "../../lib/auth-guard.js";
import { getRequestCorrelationId } from "../../lib/correlation-id.js";
import { getDbPool } from "../../lib/db.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import {
  calculateTaxLines,
  listCompanyDefaultTaxRates,
  listCompanyTaxRates,
  type TaxRateRecord
} from "../../lib/taxes.js";
import {
  SyncPushPostingHookError,
  type SyncPushPostingHookResult,
  runSyncPushPostingHook
} from "../../lib/sync-push-posting.js";
import { SyncAuditService, type AuditDbClient } from "@jurnapod/modules-platform/sync";
import { deductStockWithCost, type StockDeductResult } from "../../services/stock.js";
import { postCogsForSale, type CogsPostingResult } from "../../lib/cogs-posting.js";
import {
  syncIdempotencyService,
  SyncIdempotencyMetricsCollector,
  type IdempotencyCheckResult,
  type SyncOperationResult,
  type ErrorClassification,
  SYNC_RESULT_CODES
} from "@jurnapod/sync-core";
import { getAppEnv } from "../../lib/env.js";

// Extend Hono context with auth
declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// ============================================================================
// Constants
// ============================================================================

const MYSQL_DUPLICATE_ERROR_CODE = 1062;
const MYSQL_LOCK_WAIT_TIMEOUT_ERROR_CODE = 1205;
const MYSQL_DEADLOCK_ERROR_CODE = 1213;
const POS_TRANSACTIONS_CLIENT_TX_UNIQUE_KEY = "uq_pos_transactions_client_tx_id";
const POS_SALE_DOC_TYPE = "POS_SALE";
const SYNC_PUSH_ACCEPTED_AUDIT_ACTION = "SYNC_PUSH_ACCEPTED";
const SYNC_PUSH_DUPLICATE_AUDIT_ACTION = "SYNC_PUSH_DUPLICATE";
const SYNC_PUSH_POSTING_HOOK_FAIL_AUDIT_ACTION = "SYNC_PUSH_POSTING_HOOK_FAIL";
const IDEMPOTENCY_CONFLICT_MESSAGE = "IDEMPOTENCY_CONFLICT";
const RETRYABLE_DB_LOCK_TIMEOUT_MESSAGE = "RETRYABLE_DB_LOCK_TIMEOUT";
const RETRYABLE_DB_DEADLOCK_MESSAGE = "RETRYABLE_DB_DEADLOCK";
const CASHIER_USER_ID_MISMATCH_MESSAGE = "cashier_user_id mismatch";
const TEST_FAIL_AFTER_HEADER_INSERT_HEADER = "x-jp-sync-push-fail-after-header";
const TEST_FORCE_DB_ERRNO_HEADER = "x-jp-sync-push-force-db-errno";
const SYNC_PUSH_TEST_HOOKS_ENV = "JP_SYNC_PUSH_TEST_HOOKS";
const SYNC_PUSH_CONCURRENCY_ENV = "JP_SYNC_PUSH_CONCURRENCY";
const DEFAULT_SYNC_PUSH_CONCURRENCY = 3;
const MAX_SYNC_PUSH_CONCURRENCY = 5;
const PAYLOAD_HASH_VERSION_CANONICAL_TRX_AT = 2;

type MysqlError = {
  errno?: number;
  code?: string;
  message?: string;
  sqlMessage?: string;
};

type SyncPushResultCode = "OK" | "DUPLICATE" | "ERROR";

type IdempotencyReplayOutcome =
  | { client_tx_id: string; result: "DUPLICATE" }
  | { client_tx_id: string; result: "ERROR"; message: string };

type SyncPushTaxContext = {
  defaultTaxRates: TaxRateRecord[];
  taxRateById: Map<number, TaxRateRecord>;
};

type ProcessTransactionParams = {
  dbPool: ReturnType<typeof getDbPool>;
  tx: SyncPushTransactionPayload;
  txIndex: number;
  inputOutletId: number;
  authCompanyId: number;
  authUserId: number;
  correlationId: string;
  injectFailureAfterHeaderInsert: boolean;
  forcedRetryableErrno: number | null;
  taxContext: SyncPushTaxContext;
  metricsCollector: SyncIdempotencyMetricsCollector;
};

type AcceptedSyncPushContext = {
  correlationId: string;
  companyId: number;
  outletId: number;
  userId: number;
  clientTxId: string;
  status: "COMPLETED" | "VOID" | "REFUND";
  trxAt: string;
  posTransactionId: number;
};

type SyncPushTransactionPayload = {
  client_tx_id: string;
  company_id: number;
  outlet_id: number;
  cashier_user_id: number;
  status: "COMPLETED" | "VOID" | "REFUND";
  service_type?: "TAKEAWAY" | "DINE_IN";
  table_id?: number | null;
  reservation_id?: number | null;
  guest_count?: number | null;
  order_status?: "OPEN" | "READY_TO_PAY" | "COMPLETED" | "CANCELLED";
  opened_at?: string;
  closed_at?: string | null;
  notes?: string | null;
  trx_at: string;
  items: Array<{
    item_id: number;
    variant_id?: number;
    qty: number;
    price_snapshot: number;
    name_snapshot: string;
  }>;
  payments: Array<{
    method: string;
    amount: number;
  }>;
  taxes?: Array<{
    tax_rate_id: number;
    amount: number;
  }>;
  discount_percent?: number;
  discount_fixed?: number;
  discount_code?: string | null;
};

type ExistingIdempotencyRecord = {
  posTransactionId: number;
  payloadSha256: string | null;
  payloadHashVersion: number | null;
};

type LegacyComparablePayload = {
  client_tx_id: string;
  company_id: number;
  outlet_id: number;
  status: "COMPLETED" | "VOID" | "REFUND";
  trx_at: string;
  items: Array<{
    item_id: number;
    variant_id?: number;
    qty: number;
    price_snapshot: number;
    name_snapshot: string;
  }>;
  payments: Array<{
    method: string;
    amount: number;
  }>;
};

type QueryExecutor = {
  execute: PoolConnection["execute"];
};

// ============================================================================
// Helper Functions
// ============================================================================

function createSyncAuditService(dbPool: ReturnType<typeof getDbPool>): SyncAuditService {
  const client: AuditDbClient = {
    query: async <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> => {
      const [rows] = await dbPool.query(sql, params as (string | number | Date | null)[]);
      return rows as T[];
    },
    execute: async (sql: string, params?: unknown[]) => {
      const [result] = await dbPool.execute(sql, params as (string | number | Date | null)[]);
      return {
        affectedRows: (result as { affectedRows: number }).affectedRows,
        insertId: (result as { insertId?: number }).insertId,
      };
    },
    getConnection: async () => {
      const conn = await dbPool.getConnection();
      return {
        beginTransaction: () => conn.beginTransaction(),
        commit: () => conn.commit(),
        rollback: () => conn.rollback(),
        execute: async (sql: string, params?: unknown[]) => {
          const [result] = await conn.execute(sql, params as (string | number | Date | null)[]);
          return {
            affectedRows: (result as { affectedRows: number }).affectedRows,
            insertId: (result as { insertId?: number }).insertId,
          };
        },
        release: () => conn.release(),
      };
    },
  };
  return new SyncAuditService(client);
}

function isMysqlError(error: unknown): error is MysqlError {
  return typeof error === "object" && error !== null && "errno" in error;
}

function isRetryableMysqlError(error: unknown): error is MysqlError {
  return (
    isMysqlError(error) &&
    (error.errno === MYSQL_LOCK_WAIT_TIMEOUT_ERROR_CODE || error.errno === MYSQL_DEADLOCK_ERROR_CODE)
  );
}

function readDuplicateKeyName(error: MysqlError): string | null {
  const rawMessage =
    (typeof error.sqlMessage === "string" && error.sqlMessage) ||
    (typeof error.message === "string" && error.message) ||
    "";
  if (rawMessage.length === 0) {
    return null;
  }

  const keyMatch = rawMessage.match(/for key ['`"]([^'`"]+)['`"]/i);
  if (!keyMatch) {
    return null;
  }

  const keyName = keyMatch[1]?.trim();
  if (!keyName) {
    return null;
  }

  return keyName.split(".").pop() ?? keyName;
}

function isClientTxIdDuplicateError(error: unknown): error is MysqlError {
  if (!isMysqlError(error) || error.errno !== MYSQL_DUPLICATE_ERROR_CODE) {
    return false;
  }

  return readDuplicateKeyName(error) === POS_TRANSACTIONS_CLIENT_TX_UNIQUE_KEY;
}

function toMysqlDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid trx_at");
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
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
  defaultTaxRates: TaxRateRecord[];
  taxRateById: Map<number, TaxRateRecord>;
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

  return calculateTaxLines({
    grossAmount: grossSales,
    rates: defaultTaxRates
  }).filter((tax) => tax.amount > 0);
}

async function deductVariantStock(
  dbConnection: PoolConnection,
  companyId: number,
  variantId: number,
  quantity: number
): Promise<boolean> {
  const [variantRows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT stock_quantity FROM item_variants
     WHERE id = ? AND company_id = ? AND is_active = TRUE
     FOR UPDATE`,
    [variantId, companyId]
  );

  if (variantRows.length === 0) {
    throw new Error(`Variant ${variantId} not found or inactive`);
  }

  const currentStock = Number(variantRows[0].stock_quantity);
  const newStock = currentStock - quantity;

  if (newStock < 0) {
    throw new Error(`Insufficient stock for variant ${variantId}: ${currentStock} < ${quantity}`);
  }

  await dbConnection.execute(
    `UPDATE item_variants
     SET stock_quantity = ?
     WHERE id = ? AND company_id = ?`,
    [newStock, variantId, companyId]
  );

  return true;
}

async function resolveAndDeductStockForTransaction(
  dbConnection: PoolConnection,
  tx: SyncPushTransactionPayload,
  posTransactionId: number
): Promise<StockDeductResult[] | null> {
  if (tx.status !== "COMPLETED") {
    return null;
  }

  if (tx.items.length === 0) {
    return null;
  }

  const variantItems = tx.items.filter((item) => item.variant_id);
  const regularItems = tx.items.filter((item) => !item.variant_id);

  for (const item of variantItems) {
    if (item.variant_id) {
      await deductVariantStock(dbConnection, tx.company_id, item.variant_id, item.qty);
    }
  }

  if (regularItems.length === 0) {
    return null;
  }

  const itemIds = regularItems.map((item) => item.item_id);
  if (itemIds.length === 0) {
    return null;
  }

  const placeholders = itemIds.map(() => "?").join(", ");
  const [trackedRows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT id FROM items
     WHERE company_id = ?
       AND id IN (${placeholders})
       AND track_stock = 1`,
    [tx.company_id, ...itemIds]
  );

  const trackedItemIds = new Set((trackedRows as Array<{ id: number }>).map((row) => row.id));

  if (trackedItemIds.size === 0) {
    return null;
  }

  const stockItems = regularItems
    .filter((item) => trackedItemIds.has(item.item_id))
    .map((item) => ({
      product_id: item.item_id,
      quantity: item.qty
    }));

  if (stockItems.length === 0) {
    return null;
  }

  const stockResults = await deductStockWithCost(
    tx.company_id,
    tx.outlet_id,
    stockItems,
    tx.client_tx_id,
    tx.cashier_user_id,
    dbConnection
  );

  return stockResults;
}

async function isCogsFeatureEnabled(dbConnection: PoolConnection, companyId: number): Promise<boolean> {
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
): Promise<CogsPostingResult | null> {
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
      saleId: `POS-${posTransactionId}`,
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

function toErrorResult(clientTxId: string, message: string): SyncPushResultItem {
  return {
    client_tx_id: clientTxId,
    result: "ERROR",
    message
  };
}

function toRetryableDbErrorMessage(error: MysqlError): string {
  if (error.errno === MYSQL_LOCK_WAIT_TIMEOUT_ERROR_CODE) {
    return RETRYABLE_DB_LOCK_TIMEOUT_MESSAGE;
  }

  return RETRYABLE_DB_DEADLOCK_MESSAGE;
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
    opened_at: tx.opened_at ? toMysqlDateTime(tx.opened_at) : null,
    closed_at: tx.closed_at ? toMysqlDateTime(tx.closed_at) : null,
    notes: tx.notes ?? null,
    trx_at: toMysqlDateTime(tx.trx_at),
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
      variant_id: item.variant_id ?? null,
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

function canonicalizeTransactionForLegacyCompare(payload: LegacyComparablePayload): string {
  return JSON.stringify({
    client_tx_id: payload.client_tx_id,
    company_id: payload.company_id,
    outlet_id: payload.outlet_id,
    status: payload.status,
    trx_at: payload.trx_at,
    items: payload.items.map((item) => ({
      item_id: item.item_id,
      variant_id: item.variant_id ?? null,
      qty: item.qty,
      price_snapshot: item.price_snapshot,
      name_snapshot: item.name_snapshot
    })),
    payments: payload.payments.map((payment) => ({
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

function hasLegacyEquivalentHashMatch(existingHash: string, incomingTx: SyncPushTransactionPayload): boolean {
  for (const trxAtVariant of listLegacyEquivalentTrxAtVariants(incomingTx.trx_at)) {
    const candidateHash = computePayloadSha256(canonicalizeTransactionForLegacyHash(incomingTx));
    if (candidateHash === existingHash) {
      return true;
    }
  }

  return false;
}

function computePayloadSha256(canonicalPayload: string): string {
  return createHash("sha256").update(canonicalPayload).digest("hex");
}

function isSyncPushTestHookEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env[SYNC_PUSH_TEST_HOOKS_ENV] === "1";
}

function shouldInjectFailureAfterHeaderInsert(request: Request): boolean {
  return isSyncPushTestHookEnabled() && request.headers.get(TEST_FAIL_AFTER_HEADER_INSERT_HEADER) === "1";
}

function readForcedRetryableErrno(request: Request): number | null {
  if (!isSyncPushTestHookEnabled()) {
    return null;
  }

  const headerValue = request.headers.get(TEST_FORCE_DB_ERRNO_HEADER)?.trim();
  if (!headerValue) {
    return null;
  }

  const parsed = Number(headerValue);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  if (parsed !== MYSQL_LOCK_WAIT_TIMEOUT_ERROR_CODE && parsed !== MYSQL_DEADLOCK_ERROR_CODE) {
    return null;
  }

  return parsed;
}

function readSyncPushConcurrency(): number {
  const raw = process.env[SYNC_PUSH_CONCURRENCY_ENV];
  if (!raw || raw.trim().length === 0) {
    return DEFAULT_SYNC_PUSH_CONCURRENCY;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_SYNC_PUSH_CONCURRENCY;
  }

  return Math.min(MAX_SYNC_PUSH_CONCURRENCY, Math.max(1, parsed));
}

type IndexedTransaction = {
  tx: SyncPushTransactionPayload;
  txIndex: number;
};

async function isCashierInCompany(
  dbExecutor: QueryExecutor,
  companyId: number,
  cashierUserId: number
): Promise<boolean> {
  const [rows] = await dbExecutor.execute(
    `SELECT 1
     FROM users u
     WHERE u.id = ?
       AND u.company_id = ?
     LIMIT 1`,
    [cashierUserId, companyId]
  );

  return (rows as Array<unknown>).length > 0;
}

async function readExistingIdempotencyRecordByClientTxId(
  orderDbConnection: PoolConnection,
  companyId: number,
  outletId: number,
  clientTxId: string
): Promise<ExistingIdempotencyRecord | null> {
  const [rows] = await orderDbConnection.execute(
    `SELECT id, payload_sha256, payload_hash_version
     FROM pos_transactions
     WHERE company_id = ? AND outlet_id = ? AND client_tx_id = ?
     LIMIT 1`,
    [companyId, outletId, clientTxId]
  );

  const row = (rows as Array<{ id?: number; payload_sha256?: string | null; payload_hash_version?: number | null }>)[0];
  if (!row || !Number.isFinite(row.id)) {
    return null;
  }

  return {
    posTransactionId: Number(row.id),
    payloadSha256: typeof row.payload_sha256 === "string" ? row.payload_sha256 : null,
    payloadHashVersion: Number.isFinite(row.payload_hash_version) ? Number(row.payload_hash_version) : null
  };
}

async function rollbackQuietly(orderDbConnection: PoolConnection): Promise<void> {
  try {
    await orderDbConnection.rollback();
  } catch {
    // Ignore rollback errors to preserve root cause handling.
  }
}

type PostingAuditMetadata = {
  postingMode: string | null;
  journalBatchId: number | null;
  balanceOk: boolean | null;
  reason: string | null;
};

function logSyncPushTransactionResult(params: {
  correlationId: string;
  clientTxId: string;
  attempt: number;
  latencyMs: number;
  result: SyncPushResultCode;
}) {
  console.info("POST /sync/push transaction", {
    correlation_id: params.correlationId,
    client_tx_id: params.clientTxId,
    attempt: params.attempt,
    latency_ms: params.latencyMs,
    result: params.result
  });
}

async function readLegacyComparablePayloadByPosTransactionId(
  orderDbConnection: PoolConnection,
  posTransactionId: number
): Promise<LegacyComparablePayload | null> {
  const [headerRows] = await orderDbConnection.execute(
    `SELECT client_tx_id, company_id, outlet_id, status, DATE_FORMAT(trx_at, '%Y-%m-%d %H:%i:%s') AS trx_at
     FROM pos_transactions
     WHERE id = ?
     LIMIT 1`,
    [posTransactionId]
  );

  const header = (
    headerRows as Array<{
      client_tx_id?: string;
      company_id?: number;
      outlet_id?: number;
      status?: "COMPLETED" | "VOID" | "REFUND";
      trx_at?: string;
    }>
  )[0];
  if (
    !header ||
    typeof header.client_tx_id !== "string" ||
    !Number.isFinite(header.company_id) ||
    !Number.isFinite(header.outlet_id) ||
    typeof header.trx_at !== "string" ||
    (header.status !== "COMPLETED" && header.status !== "VOID" && header.status !== "REFUND")
  ) {
    return null;
  }

  const [itemRows] = await orderDbConnection.execute(
    `SELECT item_id, variant_id, qty, price_snapshot, name_snapshot
     FROM pos_transaction_items
     WHERE pos_transaction_id = ?
     ORDER BY line_no ASC`,
    [posTransactionId]
  );

  const [paymentRows] = await orderDbConnection.execute(
    `SELECT method, amount
     FROM pos_transaction_payments
     WHERE pos_transaction_id = ?
     ORDER BY payment_no ASC`,
    [posTransactionId]
  );

  return {
    client_tx_id: header.client_tx_id,
    company_id: Number(header.company_id),
    outlet_id: Number(header.outlet_id),
    status: header.status,
    trx_at: header.trx_at,
    items: (itemRows as Array<{ item_id: number; variant_id?: number; qty: number; price_snapshot: number; name_snapshot: string }>).map((row) => ({
      item_id: Number(row.item_id),
      variant_id: row.variant_id ? Number(row.variant_id) : undefined,
      qty: Number(row.qty),
      price_snapshot: Number(row.price_snapshot),
      name_snapshot: String(row.name_snapshot)
    })),
    payments: (paymentRows as Array<{ method: string; amount: number }>).map((row) => ({
      method: String(row.method),
      amount: Number(row.amount)
    }))
  };
}

async function doesLegacyPayloadReplayMatch(
  orderDbConnection: PoolConnection,
  posTransactionId: number,
  incomingTx: SyncPushTransactionPayload
): Promise<boolean> {
  const existingPayload = await readLegacyComparablePayloadByPosTransactionId(orderDbConnection, posTransactionId);
  if (!existingPayload) {
    return false;
  }

  const incomingPayload: LegacyComparablePayload = {
    client_tx_id: incomingTx.client_tx_id,
    company_id: incomingTx.company_id,
    outlet_id: incomingTx.outlet_id,
    status: incomingTx.status,
    trx_at: toMysqlDateTime(incomingTx.trx_at),
    items: incomingTx.items.map((item) => ({
      item_id: item.item_id,
      variant_id: item.variant_id,
      qty: item.qty,
      price_snapshot: item.price_snapshot,
      name_snapshot: item.name_snapshot
    })),
    payments: incomingTx.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount
    }))
  };

  return canonicalizeTransactionForLegacyCompare(existingPayload) === canonicalizeTransactionForLegacyCompare(incomingPayload);
}

async function doesLegacyV1HashMismatchReplayMatch(
  orderDbConnection: PoolConnection,
  posTransactionId: number,
  existingHash: string,
  incomingTx: SyncPushTransactionPayload
): Promise<boolean> {
  if (!hasLegacyEquivalentHashMatch(existingHash, incomingTx)) {
    return false;
  }

  return doesLegacyPayloadReplayMatch(orderDbConnection, posTransactionId, incomingTx);
}

async function readAcceptedPostingAuditMetadata(
  dbExecutor: QueryExecutor,
  companyId: number,
  outletId: number,
  clientTxId: string
): Promise<PostingAuditMetadata> {
  const [rows] = await dbExecutor.execute(
    `SELECT payload_json
     FROM audit_logs
     WHERE company_id = ?
       AND outlet_id = ?
       AND action = ?
       AND success = 1
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?
     ORDER BY id DESC
     LIMIT 1`,
    [companyId, outletId, SYNC_PUSH_ACCEPTED_AUDIT_ACTION, clientTxId]
  );

  const row = (rows as Array<{ payload_json?: string | null }>)[0];
  if (!row || typeof row.payload_json !== "string") {
    return {
      postingMode: null,
      journalBatchId: null,
      balanceOk: null,
      reason: null
    };
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    payload = null;
  }

  if (!payload || typeof payload !== "object") {
    return {
      postingMode: null,
      journalBatchId: null,
      balanceOk: null,
      reason: null
    };
  }

  const data = payload as Record<string, unknown>;
  const batchParsed = Number(data.journal_batch_id);
  return {
    postingMode: typeof data.posting_mode === "string" ? data.posting_mode : null,
    journalBatchId: Number.isInteger(batchParsed) ? batchParsed : null,
    balanceOk: typeof data.balance_ok === "boolean" ? data.balance_ok : null,
    reason: typeof data.reason === "string" ? data.reason : null
  };
}

async function readJournalBatchIdByPosTransactionId(
  dbExecutor: QueryExecutor,
  posTransactionId: number
): Promise<number | null> {
  const [rows] = await dbExecutor.execute(
    `SELECT id
     FROM journal_batches
     WHERE doc_type = ?
       AND doc_id = ?
     LIMIT 1`,
    [POS_SALE_DOC_TYPE, posTransactionId]
  );

  const row = (rows as Array<{ id?: number | null }>)[0];
  if (!row || !Number.isFinite(row.id)) {
    return null;
  }

  return Number(row.id);
}

async function recordSyncPushDuplicateReplayAudit(
  dbExecutor: QueryExecutor,
  params: {
    authUserId: number;
    correlationId: string;
    companyId: number;
    outletId: number;
    clientTxId: string;
    posTransactionId: number;
  }
): Promise<void> {
  const metadata = await readAcceptedPostingAuditMetadata(dbExecutor, params.companyId, params.outletId, params.clientTxId);
  const fallbackJournalBatchId = await readJournalBatchIdByPosTransactionId(dbExecutor, params.posTransactionId);
  const journalBatchId = metadata.journalBatchId ?? fallbackJournalBatchId;

  await dbExecutor.execute(
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
  dbExecutor: QueryExecutor,
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
    await dbExecutor.execute(
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
  dbExecutor: QueryExecutor,
  context: AcceptedSyncPushContext,
  posting: SyncPushPostingHookResult
): Promise<void> {
  await dbExecutor.execute(
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
// Sync Push Routes
// ============================================================================

const syncPushRoutes = new Hono();

// Auth middleware
syncPushRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

syncPushRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  const correlationId = getRequestCorrelationId(c.req.raw);
  const request = c.req.raw;
  const injectFailureAfterHeaderInsert = shouldInjectFailureAfterHeaderInsert(request);
  const forcedRetryableErrno = readForcedRetryableErrno(request);
  const startTime = Date.now();
  const tier = request.headers.get("x-sync-tier") ?? "default";

  let eventId: bigint | undefined;
  let auditService: ReturnType<typeof createSyncAuditService> | undefined;

  try {
    const rawPayload = await request.json();
    
    // Validate request payload with Zod schema
    let validatedPayload: SyncPushRequest;
    try {
      validatedPayload = SyncPushRequestSchema.parse(rawPayload);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", `Validation failed: ${validationError.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`, 400);
      }
      throw validationError;
    }
    
    const transactions = validatedPayload.transactions ?? [];
    const orderUpdates = validatedPayload.order_updates ?? [];
    
    if (transactions.length === 0 && orderUpdates.length === 0) {
      return errorResponse("INVALID_REQUEST", "At least one transaction or order_update is required", 400);
    }

    const dbPool = getDbPool();
    auditService = createSyncAuditService(dbPool);
    const metricsCollector = new SyncIdempotencyMetricsCollector();
    const results: SyncPushResultItem[] = [];

    // Start audit event
    eventId = await auditService.startEvent({
      companyId: auth.companyId,
      outletId: validatedPayload.outlet_id,
      operationType: "PUSH",
      tierName: tier,
      status: "IN_PROGRESS",
      startedAt: new Date()
    });

    const taxDbConnection = await dbPool.getConnection();
    try {
      const [companyTaxRates, defaultTaxRates] = await Promise.all([
        listCompanyTaxRates(taxDbConnection, auth.companyId),
        listCompanyDefaultTaxRates(taxDbConnection, auth.companyId)
      ]);
      const activeTaxRates = companyTaxRates.filter((rate) => rate.is_active);
      const taxRateById = new Map(activeTaxRates.map((rate) => [rate.id, rate]));

      const taxContext: SyncPushTaxContext = {
        defaultTaxRates,
        taxRateById
      };

      const maxConcurrency = readSyncPushConcurrency();
      const batches = buildTransactionBatches(transactions as SyncPushTransactionPayload[], maxConcurrency);
      const resultsByIndex: Map<number, SyncPushResultItem> = new Map();

      metricsCollector.recordRequest(transactions.length);

      for (const batch of batches) {
        metricsCollector.startBatch();

        const batchResults = await Promise.all(
          batch.map((indexedTx) =>
            processSyncPushTransaction({
              dbPool,
              tx: indexedTx.tx,
              txIndex: indexedTx.txIndex,
              inputOutletId: validatedPayload.outlet_id,
              authCompanyId: auth.companyId,
              authUserId: auth.userId,
              correlationId,
              injectFailureAfterHeaderInsert,
              forcedRetryableErrno,
              taxContext,
              metricsCollector
            })
          )
        );

        metricsCollector.endBatch(batchResults.length);

        for (const result of batchResults) {
          const originalIndex = batch.find((idxTx) => idxTx.tx.client_tx_id === result.client_tx_id)?.txIndex;
          if (originalIndex !== undefined) {
            resultsByIndex.set(originalIndex, result);
          }
        }
      }

      for (let i = 0; i < transactions.length; i++) {
        const result = resultsByIndex.get(i);
        if (result) {
          results.push(result);
        } else {
          results.push(toErrorResult(transactions[i].client_tx_id, "processing failed"));
        }
      }
    } finally {
      taxDbConnection.release();
    }

    // Complete audit event on success
    if (eventId !== undefined) {
      await auditService.completeEvent(eventId, {
        status: "SUCCESS",
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        itemsCount: transactions.length
      });
    }

    return successResponse({ results });
  } catch (error) {
    // Complete audit event on failure
    if (eventId !== undefined && auditService !== undefined) {
      await auditService.completeEvent(eventId, {
        status: "FAILED",
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        errorCode: error instanceof Error ? error.name : "UNKNOWN",
        errorMessage: error instanceof Error ? error.message : "Unknown error"
      });
    }

    console.error("POST /sync/push failed", { correlation_id: correlationId, error });
    return errorResponse("INTERNAL_SERVER_ERROR", "Sync push failed", 500);
  }
});

// ============================================================================
// Transaction Processing
// ============================================================================

async function processSyncPushTransaction(params: ProcessTransactionParams): Promise<SyncPushResultItem> {
  const { dbPool, tx, txIndex, inputOutletId, authCompanyId, authUserId, correlationId, injectFailureAfterHeaderInsert, forcedRetryableErrno, taxContext, metricsCollector } = params;
  const { defaultTaxRates, taxRateById } = taxContext;

  const orderDbConnection = await dbPool.getConnection();
  const attempt = txIndex + 1;
  const startedAtMs = Date.now();

  const logTransactionResult = (result: SyncPushResultCode) => {
    logSyncPushTransactionResult({
      correlationId,
      clientTxId: tx.client_tx_id,
      attempt,
      latencyMs: Math.max(0, Date.now() - startedAtMs),
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

    const trxAtCanonical = toMysqlDateTime(tx.trx_at);
    const openedAtCanonical = tx.opened_at ? toMysqlDateTime(tx.opened_at) : trxAtCanonical;
    const closedAtCanonical = tx.closed_at ? toMysqlDateTime(tx.closed_at) : trxAtCanonical;
    const payloadSha256 = computePayloadSha256(canonicalizeTransactionForHash(tx));
    const payloadSha256Legacy = computePayloadSha256(canonicalizeTransactionForLegacyHash(tx));
    let acceptedContextForFailureAudit: AcceptedSyncPushContext | null = null;

    // Check for existing transaction (idempotency)
    const existingRecord = await readExistingIdempotencyRecordByClientTxId(orderDbConnection, tx.company_id, tx.outlet_id, tx.client_tx_id);
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
        existingRecord.payloadHashVersion
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

        await recordSyncPushDuplicateReplayAudit(orderDbConnection, {
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

    // Verify cashier belongs to company
    const cashierInCompany = await isCashierInCompany(orderDbConnection, tx.company_id, tx.cashier_user_id);
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
      await orderDbConnection.beginTransaction();

      // Inject test failure if requested
      if (forcedRetryableErrno !== null) {
        throw {
          errno: forcedRetryableErrno
        } satisfies MysqlError;
      }

      // Insert pos_transaction header
      const [insertResult] = await orderDbConnection.execute<ResultSetHeader>(
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

      // Insert transaction items
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

        await orderDbConnection.execute(
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

      // Insert transaction payments
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

        await orderDbConnection.execute(
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

      // Calculate and insert taxes
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

        await orderDbConnection.execute(
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

      // C3/C4: Deduct stock for COMPLETED transactions
      let stockDeductResults: StockDeductResult[] | null = null;
      if (tx.status === "COMPLETED") {
        stockDeductResults = await resolveAndDeductStockForTransaction(
          orderDbConnection,
          tx,
          posTransactionId
        );
      }

      // C5: Post COGS journal entries
      const postingMode = process.env.SYNC_PUSH_POSTING_MODE ?? "disabled";
      if (stockDeductResults && stockDeductResults.length > 0) {
        await postCogsFromStockResults(
          orderDbConnection,
          tx,
          posTransactionId,
          stockDeductResults,
          postingMode
        );
      }

      // Release table for DINE_IN
      if ((tx.service_type ?? "TAKEAWAY") === "DINE_IN" && tx.table_id) {
        await orderDbConnection.execute(
          `UPDATE outlet_tables
           SET status = 'AVAILABLE', updated_at = CURRENT_TIMESTAMP
           WHERE company_id = ? AND outlet_id = ? AND id = ?`,
          [tx.company_id, tx.outlet_id, tx.table_id]
        );
      }

      // Update reservation if linked
      if (tx.reservation_id) {
        await orderDbConnection.execute(
          `UPDATE reservations
           SET linked_order_id = ?,
               status = CASE
                 WHEN status IN ('CANCELLED', 'NO_SHOW', 'COMPLETED') THEN status
                 ELSE 'COMPLETED'
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
        postingResult = await runSyncPushPostingHook(orderDbConnection, acceptedContext);
      } catch (postingHookError) {
        if (
          postingHookError instanceof SyncPushPostingHookError
          && postingHookError.mode === "shadow"
        ) {
          await recordSyncPushPostingHookFailure(orderDbConnection, acceptedContext, postingHookError);
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

      await runAcceptedSyncPushHook(orderDbConnection, acceptedContext, postingResult);

      await orderDbConnection.commit();

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
        await rollbackQuietly(orderDbConnection);

        const existingRecord = await readExistingIdempotencyRecordByClientTxId(orderDbConnection, tx.company_id, tx.outlet_id, tx.client_tx_id);
        if (!existingRecord) {
          const result = toErrorResult(tx.client_tx_id, RETRYABLE_DB_LOCK_TIMEOUT_MESSAGE);
          logTransactionResult("ERROR");
          return result;
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
          existingRecord.payloadHashVersion
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

          await recordSyncPushDuplicateReplayAudit(orderDbConnection, {
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
        await rollbackQuietly(orderDbConnection);
        
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
          await rollbackQuietly(orderDbConnection);
          
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

      await rollbackQuietly(orderDbConnection);

      // Record posting hook failure for audit
      if (
        acceptedContextForFailureAudit
        && error instanceof SyncPushPostingHookError
        && error.mode !== "shadow"
      ) {
        await recordSyncPushPostingHookFailure(dbPool, acceptedContextForFailureAudit, error);
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
    orderDbConnection.release();
  }
}

function buildTransactionBatches(
  transactions: SyncPushTransactionPayload[],
  maxConcurrency: number
): IndexedTransaction[][] {
  const batches: IndexedTransaction[][] = [];
  let current: IndexedTransaction[] = [];
  let seenClientTxIds = new Set<string>();

  for (const [txIndex, tx] of transactions.entries()) {
    const isChunkFull = current.length >= maxConcurrency;
    const hasDuplicateInChunk = seenClientTxIds.has(tx.client_tx_id);

    if ((isChunkFull || hasDuplicateInChunk) && current.length > 0) {
      batches.push(current);
      current = [];
      seenClientTxIds = new Set<string>();
    }

    current.push({ tx, txIndex });
    seenClientTxIds.add(tx.client_tx_id);
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

export { syncPushRoutes };
