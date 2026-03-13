// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { type ResultSetHeader, type RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { createHash } from "node:crypto";
import { PosTransactionSchema, SyncPushPayloadSchema, SyncPushRequestSchema, type SyncPushResultItem } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { getRequestCorrelationId } from "../../../../src/lib/correlation-id";
import { getDbPool } from "../../../../src/lib/db";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import {
  calculateTaxLines,
  listCompanyDefaultTaxRates,
  listCompanyTaxRates,
  type TaxRateRecord
} from "../../../../src/lib/taxes";
import {
  SyncPushPostingHookError,
  type SyncPushPostingHookResult,
  runSyncPushPostingHook
} from "../../../../src/lib/sync-push-posting";

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

type PostingAuditMetadata = {
  postingMode: string | null;
  journalBatchId: number | null;
  balanceOk: boolean | null;
  reason: string | null;
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
  const rawMessage = (typeof error.sqlMessage === "string" && error.sqlMessage)
    || (typeof error.message === "string" && error.message)
    || "";
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

function canonicalizeTransactionForHash(tx: {
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
}): string {
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

function canonicalizeTransactionForLegacyHash(tx: {
  client_tx_id: string;
  company_id: number;
  outlet_id: number;
  cashier_user_id: number;
  status: "COMPLETED" | "VOID" | "REFUND";
  trx_at: string;
  items: Array<{
    item_id: number;
    qty: number;
    price_snapshot: number;
    name_snapshot: string;
  }>;
  payments: Array<{
    method: string;
    amount: number;
  }>;
}, trxAtOverride?: string): string {
  return JSON.stringify({
    client_tx_id: tx.client_tx_id,
    company_id: tx.company_id,
    outlet_id: tx.outlet_id,
    cashier_user_id: tx.cashier_user_id,
    status: tx.status,
    trx_at: trxAtOverride ?? tx.trx_at,
    items: tx.items.map((item) => ({
      item_id: item.item_id,
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
    const candidateHash = computePayloadSha256(canonicalizeTransactionForLegacyHash(incomingTx, trxAtVariant));
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

async function resolveIdempotencyReplayOutcome(
  orderDbConnection: PoolConnection,
  existingRecord: ExistingIdempotencyRecord,
  tx: SyncPushTransactionPayload,
  payloadSha256: string,
  payloadSha256Legacy: string,
  authUserId: number,
  correlationId: string
): Promise<IdempotencyReplayOutcome> {
  const existingHashVersion = existingRecord.payloadHashVersion ?? 1;
  const normalizedExistingHash = existingRecord.payloadSha256?.trim() ?? "";

  if (normalizedExistingHash.length === 0) {
    const legacyReplayMatch = await doesLegacyPayloadReplayMatch(orderDbConnection, existingRecord.posTransactionId, tx);
    if (!legacyReplayMatch) {
      return {
        client_tx_id: tx.client_tx_id,
        result: "ERROR",
        message: IDEMPOTENCY_CONFLICT_MESSAGE
      };
    }

    await recordSyncPushDuplicateReplayAudit(orderDbConnection, {
      authUserId,
      correlationId,
      companyId: tx.company_id,
      outletId: tx.outlet_id,
      clientTxId: tx.client_tx_id,
      posTransactionId: existingRecord.posTransactionId
    });
    return { client_tx_id: tx.client_tx_id, result: "DUPLICATE" };
  }

  if (normalizedExistingHash === payloadSha256) {
    await recordSyncPushDuplicateReplayAudit(orderDbConnection, {
      authUserId,
      correlationId,
      companyId: tx.company_id,
      outletId: tx.outlet_id,
      clientTxId: tx.client_tx_id,
      posTransactionId: existingRecord.posTransactionId
    });
    return { client_tx_id: tx.client_tx_id, result: "DUPLICATE" };
  }

  if (existingHashVersion <= 1 && normalizedExistingHash === payloadSha256Legacy) {
    await recordSyncPushDuplicateReplayAudit(orderDbConnection, {
      authUserId,
      correlationId,
      companyId: tx.company_id,
      outletId: tx.outlet_id,
      clientTxId: tx.client_tx_id,
      posTransactionId: existingRecord.posTransactionId
    });
    return { client_tx_id: tx.client_tx_id, result: "DUPLICATE" };
  }

  if (existingHashVersion <= 1) {
    const legacyReplayMatch = await doesLegacyV1HashMismatchReplayMatch(
      orderDbConnection,
      existingRecord.posTransactionId,
      normalizedExistingHash,
      tx
    );
    if (legacyReplayMatch) {
      await recordSyncPushDuplicateReplayAudit(orderDbConnection, {
        authUserId,
        correlationId,
        companyId: tx.company_id,
        outletId: tx.outlet_id,
        clientTxId: tx.client_tx_id,
        posTransactionId: existingRecord.posTransactionId
      });
      return { client_tx_id: tx.client_tx_id, result: "DUPLICATE" };
    }
  }

  return {
    client_tx_id: tx.client_tx_id,
    result: "ERROR",
    message: IDEMPOTENCY_CONFLICT_MESSAGE
  };
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

async function processSyncPushTransaction(params: ProcessTransactionParams): Promise<SyncPushResultItem> {
  const { dbPool, tx, txIndex, inputOutletId, authCompanyId, authUserId, correlationId, injectFailureAfterHeaderInsert, forcedRetryableErrno, taxContext } = params;
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
    if (tx.company_id !== authCompanyId) {
      const result = toErrorResult(tx.client_tx_id, "company_id mismatch");
      logTransactionResult("ERROR");
      return result;
    }

    if (tx.outlet_id !== inputOutletId) {
      const result = toErrorResult(tx.client_tx_id, "outlet_id mismatch");
      logTransactionResult("ERROR");
      return result;
    }

    if ((tx.service_type ?? "TAKEAWAY") === "DINE_IN" && !tx.table_id) {
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

    const existingRecord = await readExistingIdempotencyRecordByClientTxId(orderDbConnection, tx.company_id, tx.client_tx_id);
    if (existingRecord) {
      const outcome = await resolveIdempotencyReplayOutcome(
        orderDbConnection,
        existingRecord,
        tx,
        payloadSha256,
        payloadSha256Legacy,
        authUserId,
        correlationId
      );
      if (outcome.result === "DUPLICATE") {
        logTransactionResult("DUPLICATE");
      } else {
        logTransactionResult("ERROR");
      }
      return outcome;
    }

    const cashierInCompany = await isCashierInCompany(orderDbConnection, tx.company_id, tx.cashier_user_id);
    if (!cashierInCompany) {
      const result = toErrorResult(tx.client_tx_id, CASHIER_USER_ID_MISMATCH_MESSAGE);
      logTransactionResult("ERROR");
      return result;
    }

    try {
      await orderDbConnection.beginTransaction();

      if (forcedRetryableErrno !== null) {
        throw {
          errno: forcedRetryableErrno
        } satisfies MysqlError;
      }

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
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          payloadSha256,
          PAYLOAD_HASH_VERSION_CANONICAL_TRX_AT
        ]
      );

      const posTransactionId = Number(insertResult.insertId);

      if (injectFailureAfterHeaderInsert) {
        throw new Error("SYNC_PUSH_TEST_FAIL_AFTER_HEADER_INSERT");
      }

      if (tx.items.length > 0) {
        const itemPlaceholders = tx.items.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const itemValues = (tx.items as SyncPushTransactionPayload["items"]).flatMap((item, index) => [
          posTransactionId,
          tx.company_id,
          tx.outlet_id,
          index + 1,
          item.item_id,
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
             qty,
             price_snapshot,
             name_snapshot
           ) VALUES ${itemPlaceholders}`,
          itemValues
        );
      }

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

      if ((tx.service_type ?? "TAKEAWAY") === "DINE_IN" && tx.table_id) {
        await orderDbConnection.execute(
          `UPDATE outlet_tables
           SET status = 'AVAILABLE', updated_at = CURRENT_TIMESTAMP
           WHERE company_id = ? AND outlet_id = ? AND id = ?`,
          [tx.company_id, tx.outlet_id, tx.table_id]
        );
      }

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

      logTransactionResult("OK");
      return {
        client_tx_id: tx.client_tx_id,
        result: "OK"
      };
    } catch (error) {
      if (isClientTxIdDuplicateError(error)) {
        await rollbackQuietly(orderDbConnection);

        const existingRecord = await readExistingIdempotencyRecordByClientTxId(orderDbConnection, tx.company_id, tx.client_tx_id);
        if (!existingRecord) {
          const result = toErrorResult(tx.client_tx_id, RETRYABLE_DB_LOCK_TIMEOUT_MESSAGE);
          logTransactionResult("ERROR");
          return result;
        }

        const outcome = await resolveIdempotencyReplayOutcome(
          orderDbConnection,
          existingRecord,
          tx,
          payloadSha256,
          payloadSha256Legacy,
          authUserId,
          correlationId
        );
        if (outcome.result === "DUPLICATE") {
          logTransactionResult("DUPLICATE");
        } else {
          logTransactionResult("ERROR");
        }
        return outcome;
      }

      if (isRetryableMysqlError(error)) {
        await rollbackQuietly(orderDbConnection);
        const result = toErrorResult(tx.client_tx_id, toRetryableDbErrorMessage(error));
        logTransactionResult("ERROR");
        return result;
      }

      if (isMysqlError(error) && error.errno === 1452) {
        const sqlMessage = error.sqlMessage ?? "";
        if (sqlMessage.includes("fk_pos_transactions_cashier_user") || sqlMessage.includes("cashier_user_id")) {
          await rollbackQuietly(orderDbConnection);
          const result = toErrorResult(tx.client_tx_id, CASHIER_USER_ID_MISMATCH_MESSAGE);
          logTransactionResult("ERROR");
          return result;
        }
      }

      await rollbackQuietly(orderDbConnection);

      if (
        acceptedContextForFailureAudit
        && error instanceof SyncPushPostingHookError
        && error.mode !== "shadow"
      ) {
        await recordSyncPushPostingHookFailure(dbPool, acceptedContextForFailureAudit, error);
      }

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

async function rollbackQuietly(orderDbConnection: PoolConnection): Promise<void> {
  try {
    await orderDbConnection.rollback();
  } catch {
    // Ignore rollback errors to preserve root cause handling.
  }
}

async function readExistingIdempotencyRecordByClientTxId(
  orderDbConnection: PoolConnection,
  companyId: number,
  clientTxId: string
): Promise<ExistingIdempotencyRecord | null> {
  const [rows] = await orderDbConnection.execute(
    `SELECT id, payload_sha256, payload_hash_version
     FROM pos_transactions
     WHERE company_id = ? AND client_tx_id = ?
     LIMIT 1`,
    [companyId, clientTxId]
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
    `SELECT item_id, qty, price_snapshot, name_snapshot
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
    items: (itemRows as Array<{ item_id: number; qty: number; price_snapshot: number; name_snapshot: string }>).map((row) => ({
      item_id: Number(row.item_id),
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

function withCorrelationHeaders(correlationId: string): HeadersInit {
  return {
    "x-correlation-id": correlationId
  };
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
       AND result = 'SUCCESS'
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

const syncPushOutletGuardSchema = SyncPushRequestSchema.pick({
  outlet_id: true
});

const syncPushTransactionSchemaWithOffset = PosTransactionSchema.extend({
  trx_at: z.string().datetime({ offset: true })
});

const syncPushRequestSchemaWithOffset = SyncPushRequestSchema.extend({
  transactions: z.array(syncPushTransactionSchemaWithOffset).default([])
}).refine((value) => value.transactions.length > 0 || (value.order_updates?.length ?? 0) > 0, {
  message: "At least one transaction or order_update is required"
});

const invalidJsonGuardError = new ZodError([
  {
    code: z.ZodIssueCode.custom,
    message: "Invalid request",
    path: []
  }
]);

async function parseOutletIdForGuard(request: Request): Promise<number> {
  try {
    const payload = await request.clone().json();
    return syncPushOutletGuardSchema.parse(payload).outlet_id;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw invalidJsonGuardError;
    }

    throw error;
  }
}

export const POST = withAuth(
  async (request, auth) => {
    const correlationId = getRequestCorrelationId(request);
    const injectFailureAfterHeaderInsert = shouldInjectFailureAfterHeaderInsert(request);
    const forcedRetryableErrno = readForcedRetryableErrno(request);

    try {
      const payload = await request.json();
      const input = syncPushRequestSchemaWithOffset.parse(payload);
      const dbPool = getDbPool();
      const results: SyncPushResultItem[] = [];
      const orderUpdateResults: Array<{
        update_id: string;
        result: "OK" | "DUPLICATE" | "ERROR";
        message?: string;
      }> = [];
      const itemCancellationResults: Array<{
        cancellation_id: string;
        result: "OK" | "DUPLICATE" | "ERROR";
        message?: string;
      }> = [];

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
        const batches = buildTransactionBatches(input.transactions as SyncPushTransactionPayload[], maxConcurrency);

        const resultsByIndex: Map<number, SyncPushResultItem> = new Map();

        for (const batch of batches) {
          const batchResults = await Promise.all(
            batch.map((indexedTx) =>
              processSyncPushTransaction({
                dbPool,
                tx: indexedTx.tx,
                txIndex: indexedTx.txIndex,
                inputOutletId: input.outlet_id,
                authCompanyId: auth.companyId,
                authUserId: auth.userId,
                correlationId,
                injectFailureAfterHeaderInsert,
                forcedRetryableErrno,
                taxContext
              })
            )
          );

          for (const result of batchResults) {
            const originalIndex = batch.find((idxTx) => idxTx.tx.client_tx_id === result.client_tx_id)?.txIndex;
            if (originalIndex !== undefined) {
              resultsByIndex.set(originalIndex, result);
            }
          }
        }

        for (let i = 0; i < input.transactions.length; i++) {
          const result = resultsByIndex.get(i);
          if (result) {
            results.push(result);
          } else {
            results.push(toErrorResult(input.transactions[i].client_tx_id, "processing failed"));
          }
        }
      } finally {
        taxDbConnection.release();
      }

      const orderDbConnection = await dbPool.getConnection();
      try {
        for (const update of input.order_updates ?? []) {
          if (update.company_id !== auth.companyId) {
            orderUpdateResults.push({
              update_id: update.update_id,
              result: "ERROR",
              message: "company_id mismatch"
            });
            continue;
          }
          if (update.outlet_id !== input.outlet_id) {
            orderUpdateResults.push({
              update_id: update.update_id,
              result: "ERROR",
              message: "outlet_id mismatch"
            });
            continue;
          }

          const snapshot = (input.active_orders ?? []).find((row) => row.order_id === update.order_id);
          if (!snapshot) {
            orderUpdateResults.push({
              update_id: update.update_id,
              result: "ERROR",
              message: "active_order snapshot missing"
            });
            continue;
          }

          const cancellation = (input.item_cancellations ?? []).find((row) => row.update_id === update.update_id);
          if (cancellation) {
            if (cancellation.company_id !== update.company_id || cancellation.outlet_id !== update.outlet_id) {
              orderUpdateResults.push({
                update_id: update.update_id,
                result: "ERROR",
                message: "item_cancellation scope mismatch"
              });
              itemCancellationResults.push({
                cancellation_id: cancellation.cancellation_id,
                result: "ERROR",
                message: "item_cancellation scope mismatch"
              });
              continue;
            }
            if (cancellation.order_id !== update.order_id) {
              orderUpdateResults.push({
                update_id: update.update_id,
                result: "ERROR",
                message: "item_cancellation order_id mismatch"
              });
              itemCancellationResults.push({
                cancellation_id: cancellation.cancellation_id,
                result: "ERROR",
                message: "item_cancellation order_id mismatch"
              });
              continue;
            }
          }

          try {
            await orderDbConnection.beginTransaction();

            let previousTableId: number | null = null;
            let previousServiceType: "TAKEAWAY" | "DINE_IN" | null = null;

            const [previousRows] = await orderDbConnection.execute<RowDataPacket[]>(
              `SELECT table_id, service_type
               FROM pos_order_snapshots
               WHERE order_id = ? AND company_id = ? AND outlet_id = ?
               LIMIT 1`,
              [snapshot.order_id, snapshot.company_id, snapshot.outlet_id]
            );
            const previousSnapshot = previousRows[0] as
              | {
                  table_id: number | null;
                  service_type: "TAKEAWAY" | "DINE_IN";
                }
              | undefined;

            if (previousSnapshot) {
              previousTableId = previousSnapshot.table_id;
              previousServiceType = previousSnapshot.service_type;
            }

            await orderDbConnection.execute(
              `INSERT INTO pos_order_snapshots (
                 order_id,
                 company_id,
                 outlet_id,
                 service_type,
                 source_flow,
                 settlement_flow,
                 table_id,
                 reservation_id,
                 guest_count,
                 is_finalized,
                 order_status,
                 order_state,
                 paid_amount,
                 opened_at,
                 closed_at,
                 notes,
                 updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                 opened_at = VALUES(opened_at),
                 closed_at = VALUES(closed_at),
                 notes = VALUES(notes),
                 updated_at = VALUES(updated_at)`,
              [
                snapshot.order_id,
                snapshot.company_id,
                snapshot.outlet_id,
                snapshot.service_type,
                snapshot.source_flow ?? "WALK_IN",
                snapshot.settlement_flow ?? (snapshot.service_type === "DINE_IN" ? "DEFERRED" : "IMMEDIATE"),
                snapshot.table_id,
                snapshot.reservation_id,
                snapshot.guest_count,
                snapshot.is_finalized ? 1 : 0,
                snapshot.order_status,
                snapshot.order_state,
                snapshot.paid_amount,
                toMysqlDateTime(snapshot.opened_at),
                snapshot.closed_at ? toMysqlDateTime(snapshot.closed_at) : null,
                snapshot.notes,
                toMysqlDateTime(snapshot.updated_at)
              ]
            );

            const currentTableId = snapshot.table_id ?? null;
            const shouldReleasePrevious =
              previousServiceType === "DINE_IN"
              && previousTableId !== null
              && (
                snapshot.order_state === "CLOSED"
                || snapshot.service_type !== "DINE_IN"
                || currentTableId !== previousTableId
              );
            const shouldOccupyCurrent =
              snapshot.order_state === "OPEN"
              && snapshot.service_type === "DINE_IN"
              && currentTableId !== null;

            const releaseTable = async (tableId: number) => {
              const [tableRows] = await orderDbConnection.execute<RowDataPacket[]>(
                `SELECT status FROM outlet_tables
                 WHERE company_id = ? AND outlet_id = ? AND id = ?
                 LIMIT 1`,
                [snapshot.company_id, snapshot.outlet_id, tableId]
              );
              const tableStatus = (tableRows[0] as { status?: string } | undefined)?.status;
              if (tableStatus === "UNAVAILABLE") {
                return;
              }

              const [reservationRows] = await orderDbConnection.execute<RowDataPacket[]>(
                `SELECT id FROM reservations
                 WHERE company_id = ? AND outlet_id = ? AND table_id = ?
                   AND status IN ('BOOKED', 'CONFIRMED', 'ARRIVED')
                 LIMIT 1`,
                [snapshot.company_id, snapshot.outlet_id, tableId]
              );
              const nextStatus = reservationRows.length > 0 ? "RESERVED" : "AVAILABLE";
              await orderDbConnection.execute(
                `UPDATE outlet_tables
                 SET status = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE company_id = ? AND outlet_id = ? AND id = ?`,
                [nextStatus, snapshot.company_id, snapshot.outlet_id, tableId]
              );
            };

            const occupyTable = async (tableId: number) => {
              await orderDbConnection.execute(
                `UPDATE outlet_tables
                 SET status = 'OCCUPIED', updated_at = CURRENT_TIMESTAMP
                 WHERE company_id = ? AND outlet_id = ? AND id = ?`,
                [snapshot.company_id, snapshot.outlet_id, tableId]
              );
            };

            if (shouldReleasePrevious && previousTableId !== null) {
              await releaseTable(previousTableId);
            }

            if (shouldOccupyCurrent && currentTableId !== null) {
              await occupyTable(currentTableId);
            }

            await orderDbConnection.execute(
              `DELETE FROM pos_order_snapshot_lines
               WHERE order_id = ? AND company_id = ? AND outlet_id = ?`,
              [snapshot.order_id, snapshot.company_id, snapshot.outlet_id]
            );

            if (snapshot.lines.length > 0) {
              const placeholders = snapshot.lines.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
              const values = snapshot.lines.flatMap((line) => [
                snapshot.order_id,
                snapshot.company_id,
                snapshot.outlet_id,
                line.item_id,
                line.sku_snapshot,
                line.name_snapshot,
                line.item_type_snapshot,
                line.unit_price_snapshot,
                line.qty,
                line.discount_amount,
                toMysqlDateTime(line.updated_at)
              ]);
              await orderDbConnection.execute(
                `INSERT INTO pos_order_snapshot_lines (
                   order_id,
                   company_id,
                   outlet_id,
                   item_id,
                   sku_snapshot,
                   name_snapshot,
                   item_type_snapshot,
                   unit_price_snapshot,
                   qty,
                   discount_amount,
                   updated_at
                 ) VALUES ${placeholders}`,
                values
              );
            }

            await orderDbConnection.execute(
              `INSERT INTO pos_order_updates (
                 update_id,
                 order_id,
                 company_id,
                 outlet_id,
                 base_order_updated_at,
                 event_type,
                 delta_json,
                 actor_user_id,
                 device_id,
                 event_at,
                 created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                update.update_id,
                update.order_id,
                update.company_id,
                update.outlet_id,
                update.base_order_updated_at ? toMysqlDateTime(update.base_order_updated_at) : null,
                update.event_type,
                update.delta_json,
                update.actor_user_id,
                update.device_id,
                toMysqlDateTime(update.event_at),
                toMysqlDateTime(update.created_at)
              ]
            );

            if (cancellation) {
              await orderDbConnection.execute(
                `INSERT INTO pos_item_cancellations (
                   cancellation_id,
                   update_id,
                   order_id,
                   company_id,
                   outlet_id,
                   item_id,
                   cancelled_quantity,
                   reason,
                   cancelled_by_user_id,
                   cancelled_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
                [
                  cancellation.cancellation_id,
                  update.update_id,
                  cancellation.order_id,
                  cancellation.company_id,
                  cancellation.outlet_id,
                  cancellation.item_id,
                  cancellation.cancelled_quantity,
                  cancellation.reason,
                  cancellation.cancelled_by_user_id,
                  toMysqlDateTime(cancellation.cancelled_at)
                ]
              );
            }

            await orderDbConnection.commit();
            orderUpdateResults.push({
              update_id: update.update_id,
              result: "OK"
            });
            if (cancellation) {
              itemCancellationResults.push({
                cancellation_id: cancellation.cancellation_id,
                result: "OK"
              });
            }
          } catch (error) {
            await rollbackQuietly(orderDbConnection);
            if (isMysqlError(error) && error.errno === MYSQL_DUPLICATE_ERROR_CODE) {
              orderUpdateResults.push({
                update_id: update.update_id,
                result: "DUPLICATE"
              });
              if (cancellation) {
                itemCancellationResults.push({
                  cancellation_id: cancellation.cancellation_id,
                  result: "DUPLICATE"
                });
              }
            } else {
              orderUpdateResults.push({
                update_id: update.update_id,
                result: "ERROR",
                message: "order_update insert failed"
              });
              if (cancellation) {
                itemCancellationResults.push({
                  cancellation_id: cancellation.cancellation_id,
                  result: "ERROR",
                  message: "item_cancellation insert failed"
                });
              }
            }
          }
        }
      } finally {
        orderDbConnection.release();
      }

      const response = SyncPushPayloadSchema.parse({
        results,
        order_update_results: orderUpdateResults,
        item_cancellation_results: itemCancellationResults
      });

      return successResponse(response, 200, withCorrelationHeaders(correlationId));
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse(
          "INVALID_REQUEST",
          "Invalid request",
          400,
          withCorrelationHeaders(correlationId)
        );
      }

      console.error("POST /sync/push failed", {
        correlation_id: correlationId,
        error
      });
      return errorResponse(
        "INTERNAL_SERVER_ERROR",
        "Sync push failed",
        500,
        withCorrelationHeaders(correlationId)
      );
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      outletId: (request) => parseOutletIdForGuard(request)
    })
  ]
);
