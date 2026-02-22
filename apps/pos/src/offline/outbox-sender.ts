import { type PosOfflineDb, posDb } from "./db.js";
import type { OutboxJobRow, PaymentRow, SaleItemRow, SaleRow } from "./types.js";

const DEFAULT_SYNC_PUSH_ENDPOINT = "/api/sync/push";
const DEFAULT_SYNC_PUSH_TIMEOUT_MS = 10_000;
const RETRYABLE_SYNC_RESULT_MESSAGES = new Set([
  "RETRYABLE_DB_LOCK_TIMEOUT",
  "RETRYABLE_DB_DEADLOCK"
]);

export type OutboxSendErrorCategory = "RETRYABLE" | "NON_RETRYABLE";
export type OutboxServerResult = "OK" | "DUPLICATE";

export interface OutboxSendAck {
  result: OutboxServerResult;
  message?: string;
  correlation_id?: string;
}

export interface SendOutboxJobToSyncPushInput {
  job: OutboxJobRow;
  endpoint?: string;
  fetch_impl?: typeof fetch;
  access_token?: string;
  timeout_ms?: number;
}

export interface SyncPushTransactionItem {
  item_id: number;
  qty: number;
  price_snapshot: number;
  name_snapshot: string;
}

export interface SyncPushTransactionPayment {
  method: string;
  amount: number;
}

export interface SyncPushTransaction {
  client_tx_id: string;
  company_id: number;
  outlet_id: number;
  cashier_user_id: number;
  status: "COMPLETED" | "VOID" | "REFUND";
  trx_at: string;
  items: SyncPushTransactionItem[];
  payments: SyncPushTransactionPayment[];
}

export interface SyncPushRequest {
  outlet_id: number;
  transactions: SyncPushTransaction[];
}

export interface SyncPushResultItem {
  client_tx_id: string;
  result: "OK" | "DUPLICATE" | "ERROR";
  message?: string;
}

export interface SyncPushResponse {
  results: SyncPushResultItem[];
}

interface ParsedOutboxPayload {
  sale_id: string;
  client_tx_id: string;
  company_id: number;
  outlet_id: number;
}

interface HydratedSaleSnapshot {
  sale: SaleRow;
  items: SaleItemRow[];
  payments: PaymentRow[];
}

export class OutboxSenderError extends Error {
  readonly category: OutboxSendErrorCategory;
  readonly code: string;

