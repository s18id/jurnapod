// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservations Domain Module - CRUD Operations
 *
 * This file contains read and write operations for reservations.
 * Part of Story 6.5b-c (Reservations Domain Extraction).
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "../db";
import {
  ReservationStatusV2,
  type ReservationListQuery,
  type ReservationUpdateRequest,
  type ReservationRow,
  type ReservationCreateRequest,
  type ReservationStatus,
} from "@jurnapod/shared";
// Import types from local types module
import type {
  Reservation,
  ReservationDbRow,
  CreateReservationInput,
  ListReservationsParams,
} from "./types";
import {
  ReservationNotFoundError,
  ReservationValidationError,
  ReservationConflictError,
} from "./types";

// Import helpers from utils (single source of truth)
import {
  toDbDateTime,
  toUnixMs,
  mapRow,
  mapDbRowToReservation,
  resolveEffectiveDurationMinutes,
  columnExists,
  generateReservationCodeWithConnection,
  isFinalStatus,
} from "./utils";

// Import availability helpers
import {
  checkReservationOverlap,
  hasActiveReservationOnTable,
  readTableForUpdate,
  setTableStatus,
  recomputeTableStatus,
} from "./availability";

// Re-export for use by other modules (availability, status)
export { getReservationV2WithConnection };

// Re-export helpers from utils for backward compatibility
export { mapRow, mapDbRowToReservation };

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * Legacy status transition check for the legacy updateReservation interface.
 * Uses legacy status names (BOOKED, ARRIVED, SEATED, ...) and allows same-status no-ops.
 */
function legacyCanTransition(fromStatus: string, toStatus: string): boolean {
  if (fromStatus === toStatus) {
    return true;
  }
  const transitions: Record<string, string[]> = {
    BOOKED: ["CONFIRMED", "ARRIVED", "CANCELLED", "NO_SHOW"],
    CONFIRMED: ["ARRIVED", "CANCELLED", "NO_SHOW"],
    ARRIVED: ["SEATED", "CANCELLED", "NO_SHOW"],
    SEATED: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: [],
    NO_SHOW: []
  };
  return transitions[fromStatus]?.includes(toStatus) ?? false;
}

