// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { DbConn } from "@jurnapod/db";
import type { RowDataPacket } from "mysql2";

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
 * Read a single POS transaction by client_tx_id + company_id.
 * Used for idempotency checks in sync push.
 */
export async function readPosTransactionByClientTxId(
  db: DbConn,
  clientTxId: string,
  companyId: number
): Promise<PosTransactionQueryResult | null> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT id, company_id, outlet_id, cashier_user_id, client_tx_id, status,
            service_type, table_id, reservation_id, guest_count, order_status,
            opened_at, closed_at, notes, trx_at, discount_percent, discount_fixed,
            discount_code, payload_sha256, payload_hash_version, created_at, updated_at
     FROM pos_transactions
     WHERE client_tx_id = ? AND company_id = ?
     LIMIT 1`,
    [clientTxId, companyId]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
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
 * Batch read POS transactions by client_tx_id + company_id.
 * Used for idempotency checks when processing multiple transactions.
 * Returns a Map for efficient lookup by client_tx_id.
 */
export async function batchReadPosTransactionsByClientTxIds(
  db: DbConn,
  clientTxIds: string[],
  companyId: number
): Promise<Map<string, PosTransactionQueryResult>> {
  if (clientTxIds.length === 0) {
    return new Map();
  }

  const placeholders = clientTxIds.map(() => "?").join(", ");
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT id, company_id, outlet_id, cashier_user_id, client_tx_id, status,
            service_type, table_id, reservation_id, guest_count, order_status,
            opened_at, closed_at, notes, trx_at, discount_percent, discount_fixed,
            discount_code, payload_sha256, payload_hash_version, created_at, updated_at
     FROM pos_transactions
     WHERE client_tx_id IN (${placeholders}) AND company_id = ?`,
    [...clientTxIds, companyId]
  );

  const result = new Map<string, PosTransactionQueryResult>();
  for (const row of rows) {
    const tx: PosTransactionQueryResult = {
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
      discount_percent: row.discount_percent,
      discount_fixed: row.discount_fixed,
      discount_code: row.discount_code,
      payload_sha256: row.payload_sha256,
      payload_hash_version: Number(row.payload_hash_version),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
    result.set(row.client_tx_id, tx);
  }

  return result;
}

/**
 * Insert a POS transaction header.
 * Returns the insert ID.
 * 
 * Note: This is a single-row insert. The caller is responsible for
 * transaction management when inserting related items/payments/taxes.
 */
export async function insertPosTransaction(
  db: DbConn,
  tx: PosTransactionInsertInput
): Promise<number> {
  const result = await db.execute(
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
      tx.opened_at ?? null,
      tx.closed_at ?? null,
      tx.notes ?? null,
      tx.trx_at,
      tx.discount_percent ?? 0,
      tx.discount_fixed ?? 0,
      tx.discount_code ?? null,
      tx.payload_sha256,
      tx.payload_hash_version ?? 2
    ]
  );

  return Number(result.insertId);
}

/**
 * Insert a single line item into pos_transaction_items.
 */
export async function insertPosTransactionItem(
  db: DbConn,
  item: PosTransactionItemInsertInput
): Promise<number> {
  const result = await db.execute(
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
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.pos_transaction_id,
      item.company_id,
      item.outlet_id,
      item.line_no,
      item.item_id,
      item.variant_id ?? null,
      item.qty,
      item.price_snapshot,
      item.name_snapshot
    ]
  );

  return Number(result.insertId);
}

/**
 * Insert a single payment into pos_transaction_payments.
 */
export async function insertPosTransactionPayment(
  db: DbConn,
  payment: PosTransactionPaymentInsertInput
): Promise<number> {
  const result = await db.execute(
    `INSERT INTO pos_transaction_payments (
       pos_transaction_id,
       company_id,
       outlet_id,
       payment_no,
       method,
       amount
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      payment.pos_transaction_id,
      payment.company_id,
      payment.outlet_id,
      payment.payment_no,
      payment.method,
      payment.amount
    ]
  );

  return Number(result.insertId);
}

/**
 * Insert a single tax line into pos_transaction_taxes.
 */
export async function insertPosTransactionTax(
  db: DbConn,
  tax: PosTransactionTaxInsertInput
): Promise<number> {
  const result = await db.execute(
    `INSERT INTO pos_transaction_taxes (
       pos_transaction_id,
       company_id,
       outlet_id,
       tax_rate_id,
       amount
     ) VALUES (?, ?, ?, ?, ?)`,
    [
      tax.pos_transaction_id,
      tax.company_id,
      tax.outlet_id,
      tax.tax_rate_id,
      tax.amount
    ]
  );

  return Number(result.insertId);
}
