import { type ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { createHash } from "node:crypto";
import { SyncPushRequestSchema, SyncPushResponseSchema, type SyncPushResultItem } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireOutletAccess, requireRole, withAuth } from "../../../../src/lib/auth-guard";
import { getRequestCorrelationId } from "../../../../src/lib/correlation-id";
import { getDbPool } from "../../../../src/lib/db";
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
const TEST_FAIL_AFTER_HEADER_INSERT_HEADER = "x-jp-sync-push-fail-after-header";
const TEST_FORCE_DB_ERRNO_HEADER = "x-jp-sync-push-force-db-errno";
const SYNC_PUSH_TEST_HOOKS_ENV = "JP_SYNC_PUSH_TEST_HOOKS";
const PAYLOAD_HASH_VERSION_CANONICAL_TRX_AT = 2;

const INVALID_REQUEST_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Sync push failed"
  }
};

type MysqlError = {
  errno?: number;
  code?: string;
  message?: string;
  sqlMessage?: string;
};

type SyncPushResultCode = "OK" | "DUPLICATE" | "ERROR";

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
}): string {
  return JSON.stringify({
    client_tx_id: tx.client_tx_id,
    company_id: tx.company_id,
    outlet_id: tx.outlet_id,
    cashier_user_id: tx.cashier_user_id,
    status: tx.status,
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
    }))
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

async function rollbackQuietly(dbConnection: PoolConnection): Promise<void> {
  try {
    await dbConnection.rollback();
  } catch {
    // Ignore rollback errors to preserve root cause handling.
  }
}

