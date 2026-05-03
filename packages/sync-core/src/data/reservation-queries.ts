// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { KyselySchema } from "@jurnapod/db";
import { toUtcIso } from "@jurnapod/shared";

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
  db: KyselySchema,
  companyId: number,
  outletId: number
): Promise<ReservationQueryResult[]> {
  // Calculate date boundaries in JavaScript (milliseconds since epoch)
  const now = Date.now();
  const startOfToday = Math.floor(now / 86400000) * 86400000;
  const startOfDayAfterTomorrow = startOfToday + 2 * 86400000;

  const result = await db
    .selectFrom('reservations as r')
    .select([
      'r.id', 'r.company_id', 'r.outlet_id', 'r.table_id', 'r.customer_name', 'r.customer_phone',
      'r.guest_count', 'r.reservation_at', 'r.reservation_start_ts', 'r.reservation_end_ts',
      'r.duration_minutes', 'r.status', 'r.notes', 'r.linked_order_id', 'r.arrived_at',
      'r.seated_at', 'r.cancelled_at', 'r.updated_at'
    ])
    .where('r.company_id', '=', companyId)
    .where('r.outlet_id', '=', outletId)
    .where('r.status', 'in', ['BOOKED', 'CONFIRMED', 'ARRIVED', 'SEATED'])
    .where((eb) => eb.or([
      eb.and([
        eb('r.reservation_start_ts', 'is not', null),
        eb('r.reservation_start_ts', '>=', startOfToday),
        eb('r.reservation_start_ts', '<', startOfDayAfterTomorrow)
      ]),
      eb.and([
        eb('r.reservation_start_ts', 'is', null)
      ])
    ]))
    .orderBy('reservation_start_ts', 'asc')
    .execute();
  
  return result.map((row: any) => ({
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
    arrived_at: row.arrived_at ? toUtcIso.dateLike(row.arrived_at) as string : null,
    seated_at: row.seated_at ? toUtcIso.dateLike(row.seated_at) as string : null,
    cancelled_at: row.cancelled_at ? toUtcIso.dateLike(row.cancelled_at) as string : null,
    updated_at: toUtcIso.dateLike(row.updated_at) as string
  }));
}

/**
 * Get reservations changed since a specific version for incremental sync.
 */
export async function getReservationsChangedSince(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  updatedSince: string
): Promise<ReservationQueryResult[]> {
  const result = await db
    .selectFrom('reservations as r')
    .select([
      'r.id', 'r.company_id', 'r.outlet_id', 'r.table_id', 'r.customer_name', 'r.customer_phone',
      'r.guest_count', 'r.reservation_at', 'r.reservation_start_ts', 'r.reservation_end_ts',
      'r.duration_minutes', 'r.status', 'r.notes', 'r.linked_order_id', 'r.arrived_at',
      'r.seated_at', 'r.cancelled_at', 'r.updated_at'
    ])
    .where('r.company_id', '=', companyId)
    .where('r.outlet_id', '=', outletId)
    .where('r.updated_at', '>=', updatedSince as any)
    .orderBy('reservation_start_ts', 'asc')
    .execute();
  
  return result.map((row: any) => ({
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
    arrived_at: row.arrived_at ? toUtcIso.dateLike(row.arrived_at) as string : null,
    seated_at: row.seated_at ? toUtcIso.dateLike(row.seated_at) as string : null,
    cancelled_at: row.cancelled_at ? toUtcIso.dateLike(row.cancelled_at) as string : null,
    updated_at: toUtcIso.dateLike(row.updated_at) as string
  }));
}