  constructor(category: OutboxSendErrorCategory, code: string, message: string) {
    super(message);
    this.name = "OutboxSenderError";
    this.category = category;
    this.code = code;
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "OUTBOX_SEND_FAILED";
}

function parseOutboxPayload(job: OutboxJobRow): ParsedOutboxPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(job.payload_json);
  } catch {
    throw new OutboxSenderError("NON_RETRYABLE", "OUTBOX_PAYLOAD_INVALID", `Invalid payload_json for job ${job.job_id}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new OutboxSenderError("NON_RETRYABLE", "OUTBOX_PAYLOAD_INVALID", `Invalid payload_json for job ${job.job_id}`);
  }

  const payload = parsed as Partial<ParsedOutboxPayload>;
  if (
    typeof payload.sale_id !== "string" ||
    typeof payload.client_tx_id !== "string" ||
    !isPositiveInteger(payload.company_id) ||
    !isPositiveInteger(payload.outlet_id)
  ) {
    throw new OutboxSenderError("NON_RETRYABLE", "OUTBOX_PAYLOAD_INVALID", `Invalid payload_json for job ${job.job_id}`);
  }

  return {
    sale_id: payload.sale_id,
    client_tx_id: payload.client_tx_id,
    company_id: payload.company_id,
    outlet_id: payload.outlet_id
  };
}

async function hydrateSaleSnapshot(job: OutboxJobRow, db: PosOfflineDb): Promise<HydratedSaleSnapshot> {
  return db.transaction("r", [db.sales, db.sale_items, db.payments], async () => {
    const sale = await db.sales.get(job.sale_id);
    if (!sale) {
      throw new OutboxSenderError("NON_RETRYABLE", "LOCAL_SALE_NOT_FOUND", `Sale not found for job ${job.job_id}`);
    }

    if (sale.status !== "COMPLETED" || !sale.client_tx_id) {
      throw new OutboxSenderError(
        "NON_RETRYABLE",
        "LOCAL_SALE_NOT_COMPLETED",
        `Sale ${sale.sale_id} is not ready for sync`
      );
    }

    const [items, payments] = await Promise.all([
      db.sale_items.where("sale_id").equals(sale.sale_id).toArray(),
      db.payments.where("sale_id").equals(sale.sale_id).toArray()
    ]);

    if (items.length === 0) {
      throw new OutboxSenderError("NON_RETRYABLE", "LOCAL_ITEMS_MISSING", `Sale ${sale.sale_id} has no item rows`);
    }

    if (payments.length === 0) {
      throw new OutboxSenderError("NON_RETRYABLE", "LOCAL_PAYMENTS_MISSING", `Sale ${sale.sale_id} has no payment rows`);
    }

    return {
      sale,
      items,
      payments
    };
  });
}

function buildSyncRequest(payload: ParsedOutboxPayload, snapshot: HydratedSaleSnapshot): SyncPushRequest {
  const sale = snapshot.sale;
  if (sale.client_tx_id !== payload.client_tx_id) {
    throw new OutboxSenderError(
      "NON_RETRYABLE",
      "LOCAL_CLIENT_TX_MISMATCH",
      `client_tx_id mismatch for sale ${sale.sale_id}`
    );
  }

  if (sale.company_id !== payload.company_id || sale.outlet_id !== payload.outlet_id) {
    throw new OutboxSenderError("NON_RETRYABLE", "LOCAL_SCOPE_MISMATCH", `Scope mismatch for sale ${sale.sale_id}`);
  }

  const transaction: SyncPushTransaction = {
    client_tx_id: sale.client_tx_id,
    company_id: sale.company_id,
    outlet_id: sale.outlet_id,
    cashier_user_id: sale.cashier_user_id,
    status: "COMPLETED",
    trx_at: sale.trx_at,
    items: snapshot.items.map((item) => ({
      item_id: item.item_id,
      qty: item.qty,
      price_snapshot: item.unit_price_snapshot,
      name_snapshot: item.name_snapshot
    })),
    payments: snapshot.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount
    }))
  };

  return {
    outlet_id: sale.outlet_id,
    transactions: [transaction]
  };
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function classifyHttpStatusError(status: number): OutboxSenderError {
  if (isRetryableHttpStatus(status)) {
    return new OutboxSenderError("RETRYABLE", `HTTP_${status}`, `Retryable sync push HTTP status: ${status}`);
  }

  return new OutboxSenderError("NON_RETRYABLE", `HTTP_${status}`, `Non-retryable sync push HTTP status: ${status}`);
}

function classifyTransportError(error: unknown): OutboxSenderError {
  if (error instanceof OutboxSenderError) {
    return error;
  }

  if (error instanceof TypeError) {
    return new OutboxSenderError("RETRYABLE", "NETWORK_ERROR", normalizeErrorMessage(error));
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new OutboxSenderError("RETRYABLE", "REQUEST_ABORTED", normalizeErrorMessage(error));
  }

  return new OutboxSenderError("RETRYABLE", "UNEXPECTED_SEND_ERROR", normalizeErrorMessage(error));
}

function classifySyncResultError(clientTxId: string, message: string | undefined): OutboxSenderError {
  const normalized = typeof message === "string" ? message.trim().toUpperCase() : "";
  if (RETRYABLE_SYNC_RESULT_MESSAGES.has(normalized)) {
    return new OutboxSenderError(
      "RETRYABLE",
      normalized,
      message ?? `Sync push returned retryable ERROR for client_tx_id ${clientTxId}`
    );
  }

  return new OutboxSenderError(
    "NON_RETRYABLE",
    "SYNC_RESULT_ERROR",
    message ?? `Sync push returned ERROR for client_tx_id ${clientTxId}`
  );
}

function asSyncResultItems(payload: unknown): SyncPushResultItem[] {
  const rawItems = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as Partial<SyncPushResponse>).results)
      ? (payload as Partial<SyncPushResponse>).results
      : null;

  if (!rawItems) {
    throw new OutboxSenderError("RETRYABLE", "SYNC_RESPONSE_INVALID", "Missing sync push result items");
  }

  const normalized: SyncPushResultItem[] = [];
  for (const item of rawItems) {
    if (!item || typeof item !== "object") {
      throw new OutboxSenderError("RETRYABLE", "SYNC_RESPONSE_INVALID", "Invalid sync push result item");
    }

    const parsed = item as Partial<SyncPushResultItem>;
    if (
      typeof parsed.client_tx_id !== "string" ||
      (parsed.result !== "OK" && parsed.result !== "DUPLICATE" && parsed.result !== "ERROR")
    ) {
      throw new OutboxSenderError("RETRYABLE", "SYNC_RESPONSE_INVALID", "Invalid sync push result item");
    }

    normalized.push({
      client_tx_id: parsed.client_tx_id,
      result: parsed.result,
      message: typeof parsed.message === "string" ? parsed.message : undefined
    });
  }

  return normalized;
}

export function classifyOutboxSenderError(error: unknown): OutboxSenderError {
  return classifyTransportError(error);
}

export async function sendOutboxJobToSyncPush(
  input: SendOutboxJobToSyncPushInput,
  db: PosOfflineDb = posDb
): Promise<OutboxSendAck> {
  const endpoint = input.endpoint ?? DEFAULT_SYNC_PUSH_ENDPOINT;
  const fetchCandidate = input.fetch_impl ?? globalThis.fetch;
  const fetchImpl = typeof fetchCandidate === "function" ? fetchCandidate.bind(globalThis) : null;
  if (typeof fetchImpl !== "function") {
    throw new OutboxSenderError("NON_RETRYABLE", "FETCH_UNAVAILABLE", "fetch is not available in this runtime");
  }

  const payload = parseOutboxPayload(input.job);
  const snapshot = await hydrateSaleSnapshot(input.job, db);
  const requestBody = buildSyncRequest(payload, snapshot);
  const requestCorrelationId = crypto.randomUUID();
  const timeoutMs = Number.isFinite(input.timeout_ms) && (input.timeout_ms ?? 0) > 0 ? Number(input.timeout_ms) : DEFAULT_SYNC_PUSH_TIMEOUT_MS;
  const abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId =
    abortController && timeoutMs > 0
      ? globalThis.setTimeout(() => {
          abortController.abort();
        }, timeoutMs)
      : null;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-correlation-id": requestCorrelationId,
        ...(input.access_token ? { authorization: `Bearer ${input.access_token}` } : {})
      },
      body: JSON.stringify(requestBody),
      signal: abortController?.signal
    });
  } catch (error) {
    throw classifyTransportError(error);
  } finally {
    if (timeoutId != null) {
      globalThis.clearTimeout(timeoutId);
    }
  }

  if (!response.ok) {
    throw classifyHttpStatusError(response.status);
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new OutboxSenderError("RETRYABLE", "SYNC_RESPONSE_INVALID_JSON", "Sync push response is not valid JSON");
  }

  const resultItems = asSyncResultItems(responseBody);
  const match = resultItems.find((item) => item.client_tx_id === payload.client_tx_id);
  if (!match) {
    throw new OutboxSenderError(
      "RETRYABLE",
      "SYNC_RESULT_MISSING_CLIENT_TX",
      `Sync push response missing client_tx_id ${payload.client_tx_id}`
    );
  }

  if (match.result === "ERROR") {
    throw classifySyncResultError(payload.client_tx_id, match.message);
  }

  const responseCorrelationId = response.headers.get("x-correlation-id")?.trim();

  return {
    result: match.result,
    message: match.message,
    correlation_id: responseCorrelationId && responseCorrelationId.length > 0 ? responseCorrelationId : requestCorrelationId
  };
}
