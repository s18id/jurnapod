// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservations Domain Module - Availability & Overlap Checking
 *
 * This file contains functions for checking table availability and reservation overlap.
 * Part of Story 6.5c (Reservations Domain Extraction).
 */

import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "../db";
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
  connection: PoolConnection,
  companyId: bigint,
  outletId: bigint,
  tableId: bigint
): Promise<{ statusId: number; version: number; reservationId: bigint | null } | null> {
  const [rows] = await connection.execute<OccupancySnapshotRow[]>(
    `SELECT status_id, version, reservation_id
     FROM table_occupancy
     WHERE company_id = ?
       AND outlet_id = ?
       AND table_id = ?
     FOR UPDATE`,
    [companyId, outletId, tableId]
  );

  if (rows.length === 0) {
    return null;
  }

  const reservationIdRaw = rows[0].reservation_id;
  return {
    statusId: Number(rows[0].status_id),
    version: Number(rows[0].version),
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
  connection: PoolConnection,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<OutletTableRow> {
  const [rows] = await connection.execute<OutletTableRow[]>(
    `SELECT id, status
     FROM outlet_tables
     WHERE company_id = ? AND outlet_id = ? AND id = ?
     LIMIT 1
     FOR UPDATE`,
    [companyId, outletId, tableId]
  );

  if (rows.length === 0) {
    throw new ReservationValidationError(`Table ${tableId} not found in outlet`);
  }

  return rows[0];
}

/**
 * Set table status in outlet_tables
 */
export async function setTableStatus(
  connection: PoolConnection,
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

  await connection.execute(
    `UPDATE outlet_tables
     SET status = ?, status_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE company_id = ? AND outlet_id = ? AND id = ?`,
    [status, statusId, companyId, outletId, tableId]
  );
}

// ============================================================================
// OPEN ORDER CHECK
// ============================================================================

/**
 * Check if table has an open dine-in order
 */
export async function hasOpenDineInOrderOnTable(
  connection: PoolConnection,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<boolean> {
  const [rows] = await connection.execute<Array<RowDataPacket & { count_open: number }>>(
    `SELECT COUNT(*) AS count_open
     FROM pos_order_snapshots
     WHERE company_id = ?
       AND outlet_id = ?
       AND table_id = ?
       AND order_state = 'OPEN'
       AND service_type = 'DINE_IN'`,
    [companyId, outletId, tableId]
  );

  return Number(rows[0]?.count_open ?? 0) > 0;
}

// ============================================================================
// TABLE STATUS RECOMPUTATION
// ============================================================================

/**
 * Recompute table status based on reservations and open orders
 */
export async function recomputeTableStatus(
  connection: PoolConnection,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<void> {
  const table = await readTableForUpdate(connection, companyId, outletId, tableId);
  if (table.status === "UNAVAILABLE") {
    return;
  }

  const hasOpenDineIn = await hasOpenDineInOrderOnTable(connection, companyId, outletId, tableId);
  if (hasOpenDineIn) {
    await setTableStatus(connection, companyId, outletId, tableId, "OCCUPIED");
    return;
  }

  const [rows] = await connection.execute<
    Array<
      RowDataPacket & {
        count_seated: number;
        count_pre_seated: number;
      }
    >
  >(
    `SELECT
       SUM(CASE WHEN status = 'SEATED' THEN 1 ELSE 0 END) AS count_seated,
       SUM(CASE WHEN status IN ('BOOKED', 'CONFIRMED', 'ARRIVED') THEN 1 ELSE 0 END) AS count_pre_seated
     FROM reservations
     WHERE company_id = ?
       AND outlet_id = ?
       AND table_id = ?`,
    [companyId, outletId, tableId]
  );

  const seatedCount = Number(rows[0]?.count_seated ?? 0);
  const preSeatedCount = Number(rows[0]?.count_pre_seated ?? 0);

  if (seatedCount > 0) {
    await setTableStatus(connection, companyId, outletId, tableId, "OCCUPIED");
    return;
  }

  if (preSeatedCount > 0) {
    await setTableStatus(connection, companyId, outletId, tableId, "RESERVED");
    return;
  }

  await setTableStatus(connection, companyId, outletId, tableId, "AVAILABLE");
}

// ============================================================================
// ACTIVE RESERVATION CHECK
// ============================================================================

/**
 * Check if table has an active (non-final) reservation
 */
export async function hasActiveReservationOnTable(
  connection: PoolConnection,
  companyId: number,
  outletId: number,
  tableId: number,
  exceptReservationId?: number
): Promise<boolean> {
  const [rows] = await connection.execute<Array<RowDataPacket & { count_active: number }>>(
    `SELECT COUNT(*) AS count_active
     FROM reservations
     WHERE company_id = ?
       AND outlet_id = ?
       AND table_id = ?
       AND status NOT IN ('COMPLETED', 'CANCELLED', 'NO_SHOW')
       AND (? IS NULL OR id <> ?)`,
    [companyId, outletId, tableId, exceptReservationId ?? null, exceptReservationId ?? null]
  );

  return Number(rows[0]?.count_active ?? 0) > 0;
}

// ============================================================================
// RESERVATION OVERLAP CHECKING
// ============================================================================

/**
 * Check if a reservation overlaps with existing reservations for the same table
 * Overlap exists if: existing_start < new_end AND existing_end > new_start
 */
export async function checkReservationOverlap(
  connection: PoolConnection,
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

  const canonicalSql = `
    SELECT COUNT(*) as count
    FROM reservations
    WHERE company_id = ?
      AND outlet_id = ?
      AND table_id = ?
      AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
      AND reservation_start_ts IS NOT NULL
      AND reservation_end_ts IS NOT NULL
      AND reservation_start_ts < ?
      AND reservation_end_ts > ?
      ${excludeReservationId ? 'AND id != ?' : ''}
  `;

  const canonicalParams: (bigint | number)[] = [companyId, outletId, tableId, newEndTs, newStartTs];
  if (excludeReservationId) {
    canonicalParams.push(excludeReservationId);
  }

  const [canonicalRows] = await connection.execute<Array<RowDataPacket & { count: number }>>(canonicalSql, canonicalParams);
  if (Number(canonicalRows[0]?.count ?? 0) > 0) {
    return true;
  }

  const legacySql = `
    SELECT reservation_start_ts, reservation_end_ts, reservation_at, duration_minutes
    FROM reservations
    WHERE company_id = ?
      AND outlet_id = ?
      AND table_id = ?
      AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
      AND (reservation_start_ts IS NULL OR reservation_end_ts IS NULL)
      ${excludeReservationId ? 'AND id != ?' : ''}
  `;

  const legacyParams: (bigint | number)[] = [companyId, outletId, tableId];
  if (excludeReservationId) {
    legacyParams.push(excludeReservationId);
  }

  const [legacyRows] = await connection.execute<LegacyOverlapRow[]>(legacySql, legacyParams);
  if (legacyRows.length === 0) {
    return false;
  }

  const defaultDurationMinutes = await resolveEffectiveDurationMinutes(Number(companyId), null);
  for (const row of legacyRows) {
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
  connection: PoolConnection,
  tableName: string,
  columnName: string
): Promise<boolean> {
  try {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT 1 FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = ? 
         AND COLUMN_NAME = ?
       LIMIT 1`,
      [tableName, columnName]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}
