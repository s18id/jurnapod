// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// /**
//  * Reservations Domain Module - CRUD Operations
//  *
//  * This file contains read and write operations for reservations.
//  * Part of Story 6.5b-c (Reservations Domain Extraction).
//  */

import { sql } from "kysely";
import { getDb, type KyselySchema } from "../db";
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
  db: KyselySchema,
  companyId: number,
  reservationId: number
): Promise<ReservationDbRow> {
  const result = await sql<ReservationDbRow>`
    SELECT id, company_id, outlet_id, table_id, customer_name, customer_phone, guest_count,
            reservation_at, reservation_start_ts, reservation_end_ts,
            duration_minutes, status, notes, linked_order_id,
            created_at, updated_at, arrived_at, seated_at, cancelled_at, status_id
     FROM reservations
     WHERE company_id = ${companyId} AND id = ${reservationId}
     LIMIT 1
     FOR UPDATE
  `.execute(db);

  if (result.rows.length === 0) {
    throw new ReservationNotFoundError(reservationId);
  }

  return result.rows[0]!;
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
  const db = getDb();
  const conditions: ReturnType<typeof sql>[] = [
    sql`company_id = ${companyId}`,
    sql`outlet_id = ${query.outlet_id}`
  ];

  if (query.status) {
    conditions.push(sql`status = ${query.status}`);
  }

  if (query.from && query.to) {
    if (query.overlap_filter) {
      conditions.push(sql`
        ((reservation_start_ts IS NOT NULL AND reservation_end_ts IS NOT NULL 
          AND reservation_start_ts < ${toUnixMs(query.to) + 1} AND reservation_end_ts > ${toUnixMs(query.from)}) 
        OR (reservation_start_ts IS NULL AND reservation_at >= ${toDbDateTime(query.from)} AND reservation_at <= ${toDbDateTime(query.to)}))
      `);
    } else {
      conditions.push(sql`
        ((reservation_start_ts IS NOT NULL AND reservation_start_ts >= ${toUnixMs(query.from)} AND reservation_start_ts <= ${toUnixMs(query.to)}) 
        OR (reservation_start_ts IS NULL AND reservation_at >= ${toDbDateTime(query.from)} AND reservation_at <= ${toDbDateTime(query.to)}))
      `);
    }
  } else if (query.from) {
    if (query.overlap_filter) {
      conditions.push(sql`
        ((reservation_start_ts IS NOT NULL AND reservation_end_ts IS NOT NULL AND reservation_end_ts > ${toUnixMs(query.from)}) 
        OR (reservation_start_ts IS NULL AND reservation_at >= ${toDbDateTime(query.from)}))
      `);
    } else {
      conditions.push(sql`
        ((reservation_start_ts IS NOT NULL AND reservation_start_ts >= ${toUnixMs(query.from)}) 
        OR (reservation_start_ts IS NULL AND reservation_at >= ${toDbDateTime(query.from)}))
      `);
    }
  } else if (query.to) {
    if (query.overlap_filter) {
      conditions.push(sql`
        ((reservation_start_ts IS NOT NULL AND reservation_start_ts < ${toUnixMs(query.to) + 1}) 
        OR (reservation_start_ts IS NULL AND reservation_at <= ${toDbDateTime(query.to)}))
      `);
    } else {
      conditions.push(sql`
        ((reservation_start_ts IS NOT NULL AND reservation_start_ts <= ${toUnixMs(query.to)}) 
        OR (reservation_start_ts IS NULL AND reservation_at <= ${toDbDateTime(query.to)}))
      `);
    }
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const result = await sql<ReservationDbRow>`
    SELECT id, company_id, outlet_id, table_id, customer_name, customer_phone, guest_count,
            reservation_at, reservation_start_ts, reservation_end_ts,
            duration_minutes, status, notes, linked_order_id,
            created_at, updated_at, arrived_at, seated_at, cancelled_at, status_id
     FROM reservations
     WHERE ${whereClause}
     ORDER BY reservation_start_ts IS NULL ASC, reservation_start_ts ASC, reservation_at ASC, id ASC
     LIMIT ${query.limit} OFFSET ${query.offset}
  `.execute(db);

  return result.rows.map(mapRow);
}

/**
 * Get outlet ID for a reservation (for tenant verification)
 */
export async function readReservationOutletId(
  companyId: number,
  reservationId: number
): Promise<number | null> {
  const db = getDb();
  const result = await sql<{ outlet_id: number }>`
    SELECT outlet_id FROM reservations WHERE id = ${reservationId} AND company_id = ${companyId} LIMIT 1
  `.execute(db);
  if (result.rows.length === 0) {
    return null;
  }
  return Number(result.rows[0]!.outlet_id);
}

/**
 * Get a single reservation by ID with tenant isolation (Story 12.4 interface)
 */
export async function getReservation(
  id: bigint,
  companyId: bigint,
  outletId: bigint
): Promise<Reservation | null> {
  const db = getDb();
  return getReservationV2WithConnection(db, id, companyId, outletId);
}

/**
 * Internal: Get reservation with connection for transaction support
 */
async function getReservationV2WithConnection(
  db: KyselySchema,
  id: bigint,
  companyId: bigint,
  outletId: bigint
): Promise<Reservation | null> {
  const result = await sql<ReservationDbRow>`
    SELECT
      id, company_id, outlet_id, table_id,
      status_id, status,
      guest_count,
      customer_name, customer_phone,
      reservation_at, reservation_start_ts, reservation_end_ts,
      duration_minutes, notes,
      created_at, updated_at
    FROM reservations
    WHERE id = ${id} AND company_id = ${companyId} AND outlet_id = ${outletId}
    LIMIT 1
  `.execute(db);

  if (result.rows.length === 0) {
    return null;
  }

  return mapDbRowToReservation(result.rows[0]!);
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
  const db = getDb();
  const conditions: ReturnType<typeof sql>[] = [
    sql`r.company_id = ${params.companyId}`,
    sql`r.outlet_id = ${params.outletId}`
  ];

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
      conditions.push(sql`(r.status_id = ${params.statusId} OR r.status = ${legacyStatus})`);
    } else {
      conditions.push(sql`r.status_id = ${params.statusId}`);
    }
  }

  if (params.tableId !== undefined) {
    conditions.push(sql`r.table_id = ${params.tableId}`);
  }

  if (params.customerName) {
    conditions.push(sql`r.customer_name LIKE ${`%${params.customerName}%`}`);
  }

  // Date filtering: calendar mode uses interval overlap, report mode uses point-in-time
  if (params.fromDate && params.toDate) {
    if (params.useOverlapFilter) {
      conditions.push(sql`
        ((r.reservation_start_ts IS NOT NULL AND r.reservation_end_ts IS NOT NULL 
          AND r.reservation_start_ts < ${toUnixMs(params.toDate) + 1} AND r.reservation_end_ts > ${toUnixMs(params.fromDate)}) 
        OR (r.reservation_start_ts IS NULL AND r.reservation_at >= ${toDbDateTime(params.fromDate)} AND r.reservation_at <= ${toDbDateTime(params.toDate)}))
      `);
    } else {
      conditions.push(sql`
        ((r.reservation_start_ts IS NOT NULL AND r.reservation_start_ts >= ${toUnixMs(params.fromDate)} AND r.reservation_start_ts <= ${toUnixMs(params.toDate)}) 
        OR (r.reservation_start_ts IS NULL AND r.reservation_at >= ${toDbDateTime(params.fromDate)} AND r.reservation_at <= ${toDbDateTime(params.toDate)}))
      `);
    }
  } else if (params.fromDate) {
    if (params.useOverlapFilter) {
      conditions.push(sql`
        ((r.reservation_start_ts IS NOT NULL AND r.reservation_end_ts IS NOT NULL AND r.reservation_end_ts > ${toUnixMs(params.fromDate)}) 
        OR (r.reservation_start_ts IS NULL AND r.reservation_at >= ${toDbDateTime(params.fromDate)}))
      `);
    } else {
      conditions.push(sql`
        ((r.reservation_start_ts IS NOT NULL AND r.reservation_start_ts >= ${toUnixMs(params.fromDate)}) 
        OR (r.reservation_start_ts IS NULL AND r.reservation_at >= ${toDbDateTime(params.fromDate)}))
      `);
    }
  } else if (params.toDate) {
    if (params.useOverlapFilter) {
      conditions.push(sql`
        ((r.reservation_start_ts IS NOT NULL AND r.reservation_start_ts < ${toUnixMs(params.toDate) + 1}) 
        OR (r.reservation_start_ts IS NULL AND r.reservation_at <= ${toDbDateTime(params.toDate)}))
      `);
    } else {
      conditions.push(sql`
        ((r.reservation_start_ts IS NOT NULL AND r.reservation_start_ts <= ${toUnixMs(params.toDate)}) 
        OR (r.reservation_start_ts IS NULL AND r.reservation_at <= ${toDbDateTime(params.toDate)}))
      `);
    }
  }

  const whereClause = sql.join(conditions, sql` AND `);

  // Get total count
  const countResult = await sql<{ total: number }>`
    SELECT COUNT(*) as total FROM reservations r WHERE ${whereClause}
  `.execute(db);
  const total = Number(countResult.rows[0]?.total ?? 0);

  // Get reservations with pagination
  const result = await sql<ReservationDbRow>`
    SELECT
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
    WHERE ${whereClause}
    ORDER BY r.reservation_start_ts IS NULL ASC, r.reservation_start_ts ASC, r.reservation_at ASC, r.id ASC
    LIMIT ${params.limit} OFFSET ${params.offset}
  `.execute(db);

  const reservations = result.rows.map(mapDbRowToReservation);

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
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    if (input.table_id) {
      const table = await readTableForUpdate(trx, companyId, input.outlet_id, input.table_id);
      const tableAlreadyReserved = await hasActiveReservationOnTable(
        trx,
        companyId,
        input.outlet_id,
        input.table_id
      );
      if (table.status === "OCCUPIED" || table.status === "UNAVAILABLE" || tableAlreadyReserved || table.status === "RESERVED") {
        throw new ReservationValidationError("Selected table is not available for reservation");
      }
      await setTableStatus(trx, companyId, input.outlet_id, input.table_id, "RESERVED");
    }

    const reservationAtDb = toDbDateTime(input.reservation_at);
    const reservationStartTs = toUnixMs(input.reservation_at);
    const effectiveDurationMinutes = await resolveEffectiveDurationMinutes(companyId, input.duration_minutes);
    const reservationEndTs = reservationStartTs + effectiveDurationMinutes * 60000;

    // Generate a reservation code for the new reservation
    const reservationCode = await generateReservationCodeWithConnection(
      trx,
      BigInt(input.outlet_id)
    );

    // Check which columns exist to build the appropriate INSERT
    const hasReservationCodeCol = await columnExists(trx, 'reservations', 'reservation_code');
    const hasStatusIdCol = await columnExists(trx, 'reservations', 'status_id');
    const hasCreatedByCol = await columnExists(trx, 'reservations', 'created_by');
    const hasReservationStartTsCol = await columnExists(trx, 'reservations', 'reservation_start_ts');
    const hasReservationEndTsCol = await columnExists(trx, 'reservations', 'reservation_end_ts');
    const hasCanonicalTsCols = hasReservationStartTsCol && hasReservationEndTsCol;

    let insertResult;
    if (hasReservationCodeCol && hasStatusIdCol && hasCreatedByCol && hasCanonicalTsCols) {
      // All new columns exist
      insertResult = await sql`
        INSERT INTO reservations (
          company_id, outlet_id, table_id, customer_name, customer_phone,
          guest_count, reservation_at, reservation_start_ts, reservation_end_ts,
          duration_minutes, status, notes,
          reservation_code, status_id, created_by
        ) VALUES (
          ${companyId}, ${input.outlet_id}, ${input.table_id ?? null}, ${input.customer_name},
          ${input.customer_phone ?? null}, ${input.guest_count}, ${reservationAtDb},
          ${reservationStartTs}, ${reservationEndTs}, ${input.duration_minutes ?? null},
          'BOOKED', ${input.notes ?? null}, ${reservationCode}, ${ReservationStatusV2.PENDING}, 'system'
        )
      `.execute(trx);
    } else if (hasReservationCodeCol && hasStatusIdCol && hasCreatedByCol) {
      insertResult = await sql`
        INSERT INTO reservations (
          company_id, outlet_id, table_id, customer_name, customer_phone,
          guest_count, reservation_at, duration_minutes, status, notes,
          reservation_code, status_id, created_by
        ) VALUES (
          ${companyId}, ${input.outlet_id}, ${input.table_id ?? null}, ${input.customer_name},
          ${input.customer_phone ?? null}, ${input.guest_count}, ${reservationAtDb},
          ${input.duration_minutes ?? null}, 'BOOKED', ${input.notes ?? null},
          ${reservationCode}, ${ReservationStatusV2.PENDING}, 'system'
        )
      `.execute(trx);
    } else if (hasCanonicalTsCols) {
      insertResult = await sql`
        INSERT INTO reservations (
          company_id, outlet_id, table_id, customer_name, customer_phone,
          guest_count, reservation_at, reservation_start_ts, reservation_end_ts,
          duration_minutes, status, status_id, notes
        ) VALUES (
          ${companyId}, ${input.outlet_id}, ${input.table_id ?? null}, ${input.customer_name},
          ${input.customer_phone ?? null}, ${input.guest_count}, ${reservationAtDb},
          ${reservationStartTs}, ${reservationEndTs}, ${input.duration_minutes ?? null},
          'BOOKED', 1, ${input.notes ?? null}
        )
      `.execute(trx);
    } else {
      // Use legacy columns only
      insertResult = await sql`
        INSERT INTO reservations (
          company_id, outlet_id, table_id, customer_name, customer_phone,
          guest_count, reservation_at, duration_minutes, status, status_id, notes
        ) VALUES (
          ${companyId}, ${input.outlet_id}, ${input.table_id ?? null}, ${input.customer_name},
          ${input.customer_phone ?? null}, ${input.guest_count}, ${reservationAtDb},
          ${input.duration_minutes ?? null}, 'BOOKED', 1, ${input.notes ?? null}
        )
      `.execute(trx);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reservationId = Number((insertResult as any).insertId ?? 0);
    const row = await readReservationForUpdate(trx, companyId, reservationId);
    return mapRow(row);
  });
}