async function readReservationForUpdate(
  connection: PoolConnection,
  companyId: number,
  reservationId: number
): Promise<ReservationDbRow> {
  const [rows] = await connection.execute<ReservationDbRow[]>(
    `SELECT id, company_id, outlet_id, table_id, customer_name, customer_phone, guest_count,
            reservation_at, reservation_start_ts, reservation_end_ts,
            duration_minutes, status, notes, linked_order_id,
            created_at, updated_at, arrived_at, seated_at, cancelled_at, status_id
     FROM reservations
     WHERE company_id = ? AND id = ?
     LIMIT 1
     FOR UPDATE`,
    [companyId, reservationId]
  );

  if (rows.length === 0) {
    throw new ReservationNotFoundError(reservationId);
  }

  return rows[0];
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * List reservations with filtering and pagination (legacy interface)
 */
export async function listReservations(
  companyId: number,
  query: ReservationListQuery
): Promise<ReservationRow[]> {
  const pool = getDbPool();
  const where: string[] = ["company_id = ?", "outlet_id = ?"];
  const params: Array<number | string> = [companyId, query.outlet_id];

  if (query.status) {
    where.push("status = ?");
    params.push(query.status);
  }

  if (query.from && query.to) {
    if (query.overlap_filter) {
      where.push(
        "((reservation_start_ts IS NOT NULL AND reservation_end_ts IS NOT NULL " +
        "  AND reservation_start_ts < ? AND reservation_end_ts > ?) " +
        "OR (reservation_start_ts IS NULL AND reservation_at >= ? AND reservation_at <= ?))"
      );
      params.push(
        toUnixMs(query.to) + 1,
        toUnixMs(query.from),
        toDbDateTime(query.from),
        toDbDateTime(query.to)
      );
    } else {
      where.push("((reservation_start_ts IS NOT NULL AND reservation_start_ts >= ? AND reservation_start_ts <= ?) OR (reservation_start_ts IS NULL AND reservation_at >= ? AND reservation_at <= ?))");
      params.push(toUnixMs(query.from), toUnixMs(query.to), toDbDateTime(query.from), toDbDateTime(query.to));
    }
  } else if (query.from) {
    if (query.overlap_filter) {
      where.push("((reservation_start_ts IS NOT NULL AND reservation_end_ts IS NOT NULL AND reservation_end_ts > ?) OR (reservation_start_ts IS NULL AND reservation_at >= ?))");
      params.push(toUnixMs(query.from), toDbDateTime(query.from));
    } else {
      where.push("((reservation_start_ts IS NOT NULL AND reservation_start_ts >= ?) OR (reservation_start_ts IS NULL AND reservation_at >= ?))");
      params.push(toUnixMs(query.from), toDbDateTime(query.from));
    }
  } else if (query.to) {
    if (query.overlap_filter) {
      where.push("((reservation_start_ts IS NOT NULL AND reservation_start_ts < ?) OR (reservation_start_ts IS NULL AND reservation_at <= ?))");
      params.push(toUnixMs(query.to) + 1, toDbDateTime(query.to));
    } else {
      where.push("((reservation_start_ts IS NOT NULL AND reservation_start_ts <= ?) OR (reservation_start_ts IS NULL AND reservation_at <= ?))");
      params.push(toUnixMs(query.to), toDbDateTime(query.to));
    }
  }

  params.push(query.limit, query.offset);
  const [rows] = await pool.execute<ReservationDbRow[]>(
    `SELECT id, company_id, outlet_id, table_id, customer_name, customer_phone, guest_count,
            reservation_at, reservation_start_ts, reservation_end_ts,
            duration_minutes, status, notes, linked_order_id,
            created_at, updated_at, arrived_at, seated_at, cancelled_at, status_id
     FROM reservations
     WHERE ${where.join(" AND ")}
     ORDER BY reservation_start_ts IS NULL ASC, reservation_start_ts ASC, reservation_at ASC, id ASC
     LIMIT ? OFFSET ?`,
    params
  );

  return rows.map(mapRow);
}

/**
 * Get outlet ID for a reservation (for tenant verification)
 */
export async function readReservationOutletId(
  companyId: number,
  reservationId: number
): Promise<number | null> {
  const pool = getDbPool();
  const [rows] = await pool.execute<Array<RowDataPacket & { outlet_id: number }>>(
    `SELECT outlet_id FROM reservations WHERE id = ? AND company_id = ? LIMIT 1`,
    [reservationId, companyId]
  );
  if (rows.length === 0) {
    return null;
  }
  return Number(rows[0].outlet_id);
}

/**
 * Get a single reservation by ID with tenant isolation (Story 12.4 interface)
 */
export async function getReservation(
  id: bigint,
  companyId: bigint,
  outletId: bigint
): Promise<Reservation | null> {
  const pool = getDbPool();
  return getReservationV2WithConnection(pool as unknown as PoolConnection, id, companyId, outletId);
}

/**
 * Internal: Get reservation with connection for transaction support
 */
async function getReservationV2WithConnection(
  connection: PoolConnection | { execute: Function },
  id: bigint,
  companyId: bigint,
  outletId: bigint
): Promise<Reservation | null> {
  const [rows] = await connection.execute<ReservationDbRow[]>(
    `SELECT
      id, company_id, outlet_id, table_id,
      status_id, status,
      guest_count,
      customer_name, customer_phone,
      reservation_at, reservation_start_ts, reservation_end_ts,
      duration_minutes, notes,
      created_at, updated_at
    FROM reservations
    WHERE id = ? AND company_id = ? AND outlet_id = ?
    LIMIT 1`,
    [id, companyId, outletId]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapDbRowToReservation(rows[0]);
}

/**
 * List reservations with flexible filtering (Story 12.4 interface)
 *
 * Date filtering modes:
 * - Calendar mode (useOverlapFilter=true): Returns reservations that overlap with the date range.
 * - Report mode (useOverlapFilter=false, default): Returns reservations that START within the date range.
 */
export async function listReservationsV2(
  params: ListReservationsParams
): Promise<{ reservations: Reservation[]; total: number }> {
  const pool = getDbPool();

  const whereConditions: string[] = ['r.company_id = ?', 'r.outlet_id = ?'];
  const queryParams: (bigint | number | string | Date)[] = [params.companyId, params.outletId];

  // Add optional filters with fallback to legacy columns
  if (params.statusId !== undefined) {
    const legacyStatusMap: Record<number, string> = {
      [ReservationStatusV2.PENDING]: 'BOOKED',
      [ReservationStatusV2.CONFIRMED]: 'CONFIRMED',
      [ReservationStatusV2.CHECKED_IN]: 'ARRIVED',
      [ReservationStatusV2.NO_SHOW]: 'NO_SHOW',
      [ReservationStatusV2.CANCELLED]: 'CANCELLED',
      [ReservationStatusV2.COMPLETED]: 'COMPLETED'
    };
    const legacyStatus = legacyStatusMap[params.statusId];
    if (legacyStatus) {
      whereConditions.push('(r.status_id = ? OR r.status = ?)');
      queryParams.push(params.statusId, legacyStatus);
    } else {
      whereConditions.push('r.status_id = ?');
      queryParams.push(params.statusId);
    }
  }

  if (params.tableId !== undefined) {
    whereConditions.push('r.table_id = ?');
    queryParams.push(params.tableId);
  }

  if (params.customerName) {
    whereConditions.push('r.customer_name LIKE ?');
    queryParams.push(`%${params.customerName}%`);
  }

  // Date filtering: calendar mode uses interval overlap, report mode uses point-in-time
  if (params.fromDate && params.toDate) {
    if (params.useOverlapFilter) {
      whereConditions.push(
        '((r.reservation_start_ts IS NOT NULL AND r.reservation_end_ts IS NOT NULL ' +
        '  AND r.reservation_start_ts < ? AND r.reservation_end_ts > ?) ' +
        'OR (r.reservation_start_ts IS NULL AND r.reservation_at >= ? AND r.reservation_at <= ?))'
      );
      queryParams.push(
        toUnixMs(params.toDate) + 1,
        toUnixMs(params.fromDate),
        toDbDateTime(params.fromDate),
        toDbDateTime(params.toDate)
      );
    } else {
      whereConditions.push(
        '((r.reservation_start_ts IS NOT NULL AND r.reservation_start_ts >= ? AND r.reservation_start_ts <= ?) ' +
        'OR (r.reservation_start_ts IS NULL AND r.reservation_at >= ? AND r.reservation_at <= ?))'
      );
      queryParams.push(
        toUnixMs(params.fromDate),
        toUnixMs(params.toDate),
        toDbDateTime(params.fromDate),
        toDbDateTime(params.toDate)
      );
    }
  } else if (params.fromDate) {
    if (params.useOverlapFilter) {
      whereConditions.push(
        '((r.reservation_start_ts IS NOT NULL AND r.reservation_end_ts IS NOT NULL AND r.reservation_end_ts > ?) ' +
        'OR (r.reservation_start_ts IS NULL AND r.reservation_at >= ?))'
      );
      queryParams.push(toUnixMs(params.fromDate), toDbDateTime(params.fromDate));
    } else {
      whereConditions.push(
        '((r.reservation_start_ts IS NOT NULL AND r.reservation_start_ts >= ?) ' +
        'OR (r.reservation_start_ts IS NULL AND r.reservation_at >= ?))'
      );
      queryParams.push(toUnixMs(params.fromDate), toDbDateTime(params.fromDate));
    }
  } else if (params.toDate) {
    if (params.useOverlapFilter) {
      whereConditions.push(
        '((r.reservation_start_ts IS NOT NULL AND r.reservation_start_ts < ?) ' +
        'OR (r.reservation_start_ts IS NULL AND r.reservation_at <= ?))'
      );
      queryParams.push(toUnixMs(params.toDate) + 1, toDbDateTime(params.toDate));
    } else {
      whereConditions.push(
        '((r.reservation_start_ts IS NOT NULL AND r.reservation_start_ts <= ?) ' +
        'OR (r.reservation_start_ts IS NULL AND r.reservation_at <= ?))'
      );
      queryParams.push(toUnixMs(params.toDate), toDbDateTime(params.toDate));
    }
  }

  // Get total count
  const countSql = `SELECT COUNT(*) as total FROM reservations r WHERE ${whereConditions.join(' AND ')}`;
  const [countRows] = await pool.execute<RowDataPacket[]>(countSql, queryParams);
  const total = Number(countRows[0]?.total ?? 0);

  // Get reservations with pagination
  const dataParams = [...queryParams, params.limit, params.offset];
  const [rows] = await pool.execute<ReservationDbRow[]>(
    `SELECT
      r.id, r.company_id, r.outlet_id, r.table_id,
      r.status_id, r.status,
      r.guest_count,
      r.customer_name, r.customer_phone,
      r.reservation_at, r.reservation_start_ts, r.reservation_end_ts,
      r.duration_minutes, r.notes,
      r.created_at, r.updated_at,
      ot.code as table_code, ot.name as table_name
    FROM reservations r
    LEFT JOIN outlet_tables ot ON r.table_id = ot.id
      AND r.company_id = ot.company_id
      AND r.outlet_id = ot.outlet_id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY r.reservation_start_ts IS NULL ASC, r.reservation_start_ts ASC, r.reservation_at ASC, r.id ASC
    LIMIT ? OFFSET ?`,
    dataParams
  );

  const reservations = rows.map(mapDbRowToReservation);

  return { reservations, total };
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Create a new reservation (legacy interface)
 */
export async function createReservation(
  companyId: number,
  input: ReservationCreateRequest
): Promise<ReservationRow> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (input.table_id) {
      const table = await readTableForUpdate(connection, companyId, input.outlet_id, input.table_id);
      const tableAlreadyReserved = await hasActiveReservationOnTable(
        connection,
        companyId,
        input.outlet_id,
        input.table_id
      );
      if (table.status === "OCCUPIED" || table.status === "UNAVAILABLE" || tableAlreadyReserved || table.status === "RESERVED") {
        throw new ReservationValidationError("Selected table is not available for reservation");
      }
      await setTableStatus(connection, companyId, input.outlet_id, input.table_id, "RESERVED");
    }

    const reservationAtDb = toDbDateTime(input.reservation_at);
    const reservationStartTs = toUnixMs(input.reservation_at);
    const effectiveDurationMinutes = await resolveEffectiveDurationMinutes(companyId, input.duration_minutes);
    const reservationEndTs = reservationStartTs + effectiveDurationMinutes * 60000;

    // Generate a reservation code for the new reservation
    const reservationCode = await generateReservationCodeWithConnection(
      connection,
      BigInt(input.outlet_id)
    );

    // Check which columns exist to build the appropriate INSERT
    const hasReservationCodeCol = await columnExists(connection, 'reservations', 'reservation_code');
    const hasStatusIdCol = await columnExists(connection, 'reservations', 'status_id');
    const hasCreatedByCol = await columnExists(connection, 'reservations', 'created_by');
    const hasReservationStartTsCol = await columnExists(connection, 'reservations', 'reservation_start_ts');
    const hasReservationEndTsCol = await columnExists(connection, 'reservations', 'reservation_end_ts');
    const hasCanonicalTsCols = hasReservationStartTsCol && hasReservationEndTsCol;

    let insertSql: string;
    let insertValues: (string | number | null)[];

    if (hasReservationCodeCol && hasStatusIdCol && hasCreatedByCol && hasCanonicalTsCols) {
      // All new columns exist
      insertSql = `INSERT INTO reservations (
         company_id, outlet_id, table_id, customer_name, customer_phone,
         guest_count, reservation_at, reservation_start_ts, reservation_end_ts,
         duration_minutes, status, notes,
         reservation_code, status_id, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', ?, ?, ?, ?)`;
      insertValues = [
        companyId,
        input.outlet_id,
        input.table_id ?? null,
        input.customer_name,
        input.customer_phone ?? null,
        input.guest_count,
        reservationAtDb,
        reservationStartTs,
        reservationEndTs,
        input.duration_minutes ?? null,
        input.notes ?? null,
        reservationCode,
        ReservationStatusV2.PENDING,
        'system'
      ];
    } else if (hasReservationCodeCol && hasStatusIdCol && hasCreatedByCol) {
      insertSql = `INSERT INTO reservations (
         company_id, outlet_id, table_id, customer_name, customer_phone,
         guest_count, reservation_at, duration_minutes, status, notes,
         reservation_code, status_id, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', ?, ?, ?, ?)`;
      insertValues = [
        companyId,
        input.outlet_id,
        input.table_id ?? null,
        input.customer_name,
        input.customer_phone ?? null,
        input.guest_count,
        reservationAtDb,
        input.duration_minutes ?? null,
        input.notes ?? null,
        reservationCode,
        ReservationStatusV2.PENDING,
        'system'
      ];
    } else if (hasCanonicalTsCols) {
      insertSql = `INSERT INTO reservations (
         company_id, outlet_id, table_id, customer_name, customer_phone,
         guest_count, reservation_at, reservation_start_ts, reservation_end_ts,
         duration_minutes, status, status_id, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', 1, ?)`;
      insertValues = [
        companyId,
        input.outlet_id,
        input.table_id ?? null,
        input.customer_name,
        input.customer_phone ?? null,
        input.guest_count,
        reservationAtDb,
        reservationStartTs,
        reservationEndTs,
        input.duration_minutes ?? null,
        input.notes ?? null
      ];
    } else {
      // Use legacy columns only
      insertSql = `INSERT INTO reservations (
         company_id, outlet_id, table_id, customer_name, customer_phone,
         guest_count, reservation_at, duration_minutes, status, status_id, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', 1, ?)`;
      insertValues = [
        companyId,
        input.outlet_id,
        input.table_id ?? null,
        input.customer_name,
        input.customer_phone ?? null,
        input.guest_count,
        reservationAtDb,
        input.duration_minutes ?? null,
        input.notes ?? null
      ];
    }

    const [insertResult] = await connection.execute<ResultSetHeader>(insertSql, insertValues);

    const reservationId = Number(insertResult.insertId);
    const row = await readReservationForUpdate(connection, companyId, reservationId);
    await connection.commit();
    return mapRow(row);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Update reservation details including status transitions (legacy interface)
 */
export async function updateReservation(
  companyId: number,
  reservationId: number,
  patch: ReservationUpdateRequest
): Promise<ReservationRow> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const current = await readReservationForUpdate(connection, companyId, reservationId);
    const nextReservationAt = patch.reservation_at === undefined ? current.reservation_at : patch.reservation_at;
    const nextDurationMinutes = patch.duration_minutes === undefined ? current.duration_minutes : patch.duration_minutes;
    const nextReservationAtDb = toDbDateTime(nextReservationAt);
    const reservationStartTs = toUnixMs(nextReservationAt);
    const effectiveDurationMinutes = await resolveEffectiveDurationMinutes(companyId, nextDurationMinutes);
    const reservationEndTs = reservationStartTs + effectiveDurationMinutes * 60000;

    const nextStatus = patch.status ?? current.status;
    if (!legacyCanTransition(current.status ?? '', nextStatus ?? '')) {
      throw new ReservationValidationError(`Invalid reservation transition: ${current.status} -> ${nextStatus}`);
    }

    if (isFinalStatus(current.status as ReservationStatus) && current.status !== nextStatus) {
      throw new ReservationValidationError("Finalized reservation cannot be modified");
    }

    if (
      isFinalStatus(current.status as ReservationStatus) &&
      (patch.table_id !== undefined ||
        patch.customer_name !== undefined ||
        patch.customer_phone !== undefined ||
        patch.guest_count !== undefined ||
        patch.reservation_at !== undefined ||
        patch.duration_minutes !== undefined ||
        patch.notes !== undefined)
    ) {
      throw new ReservationValidationError("Finalized reservation cannot be modified");
    }

    const nextTableId = patch.table_id === undefined ? current.table_id : patch.table_id;

    if (nextStatus === "SEATED" && !nextTableId) {
      throw new ReservationValidationError("Seated reservation requires table assignment");
    }

    if (nextTableId && current.table_id !== nextTableId) {
      const table = await readTableForUpdate(connection, companyId, current.outlet_id, nextTableId);
      const tableAlreadyReserved = await hasActiveReservationOnTable(
        connection,
        companyId,
        current.outlet_id,
        nextTableId,
        reservationId
      );
      if (table.status === "OCCUPIED" || table.status === "UNAVAILABLE" || tableAlreadyReserved) {
        throw new ReservationValidationError("Selected table is not assignable");
      }
    }

    const hasReservationStartTsCol = await columnExists(connection, 'reservations', 'reservation_start_ts');
    const hasReservationEndTsCol = await columnExists(connection, 'reservations', 'reservation_end_ts');

    const updateAssignments = [
      'table_id = ?',
      'customer_name = ?',
      'customer_phone = ?',
      'guest_count = ?',
      'reservation_at = ?',
      'duration_minutes = ?',
      'status = ?',
      'notes = ?',
      "arrived_at = CASE WHEN ? = 'ARRIVED' THEN CURRENT_TIMESTAMP ELSE arrived_at END",
      "seated_at = CASE WHEN ? = 'SEATED' THEN CURRENT_TIMESTAMP ELSE seated_at END",
      "cancelled_at = CASE WHEN ? IN ('CANCELLED', 'NO_SHOW') THEN CURRENT_TIMESTAMP ELSE cancelled_at END",
      'updated_at = CURRENT_TIMESTAMP'
    ];

    const updateValues: Array<string | number | null> = [
      nextTableId,
      patch.customer_name ?? current.customer_name,
      patch.customer_phone === undefined ? current.customer_phone : patch.customer_phone,
      patch.guest_count ?? current.guest_count,
      nextReservationAtDb,
      nextDurationMinutes,
      nextStatus,
      patch.notes === undefined ? current.notes : patch.notes,
      nextStatus,
      nextStatus,
      nextStatus
    ];

    if (hasReservationStartTsCol && hasReservationEndTsCol) {
      updateAssignments.splice(6, 0, 'reservation_start_ts = ?', 'reservation_end_ts = ?');
      updateValues.splice(6, 0, reservationStartTs, reservationEndTs);
    }

    updateValues.push(companyId, reservationId);

    await connection.execute(
      `UPDATE reservations
       SET ${updateAssignments.join(',\n           ')}
       WHERE company_id = ? AND id = ?`,
      updateValues
    );

    const impactedTableIds = new Set<number>();
    if (current.table_id != null) {
      impactedTableIds.add(current.table_id);
    }
    if (nextTableId != null) {
      impactedTableIds.add(nextTableId);
    }

    for (const tableId of impactedTableIds) {
      await recomputeTableStatus(connection, companyId, current.outlet_id, tableId);
    }

    const updated = await readReservationForUpdate(connection, companyId, reservationId);
    await connection.commit();
    return mapRow(updated);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Create a new reservation (Story 12.4 interface)
 * Inserts with PENDING status and generates reservation code
 */
export async function createReservationV2(
  input: CreateReservationInput
): Promise<Reservation> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Check for overlapping reservations if table is specified
    const durationMinutes = input.durationMinutes ?? 90;
    const tableId = input.tableId ?? null;

    if (tableId) {
      const overlapExists = await checkReservationOverlap(
        connection,
        input.companyId,
        input.outletId,
        tableId,
        input.reservationTime,
        durationMinutes
      );

      if (overlapExists) {
        throw new ReservationConflictError('Table is already reserved for this time slot');
      }
    }

    // Generate unique reservation code
    const reservationCode = await generateReservationCodeWithConnection(
      connection,
      input.outletId
    );

    // Prepare values with fallbacks for columns that may not exist yet
    const reservationAt = toDbDateTime(input.reservationTime);
    const reservationStartTs = toUnixMs(input.reservationTime);
    const effectiveDurationMinutes = await resolveEffectiveDurationMinutes(
      Number(input.companyId),
      input.durationMinutes
    );
    const reservationEndTs = reservationStartTs + effectiveDurationMinutes * 60000;

    // Insert reservation — check which columns exist to build the appropriate INSERT
    const hasReservationCode = await columnExists(connection, 'reservations', 'reservation_code');
    const hasCustomerEmail = await columnExists(connection, 'reservations', 'customer_email');
    const hasCreatedBy = await columnExists(connection, 'reservations', 'created_by');
    const hasStatusId = await columnExists(connection, 'reservations', 'status_id');
    const hasReservationStartTs = await columnExists(connection, 'reservations', 'reservation_start_ts');
    const hasReservationEndTs = await columnExists(connection, 'reservations', 'reservation_end_ts');
    const hasCanonicalTsCols = hasReservationStartTs && hasReservationEndTs;

    let insertSql: string;
    let insertValues: (string | number | bigint | null)[];

    if (hasReservationCode && hasCustomerEmail && hasCreatedBy && hasStatusId && hasCanonicalTsCols) {
      // All new columns exist
      insertSql = `INSERT INTO reservations (
        company_id, outlet_id, table_id,
        customer_name, customer_phone,
        guest_count, reservation_at, reservation_start_ts, reservation_end_ts,
        duration_minutes,
        status, notes, reservation_code, customer_email,
        created_by, status_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', ?, ?, ?, ?, ?)`;
      insertValues = [
        input.companyId,
        input.outletId,
        tableId,
        input.customerName,
        input.customerPhone ?? null,
        input.partySize,
        reservationAt,
        reservationStartTs,
        reservationEndTs,
        durationMinutes,
        input.notes ?? null,
        reservationCode,
        input.customerEmail ?? null,
        input.createdBy,
        ReservationStatusV2.PENDING
      ];
    } else if (hasReservationCode && hasCustomerEmail && hasCreatedBy && hasStatusId) {
      insertSql = `INSERT INTO reservations (
        company_id, outlet_id, table_id,
        customer_name, customer_phone,
        guest_count, reservation_at, duration_minutes,
        status, notes, reservation_code, customer_email,
        created_by, status_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', ?, ?, ?, ?, ?)`;
      insertValues = [
        input.companyId,
        input.outletId,
        tableId,
        input.customerName,
        input.customerPhone ?? null,
        input.partySize,
        reservationAt,
        durationMinutes,
        input.notes ?? null,
        reservationCode,
        input.customerEmail ?? null,
        input.createdBy,
        ReservationStatusV2.PENDING
      ];
    } else if (hasCanonicalTsCols) {
      insertSql = `INSERT INTO reservations (
        company_id, outlet_id, table_id,
        customer_name, customer_phone,
        guest_count, reservation_at, reservation_start_ts, reservation_end_ts,
        duration_minutes, status, status_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', 1, ?)`;
      insertValues = [
        input.companyId,
        input.outletId,
        tableId,
        input.customerName,
        input.customerPhone ?? null,
        input.partySize,
        reservationAt,
        reservationStartTs,
        reservationEndTs,
        durationMinutes,
        input.notes ?? null
      ];
    } else {
      // Use legacy columns only
      insertSql = `INSERT INTO reservations (
        company_id, outlet_id, table_id,
        customer_name, customer_phone,
        guest_count, reservation_at, duration_minutes,
        status, status_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', 1, ?)`;
      insertValues = [
        input.companyId,
        input.outletId,
        tableId,
        input.customerName,
        input.customerPhone ?? null,
        input.partySize,
        reservationAt,
        durationMinutes,
        input.notes ?? null
      ];
    }

    const [insertResult] = await connection.execute<ResultSetHeader>(insertSql, insertValues);

    const reservationId = BigInt(insertResult.insertId);

    // Fetch within the transaction so a failed fetch causes rollback (no orphan)
    const reservation = await getReservationV2WithConnection(
      connection,
      reservationId,
      input.companyId,
      input.outletId
    );

    if (!reservation) {
      throw new Error('Failed to retrieve created reservation');
    }

    await connection.commit();

    // Preserve in-memory values for columns that may not exist in the DB schema yet
    return {
      ...reservation,
      reservationCode: reservation.reservationCode || reservationCode,
      createdBy: reservation.createdBy || input.createdBy,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
