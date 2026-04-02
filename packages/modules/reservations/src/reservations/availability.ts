// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservations Module - Availability & Overlap Checking
 *
 * Functions for checking table availability and reservation overlap.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { OccupancySnapshotRow } from "./types.js";
import type { UnixMs } from "../time/timestamp.js";
import { fromUnixMsToNumber, toUnixMsFromDate } from "./utils.js";
import { reservationsOverlap } from "../time/overlap.js";

/**
 * Get table occupancy snapshot with row lock (FOR UPDATE)
 */
export async function getTableOccupancySnapshotWithConnection(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<{ statusId: number; version: number; reservationId: number | null } | null> {
  const result = await sql<OccupancySnapshotRow>`
    SELECT status_id, version, reservation_id
     FROM table_occupancy
     WHERE company_id = ${companyId}
       AND outlet_id = ${outletId}
       AND table_id = ${tableId}
     FOR UPDATE
  `.execute(db);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0]!;
  const reservationIdRaw = row.reservation_id;
  return {
    statusId: Number(row.status_id),
    version: Number(row.version),
    reservationId: reservationIdRaw == null ? null : Number(reservationIdRaw)
  };
}

/**
 * Read table record with row lock (FOR UPDATE)
 */
export async function readTableForUpdate(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<{ id: number; status: string } | null> {
  const result = await sql`
    SELECT id, status
     FROM outlet_tables
     WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id = ${tableId}
     LIMIT 1
     FOR UPDATE
  `.execute(db);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as { id: number; status: string };
}

/**
 * Check if table has an open dine-in order
 */
export async function hasOpenDineInOrderOnTable(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<boolean> {
  const result = await sql<{ count_open: number }>`
    SELECT COUNT(*) AS count_open
     FROM pos_order_snapshots
     WHERE company_id = ${companyId}
       AND outlet_id = ${outletId}
       AND table_id = ${tableId}
       AND order_state = 'OPEN'
       AND service_type = 'DINE_IN'
  `.execute(db);

  return Number(result.rows[0]?.count_open ?? 0) > 0;
}

/**
 * Check if a reservation overlaps with existing reservations for the same table
 */
export async function checkReservationOverlap(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  tableId: number | null,
  reservationStartTs: UnixMs,
  durationMinutes: number,
  excludeReservationId?: number
): Promise<boolean> {
  if (!tableId) {
    return false;
  }

  const reservationEndTs = reservationStartTs + durationMinutes * 60_000;

  // Check canonical timestamps first
  let query = sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM reservations
    WHERE company_id = ${companyId}
      AND outlet_id = ${outletId}
      AND table_id = ${tableId}
      AND status NOT IN (4, 5, 6)  -- Not COMPLETED, CANCELLED, NO_SHOW
      AND reservation_start_ts IS NOT NULL
      AND reservation_end_ts IS NOT NULL
      AND reservation_start_ts < ${reservationEndTs}
      AND reservation_end_ts > ${reservationStartTs}
  `;

  if (excludeReservationId) {
    query = sql<{ count: number }>`
      SELECT COUNT(*) as count
      FROM reservations
      WHERE company_id = ${companyId}
        AND outlet_id = ${outletId}
        AND table_id = ${tableId}
        AND status NOT IN (4, 5, 6)
        AND reservation_start_ts IS NOT NULL
        AND reservation_end_ts IS NOT NULL
        AND reservation_start_ts < ${reservationEndTs}
        AND reservation_end_ts > ${reservationStartTs}
        AND id <> ${excludeReservationId}
    `;
  }

  const result = await query.execute(db);
  if (Number(result.rows[0]?.count ?? 0) > 0) {
    return true;
  }

  // Check legacy rows without canonical timestamps
  let legacyQuery = sql`
    SELECT reservation_start_ts, reservation_end_ts, reservation_at, duration_minutes
    FROM reservations
    WHERE company_id = ${companyId}
      AND outlet_id = ${outletId}
      AND table_id = ${tableId}
      AND status NOT IN (4, 5, 6)
      AND (reservation_start_ts IS NULL OR reservation_end_ts IS NULL)
  `;

  if (excludeReservationId) {
    legacyQuery = sql`
      SELECT reservation_start_ts, reservation_end_ts, reservation_at, duration_minutes
      FROM reservations
      WHERE company_id = ${companyId}
        AND outlet_id = ${outletId}
        AND table_id = ${tableId}
        AND status NOT IN (4, 5, 6)
        AND (reservation_start_ts IS NULL OR reservation_end_ts IS NULL)
        AND id <> ${excludeReservationId}
    `;
  }

  const legacyResult = await legacyQuery.execute(db);
  if (legacyResult.rows.length === 0) {
    return false;
  }

  const defaultDurationMinutes = 90;
  for (const row of legacyResult.rows) {
    const r = row as { reservation_start_ts: number | string | null; reservation_end_ts: number | string | null; reservation_at: string | null; duration_minutes: number | null };
    const existingDuration = r.duration_minutes ?? defaultDurationMinutes;
    let existingStartTs = fromUnixMsToNumber(r.reservation_start_ts);
    let existingEndTs = fromUnixMsToNumber(r.reservation_end_ts);

    if (existingStartTs === null && r.reservation_at) {
      existingStartTs = toUnixMsFromDate(r.reservation_at);
    }
    if (existingEndTs === null && existingStartTs !== null) {
      existingEndTs = existingStartTs + existingDuration * 60_000;
    }
    if (existingStartTs === null && existingEndTs !== null) {
      existingStartTs = existingEndTs - existingDuration * 60_000;
    }
    if (existingStartTs === null || existingEndTs === null) {
      continue;
    }

    if (reservationsOverlap(reservationStartTs, reservationEndTs, existingStartTs, existingEndTs)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if table has an active (non-final) reservation
 */
export async function hasActiveReservationOnTable(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  tableId: number,
  exceptReservationId?: number
): Promise<boolean> {
  const exceptId = exceptReservationId ?? null;
  let result;
  if (exceptId) {
    result = await sql<{ count_active: number }>`
      SELECT COUNT(*) AS count_active
       FROM reservations
       WHERE company_id = ${companyId}
         AND outlet_id = ${outletId}
         AND table_id = ${tableId}
         AND status NOT IN (4, 5, 6)
         AND id <> ${exceptId}
    `.execute(db);
  } else {
    result = await sql<{ count_active: number }>`
      SELECT COUNT(*) AS count_active
       FROM reservations
       WHERE company_id = ${companyId}
         AND outlet_id = ${outletId}
         AND table_id = ${tableId}
         AND status NOT IN (4, 5, 6)
    `.execute(db);
  }

  return Number(result.rows[0]?.count_active ?? 0) > 0;
}