/**
 * Update reservation details including status transitions (legacy interface)
 */
export async function updateReservation(
  companyId: number,
  reservationId: number,
  patch: ReservationUpdateRequest
): Promise<ReservationRow> {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    const current = await readReservationForUpdate(trx, companyId, reservationId);
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
      const table = await readTableForUpdate(trx, companyId, current.outlet_id, nextTableId);
      const tableAlreadyReserved = await hasActiveReservationOnTable(
        trx,
        companyId,
        current.outlet_id,
        nextTableId,
        reservationId
      );
      if (table.status === "OCCUPIED" || table.status === "UNAVAILABLE" || tableAlreadyReserved) {
        throw new ReservationValidationError("Selected table is not assignable");
      }
    }

    const hasReservationStartTsCol = await columnExists(trx, 'reservations', 'reservation_start_ts');
    const hasReservationEndTsCol = await columnExists(trx, 'reservations', 'reservation_end_ts');

    if (hasReservationStartTsCol && hasReservationEndTsCol) {
      await sql`UPDATE reservations SET table_id = ${nextTableId}, customer_name = ${patch.customer_name ?? current.customer_name}, customer_phone = ${patch.customer_phone === undefined ? current.customer_phone : patch.customer_phone}, guest_count = ${patch.guest_count ?? current.guest_count}, reservation_at = ${nextReservationAtDb}, reservation_start_ts = ${reservationStartTs}, reservation_end_ts = ${reservationEndTs}, duration_minutes = ${nextDurationMinutes}, status = ${nextStatus}, notes = ${patch.notes === undefined ? current.notes : patch.notes}, arrived_at = CASE WHEN ${nextStatus} = 'ARRIVED' THEN CURRENT_TIMESTAMP ELSE arrived_at END, seated_at = CASE WHEN ${nextStatus} = 'SEATED' THEN CURRENT_TIMESTAMP ELSE seated_at END, cancelled_at = CASE WHEN ${nextStatus} IN ('CANCELLED', 'NO_SHOW') THEN CURRENT_TIMESTAMP ELSE cancelled_at END, updated_at = CURRENT_TIMESTAMP WHERE company_id = ${companyId} AND id = ${reservationId}`.execute(trx);
    } else {
      await sql`UPDATE reservations SET table_id = ${nextTableId}, customer_name = ${patch.customer_name ?? current.customer_name}, customer_phone = ${patch.customer_phone === undefined ? current.customer_phone : patch.customer_phone}, guest_count = ${patch.guest_count ?? current.guest_count}, reservation_at = ${nextReservationAtDb}, duration_minutes = ${nextDurationMinutes}, status = ${nextStatus}, notes = ${patch.notes === undefined ? current.notes : patch.notes}, arrived_at = CASE WHEN ${nextStatus} = 'ARRIVED' THEN CURRENT_TIMESTAMP ELSE arrived_at END, seated_at = CASE WHEN ${nextStatus} = 'SEATED' THEN CURRENT_TIMESTAMP ELSE seated_at END, cancelled_at = CASE WHEN ${nextStatus} IN ('CANCELLED', 'NO_SHOW') THEN CURRENT_TIMESTAMP ELSE cancelled_at END, updated_at = CURRENT_TIMESTAMP WHERE company_id = ${companyId} AND id = ${reservationId}`.execute(trx);
    }

    const impactedTableIds = new Set<number>();
    if (current.table_id != null) {
      impactedTableIds.add(current.table_id);
    }
    if (nextTableId != null) {
      impactedTableIds.add(nextTableId);
    }

    for (const tableId of impactedTableIds) {
      await recomputeTableStatus(trx, companyId, current.outlet_id, tableId);
    }

    const updated = await readReservationForUpdate(trx, companyId, reservationId);
    return mapRow(updated);
  });
}

