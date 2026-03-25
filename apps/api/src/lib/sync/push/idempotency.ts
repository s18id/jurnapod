// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Idempotency
 * 
 * Batch idempotency checking for sync push transactions.
 * These functions have zero HTTP knowledge.
 * 
 * Uses Kysely for type-safe queries where possible.
 * Complex batch inserts preserve raw SQL for performance.
 */

import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { newKyselyConnection } from "@jurnapod/db";
import { syncIdempotencyService, type SyncIdempotencyMetricsCollector, type SyncOperationResult } from "@jurnapod/sync-core";
import { toEpochMs, toMysqlDateTime, toUtcInstant } from "../../date-helpers.js";
import type {
  ExistingIdempotencyRecord,
  SyncPushTransactionPayload,
  SyncPushResultItem
} from "./types.js";

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

function toMysqlDateTimeStrict(value: string, fieldName: string = "datetime"): string {
  try {
    return toMysqlDateTime(value);
  } catch {
    throw new Error(`Invalid ${fieldName}`);
  }
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
    opened_at: tx.opened_at ? toMysqlDateTimeStrict(tx.opened_at, "opened_at") : null,
    closed_at: tx.closed_at ? toMysqlDateTimeStrict(tx.closed_at, "closed_at") : null,
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

/**
 * Read existing idempotency record by client_tx_id
 */
export async function readExistingIdempotencyRecordByClientTxId(
  orderDbConnection: PoolConnection,
  companyId: number,
  outletId: number,
  clientTxId: string
): Promise<ExistingIdempotencyRecord | null> {
  const kysely = newKyselyConnection(orderDbConnection);
  
  const row = await kysely
    .selectFrom('pos_transactions')
    .where('company_id', '=', companyId)
    .where('outlet_id', '=', outletId)
    .where('client_tx_id', '=', clientTxId)
    .select(['id', 'payload_sha256', 'payload_hash_version'])
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return {
    posTransactionId: row.id,
    payloadSha256: row.payload_sha256 ?? null,
    payloadHashVersion: row.payload_hash_version ?? null
  };
}

/**
 * Batch read existing idempotency records by client_tx_ids
 * 
 * Uses Kysely for type-safe batch query.
 */
export async function batchReadExistingIdempotencyRecords(
  orderDbConnection: PoolConnection,
  companyId: number,
  outletId: number,
  clientTxIds: string[]
): Promise<Map<string, ExistingIdempotencyRecord>> {
  if (clientTxIds.length === 0) {
    return new Map();
  }

  const kysely = newKyselyConnection(orderDbConnection);

  const rows = await kysely
    .selectFrom('pos_transactions')
    .where('company_id', '=', companyId)
    .where('outlet_id', '=', outletId)
    .where('client_tx_id', 'in', clientTxIds)
    .select(['id', 'client_tx_id', 'payload_sha256', 'payload_hash_version'])
    .execute();

  const result = new Map<string, ExistingIdempotencyRecord>();
  for (const row of rows) {
    result.set(row.client_tx_id, {
      posTransactionId: row.id,
      payloadSha256: row.payload_sha256 ?? null,
      payloadHashVersion: row.payload_hash_version ?? null
    });
  }

  return result;
}

/**
 * Result of batch idempotency check
 */
export type BatchIdempotencyCheckResult = {
  /** Transactions that are new and need processing */
  newTransactions: Array<{
    tx: SyncPushTransactionPayload;
    txIndex: number;
  }>;
  /** Cached results for duplicate transactions */
  cachedResults: SyncPushResultItem[];
  /** Map of client_tx_id to existing record */
  existingRecords: Map<string, ExistingIdempotencyRecord>;
};

export async function resolveBatchIdempotencyCheck(params: {
  orderDbConnection: PoolConnection;
  companyId: number;
  outletId: number;
  transactions: SyncPushTransactionPayload[];
  metricsCollector: SyncIdempotencyMetricsCollector;
}): Promise<BatchIdempotencyCheckResult> {
  const { orderDbConnection, companyId, outletId, transactions, metricsCollector } = params;
  const clientTxIds = Array.from(new Set(transactions.map((tx) => tx.client_tx_id)));
  const existingRecords = await batchReadExistingIdempotencyRecords(
    orderDbConnection,
    companyId,
    outletId,
    clientTxIds
  );

  const newTransactions: BatchIdempotencyCheckResult["newTransactions"] = [];
  const cachedResults: SyncPushResultItem[] = [];
  const metrics: SyncOperationResult[] = [];

  transactions.forEach((tx, txIndex) => {
    const existingRecord = existingRecords.get(tx.client_tx_id);
    if (!existingRecord) {
      newTransactions.push({ tx, txIndex });
      return;
    }

    const payloadSha256 = computePayloadSha256(canonicalizeTransactionForHash(tx));
    const legacyHashVariants = listLegacyEquivalentTrxAtVariants(tx.trx_at).map((trxAtVariant) =>
      computePayloadSha256(canonicalizeTransactionForLegacyHash({ ...tx, trx_at: trxAtVariant }))
    );

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
      cachedResults.push({ client_tx_id: tx.client_tx_id, result: "DUPLICATE" });
      metrics.push({
        client_tx_id: tx.client_tx_id,
        result: "DUPLICATE",
        latency_ms: 0,
        error_classification: idempotencyResult.classification,
        is_retry: false
      });
      return;
    }

    cachedResults.push({
      client_tx_id: tx.client_tx_id,
      result: "ERROR",
      message: "IDEMPOTENCY_CONFLICT"
    });
    metrics.push({
      client_tx_id: tx.client_tx_id,
      result: "ERROR",
      latency_ms: 0,
      error_classification: idempotencyResult.classification ?? "CONFLICT",
      is_retry: false
    });
  });

  if (metrics.length > 0) {
    metricsCollector.recordResults(metrics);
  }

  return {
    newTransactions,
    cachedResults,
    existingRecords
  };
}
