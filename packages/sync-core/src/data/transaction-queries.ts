// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { KyselySchema } from "@jurnapod/db";

// ============================================================================
// Query Result Types
// ============================================================================

export type PosTransactionQueryResult = {
  id: number;
  company_id: number;
  outlet_id: number;
  cashier_user_id: number | null;
  client_tx_id: string;
  status: string;
  service_type: string;
  table_id: number | null;
  reservation_id: number | null;
  guest_count: number | null;
  order_status: string;
  opened_at: Date | null;
  closed_at: Date | null;
  notes: string | null;
  trx_at: Date;
  trx_at_ts: number;
  discount_percent: string;
  discount_fixed: string;
  discount_code: string | null;
  payload_sha256: string;
  payload_hash_version: number;
  created_at: Date;
  updated_at: Date;
};

export type PosTransactionItemQueryResult = {
  id: number;
  pos_transaction_id: number;
  company_id: number;
  outlet_id: number;
  line_no: number;
  item_id: number;
  variant_id: number | null;
  qty: string;
  price_snapshot: string;
  name_snapshot: string;
  created_at: Date;
};

export type PosTransactionPaymentQueryResult = {
  id: number;
  pos_transaction_id: number;
  company_id: number;
  outlet_id: number;
  payment_no: number;
  method: string;
  amount: string;
  created_at: Date;
};

export type PosTransactionTaxQueryResult = {
  id: number;
  pos_transaction_id: number;
  company_id: number;
  outlet_id: number;
  tax_rate_id: number;
  amount: string;
  created_at: Date;
};

// ============================================================================
// Input Types (for inserts)
// ============================================================================

export type PosTransactionInsertInput = {
  id?: number;
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
  opened_at?: string | null;
  closed_at?: string | null;
  notes?: string | null;
  trx_at: string;
  trx_at_ts: number;
  discount_percent?: number;
  discount_fixed?: number;
  discount_code?: string | null;
  payload_sha256: string;
  payload_hash_version?: number;
};

export type PosTransactionItemInsertInput = {
  pos_transaction_id: number;
  company_id: number;
  outlet_id: number;
  line_no: number;
  item_id: number;
  variant_id?: number | null;
  qty: number;
  price_snapshot: number;
  name_snapshot: string;
};

export type PosTransactionPaymentInsertInput = {
  pos_transaction_id: number;
  company_id: number;
  outlet_id: number;
  payment_no: number;
  method: string;
  amount: number;
};

export type PosTransactionTaxInsertInput = {
  pos_transaction_id: number;
  company_id: number;
  outlet_id: number;
  tax_rate_id: number;
  amount: number;
};

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Read a single POS transaction by client_tx_id + company_id + outlet_id.
 * Used for idempotency checks in sync push.
 */
