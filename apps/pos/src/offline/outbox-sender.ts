// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import Dexie from "dexie";
import { type PosOfflineDb, posDb } from "@jurnapod/offline-db/dexie";
import type {
  ActiveOrderLineRow,
  ActiveOrderRow,
  ActiveOrderUpdateRow,
  OutboxJobRow,
  PaymentRow,
  SaleItemRow,
  SaleRow
} from "@jurnapod/offline-db/dexie";

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
  service_type?: "TAKEAWAY" | "DINE_IN";
  table_id?: number | null;
  reservation_id?: number | null;
  guest_count?: number | null;
  order_status?: "OPEN" | "READY_TO_PAY" | "COMPLETED" | "CANCELLED";
  opened_at?: string;
  closed_at?: string | null;
  notes?: string | null;
  trx_at: string;
  items: SyncPushTransactionItem[];
  payments: SyncPushTransactionPayment[];
}

export interface SyncPushRequest {
  outlet_id: number;
  transactions: SyncPushTransaction[];
  active_orders?: Array<{
    order_id: string;
    company_id: number;
    outlet_id: number;
    service_type: "TAKEAWAY" | "DINE_IN";
    table_id: number | null;
    reservation_id: number | null;
    guest_count: number | null;
    is_finalized: boolean;
    order_status: "OPEN" | "READY_TO_PAY" | "COMPLETED" | "CANCELLED";
    order_state: "OPEN" | "CLOSED";
    paid_amount: number;
    opened_at: string;
    closed_at: string | null;
    notes: string | null;
    updated_at: string;
    lines: Array<{
      item_id: number;
      sku_snapshot: string | null;
      name_snapshot: string;
      item_type_snapshot: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
      unit_price_snapshot: number;
      qty: number;
      discount_amount: number;
      updated_at: string;
    }>;
  }>;
  order_updates?: Array<{
    update_id: string;
    order_id: string;
    company_id: number;
    outlet_id: number;
    base_order_updated_at: string | null;
    event_type: string;
    delta_json: string;
    actor_user_id: number | null;
    device_id: string;
    event_at: string;
    created_at: string;
  }>;
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

interface ParsedOrderUpdateOutboxPayload {
  update_id: string;
  order_id: string;
  company_id: number;
  outlet_id: number;
}

interface HydratedSaleSnapshot {
  sale: SaleRow;
  items: SaleItemRow[];
  payments: PaymentRow[];
}

interface HydratedOrderUpdateSnapshot {
  order: ActiveOrderRow;
  lines: ActiveOrderLineRow[];
  update: ActiveOrderUpdateRow;
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

function parseOrderUpdateOutboxPayload(job: OutboxJobRow): ParsedOrderUpdateOutboxPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(job.payload_json);
  } catch {
    throw new OutboxSenderError("NON_RETRYABLE", "OUTBOX_PAYLOAD_INVALID", `Invalid payload_json for job ${job.job_id}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new OutboxSenderError("NON_RETRYABLE", "OUTBOX_PAYLOAD_INVALID", `Invalid payload_json for job ${job.job_id}`);
  }

  const payload = parsed as Partial<ParsedOrderUpdateOutboxPayload>;
  if (
    typeof payload.update_id !== "string" ||
    typeof payload.order_id !== "string" ||
    !isPositiveInteger(payload.company_id) ||
    !isPositiveInteger(payload.outlet_id)
  ) {
    throw new OutboxSenderError("NON_RETRYABLE", "OUTBOX_PAYLOAD_INVALID", `Invalid payload_json for job ${job.job_id}`);
  }

  return {
    update_id: payload.update_id,
    order_id: payload.order_id,
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

async function hydrateOrderUpdateSnapshot(
  payload: ParsedOrderUpdateOutboxPayload,
  db: PosOfflineDb
): Promise<HydratedOrderUpdateSnapshot> {
  return db.transaction("r", [db.active_orders, db.active_order_lines, db.active_order_updates], async () => {
    const [order, lines, update] = await Promise.all([
      db.active_orders.get(payload.order_id),
      db.active_order_lines.where("[order_id+item_id]").between([payload.order_id, Dexie.minKey], [payload.order_id, Dexie.maxKey]).toArray(),
      db.active_order_updates.where("update_id").equals(payload.update_id).first()
    ]);

    if (!order) {
      throw new OutboxSenderError("NON_RETRYABLE", "LOCAL_ORDER_NOT_FOUND", `Order not found for update ${payload.update_id}`);
    }
    if (!update) {
      throw new OutboxSenderError("NON_RETRYABLE", "LOCAL_ORDER_UPDATE_NOT_FOUND", `Order update not found ${payload.update_id}`);
    }

    return {
      order,
      lines,
      update
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
    service_type: sale.service_type ?? "TAKEAWAY",
    table_id: sale.table_id ?? null,
    reservation_id: sale.reservation_id ?? null,
    guest_count: sale.guest_count ?? null,
    order_status: sale.order_status ?? "COMPLETED",
    opened_at: sale.opened_at ?? sale.created_at,
    closed_at: sale.closed_at ?? sale.completed_at,
    notes: sale.notes ?? null,
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

function buildOrderUpdateSyncRequest(
  payload: ParsedOrderUpdateOutboxPayload,
  snapshot: HydratedOrderUpdateSnapshot
): SyncPushRequest {
  if (snapshot.order.company_id !== payload.company_id || snapshot.order.outlet_id !== payload.outlet_id) {
    throw new OutboxSenderError("NON_RETRYABLE", "LOCAL_SCOPE_MISMATCH", `Scope mismatch for order ${snapshot.order.order_id}`);
  }

  return {
    outlet_id: snapshot.order.outlet_id,
    transactions: [],
    active_orders: [
      {
        order_id: snapshot.order.order_id,
        company_id: snapshot.order.company_id,
        outlet_id: snapshot.order.outlet_id,
        service_type: snapshot.order.service_type,
        table_id: snapshot.order.table_id,
        reservation_id: snapshot.order.reservation_id,
        guest_count: snapshot.order.guest_count,
        is_finalized: snapshot.order.is_finalized,
        order_status: snapshot.order.order_status,
        order_state: snapshot.order.order_state,
        paid_amount: snapshot.order.paid_amount,
        opened_at: snapshot.order.opened_at,
        closed_at: snapshot.order.closed_at,
        notes: snapshot.order.notes,
        updated_at: snapshot.order.updated_at,
        lines: snapshot.lines.map((line) => ({
          item_id: line.item_id,
          sku_snapshot: line.sku_snapshot,
          name_snapshot: line.name_snapshot,
          item_type_snapshot: line.item_type_snapshot,
          unit_price_snapshot: line.unit_price_snapshot,
          qty: line.qty,
          discount_amount: line.discount_amount,
          updated_at: line.updated_at
        }))
      }
    ],
    order_updates: [
      {
        update_id: snapshot.update.update_id,
        order_id: snapshot.update.order_id,
        company_id: snapshot.update.company_id,
        outlet_id: snapshot.update.outlet_id,
        base_order_updated_at: snapshot.update.base_order_updated_at,
        event_type: snapshot.update.event_type,
        delta_json: snapshot.update.delta_json,
        actor_user_id: snapshot.update.actor_user_id,
        device_id: snapshot.update.device_id,
        event_at: snapshot.update.event_at,
        created_at: snapshot.update.created_at
      }
    ]
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
  if (payload && typeof payload === "object" && "success" in payload) {
    const envelope = payload as { success?: boolean; data?: { message?: string } };
    if (envelope.success === false) {
      throw new OutboxSenderError(
        "RETRYABLE",
        "SYNC_RESPONSE_ERROR",
        envelope.data?.message ?? "Sync push responded with error"
      );
    }
  }

  const resolved =
    payload && typeof payload === "object" && "data" in payload ? (payload as { data?: unknown }).data : payload;

  const rawItems = Array.isArray(resolved)
    ? resolved
    : resolved && typeof resolved === "object" && Array.isArray((resolved as Partial<SyncPushResponse>).results)
      ? (resolved as Partial<SyncPushResponse>).results
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

/**
 * Classifies any error that occurs during outbox sending into a structured OutboxSenderError.
 * This is the primary exported API for error classification.
 * 
 * @param error - The error to classify (can be transport, HTTP, or already classified)
 * @returns A structured OutboxSenderError with category (RETRYABLE/NON_RETRYABLE)
 */
export function classifyOutboxSenderError(error: unknown): OutboxSenderError {
  // Already classified errors pass through
  if (error instanceof OutboxSenderError) {
    return error;
  }
  
  // For now, only transport errors are exposed through this API.
  // HTTP status and sync result errors are handled internally in sendOutboxJobToSyncPush.
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

  const isOrderUpdateJob = input.job.job_type === "SYNC_POS_ORDER_UPDATE";
  let salePayload: ParsedOutboxPayload | null = null;
  let requestBody: SyncPushRequest;

  if (isOrderUpdateJob) {
    const orderPayload = parseOrderUpdateOutboxPayload(input.job);
    const orderSnapshot = await hydrateOrderUpdateSnapshot(orderPayload, db);
    requestBody = buildOrderUpdateSyncRequest(orderPayload, orderSnapshot);
  } else {
    salePayload = parseOutboxPayload(input.job);
    const saleSnapshot = await hydrateSaleSnapshot(input.job, db);
    requestBody = buildSyncRequest(salePayload, saleSnapshot);
  }
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

  let ackResult: OutboxServerResult = "OK";
  let ackMessage: string | undefined;

  if (!isOrderUpdateJob && salePayload) {
    const resultItems = asSyncResultItems(responseBody);
    const match = resultItems.find((item) => item.client_tx_id === salePayload.client_tx_id);
    if (!match) {
      throw new OutboxSenderError(
        "RETRYABLE",
        "SYNC_RESULT_MISSING_CLIENT_TX",
        `Sync push response missing client_tx_id ${salePayload.client_tx_id}`
      );
    }

    if (match.result === "ERROR") {
      throw classifySyncResultError(salePayload.client_tx_id, match.message);
    }

    ackResult = match.result;
    ackMessage = match.message;
  }

  const responseCorrelationId = response.headers.get("x-correlation-id")?.trim();

  return {
    result: ackResult,
    message: ackMessage,
    correlation_id: responseCorrelationId && responseCorrelationId.length > 0 ? responseCorrelationId : requestCorrelationId
  };
}