async function readExistingIdempotencyRecordByClientTxId(
  dbConnection: PoolConnection,
  clientTxId: string
): Promise<ExistingIdempotencyRecord | null> {
  const [rows] = await dbConnection.execute(
    `SELECT id, payload_sha256, payload_hash_version
     FROM pos_transactions
     WHERE client_tx_id = ?
     LIMIT 1`,
    [clientTxId]
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
  dbConnection: PoolConnection,
  posTransactionId: number
): Promise<LegacyComparablePayload | null> {
  const [headerRows] = await dbConnection.execute(
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

  const [itemRows] = await dbConnection.execute(
    `SELECT item_id, qty, price_snapshot, name_snapshot
     FROM pos_transaction_items
     WHERE pos_transaction_id = ?
     ORDER BY line_no ASC`,
    [posTransactionId]
  );

  const [paymentRows] = await dbConnection.execute(
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
  dbConnection: PoolConnection,
  posTransactionId: number,
  incomingTx: SyncPushTransactionPayload
): Promise<boolean> {
  const existingPayload = await readLegacyComparablePayloadByPosTransactionId(dbConnection, posTransactionId);
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
  dbConnection: PoolConnection,
  posTransactionId: number,
  existingHash: string,
  incomingTx: SyncPushTransactionPayload
): Promise<boolean> {
  if (!hasLegacyEquivalentHashMatch(existingHash, incomingTx)) {
    return false;
  }

  return doesLegacyPayloadReplayMatch(dbConnection, posTransactionId, incomingTx);
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
       ip_address,
       payload_json
     ) VALUES (?, ?, ?, ?, 'SUCCESS', NULL, ?)`,
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
  clientTxId: string
): Promise<PostingAuditMetadata> {
  const [rows] = await dbExecutor.execute(
    `SELECT payload_json
     FROM audit_logs
     WHERE action = ?
       AND result = 'SUCCESS'
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?
     ORDER BY id DESC
     LIMIT 1`,
    [SYNC_PUSH_ACCEPTED_AUDIT_ACTION, clientTxId]
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
  const metadata = await readAcceptedPostingAuditMetadata(dbExecutor, params.clientTxId);
  const fallbackJournalBatchId = await readJournalBatchIdByPosTransactionId(dbExecutor, params.posTransactionId);
  const journalBatchId = metadata.journalBatchId ?? fallbackJournalBatchId;

  await dbExecutor.execute(
    `INSERT INTO audit_logs (
       company_id,
       outlet_id,
       user_id,
       action,
       result,
       ip_address,
       payload_json
     ) VALUES (?, ?, ?, ?, 'SUCCESS', NULL, ?)`,
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
         ip_address,
         payload_json
       ) VALUES (?, ?, ?, ?, 'FAIL', NULL, ?)`,
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

const syncPushTransactionSchemaWithOffset = SyncPushRequestSchema.shape.transactions.element.extend({
  trx_at: z.string().datetime({ offset: true })
});

const syncPushRequestSchemaWithOffset = SyncPushRequestSchema.extend({
  transactions: z.array(syncPushTransactionSchemaWithOffset).min(1)
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
      const dbConnection = await dbPool.getConnection();
      const results: SyncPushResultItem[] = [];
      try {
        for (const [txIndex, tx] of input.transactions.entries()) {
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

          if (tx.company_id !== auth.companyId) {
            results.push(toErrorResult(tx.client_tx_id, "company_id mismatch"));
            logTransactionResult("ERROR");
            continue;
          }

          if (tx.outlet_id !== input.outlet_id) {
            results.push(toErrorResult(tx.client_tx_id, "outlet_id mismatch"));
            logTransactionResult("ERROR");
            continue;
          }

          const trxAtCanonical = toMysqlDateTime(tx.trx_at);
          const payloadSha256 = computePayloadSha256(canonicalizeTransactionForHash(tx));
          const payloadSha256Legacy = computePayloadSha256(canonicalizeTransactionForLegacyHash(tx));
          let acceptedContextForFailureAudit: AcceptedSyncPushContext | null = null;

          try {
            await dbConnection.beginTransaction();

            if (forcedRetryableErrno !== null) {
              throw {
                errno: forcedRetryableErrno
              } satisfies MysqlError;
            }

            const [insertResult] = await dbConnection.execute<ResultSetHeader>(
              `INSERT INTO pos_transactions (
                 company_id,
                 outlet_id,
                 client_tx_id,
                 status,
                 trx_at,
                 payload_sha256,
                 payload_hash_version
               ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                tx.company_id,
                tx.outlet_id,
                tx.client_tx_id,
                tx.status,
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
              const itemValues = tx.items.flatMap((item, index) => [
                posTransactionId,
                tx.company_id,
                tx.outlet_id,
                index + 1,
                item.item_id,
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
                   qty,
                   price_snapshot,
                   name_snapshot
                 ) VALUES ${itemPlaceholders}`,
                itemValues
              );
            }

            if (tx.payments.length > 0) {
              const paymentPlaceholders = tx.payments.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
              const paymentValues = tx.payments.flatMap((payment, index) => [
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

            const acceptedContext: AcceptedSyncPushContext = {
              correlationId,
              companyId: tx.company_id,
              outletId: tx.outlet_id,
              userId: auth.userId,
              clientTxId: tx.client_tx_id,
              status: tx.status,
              trxAt: tx.trx_at,
              posTransactionId
            };
            acceptedContextForFailureAudit = acceptedContext;

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

            results.push({
              client_tx_id: tx.client_tx_id,
              result: "OK"
            });
            logTransactionResult("OK");
          } catch (error) {
            if (isClientTxIdDuplicateError(error)) {
              await rollbackQuietly(dbConnection);

              const existingRecord = await readExistingIdempotencyRecordByClientTxId(dbConnection, tx.client_tx_id);
              if (!existingRecord) {
                results.push(toErrorResult(tx.client_tx_id, RETRYABLE_DB_LOCK_TIMEOUT_MESSAGE));
                logTransactionResult("ERROR");
                continue;
              }

              const existingHashVersion = existingRecord.payloadHashVersion ?? 1;
              const normalizedExistingHash = existingRecord.payloadSha256?.trim() ?? "";
              if (normalizedExistingHash.length === 0) {
                const legacyReplayMatch = await doesLegacyPayloadReplayMatch(dbConnection, existingRecord.posTransactionId, tx);
                if (!legacyReplayMatch) {
                  results.push(toErrorResult(tx.client_tx_id, IDEMPOTENCY_CONFLICT_MESSAGE));
                  logTransactionResult("ERROR");
                  continue;
                }

                await recordSyncPushDuplicateReplayAudit(dbConnection, {
                  authUserId: auth.userId,
                  correlationId,
                  companyId: tx.company_id,
                  outletId: tx.outlet_id,
                  clientTxId: tx.client_tx_id,
                  posTransactionId: existingRecord.posTransactionId
                });
                results.push({
                  client_tx_id: tx.client_tx_id,
                  result: "DUPLICATE"
                });
                logTransactionResult("DUPLICATE");
                continue;
              }

              if (normalizedExistingHash === payloadSha256) {
                await recordSyncPushDuplicateReplayAudit(dbConnection, {
                  authUserId: auth.userId,
                  correlationId,
                  companyId: tx.company_id,
                  outletId: tx.outlet_id,
                  clientTxId: tx.client_tx_id,
                  posTransactionId: existingRecord.posTransactionId
                });
                results.push({
                  client_tx_id: tx.client_tx_id,
                  result: "DUPLICATE"
                });
                logTransactionResult("DUPLICATE");
                continue;
              }

              if (existingHashVersion <= 1 && normalizedExistingHash === payloadSha256Legacy) {
                await recordSyncPushDuplicateReplayAudit(dbConnection, {
                  authUserId: auth.userId,
                  correlationId,
                  companyId: tx.company_id,
                  outletId: tx.outlet_id,
                  clientTxId: tx.client_tx_id,
                  posTransactionId: existingRecord.posTransactionId
                });
                results.push({
                  client_tx_id: tx.client_tx_id,
                  result: "DUPLICATE"
                });
                logTransactionResult("DUPLICATE");
                continue;
              }

              if (existingHashVersion <= 1) {
                const legacyReplayMatch = await doesLegacyV1HashMismatchReplayMatch(
                  dbConnection,
                  existingRecord.posTransactionId,
                  normalizedExistingHash,
                  tx
                );
                if (legacyReplayMatch) {
                  await recordSyncPushDuplicateReplayAudit(dbConnection, {
                    authUserId: auth.userId,
                    correlationId,
                    companyId: tx.company_id,
                    outletId: tx.outlet_id,
                    clientTxId: tx.client_tx_id,
                    posTransactionId: existingRecord.posTransactionId
                  });
                  results.push({
                    client_tx_id: tx.client_tx_id,
                    result: "DUPLICATE"
                  });
                  logTransactionResult("DUPLICATE");
                  continue;
                }
              }

              results.push(toErrorResult(tx.client_tx_id, IDEMPOTENCY_CONFLICT_MESSAGE));
              logTransactionResult("ERROR");
              continue;
            }

            if (isRetryableMysqlError(error)) {
              await rollbackQuietly(dbConnection);
              results.push(toErrorResult(tx.client_tx_id, toRetryableDbErrorMessage(error)));
              logTransactionResult("ERROR");
              continue;
            }

            await rollbackQuietly(dbConnection);

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
            results.push(toErrorResult(tx.client_tx_id, "insert failed"));
            logTransactionResult("ERROR");
          }
        }
      } finally {
        dbConnection.release();
      }

      const response = SyncPushResponseSchema.parse({ results });

      return Response.json(
        {
          ok: true,
          ...response
        },
        {
          status: 200,
          headers: withCorrelationHeaders(correlationId)
        }
      );
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return Response.json(INVALID_REQUEST_RESPONSE, {
          status: 400,
          headers: withCorrelationHeaders(correlationId)
        });
      }

      console.error("POST /sync/push failed", {
        correlation_id: correlationId,
        error
      });
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, {
        status: 500,
        headers: withCorrelationHeaders(correlationId)
      });
    }
  },
  [
    requireRole(["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"]),
    requireOutletAccess((request) => parseOutletIdForGuard(request))
  ]
);