export async function readPosTransactionByClientTxId(
  db: KyselySchema,
  clientTxId: string,
  companyId: number,
  outletId: number
): Promise<PosTransactionQueryResult | null> {
  const result = await db
    .selectFrom('pos_transactions')
    .select([
      'id', 'company_id', 'outlet_id', 'cashier_user_id', 'client_tx_id', 'status',
      'service_type', 'table_id', 'reservation_id', 'guest_count', 'order_status',
      'opened_at', 'closed_at', 'notes', 'trx_at', 'trx_at_ts', 'discount_percent', 'discount_fixed',
      'discount_code', 'payload_sha256', 'payload_hash_version', 'created_at', 'updated_at'
    ])
    .where('client_tx_id', '=', clientTxId)
    .where('company_id', '=', companyId)
    .where('outlet_id', '=', outletId)
    .limit(1)
    .executeTakeFirst();

  if (!result) {
    return null;
  }

  const row = result as any;
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    cashier_user_id: row.cashier_user_id == null ? null : Number(row.cashier_user_id),
    client_tx_id: row.client_tx_id,
    status: row.status,
    service_type: row.service_type,
    table_id: row.table_id == null ? null : Number(row.table_id),
    reservation_id: row.reservation_id == null ? null : Number(row.reservation_id),
    guest_count: row.guest_count == null ? null : Number(row.guest_count),
    order_status: row.order_status,
    opened_at: row.opened_at,
    closed_at: row.closed_at,
    notes: row.notes,
    trx_at: row.trx_at,
    trx_at_ts: row.trx_at_ts == null
      ? (() => { throw new Error('trx_at_ts must not be null'); })()
      : Number(row.trx_at_ts),
    discount_percent: row.discount_percent,
    discount_fixed: row.discount_fixed,
    discount_code: row.discount_code,
    payload_sha256: row.payload_sha256,
    payload_hash_version: Number(row.payload_hash_version),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Batch read POS transactions by client_tx_id + company_id + outlet_id.
 * Used for idempotency checks when processing multiple transactions.
 * Returns a Map for efficient lookup by client_tx_id.
 */
export async function batchReadPosTransactionsByClientTxIds(
  db: KyselySchema,
  clientTxIds: string[],
  companyId: number,
  outletId: number
): Promise<Map<string, PosTransactionQueryResult>> {
  if (clientTxIds.length === 0) {
    return new Map();
  }

  const result = await db
    .selectFrom('pos_transactions')
    .select([
      'id', 'company_id', 'outlet_id', 'cashier_user_id', 'client_tx_id', 'status',
      'service_type', 'table_id', 'reservation_id', 'guest_count', 'order_status',
      'opened_at', 'closed_at', 'notes', 'trx_at', 'trx_at_ts', 'discount_percent', 'discount_fixed',
      'discount_code', 'payload_sha256', 'payload_hash_version', 'created_at', 'updated_at'
    ])
    .where('client_tx_id', 'in', clientTxIds)
    .where('company_id', '=', companyId)
    .where('outlet_id', '=', outletId)
    .execute();

  const map = new Map<string, PosTransactionQueryResult>();
  for (const row of result) {
    const r = row as any;
    const tx: PosTransactionQueryResult = {
      id: Number(r.id),
      company_id: Number(r.company_id),
      outlet_id: Number(r.outlet_id),
      cashier_user_id: r.cashier_user_id == null ? null : Number(r.cashier_user_id),
      client_tx_id: r.client_tx_id,
      status: r.status,
      service_type: r.service_type,
      table_id: r.table_id == null ? null : Number(r.table_id),
      reservation_id: r.reservation_id == null ? null : Number(r.reservation_id),
      guest_count: r.guest_count == null ? null : Number(r.guest_count),
      order_status: r.order_status,
      opened_at: r.opened_at,
      closed_at: r.closed_at,
      notes: r.notes,
      trx_at: r.trx_at,
      trx_at_ts: r.trx_at_ts == null
        ? (() => { throw new Error('trx_at_ts must not be null'); })()
        : Number(r.trx_at_ts),
      discount_percent: r.discount_percent,
      discount_fixed: r.discount_fixed,
      discount_code: r.discount_code,
      payload_sha256: r.payload_sha256,
      payload_hash_version: Number(r.payload_hash_version),
      created_at: r.created_at,
      updated_at: r.updated_at
    };
    map.set(r.client_tx_id, tx);
  }

  return map;
}

/**
 * Insert a POS transaction header.
 * Returns the insert ID.
 * 
 * Note: This is a single-row insert. The caller is responsible for
 * transaction management when inserting related items/payments/taxes.
 */
export async function insertPosTransaction(
  db: KyselySchema,
  tx: PosTransactionInsertInput
): Promise<number> {
  const openedAt = tx.opened_at ? new Date(tx.opened_at) : null;
  const closedAt = tx.closed_at ? new Date(tx.closed_at) : null;
  const trxAt = new Date(tx.trx_at_ts);

  const result = await db
    .insertInto('pos_transactions')
    .values({
      company_id: tx.company_id,
      outlet_id: tx.outlet_id,
      cashier_user_id: tx.cashier_user_id,
      client_tx_id: tx.client_tx_id,
      status: tx.status,
      service_type: tx.service_type ?? "TAKEAWAY",
      table_id: tx.table_id ?? null,
      reservation_id: tx.reservation_id ?? null,
      guest_count: tx.guest_count ?? null,
      order_status: tx.order_status ?? "COMPLETED",
      opened_at: openedAt,
      closed_at: closedAt,
      notes: tx.notes ?? null,
      trx_at: trxAt,
      trx_at_ts: tx.trx_at_ts,
      discount_percent: tx.discount_percent ?? 0,
      discount_fixed: tx.discount_fixed ?? 0,
      discount_code: tx.discount_code ?? null,
      payload_sha256: tx.payload_sha256,
      payload_hash_version: tx.payload_hash_version ?? 2
    })
    .executeTakeFirstOrThrow();

  return Number(result.insertId);
}

/**
 * Insert a single line item into pos_transaction_items.
 */
export async function insertPosTransactionItem(
  db: KyselySchema,
  item: PosTransactionItemInsertInput
): Promise<number> {
  const result = await db
    .insertInto('pos_transaction_items')
    .values({
      pos_transaction_id: item.pos_transaction_id,
      company_id: item.company_id,
      outlet_id: item.outlet_id,
      line_no: item.line_no,
      item_id: item.item_id,
      variant_id: item.variant_id ?? null,
      qty: item.qty,
      price_snapshot: item.price_snapshot,
      name_snapshot: item.name_snapshot
    })
    .executeTakeFirstOrThrow();

  return Number(result.insertId);
}

/**
 * Insert a single payment into pos_transaction_payments.
 */
export async function insertPosTransactionPayment(
  db: KyselySchema,
  payment: PosTransactionPaymentInsertInput
): Promise<number> {
  const result = await db
    .insertInto('pos_transaction_payments')
    .values({
      pos_transaction_id: payment.pos_transaction_id,
      company_id: payment.company_id,
      outlet_id: payment.outlet_id,
      payment_no: payment.payment_no,
      method: payment.method,
      amount: payment.amount
    })
    .executeTakeFirstOrThrow();

  return Number(result.insertId);
}

/**
 * Insert a single tax line into pos_transaction_taxes.
 */
export async function insertPosTransactionTax(
  db: KyselySchema,
  tax: PosTransactionTaxInsertInput
): Promise<number> {
  const result = await db
    .insertInto('pos_transaction_taxes')
    .values({
      pos_transaction_id: tax.pos_transaction_id,
      company_id: tax.company_id,
      outlet_id: tax.outlet_id,
      tax_rate_id: tax.tax_rate_id,
      amount: tax.amount
    })
    .executeTakeFirstOrThrow();

  return Number(result.insertId);
}
