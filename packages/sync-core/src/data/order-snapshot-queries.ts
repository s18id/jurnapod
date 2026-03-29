// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { DbConn } from "@jurnapod/db";
import type { RowDataPacket } from "mysql2";

// ============================================================================
// Query Result Types
// ============================================================================

export type OrderSnapshotQueryResult = {
  order_id: string;
  company_id: number;
  outlet_id: number;
  order_status: string;
  order_state: string;
  service_type: string;
  source_flow: string | null;
  settlement_flow: string | null;
  is_finalized: number;
  opened_at: Date;
  opened_at_ts: number;
  closed_at: Date | null;
  closed_at_ts: number | null;
  updated_at: Date;
  updated_at_ts: number;
  table_id: number | null;
  reservation_id: number | null;
  guest_count: number | null;
  paid_amount: string;
  notes: string | null;
  created_at: Date;
};

export type OrderSnapshotLineQueryResult = {
  id: number;
  order_id: string;
  company_id: number;
  outlet_id: number;
  item_id: number;
  variant_id: number | null;
  qty: string;
  unit_price_snapshot: string;
  discount_amount: string;
  name_snapshot: string;
  item_type_snapshot: string;
  sku_snapshot: string | null;
  updated_at: Date;
  updated_at_ts: number;
  created_at: Date;
};

// ============================================================================
// Input Types (for inserts)
// ============================================================================

export type OrderSnapshotUpsertInput = {
  order_id: string;
  company_id: number;
  outlet_id: number;
  order_status: string;
  order_state: string;
  service_type: string;
  source_flow?: string | null;
  settlement_flow?: string | null;
  is_finalized?: number;
  opened_at: string;
  opened_at_ts: number;
  closed_at?: string | null;
  closed_at_ts?: number | null;
  updated_at: string;
  updated_at_ts: number;
  table_id?: number | null;
  reservation_id?: number | null;
  guest_count?: number | null;
  paid_amount?: number;
  notes?: string | null;
};

export type OrderSnapshotLineInsertInput = {
  order_id: string;
  company_id: number;
  outlet_id: number;
  item_id: number;
  variant_id?: number | null;
  qty: number;
  unit_price_snapshot: number;
  discount_amount?: number;
  name_snapshot: string;
  item_type_snapshot: string;
  sku_snapshot?: string | null;
  updated_at: string;
  updated_at_ts: number;
};

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Upsert an order snapshot header.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE for idempotency on (order_id, company_id).
 * 
 * Timestamp authority:
 * - opened_at / opened_at_ts: CLIENT-authoritative
 * - closed_at / closed_at_ts: CLIENT-authoritative
 * - updated_at / updated_at_ts: CLIENT-authoritative
 * - created_at: SERVER-authoritative (DB default)
 */
export async function upsertOrderSnapshot(
  db: DbConn,
  snapshot: OrderSnapshotUpsertInput
): Promise<void> {
  await db.execute(
    `INSERT INTO pos_order_snapshots (
       order_id, company_id, outlet_id, service_type, source_flow, settlement_flow,
       table_id, reservation_id, guest_count, is_finalized, order_status, order_state,
       paid_amount, opened_at, opened_at_ts, closed_at, closed_at_ts, notes, updated_at, updated_at_ts
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      snapshot.order_id,
      snapshot.company_id,
      snapshot.outlet_id,
      snapshot.service_type,
      snapshot.source_flow ?? null,
      snapshot.settlement_flow ?? null,
      snapshot.table_id ?? null,
      snapshot.reservation_id ?? null,
      snapshot.guest_count ?? null,
      snapshot.is_finalized ?? 0,
      snapshot.order_status,
      snapshot.order_state,
      snapshot.paid_amount ?? 0,
      snapshot.opened_at,
      snapshot.opened_at_ts,
      snapshot.closed_at ?? null,
      snapshot.closed_at_ts ?? null,
      snapshot.notes ?? null,
      snapshot.updated_at,
      snapshot.updated_at_ts
    ]
  );
}

/**
 * Delete all snapshot lines for an order.
 * Used before re-inserting lines during snapshot refresh.
 */
export async function deleteOrderSnapshotLines(
  db: DbConn,
  orderId: string
): Promise<void> {
  await db.execute(
    `DELETE FROM pos_order_snapshot_lines WHERE order_id = ?`,
    [orderId]
  );
}

/**
 * Insert a single line into pos_order_snapshot_lines.
 * Returns the insert ID.
 */
export async function insertOrderSnapshotLine(
  db: DbConn,
  line: OrderSnapshotLineInsertInput
): Promise<number> {
  const result = await db.execute(
    `INSERT INTO pos_order_snapshot_lines (
       order_id, company_id, outlet_id, item_id, variant_id,
       qty, unit_price_snapshot, discount_amount, name_snapshot,
       item_type_snapshot, sku_snapshot, updated_at, updated_at_ts
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      line.order_id,
      line.company_id,
      line.outlet_id,
      line.item_id,
      line.variant_id ?? null,
      line.qty,
      line.unit_price_snapshot,
      line.discount_amount ?? 0,
      line.name_snapshot,
      line.item_type_snapshot,
      line.sku_snapshot ?? null,
      line.updated_at,
      line.updated_at_ts
    ]
  );

  return Number(result.insertId);
}

