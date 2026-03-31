// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// /**
//  * Reservations Domain Module - Availability & Overlap Checking
//  *
//  * This file contains functions for checking table availability and reservation overlap.
//  * Part of Story 6.5c (Reservations Domain Extraction).
//  */

import { sql } from "kysely";
import type { KyselySchema } from "../db";
import {
  OutletTableStatusId,
  type ReservationStatus
} from "@jurnapod/shared";
import { toUtcInstant, toEpochMs, fromEpochMs } from "../date-helpers";

// Import types from local types module
import type {
  OccupancySnapshotRow,
  OutletTableRow,
  LegacyOverlapRow,
  OutletTableStatus,
} from "./types";
import {
  RESERVATION_DEFAULT_DURATION_KEY,
  RESERVATION_DEFAULT_DURATION_FALLBACK,
  ReservationValidationError,
} from "./types";

// Import helpers from utils module
import { toUnixMs, fromUnixMs, resolveEffectiveDurationMinutes } from "./utils";

// ============================================================================
// TABLE OCCUPANCY SNAPSHOT
// ============================================================================

/**
 * Get table occupancy snapshot with row lock (FOR UPDATE)
 */
export async function getTableOccupancySnapshotWithConnection(
  db: KyselySchema,
  companyId: bigint,
  outletId: bigint,
  tableId: bigint
): Promise<{ statusId: number; version: number; reservationId: bigint | null } | null> {
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
    reservationId: reservationIdRaw == null ? null : BigInt(String(reservationIdRaw))
  };
}

// ============================================================================
// TABLE STATUS OPERATIONS
// ============================================================================

/**
 * Read table record with row lock (FOR UPDATE)
 */
