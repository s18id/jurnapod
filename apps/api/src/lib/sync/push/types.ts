// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Types
 * 
 * Shared types for sync push business logic.
 * These types have zero HTTP knowledge - they are plain data structures.
 */

import type { TaxRateRecord } from "../../../lib/taxes.js";
import type { StockDeductResult } from "../../../services/stock.js";
import type { CogsPostingResult } from "../../../lib/cogs-posting.js";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import type { PoolConnection, Pool } from "mysql2/promise";
import type { Kysely } from "kysely";
import type { DB } from "@jurnapod/db";
import type { SyncIdempotencyMetricsCollector } from "@jurnapod/sync-core";

// ============================================================================
// Constants
// ============================================================================

export const MYSQL_DUPLICATE_ERROR_CODE = 1062;
export const MYSQL_LOCK_WAIT_TIMEOUT_ERROR_CODE = 1205;
export const MYSQL_DEADLOCK_ERROR_CODE = 1213;
export const POS_TRANSACTIONS_CLIENT_TX_UNIQUE_KEY = "uq_pos_transactions_outlet_client_tx";
export const POS_SALE_DOC_TYPE = "POS_SALE";
export const SYNC_PUSH_ACCEPTED_AUDIT_ACTION = "SYNC_PUSH_ACCEPTED";
export const SYNC_PUSH_DUPLICATE_AUDIT_ACTION = "SYNC_PUSH_DUPLICATE";
export const SYNC_PUSH_POSTING_HOOK_FAIL_AUDIT_ACTION = "SYNC_PUSH_POSTING_HOOK_FAIL";
export const IDEMPOTENCY_CONFLICT_MESSAGE = "IDEMPOTENCY_CONFLICT";
export const RETRYABLE_DB_LOCK_TIMEOUT_MESSAGE = "RETRYABLE_DB_LOCK_TIMEOUT";
export const RETRYABLE_DB_DEADLOCK_MESSAGE = "RETRYABLE_DB_DEADLOCK";
export const CASHIER_USER_ID_MISMATCH_MESSAGE = "cashier_user_id mismatch";
export const DEFAULT_SYNC_PUSH_CONCURRENCY = 3;
export const MAX_SYNC_PUSH_CONCURRENCY = 5;
export const PAYLOAD_HASH_VERSION_CANONICAL_TRX_AT = 2;

// ============================================================================
// Error Types
// ============================================================================

export type MysqlError = {
  errno?: number;
  code?: string;
  message?: string;
  sqlMessage?: string;
};

export function isMysqlError(error: unknown): error is MysqlError {
  return typeof error === "object" && error !== null && "errno" in error;
}

export function isRetryableMysqlError(error: unknown): error is MysqlError {
  return (
    isMysqlError(error) &&
    (error.errno === MYSQL_LOCK_WAIT_TIMEOUT_ERROR_CODE || error.errno === MYSQL_DEADLOCK_ERROR_CODE)
  );
}

export function isClientTxIdDuplicateError(error: unknown): boolean {
  if (!isMysqlError(error) || error.errno !== MYSQL_DUPLICATE_ERROR_CODE) {
    return false;
  }
  return readDuplicateKeyName(error) === POS_TRANSACTIONS_CLIENT_TX_UNIQUE_KEY;
}

export function readDuplicateKeyName(error: MysqlError): string | null {
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

export function toRetryableDbErrorMessage(error: MysqlError): string {
  if (error.errno === MYSQL_LOCK_WAIT_TIMEOUT_ERROR_CODE) {
    return RETRYABLE_DB_LOCK_TIMEOUT_MESSAGE;
  }
  return RETRYABLE_DB_DEADLOCK_MESSAGE;
}

// ============================================================================
// Result Types
// ============================================================================

export type SyncPushResultCode = "OK" | "DUPLICATE" | "ERROR";

export type IdempotencyReplayOutcome =
  | { client_tx_id: string; result: "DUPLICATE" }
  | { client_tx_id: string; result: "ERROR"; message: string };

export type SyncPushResultItem = {
  client_tx_id: string;
  result: SyncPushResultCode;
  message?: string;
};

export function toErrorResult(clientTxId: string, message: string): SyncPushResultItem {
  return {
    client_tx_id: clientTxId,
    result: "ERROR",
    message
  };
}

// ============================================================================
// Context Types
// ============================================================================

export type SyncPushTaxContext = {
  defaultTaxRates: TaxRateRecord[];
  taxRateById: Map<number, TaxRateRecord>;
};

export type AcceptedSyncPushContext = {
  correlationId: string;
  companyId: number;
  outletId: number;
  userId: number;
  clientTxId: string;
  status: "COMPLETED" | "VOID" | "REFUND";
  trxAt: string;
  posTransactionId: number;
};

// ============================================================================
// Transaction Payload Types
// ============================================================================

export type SyncPushTransactionPayload = {
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

export type ExistingIdempotencyRecord = {
  posTransactionId: number;
  payloadSha256: string | null;
  payloadHashVersion: number | null;
};

export type LegacyComparablePayload = {
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

// ============================================================================
// Order Sync Types
// ============================================================================

export type OrderUpdateResult = {
  update_id: string;
  result: "OK" | "DUPLICATE" | "ERROR";
  message?: string;
};

export type ItemCancellationResult = {
  cancellation_id: string;
  result: "OK" | "DUPLICATE" | "ERROR";
  message?: string;
};

export type ActiveOrder = {
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

export type OrderUpdate = {
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
  created_at?: string;
};

export type ItemCancellation = {
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
// Process Transaction Types
// ============================================================================

export type ProcessTransactionParams = {
  dbPool: Pool;
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

export type QueryExecutor = {
  execute: PoolConnection["execute"];
};

// ============================================================================
// Orchestrator Types
// ============================================================================

export type OrchestrateSyncPushParams = {
  dbPool: Pool;
  transactions: SyncPushTransactionPayload[];
  active_orders?: ActiveOrder[];
  order_updates?: OrderUpdate[];
  item_cancellations?: ItemCancellation[];
  inputOutletId: number;
  authCompanyId: number;
  authUserId: number;
  correlationId: string;
  taxContext: SyncPushTaxContext;
  injectFailureAfterHeaderInsert: boolean;
  forcedRetryableErrno: number | null;
  metricsCollector: SyncIdempotencyMetricsCollector;
  /** Maximum number of concurrent transaction batches. */
  maxConcurrency: number;
};

export type OrchestrateSyncPushResult = {
  results: SyncPushResultItem[];
  orderUpdateResults: OrderUpdateResult[];
  itemCancellationResults: ItemCancellationResult[];
};