/**
 * Read a single order snapshot by order_id + company_id.
 * Used for idempotency checks in sync push.
 */
export async function readOrderSnapshotByOrderId(
  db: DbConn,
  orderId: string,
  companyId: number
): Promise<OrderSnapshotQueryResult | null> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT order_id, company_id, outlet_id, order_status, order_state,
            service_type, source_flow, settlement_flow, is_finalized,
            opened_at, opened_at_ts, closed_at, closed_at_ts,
            updated_at, updated_at_ts, table_id, reservation_id,
            guest_count, paid_amount, notes, created_at
     FROM pos_order_snapshots
     WHERE order_id = ? AND company_id = ?
     LIMIT 1`,
    [orderId, companyId]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    order_id: row.order_id,
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    order_status: row.order_status,
    order_state: row.order_state,
    service_type: row.service_type,
    source_flow: row.source_flow,
    settlement_flow: row.settlement_flow,
    is_finalized: Number(row.is_finalized),
    opened_at: row.opened_at,
    opened_at_ts: Number(row.opened_at_ts),
    closed_at: row.closed_at,
    closed_at_ts: row.closed_at_ts == null ? null : Number(row.closed_at_ts),
    updated_at: row.updated_at,
    updated_at_ts: Number(row.updated_at_ts),
    table_id: row.table_id == null ? null : Number(row.table_id),
    reservation_id: row.reservation_id == null ? null : Number(row.reservation_id),
    guest_count: row.guest_count == null ? null : Number(row.guest_count),
    paid_amount: row.paid_amount,
    notes: row.notes,
    created_at: row.created_at
  };
}

/**
 * Batch read order snapshots by order_ids + company_id.
 * Used for idempotency checks when processing multiple orders.
 * Returns a Map for efficient lookup by order_id.
 */
export async function batchReadOrderSnapshotsByOrderIds(
  db: DbConn,
  orderIds: string[],
  companyId: number
): Promise<Map<string, OrderSnapshotQueryResult>> {
  if (orderIds.length === 0) {
    return new Map();
  }

  const placeholders = orderIds.map(() => "?").join(", ");
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT order_id, company_id, outlet_id, order_status, order_state,
            service_type, source_flow, settlement_flow, is_finalized,
            opened_at, opened_at_ts, closed_at, closed_at_ts,
            updated_at, updated_at_ts, table_id, reservation_id,
            guest_count, paid_amount, notes, created_at
     FROM pos_order_snapshots
     WHERE order_id IN (${placeholders}) AND company_id = ?`,
    [...orderIds, companyId]
  );

  const result = new Map<string, OrderSnapshotQueryResult>();
  for (const row of rows) {
    const snapshot: OrderSnapshotQueryResult = {
      order_id: row.order_id,
      company_id: Number(row.company_id),
      outlet_id: Number(row.outlet_id),
      order_status: row.order_status,
      order_state: row.order_state,
      service_type: row.service_type,
      source_flow: row.source_flow,
      settlement_flow: row.settlement_flow,
      is_finalized: Number(row.is_finalized),
      opened_at: row.opened_at,
      opened_at_ts: Number(row.opened_at_ts),
      closed_at: row.closed_at,
      closed_at_ts: row.closed_at_ts == null ? null : Number(row.closed_at_ts),
      updated_at: row.updated_at,
      updated_at_ts: Number(row.updated_at_ts),
      table_id: row.table_id == null ? null : Number(row.table_id),
      reservation_id: row.reservation_id == null ? null : Number(row.reservation_id),
      guest_count: row.guest_count == null ? null : Number(row.guest_count),
      paid_amount: row.paid_amount,
      notes: row.notes,
      created_at: row.created_at
    };
    result.set(row.order_id, snapshot);
  }

  return result;
}