/**
 * Create a new reservation (Story 12.4 interface)
 * Inserts with PENDING status and generates reservation code
 */
export async function createReservationV2(
  input: CreateReservationInput
): Promise<Reservation> {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    // Check for overlapping reservations if table is specified
    const durationMinutes = input.durationMinutes ?? 90;
    const tableId = input.tableId ?? null;

    if (tableId) {
      const overlapExists = await checkReservationOverlap(
        trx,
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
      trx,
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
    const hasReservationCode = await columnExists(trx, 'reservations', 'reservation_code');
    const hasCustomerEmail = await columnExists(trx, 'reservations', 'customer_email');
    const hasCreatedBy = await columnExists(trx, 'reservations', 'created_by');
    const hasStatusId = await columnExists(trx, 'reservations', 'status_id');
    const hasReservationStartTs = await columnExists(trx, 'reservations', 'reservation_start_ts');
    const hasReservationEndTs = await columnExists(trx, 'reservations', 'reservation_end_ts');
    const hasCanonicalTsCols = hasReservationStartTs && hasReservationEndTs;

    let insertResult;
    if (hasReservationCode && hasCustomerEmail && hasCreatedBy && hasStatusId && hasCanonicalTsCols) {
      // All new columns exist
      insertResult = await sql`
        INSERT INTO reservations (
          company_id, outlet_id, table_id,
          customer_name, customer_phone,
          guest_count, reservation_at, reservation_start_ts, reservation_end_ts,
          duration_minutes,
          status, notes, reservation_code, customer_email,
          created_by, status_id
        ) VALUES (
          ${input.companyId}, ${input.outletId}, ${tableId},
          ${input.customerName}, ${input.customerPhone ?? null},
          ${input.partySize}, ${reservationAt}, ${reservationStartTs}, ${reservationEndTs},
          ${durationMinutes},
          'BOOKED', ${input.notes ?? null}, ${reservationCode}, ${input.customerEmail ?? null},
          ${input.createdBy}, ${ReservationStatusV2.PENDING}
        )
      `.execute(trx);
    } else if (hasReservationCode && hasCustomerEmail && hasCreatedBy && hasStatusId) {
      insertResult = await sql`
        INSERT INTO reservations (
          company_id, outlet_id, table_id,
          customer_name, customer_phone,
          guest_count, reservation_at, duration_minutes,
          status, notes, reservation_code, customer_email,
          created_by, status_id
        ) VALUES (
          ${input.companyId}, ${input.outletId}, ${tableId},
          ${input.customerName}, ${input.customerPhone ?? null},
          ${input.partySize}, ${reservationAt}, ${durationMinutes},
          'BOOKED', ${input.notes ?? null}, ${reservationCode}, ${input.customerEmail ?? null},
          ${input.createdBy}, ${ReservationStatusV2.PENDING}
        )
      `.execute(trx);
    } else if (hasCanonicalTsCols) {
      insertResult = await sql`
        INSERT INTO reservations (
          company_id, outlet_id, table_id,
          customer_name, customer_phone,
          guest_count, reservation_at, reservation_start_ts, reservation_end_ts,
          duration_minutes, status, status_id, notes
        ) VALUES (
          ${input.companyId}, ${input.outletId}, ${tableId},
          ${input.customerName}, ${input.customerPhone ?? null},
          ${input.partySize}, ${reservationAt}, ${reservationStartTs}, ${reservationEndTs},
          ${durationMinutes}, 'BOOKED', 1, ${input.notes ?? null}
        )
      `.execute(trx);
    } else {
      // Use legacy columns only
      insertResult = await sql`
        INSERT INTO reservations (
          company_id, outlet_id, table_id,
          customer_name, customer_phone,
          guest_count, reservation_at, duration_minutes,
          status, status_id, notes
        ) VALUES (
          ${input.companyId}, ${input.outletId}, ${tableId},
          ${input.customerName}, ${input.customerPhone ?? null},
          ${input.partySize}, ${reservationAt}, ${durationMinutes},
          'BOOKED', 1, ${input.notes ?? null}
        )
      `.execute(trx);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reservationId = BigInt((insertResult as any).insertId ?? 0);

    // Fetch within the transaction so a failed fetch causes rollback (no orphan)
    const reservation = await getReservationV2WithConnection(
      trx,
      reservationId,
      input.companyId,
      input.outletId
    );

    if (!reservation) {
      throw new Error('Failed to retrieve created reservation');
    }

    // Preserve in-memory values for columns that may not exist in the DB schema yet
    return {
      ...reservation,
      reservationCode: reservation.reservationCode || reservationCode,
      createdBy: reservation.createdBy || input.createdBy,
    };
  });
}
