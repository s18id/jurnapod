// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { DbConn } from "@jurnapod/db";
import type { RowDataPacket } from "mysql2";
import { toRfc3339Required } from "@jurnapod/shared";

export type ReservationQueryResult = {
  reservation_id: number;
  company_id: number;
  outlet_id: number;
  table_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  guest_count: number;
  reservation_at: string;
  reservation_start_ts: number | null;
  reservation_end_ts: number | null;
  duration_minutes: number | null;
  status: "BOOKED" | "CONFIRMED" | "ARRIVED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  notes: string | null;
  linked_order_id: number | null;
  arrived_at: string | null;
  seated_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
};

/**
 * Get active reservations for an outlet (today and tomorrow).
 * Active statuses: BOOKED, CONFIRMED, ARRIVED, SEATED.
 */
export async function getActiveReservationsForSync(
  db: DbConn,
  companyId: number,
  outletId: number
): Promise<ReservationQueryResult[]> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT id, company_id, outlet_id, table_id, customer_name, customer_phone, 
            guest_count, reservation_at, reservation_start_ts, reservation_end_ts,
            duration_minutes, status, notes, linked_order_id, arrived_at, 
            seated_at, cancelled_at, updated_at
     FROM reservations
     WHERE company_id = ? 
       AND outlet_id = ?
       AND status IN ('BOOKED', 'CONFIRMED', 'ARRIVED', 'SEATED')
       AND (
         (
           reservation_start_ts IS NOT NULL
           AND reservation_start_ts >= (UNIX_TIMESTAMP(CURDATE()) * 1000)
           AND reservation_start_ts < (UNIX_TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 2 DAY)) * 1000)
         )
         OR (
           reservation_start_ts IS NULL
           AND reservation_at >= CURDATE()
           AND reservation_at < DATE_ADD(CURDATE(), INTERVAL 2 DAY)
         )
       )
     ORDER BY reservation_start_ts IS NULL ASC, reservation_start_ts ASC, reservation_at ASC`,
    [companyId, outletId]
  );
  
  return rows.map((row) => ({
    reservation_id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    table_id: row.table_id == null ? null : Number(row.table_id),
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    guest_count: Number(row.guest_count),
    reservation_at: row.reservation_at,
    reservation_start_ts: row.reservation_start_ts == null ? null : Number(row.reservation_start_ts),
    reservation_end_ts: row.reservation_end_ts == null ? null : Number(row.reservation_end_ts),
    duration_minutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    status: row.status,
    notes: row.notes,
    linked_order_id: row.linked_order_id == null ? null : Number(row.linked_order_id),
    arrived_at: row.arrived_at ? toRfc3339Required(row.arrived_at) : null,
    seated_at: row.seated_at ? toRfc3339Required(row.seated_at) : null,
    cancelled_at: row.cancelled_at ? toRfc3339Required(row.cancelled_at) : null,
    updated_at: toRfc3339Required(row.updated_at)
  }));
}

/**
 * Get reservations changed since a specific version for incremental sync.
 */
export async function getReservationsChangedSince(
  db: DbConn,
  companyId: number,
  outletId: number,
  updatedSince: string
): Promise<ReservationQueryResult[]> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT id, company_id, outlet_id, table_id, customer_name, customer_phone, 
            guest_count, reservation_at, reservation_start_ts, reservation_end_ts,
            duration_minutes, status, notes, linked_order_id, arrived_at, 
            seated_at, cancelled_at, updated_at
     FROM reservations
     WHERE company_id = ? 
       AND outlet_id = ?
       AND updated_at >= ?
     ORDER BY reservation_start_ts IS NULL ASC, reservation_start_ts ASC, reservation_at ASC`,
    [companyId, outletId, updatedSince]
  );
  
  return rows.map((row) => ({
    reservation_id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    table_id: row.table_id == null ? null : Number(row.table_id),
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    guest_count: Number(row.guest_count),
    reservation_at: row.reservation_at,
    reservation_start_ts: row.reservation_start_ts == null ? null : Number(row.reservation_start_ts),
    reservation_end_ts: row.reservation_end_ts == null ? null : Number(row.reservation_end_ts),
    duration_minutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    status: row.status,
    notes: row.notes,
    linked_order_id: row.linked_order_id == null ? null : Number(row.linked_order_id),
    arrived_at: row.arrived_at ? toRfc3339Required(row.arrived_at) : null,
    seated_at: row.seated_at ? toRfc3339Required(row.seated_at) : null,
    cancelled_at: row.cancelled_at ? toRfc3339Required(row.cancelled_at) : null,
    updated_at: toRfc3339Required(row.updated_at)
  }));
}