export async function readTableForUpdate(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<OutletTableRow> {
  const result = await sql<OutletTableRow>`
    SELECT id, status
     FROM outlet_tables
     WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id = ${tableId}
     LIMIT 1
     FOR UPDATE
  `.execute(db);

  if (result.rows.length === 0) {
    throw new ReservationValidationError(`Table ${tableId} not found in outlet`);
  }

  return result.rows[0]!;
}

/**
 * Set table status in outlet_tables
 */
export async function setTableStatus(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  tableId: number,
  status: OutletTableStatus
): Promise<void> {
  const statusId =
    status === "UNAVAILABLE"
      ? OutletTableStatusId.UNAVAILABLE
      : status === "OCCUPIED"
        ? OutletTableStatusId.OCCUPIED
        : status === "RESERVED"
          ? OutletTableStatusId.RESERVED
          : OutletTableStatusId.AVAILABLE;

  await sql`
    UPDATE outlet_tables
     SET status = ${status}, status_id = ${statusId}, updated_at = CURRENT_TIMESTAMP
     WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id = ${tableId}
  `.execute(db);
}

// ============================================================================
// OPEN ORDER CHECK
// ============================================================================

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

// ============================================================================
// TABLE STATUS RECOMPUTATION
// ============================================================================

/**
 * Recompute table status based on reservations and open orders
 */
export async function recomputeTableStatus(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<void> {
  const table = await readTableForUpdate(db, companyId, outletId, tableId);
  if (table.status === "UNAVAILABLE") {
    return;
  }

  const hasOpenDineIn = await hasOpenDineInOrderOnTable(db, companyId, outletId, tableId);
  if (hasOpenDineIn) {
    await setTableStatus(db, companyId, outletId, tableId, "OCCUPIED");
    return;
  }

  const result = await sql<{ count_seated: number; count_pre_seated: number }>`
    SELECT
       SUM(CASE WHEN status = 'SEATED' THEN 1 ELSE 0 END) AS count_seated,
       SUM(CASE WHEN status IN ('BOOKED', 'CONFIRMED', 'ARRIVED') THEN 1 ELSE 0 END) AS count_pre_seated
     FROM reservations
     WHERE company_id = ${companyId}
       AND outlet_id = ${outletId}
       AND table_id = ${tableId}
  `.execute(db);

  const seatedCount = Number(result.rows[0]?.count_seated ?? 0);
  const preSeatedCount = Number(result.rows[0]?.count_pre_seated ?? 0);

  if (seatedCount > 0) {
    await setTableStatus(db, companyId, outletId, tableId, "OCCUPIED");
    return;
  }

  if (preSeatedCount > 0) {
    await setTableStatus(db, companyId, outletId, tableId, "RESERVED");
    return;
  }

  await setTableStatus(db, companyId, outletId, tableId, "AVAILABLE");
}

// ============================================================================
// ACTIVE RESERVATION CHECK
// ============================================================================

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
  const result = await sql<{ count_active: number }>`
    SELECT COUNT(*) AS count_active
     FROM reservations
     WHERE company_id = ${companyId}
       AND outlet_id = ${outletId}
       AND table_id = ${tableId}
       AND status NOT IN ('COMPLETED', 'CANCELLED', 'NO_SHOW')
       AND (${exceptId} IS NULL OR id <> ${exceptId})
  `.execute(db);

  return Number(result.rows[0]?.count_active ?? 0) > 0;
}

// ============================================================================
// RESERVATION OVERLAP CHECKING
// ============================================================================

/**
 * Check if a reservation overlaps with existing reservations for the same table
 * Overlap exists if: existing_start < new_end AND existing_end > new_start
 */
export async function checkReservationOverlap(
  db: KyselySchema,
  companyId: bigint,
  outletId: bigint,
  tableId: bigint | null,
  reservationTime: Date,
  durationMinutes: number,
  excludeReservationId?: bigint
): Promise<boolean> {
  if (!tableId) {
    return false;
  }

  const newStartTs = toUnixMs(reservationTime);
  const newEndTs = newStartTs + durationMinutes * 60000;

  let canonicalQuery = sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM reservations
    WHERE company_id = ${companyId}
      AND outlet_id = ${outletId}
      AND table_id = ${tableId}
      AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
      AND reservation_start_ts IS NOT NULL
      AND reservation_end_ts IS NOT NULL
      AND reservation_start_ts < ${newEndTs}
      AND reservation_end_ts > ${newStartTs}
  `;

  if (excludeReservationId) {
    canonicalQuery = sql<{ count: number }>`
      SELECT COUNT(*) as count
      FROM reservations
      WHERE company_id = ${companyId}
        AND outlet_id = ${outletId}
        AND table_id = ${tableId}
        AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
        AND reservation_start_ts IS NOT NULL
        AND reservation_end_ts IS NOT NULL
        AND reservation_start_ts < ${newEndTs}
        AND reservation_end_ts > ${newStartTs}
        AND id <> ${excludeReservationId}
    `;
  }

  const canonicalResult = await canonicalQuery.execute(db);
  if (Number(canonicalResult.rows[0]?.count ?? 0) > 0) {
    return true;
  }

  let legacyQuery = sql<LegacyOverlapRow>`
    SELECT reservation_start_ts, reservation_end_ts, reservation_at, duration_minutes
    FROM reservations
    WHERE company_id = ${companyId}
      AND outlet_id = ${outletId}
      AND table_id = ${tableId}
      AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
      AND (reservation_start_ts IS NULL OR reservation_end_ts IS NULL)
  `;

  if (excludeReservationId) {
    legacyQuery = sql<LegacyOverlapRow>`
      SELECT reservation_start_ts, reservation_end_ts, reservation_at, duration_minutes
      FROM reservations
      WHERE company_id = ${companyId}
        AND outlet_id = ${outletId}
        AND table_id = ${tableId}
        AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
        AND (reservation_start_ts IS NULL OR reservation_end_ts IS NULL)
        AND id <> ${excludeReservationId}
    `;
  }

  const legacyResult = await legacyQuery.execute(db);
  if (legacyResult.rows.length === 0) {
    return false;
  }

  const defaultDurationMinutes = await resolveEffectiveDurationMinutes(Number(companyId), null);
  for (const row of legacyResult.rows) {
    const existingDuration = row.duration_minutes ?? defaultDurationMinutes;
    let existingStartTs = fromUnixMs(row.reservation_start_ts);
    let existingEndTs = fromUnixMs(row.reservation_end_ts);

    if (existingStartTs === null && row.reservation_at) {
      existingStartTs = toUnixMs(row.reservation_at);
    }
    if (existingEndTs === null && existingStartTs !== null) {
      existingEndTs = existingStartTs + existingDuration * 60000;
    }
    if (existingStartTs === null && existingEndTs !== null) {
      existingStartTs = existingEndTs - existingDuration * 60000;
    }
    if (existingStartTs === null || existingEndTs === null) {
      continue;
    }

    if (existingStartTs < newEndTs && existingEndTs > newStartTs) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// SCHEMA HELPERS
// ============================================================================

/**
 * Check if a column exists in a table
 */
export async function columnExists(
  db: KyselySchema,
  tableName: string,
  columnName: string
): Promise<boolean> {
  try {
    const result = await sql`
      SELECT 1 FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = ${tableName}
         AND COLUMN_NAME = ${columnName}
       LIMIT 1
    `.execute(db);
    return result.rows.length > 0;
  } catch {
    return false;
  }
}
