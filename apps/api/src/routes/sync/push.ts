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
import { z, ZodError } from "zod";
import { createHash } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import {
  NumericIdSchema,
  OrderUpdateEventTypeSchema,
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
import { toEpochMs, toMysqlDateTime, toUtcInstant } from "../../lib/date-helpers.js";

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
const POS_TRANSACTIONS_CLIENT_TX_UNIQUE_KEY = "uq_pos_transactions_outlet_client_tx";
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
// Order Sync Types
// ============================================================================

type OrderUpdateResult = {
  update_id: string;
  result: "OK" | "DUPLICATE" | "ERROR";
  message?: string;
};

type ItemCancellationResult = {
  cancellation_id: string;
  result: "OK" | "DUPLICATE" | "ERROR";
  message?: string;
};

type ActiveOrder = {
  order_id: string;
  company_id: number;
  outlet_id: number;
  service_type: string;
  source_flow?: string;
  settlement_flow?: string;
  table_id?: number | null;
  reservation_id?: number | null;
  guest_count?: number | null;
  is_finalized: boolean;
  order_status: string;
  order_state: string;
  paid_amount: number;
  opened_at: string;
  closed_at?: string | null;
  notes?: string | null;
  updated_at: string;
  lines: Array<{
    item_id: number;
    variant_id?: number;
    sku_snapshot?: string | null;
    name_snapshot: string;
    item_type_snapshot: string;
    unit_price_snapshot: number;
    qty: number;
    discount_amount: number;
    updated_at: string;
  }>;
};

type OrderUpdate = {
  update_id: string;
  order_id: string;
  company_id: number;
  outlet_id: number;
  base_order_updated_at?: string | null;
  event_type: string;
  delta_json: string;
  actor_user_id?: number | null;
  device_id: string;
  event_at: string;
  // created_at is SERVER-authoritative ingest metadata.
  // The server generates this at ingest time; client-provided value is IGNORED.
  // Marked optional to reflect schema contract.
  created_at?: string;
};

type ItemCancellation = {
  cancellation_id: string;
  update_id?: string;
  order_id: string;
  item_id: number;
  variant_id?: number;
  company_id: number;
  outlet_id: number;
  cancelled_quantity: number;
  reason: string;
  cancelled_by_user_id?: number | null;
  cancelled_at: string;
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

/**
 * Normalize trx_at timestamp to unix milliseconds for consistent hashing.
 * Handles ISO 8601 variants like:
 * - 2026-03-24T10:30:00Z
 * - 2026-03-24T10:30:00.000Z
 * - 2026-03-24T10:30:00.123Z
 * All normalize to the same unix timestamp in milliseconds.
 * Also handles numeric unix timestamps (seconds or milliseconds).
 */
function normalizeTrxAtForHash(trxAt: string | number): number {
  // Handle numeric input (unix timestamp)
  if (typeof trxAt === 'number') {
    // Detect if seconds or milliseconds by magnitude
    // Unix seconds are ~10 digits, Unix ms are ~13 digits
    return trxAt > 1e12 ? trxAt : trxAt * 1000;
  }

  // String input: validate via isValidDateTime then convert via toEpochMs
  // so rolled dates and invalid formats are rejected instead of silently mishandled.
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
      // Omit variant_id if null to match legacy hash computation (test helper behavior)
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
    const txWithVariant = { ...incomingTx, trx_at: trxAtVariant };
    const candidateHash = computePayloadSha256(canonicalizeTransactionForLegacyHash(txWithVariant));
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
    trx_at: toMysqlDateTimeStrict(incomingTx.trx_at),
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
// Order Sync Processing Functions
// ============================================================================

/**
 * Process active orders - upserts order snapshots and their lines
 * Uses INSERT ... ON DUPLICATE KEY UPDATE for idempotency
 *
 * Timestamp semantics:
 * - opened_at_ts: STATE TRANSITION - when the order was opened (client-authored)
 * - closed_at_ts: STATE TRANSITION - when the order was closed (client-authored)
 * - updated_at_ts: SNAPSHOT FRESHNESS - when this snapshot was generated (client-authored)
 * - created_at_ts: SERVER INGEST TIME - when this record was first inserted server-side
 *
 * created_at_ts is set to server current time on INSERT and preserved on UPDATE
 * (ON DUPLICATE KEY UPDATE does not touch created_at columns).
 */
async function processActiveOrders(
  executor: QueryExecutor,
  orders: ActiveOrder[],
  correlationId: string
): Promise<OrderUpdateResult[]> {
  const results: OrderUpdateResult[] = [];

  for (const order of orders) {
    try {
      // Generate server-authoritative ingest time for created_at / created_at_ts
      // This is the time the server ingests the snapshot, not the event time.
      const serverNow = new Date();
      const serverCreatedAtMysql = toMysqlDateTimeStrict(serverNow.toISOString(), "server_created_at");
      const serverCreatedAtTs = serverNow.getTime();

      // Upsert the order snapshot
      // Note: created_at and created_at_ts are NOT in the ON DUPLICATE KEY UPDATE clause,
      // so they are preserved on existing rows and set to serverNow on new rows.
      await executor.execute(
        `INSERT INTO pos_order_snapshots (
           order_id, company_id, outlet_id, service_type, source_flow, settlement_flow,
           table_id, reservation_id, guest_count, is_finalized, order_status, order_state,
           paid_amount, opened_at, opened_at_ts, closed_at, closed_at_ts, notes, updated_at, updated_at_ts,
           created_at, created_at_ts
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           service_type = VALUES(service_type),
           source_flow = VALUES(source_flow),
           settlement_flow = VALUES(settlement_flow),
           table_id = VALUES(table_id),
           reservation_id = VALUES(reservation_id),
           guest_count = VALUES(guest_count),
           is_finalized = VALUES(is_finalized),
           order_status = VALUES(order_status),
           order_state = VALUES(order_state),
           paid_amount = VALUES(paid_amount),
           closed_at = VALUES(closed_at),
           closed_at_ts = VALUES(closed_at_ts),
           notes = VALUES(notes),
           updated_at = VALUES(updated_at),
           updated_at_ts = VALUES(updated_at_ts)`,
        [
          order.order_id,
          order.company_id,
          order.outlet_id,
          order.service_type,
          order.source_flow ?? null,
          order.settlement_flow ?? null,
          order.table_id ?? null,
          order.reservation_id ?? null,
          order.guest_count ?? null,
          order.is_finalized ? 1 : 0,
          order.order_status,
          order.order_state,
          order.paid_amount,
           toMysqlDateTimeStrict(order.opened_at, "opened_at"),
           toTimestampMs(order.opened_at, "opened_at"),
           order.closed_at ? toMysqlDateTimeStrict(order.closed_at, "closed_at") : null,
           order.closed_at ? toTimestampMs(order.closed_at, "closed_at") : null,
           order.notes ?? null,
           toMysqlDateTimeStrict(order.updated_at, "updated_at"),
           toTimestampMs(order.updated_at, "updated_at"),
           serverCreatedAtMysql,
           serverCreatedAtTs
        ]
      );

      // Delete existing lines and re-insert (simpler than diffing)
      await executor.execute(
        `DELETE FROM pos_order_snapshot_lines WHERE order_id = ? AND company_id = ?`,
        [order.order_id, order.company_id]
      );

      // Insert new lines
      // Timestamp semantics for snapshot lines:
      // - updated_at_ts: snapshot freshness/update time (from line's updated_at)
      // - created_at_ts: server ingest time (serverNow) - distinct from updated_at_ts
      if (order.lines.length > 0) {
        const lineValues = order.lines.map((line) => [
          order.order_id,
          order.company_id,
          order.outlet_id,
          line.item_id,
          line.variant_id ?? null,
          line.sku_snapshot ?? null,
          line.name_snapshot,
          line.item_type_snapshot,
          line.unit_price_snapshot,
          line.qty,
          line.discount_amount,
          toMysqlDateTimeStrict(line.updated_at, "updated_at"),
          toTimestampMs(line.updated_at, "updated_at"), // updated_at_ts = snapshot freshness
          serverCreatedAtMysql,                        // created_at = server ingest time
          serverCreatedAtTs                             // created_at_ts = server ingest time
        ]);

        const placeholders = lineValues.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const flatValues = lineValues.flat();

        await executor.execute(
          `INSERT INTO pos_order_snapshot_lines (
             order_id, company_id, outlet_id, item_id, variant_id, sku_snapshot,
             name_snapshot, item_type_snapshot, unit_price_snapshot, qty,
             discount_amount, updated_at, updated_at_ts, created_at, created_at_ts
           ) VALUES ${placeholders}`,
          flatValues
        );
      }

      results.push({
        update_id: order.order_id, // Use order_id as update_id for snapshot finalize
        result: "OK"
      });
    } catch (error) {
      console.error("Failed to process active order", {
        correlation_id: correlationId,
        order_id: order.order_id,
        error
      });
      results.push({
        update_id: order.order_id,
        result: "ERROR",
        message: error instanceof Error ? error.message : "Failed to process order"
      });
    }
  }

  return results;
}

/**
 * Process order updates - inserts order update events with idempotency via update_id
 *
 * Authority semantics:
 * - event_at / event_at_ts: CLIENT-authoritative - preserve from payload after validation
 * - created_at / created_at_ts: SERVER-authoritative - generated server-side at ingest time
 * - base_order_updated_at / base_order_updated_at_ts: VERSION MARKER METADATA - copied from the
 *   base order's updated_at at the time the update was created. This is NOT business time,
 *   event time, or display time. It is preserved metadata for potential future stale detection
 *   when an authoritative server-side order version is available.
 *
 * The base_order_updated_at_ts is stored as-is from the client payload. It represents the
 * client's claim about what version of the order they observed when creating the update.
 * Currently, no server-side stale detection is enforced because:
 *   1. There is no authoritative server-generated order version currently available
 *   2. Comparing client-claimed values (base_order_updated_at_ts) against each other is not
 *      true optimistic-concurrency - it would be a fabricated heuristic
 * Future enhancement: When an authoritative server-side order version exists (e.g., a
 * server-generated sequence number or verified snapshot updated_at_ts), stale detection
 * can be implemented by comparing incoming base_order_updated_at_ts against that authoritative
 * source, with proper enforcement that snapshot updates advance the authoritative version.
 *
 * Idempotency is preserved via update_id uniqueness.
 *
 * This ensures offline replay and ordering remain deterministic without conflating
 * the time the event occurred on device with the time it was ingested server-side.
 */
async function processOrderUpdates(
  executor: QueryExecutor,
  updates: OrderUpdate[],
  correlationId: string
): Promise<OrderUpdateResult[]> {
  const results: OrderUpdateResult[] = [];

  for (const update of updates) {
    console.info("processOrderUpdates: processing update", { correlation_id: correlationId, update_id: update.update_id });
    try {
      // Check if update already exists (idempotency via update_id)
      const [existing] = await executor.execute<RowDataPacket[]>(
        `SELECT update_id FROM pos_order_updates WHERE update_id = ? LIMIT 1`,
        [update.update_id]
      );

      console.info("processOrderUpdates: existing check", { correlation_id: correlationId, update_id: update.update_id, existingCount: existing.length });

      if (existing.length > 0) {
        results.push({
          update_id: update.update_id,
          result: "DUPLICATE"
        });
        continue;
      }

      // Generate server-authoritative ingest time for created_at / created_at_ts
      // This is the time the server ingests the update, not the time the event occurred on device
      const serverNow = new Date();
      const serverCreatedAtMysql = toMysqlDateTimeStrict(serverNow.toISOString(), "server_created_at");
      const serverCreatedAtTs = serverNow.getTime();

      // Insert the order update
      // Note: base_order_updated_at_ts is stored as VERSION MARKER METADATA only.
      // No server-side stale detection is performed - see JSDoc for rationale.
      console.info("processOrderUpdates: inserting", { correlation_id: correlationId, update_id: update.update_id });
      await executor.execute(
        `INSERT INTO pos_order_updates (
           update_id, order_id, company_id, outlet_id, base_order_updated_at, base_order_updated_at_ts,
           event_type, delta_json, actor_user_id, device_id, event_at, event_at_ts, created_at, created_at_ts
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          update.update_id,
          update.order_id,
          update.company_id,
          update.outlet_id,
          update.base_order_updated_at
            ? toMysqlDateTimeStrict(update.base_order_updated_at, "base_order_updated_at")
            : null,
          update.base_order_updated_at
            ? toTimestampMs(update.base_order_updated_at, "base_order_updated_at")
            : null,
          update.event_type,
          update.delta_json,
          update.actor_user_id ?? null,
          update.device_id,
          toMysqlDateTimeStrict(update.event_at, "event_at"),
          toTimestampMs(update.event_at, "event_at"),
          serverCreatedAtMysql,
          serverCreatedAtTs
        ]
      );
      console.info("processOrderUpdates: insert complete", { correlation_id: correlationId, update_id: update.update_id });

      results.push({
        update_id: update.update_id,
        result: "OK"
      });
    } catch (error) {
      console.error("processOrderUpdates: failed", {
        correlation_id: correlationId,
        update_id: update.update_id,
        error
      });
      results.push({
        update_id: update.update_id,
        result: "ERROR",
        message: error instanceof Error ? error.message : "Failed to process order update"
      });
    }
  }

  return results;
}

/**
 * Process item cancellations - inserts cancellation records with idempotency via cancellation_id
 *
 * Authority semantics:
 * - cancelled_at / cancelled_at_ts: CLIENT-authoritative - preserve from payload after validation
 * - created_at / created_at_ts: SERVER-authoritative - generated server-side at ingest time
 *
 * This ensures offline replay and ordering remain deterministic without conflating
 * the time the cancellation occurred on device with the time it was ingested server-side.
 */
async function processItemCancellations(
  executor: QueryExecutor,
  cancellations: ItemCancellation[],
  correlationId: string
): Promise<ItemCancellationResult[]> {
  const results: ItemCancellationResult[] = [];

  for (const cancellation of cancellations) {
    try {
      // Check if cancellation already exists (idempotency)
      const [existing] = await executor.execute<RowDataPacket[]>(
        `SELECT cancellation_id FROM pos_item_cancellations WHERE cancellation_id = ? LIMIT 1`,
        [cancellation.cancellation_id]
      );

      if (existing.length > 0) {
        results.push({
          cancellation_id: cancellation.cancellation_id,
          result: "DUPLICATE"
        });
        continue;
      }

      // Generate server-authoritative ingest time for created_at / created_at_ts
      // This is the time the server ingests the cancellation, not the time it occurred on device
      const serverNow = new Date();
      const serverCreatedAtMysql = toMysqlDateTimeStrict(serverNow.toISOString(), "server_created_at");
      const serverCreatedAtTs = serverNow.getTime();

      // Insert the cancellation
      await executor.execute(
        `INSERT INTO pos_item_cancellations (
           cancellation_id, update_id, order_id, item_id, variant_id,
           company_id, outlet_id, cancelled_quantity, reason,
           cancelled_by_user_id, cancelled_at, cancelled_at_ts, created_at, created_at_ts
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cancellation.cancellation_id,
          cancellation.update_id ?? null,
          cancellation.order_id,
          cancellation.item_id,
          cancellation.variant_id ?? null,
          cancellation.company_id,
          cancellation.outlet_id,
          cancellation.cancelled_quantity,
          cancellation.reason,
          cancellation.cancelled_by_user_id ?? null,
          toMysqlDateTimeStrict(cancellation.cancelled_at, "cancelled_at"),
          toTimestampMs(cancellation.cancelled_at, "cancelled_at"),
          serverCreatedAtMysql,
          serverCreatedAtTs
        ]
      );

      results.push({
        cancellation_id: cancellation.cancellation_id,
        result: "OK"
      });
    } catch (error) {
      console.error("Failed to process item cancellation", {
        correlation_id: correlationId,
        cancellation_id: cancellation.cancellation_id,
        error
      });
      results.push({
        cancellation_id: cancellation.cancellation_id,
        result: "ERROR",
        message: error instanceof Error ? error.message : "Failed to process cancellation"
      });
    }
  }

  return results;
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
  const dbPool = getDbPool();
  let metricsCollector = new SyncIdempotencyMetricsCollector();

  console.info("POST /sync/push started", {
    correlation_id: correlationId,
    company_id: auth.companyId,
    user_id: auth.userId
  });

  try {
    // Parse and validate request body
    const body = await c.req.json();
    const validationResult = SyncPushRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.warn("POST /sync/push validation failed", {
        correlation_id: correlationId,
        company_id: auth.companyId,
        errors: validationResult.error.errors
      });
      return errorResponse("VALIDATION_ERROR", "Invalid request payload", 400);
    }

    const { outlet_id, transactions, active_orders, order_updates, item_cancellations } = validationResult.data;
    
    console.info("POST /sync/push parsed request", {
      correlation_id: correlationId,
      has_active_orders: !!active_orders,
      active_orders_count: active_orders?.length ?? 0,
      has_order_updates: !!order_updates,
      order_updates_count: order_updates?.length ?? 0,
      has_item_cancellations: !!item_cancellations,
      item_cancellations_count: item_cancellations?.length ?? 0
    });

    // Verify outlet access - sync push creates transactions, requires create permission
    const outletAccessGuard = requireAccess({
      roles: ["OWNER", "ADMIN", "CASHIER"], // ACCOUNTANT excluded - only has read permission
      module: "pos",
      permission: "create",
      outletId: outlet_id
    });

    const outletAccessResult = await outletAccessGuard(c.req.raw, auth);
    if (outletAccessResult) {
      return outletAccessResult;
    }

    // Early return only if there's nothing to process (no transactions, active_orders, order_updates, or item_cancellations)
    const hasActiveOrders = active_orders && active_orders.length > 0;
    const hasOrderUpdates = order_updates && order_updates.length > 0;
    const hasItemCancellations = item_cancellations && item_cancellations.length > 0;
    if (transactions.length === 0 && !hasActiveOrders && !hasOrderUpdates && !hasItemCancellations) {
      return successResponse({ results: [] });
    }

    // Load tax context
    const connection = await dbPool.getConnection();
    try {
      const [defaultTaxRates, allTaxRates] = await Promise.all([
        listCompanyDefaultTaxRates(connection, auth.companyId),
        listCompanyTaxRates(connection, auth.companyId)
      ]);

      const taxRateById = new Map(allTaxRates.map((rate) => [rate.id, rate]));
      const taxContext: SyncPushTaxContext = { defaultTaxRates, taxRateById };

      // Process transactions in batches
      const maxConcurrency = readSyncPushConcurrency();
      const batches = buildTransactionBatches(transactions, maxConcurrency);
      const results: SyncPushResultItem[] = [];

      const injectFailureAfterHeaderInsert = shouldInjectFailureAfterHeaderInsert(c.req.raw);
      const forcedRetryableErrno = readForcedRetryableErrno(c.req.raw);

      for (const batch of batches) {
        const batchPromises = batch.map((indexedTx) =>
          processSyncPushTransaction({
            dbPool,
            tx: indexedTx.tx,
            txIndex: indexedTx.txIndex,
            inputOutletId: outlet_id,
            authCompanyId: auth.companyId,
            authUserId: auth.userId,
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

      // Process active orders, order updates, and item cancellations
      let orderUpdateResults: OrderUpdateResult[] = [];
      let itemCancellationResults: ItemCancellationResult[] = [];

      if (active_orders && active_orders.length > 0) {
        console.info("POST /sync/push processing active_orders", { correlation_id: correlationId, count: active_orders.length });
        orderUpdateResults = await processActiveOrders({ execute: connection.execute.bind(connection) }, active_orders as ActiveOrder[], correlationId);
        console.info("POST /sync/push active_orders results", { correlation_id: correlationId, results: orderUpdateResults });
      }

      if (order_updates && order_updates.length > 0) {
        console.info("POST /sync/push processing order_updates", { correlation_id: correlationId, count: order_updates.length });
        orderUpdateResults = await processOrderUpdates({ execute: connection.execute.bind(connection) }, order_updates as OrderUpdate[], correlationId);
        console.info("POST /sync/push order_updates results", { correlation_id: correlationId, results: orderUpdateResults });
      }

      if (item_cancellations && item_cancellations.length > 0) {
        console.info("POST /sync/push processing item_cancellations", { correlation_id: correlationId, count: item_cancellations.length });
        itemCancellationResults = await processItemCancellations({ execute: connection.execute.bind(connection) }, item_cancellations as ItemCancellation[], correlationId);
        console.info("POST /sync/push item_cancellations results", { correlation_id: correlationId, results: itemCancellationResults });
      }

      // Log summary
      const okCount = results.filter((r) => r.result === "OK").length;
      const duplicateCount = results.filter((r) => r.result === "DUPLICATE").length;
      const errorCount = results.filter((r) => r.result === "ERROR").length;

      console.info("POST /sync/push completed", {
        correlation_id: correlationId,
        company_id: auth.companyId,
        outlet_id,
        total_transactions: transactions.length,
        ok_count: okCount,
        duplicate_count: duplicateCount,
        error_count: errorCount,
        order_update_results_count: orderUpdateResults.length,
        item_cancellation_results_count: itemCancellationResults.length
      });

      const responsePayload = {
        results,
        ...(orderUpdateResults.length > 0 && { order_update_results: orderUpdateResults }),
        ...(itemCancellationResults.length > 0 && { item_cancellation_results: itemCancellationResults })
      };
      console.info("POST /sync/push response payload", { correlation_id: correlationId, payload: JSON.stringify(responsePayload) });

      return successResponse(responsePayload);
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("POST /sync/push failed", {
      correlation_id: correlationId,
      company_id: auth.companyId,
      error
    });

    if (error instanceof ZodError) {
      return errorResponse("VALIDATION_ERROR", "Invalid request payload", 400);
    }

    return errorResponse(
      "INTERNAL_SERVER_ERROR",
      error instanceof Error ? error.message : "Sync push failed",
      500
    );
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

    const trxAtCanonical = toMysqlDateTimeStrict(tx.trx_at);
    const openedAtCanonical = tx.opened_at ? toMysqlDateTimeStrict(tx.opened_at) : trxAtCanonical;
    const closedAtCanonical = tx.closed_at ? toMysqlDateTimeStrict(tx.closed_at) : trxAtCanonical;
    const payloadSha256 = computePayloadSha256(canonicalizeTransactionForHash(tx));

    // Compute legacy hash variants to handle trx_at format differences (.000Z vs Z)
    const legacyHashVariants: string[] = [];
    for (const trxAtVariant of listLegacyEquivalentTrxAtVariants(tx.trx_at)) {
      // Create a temporary tx with this variant's trx_at
      const txWithVariant = { ...tx, trx_at: trxAtVariant };
      legacyHashVariants.push(computePayloadSha256(canonicalizeTransactionForLegacyHash(txWithVariant)));
    }

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
           SET status = 'AVAILABLE', status_id = 1, updated_at = CURRENT_TIMESTAMP
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

        // The conflicting row may not be visible yet (race: original tx not yet committed).
        // Retry with backoff to give the original transaction time to commit.
        let existingRecord = null;
        for (let retryAttempt = 0; retryAttempt < 10 && !existingRecord; retryAttempt++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          existingRecord = await readExistingIdempotencyRecordByClientTxId(orderDbConnection, tx.company_id, tx.outlet_id, tx.client_tx_id);
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
