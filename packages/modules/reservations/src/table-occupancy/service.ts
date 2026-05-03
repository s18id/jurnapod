// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Table Occupancy Module - Service Operations
 *
 * Table occupancy management including hold, seat, release operations.
 */

import { sql } from "kysely";
import { randomBytes } from "node:crypto";
import type { KyselySchema } from "@jurnapod/db";
import { toUtcIso } from "@jurnapod/shared";
import type {
  TableOccupancyState,
  TableBoardItem,
  HoldTableInput,
  SeatTableInput,
  ReleaseTableInput,
} from "./types.js";
import {
  TableOccupancyStatus,
  TableEventType,
  TableOccupancyNotFoundError,
  TableOccupancyConflictError,
  TableNotAvailableError,
  TableNotOccupiedError,
} from "./types.js";

// ============================================================================
// TABLE BOARD QUERIES
// ============================================================================

type TableBoardRow = {
  table_id: number;
  table_code: string;
  table_name: string;
  capacity: number | null;
  zone: string | null;
  occupancy_status_id: number;
  current_session_id: number | null;
  current_reservation_id: number | null;
  guest_count: number | null;
  version: number;
  next_reservation_start_at: number | null;
  updated_at: Date;
};

/**
 * Get table board data for an outlet
 */
export async function getTableBoard(
  db: KyselySchema,
  companyId: number,
  outletId: number
): Promise<TableBoardItem[]> {
  const result = await sql<TableBoardRow>`
    SELECT 
      ot.id as table_id,
      ot.code as table_code,
      ot.name as table_name,
      ot.capacity,
      ot.zone,
      COALESCE(to2.status_id, ${TableOccupancyStatus.AVAILABLE}) as occupancy_status_id,
      to2.service_session_id as current_session_id,
      to2.reservation_id as current_reservation_id,
      to2.guest_count,
      COALESCE(to2.version, 1) as version,
      (
        SELECT MIN(
          CASE
            WHEN r.reservation_start_ts IS NOT NULL THEN r.reservation_start_ts
            ELSE UNIX_TIMESTAMP(r.reservation_at) * 1000
          END
        )
        FROM reservations r
        WHERE r.company_id = ot.company_id
          AND r.outlet_id = ot.outlet_id
          AND r.table_id = ot.id
          AND r.status_id IN (1, 2)
          AND (
            (r.reservation_start_ts IS NOT NULL AND r.reservation_start_ts >= (UNIX_TIMESTAMP(NOW()) * 1000))
            OR (r.reservation_start_ts IS NULL AND r.reservation_at >= NOW())
          )
      ) as next_reservation_start_at,
      COALESCE(to2.updated_at, ot.updated_at) as updated_at
    FROM outlet_tables ot
    LEFT JOIN table_occupancy to2 ON ot.id = to2.table_id
      AND ot.company_id = to2.company_id
      AND ot.outlet_id = to2.outlet_id
    WHERE ot.company_id = ${companyId}
      AND ot.outlet_id = ${outletId}
    ORDER BY ot.zone, ot.code
  `.execute(db);

  return result.rows.map(row => ({
    tableId: row.table_id,
    tableCode: row.table_code,
    tableName: row.table_name,
    capacity: row.capacity,
    zone: row.zone,
    occupancyStatusId: row.occupancy_status_id,
    availableNow: row.occupancy_status_id === TableOccupancyStatus.AVAILABLE,
    currentSessionId: row.current_session_id,
    currentReservationId: row.current_reservation_id,
    guestCount: row.guest_count,
    version: row.version,
    nextReservationStartAt:
      row.next_reservation_start_at == null
        ? null
        : new Date(row.next_reservation_start_at),
    updatedAt: new Date(row.updated_at)
  }));
}

// ============================================================================
// OCCUPANCY STATE MANAGEMENT
// ============================================================================

type TableOccupancyRow = {
  id: number;
  company_id: number;
  outlet_id: number;
  table_id: number;
  status_id: number;
  version: number;
  service_session_id: number | null;
  reservation_id: number | null;
  occupied_at: Date | null;
  reserved_until: Date | null;
  guest_count: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
};

/**
 * Get current occupancy state for a table
 */
export async function getTableOccupancy(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<TableOccupancyState | null> {
  const result = await sql<TableOccupancyRow>`
    SELECT 
      id,
      company_id,
      outlet_id,
      table_id,
      status_id,
      version,
      service_session_id,
      reservation_id,
      occupied_at,
      reserved_until,
      guest_count,
      notes,
      created_at,
      updated_at,
      created_by,
      updated_by
    FROM table_occupancy
    WHERE company_id = ${companyId}
      AND outlet_id = ${outletId}
      AND table_id = ${tableId}
  `.execute(db);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0]!;
  return {
    id: row.id,
    companyId: row.company_id,
    outletId: row.outlet_id,
    tableId: row.table_id,
    statusId: row.status_id,
    version: row.version,
    serviceSessionId: row.service_session_id,
    reservationId: row.reservation_id,
    occupiedAt: row.occupied_at ? new Date(row.occupied_at) : null,
    reservedUntil: row.reserved_until ? new Date(row.reserved_until) : null,
    guestCount: row.guest_count,
    notes: row.notes,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by
  };
}

/**
 * Hold a table for reservation
 */
export async function holdTable(
  db: KyselySchema,
  input: HoldTableInput
): Promise<{ occupancy: TableOccupancyState; newVersion: number }> {
  return db.transaction().execute(async (trx) => {
    return holdTableWithKysely(trx, input);
  });
}

/**
 * Hold a table with provided transaction
 */
export async function holdTableWithKysely(
  db: KyselySchema,
  input: HoldTableInput
): Promise<{ occupancy: TableOccupancyState; newVersion: number }> {
  // Get current occupancy state
  const currentState = await getTableOccupancyWithKysely(
    db,
    input.companyId,
    input.outletId,
    input.tableId
  );

  if (!currentState) {
    throw new TableOccupancyNotFoundError(input.tableId);
  }

  // Check optimistic locking version
  if (currentState.version !== input.expectedVersion) {
    throw new TableOccupancyConflictError(
      "Table state has changed",
      currentState
    );
  }

  // Check table is available
  if (currentState.statusId !== TableOccupancyStatus.AVAILABLE) {
    throw new TableNotAvailableError(input.tableId, currentState.statusId);
  }

  // Update occupancy to RESERVED
  const updateResult = await sql`
    UPDATE table_occupancy
    SET status_id = ${TableOccupancyStatus.RESERVED},
        reserved_until = ${input.heldUntil},
        reservation_id = ${input.reservationId ?? null},
        notes = ${input.notes ?? null},
        version = version + 1,
        updated_at = NOW(),
        updated_by = ${input.createdBy}
    WHERE company_id = ${input.companyId}
      AND outlet_id = ${input.outletId}
      AND table_id = ${input.tableId}
      AND version = ${input.expectedVersion}
  `.execute(db);

  if ((updateResult as any).affectedRows === 0) {
    throw new TableOccupancyConflictError(
      "Table state has changed during update",
      currentState
    );
  }

  // Log the event
  await logTableEventWithKysely(db, {
    companyId: input.companyId,
    outletId: input.outletId,
    tableId: input.tableId,
    eventTypeId: TableEventType.RESERVATION_CREATED,
    clientTxId: randomBytes(16).toString('hex'),
    occupancyVersionBefore: currentState.version,
    occupancyVersionAfter: currentState.version + 1,
    eventData: { reason: "Table held for reservation", heldUntil: toUtcIso.dateLike(input.heldUntil) },
    statusIdBefore: currentState.statusId,
    statusIdAfter: TableOccupancyStatus.RESERVED,
    serviceSessionId: null,
    reservationId: input.reservationId ?? null,
    posOrderId: null,
    occurredAt: new Date(),
    createdBy: input.createdBy
  });

  const updatedState = await getTableOccupancyWithKysely(
    db,
    input.companyId,
    input.outletId,
    input.tableId
  );

  if (!updatedState) {
    throw new Error("Failed to retrieve updated occupancy state");
  }

  return {
    occupancy: updatedState,
    newVersion: updatedState.version
  };
}

/**
 * Seat guests at a table
 */
export async function seatTable(
  db: KyselySchema,
  input: SeatTableInput
): Promise<{ sessionId: number; occupancy: TableOccupancyState }> {
  return db.transaction().execute(async (trx) => {
    return seatTableWithKysely(trx, input);
  });
}

/**
 * Seat guests at a table with provided transaction
 */
export async function seatTableWithKysely(
  db: KyselySchema,
  input: SeatTableInput
): Promise<{ sessionId: number; occupancy: TableOccupancyState }> {
  // Get current occupancy state
  const currentState = await getTableOccupancyWithKysely(
    db,
    input.companyId,
    input.outletId,
    input.tableId
  );

  if (!currentState) {
    throw new TableOccupancyNotFoundError(input.tableId);
  }

  // Check optimistic locking version
  if (currentState.version !== input.expectedVersion) {
    throw new TableOccupancyConflictError(
      "Table state has changed",
      currentState
    );
  }

  // Check table is available or reserved (not occupied)
  if (currentState.statusId === TableOccupancyStatus.OCCUPIED) {
    throw new TableNotAvailableError(input.tableId, currentState.statusId);
  }

  // Create service session
  const insertResult = await sql`
    INSERT INTO table_service_sessions
    (company_id, outlet_id, table_id, status_id, started_at, guest_count, guest_name, notes, created_at, updated_at, created_by)
    VALUES (
      ${input.companyId},
      ${input.outletId},
      ${input.tableId},
      1,
      NOW(),
      ${input.guestCount},
      ${input.guestName ?? null},
      ${input.notes ?? null},
      NOW(),
      NOW(),
      ${input.createdBy}
    )
  `.execute(db);

  const sessionId = Number((insertResult as any).insertId);

  // Update occupancy to OCCUPIED
  const updateResult = await sql`
    UPDATE table_occupancy
    SET status_id = ${TableOccupancyStatus.OCCUPIED},
        service_session_id = ${sessionId},
        occupied_at = NOW(),
        guest_count = ${input.guestCount},
        reservation_id = ${input.reservationId ?? null},
        version = version + 1,
        updated_at = NOW(),
        updated_by = ${input.createdBy}
    WHERE company_id = ${input.companyId}
      AND outlet_id = ${input.outletId}
      AND table_id = ${input.tableId}
      AND version = ${input.expectedVersion}
  `.execute(db);

  if ((updateResult as any).affectedRows === 0) {
    throw new TableOccupancyConflictError(
      "Table state has changed during update",
      currentState
    );
  }

  // Log the event
  await logTableEventWithKysely(db, {
    companyId: input.companyId,
    outletId: input.outletId,
    tableId: input.tableId,
    eventTypeId: TableEventType.TABLE_OPENED,
    clientTxId: randomBytes(16).toString('hex'),
    occupancyVersionBefore: currentState.version,
    occupancyVersionAfter: currentState.version + 1,
    eventData: {
      reason: "Guests seated",
      guestCount: input.guestCount,
      guestName: input.guestName
    },
    statusIdBefore: currentState.statusId,
    statusIdAfter: TableOccupancyStatus.OCCUPIED,
    serviceSessionId: sessionId,
    reservationId: input.reservationId ?? null,
    posOrderId: null,
    occurredAt: new Date(),
    createdBy: input.createdBy
  });

  const updatedState = await getTableOccupancyWithKysely(
    db,
    input.companyId,
    input.outletId,
    input.tableId
  );

  if (!updatedState) {
    throw new Error("Failed to retrieve updated occupancy state");
  }

  return {
    sessionId,
    occupancy: updatedState
  };
}

/**
 * Release a table after service
 */
export async function releaseTable(
  db: KyselySchema,
  input: ReleaseTableInput
): Promise<{ occupancy: TableOccupancyState; newVersion: number }> {
  return db.transaction().execute(async (trx) => {
    // Get current occupancy state
    const currentState = await getTableOccupancyWithKysely(
      trx,
      input.companyId,
      input.outletId,
      input.tableId
    );

    if (!currentState) {
      throw new TableOccupancyNotFoundError(input.tableId);
    }

    // Check optimistic locking version
    if (currentState.version !== input.expectedVersion) {
      throw new TableOccupancyConflictError(
        "Table state has changed",
        currentState
      );
    }

    // Check table is occupied
    if (currentState.statusId !== TableOccupancyStatus.OCCUPIED) {
      throw new TableNotOccupiedError(input.tableId, currentState.statusId);
    }

    // Update service session to CLOSED (status 3 = CLOSED)
    if (currentState.serviceSessionId) {
      await sql`
        UPDATE table_service_sessions
        SET status_id = 3,
            closed_at = NOW(),
            updated_at = NOW(),
            updated_by = ${input.updatedBy}
        WHERE id = ${currentState.serviceSessionId}
          AND company_id = ${input.companyId}
          AND outlet_id = ${input.outletId}
      `.execute(trx);
    }

    // Update occupancy to AVAILABLE
    const updateResult = await sql`
      UPDATE table_occupancy
      SET status_id = ${TableOccupancyStatus.AVAILABLE},
          service_session_id = NULL,
          occupied_at = NULL,
          guest_count = NULL,
          reservation_id = NULL,
          notes = ${input.notes ?? null},
          version = version + 1,
          updated_at = NOW(),
          updated_by = ${input.updatedBy}
      WHERE company_id = ${input.companyId}
        AND outlet_id = ${input.outletId}
        AND table_id = ${input.tableId}
        AND version = ${input.expectedVersion}
    `.execute(trx);

    if ((updateResult as any).affectedRows === 0) {
      throw new TableOccupancyConflictError(
        "Table state has changed during update",
        currentState
      );
    }

    // Log the event
    await logTableEventWithKysely(trx, {
      companyId: input.companyId,
      outletId: input.outletId,
      tableId: input.tableId,
      eventTypeId: TableEventType.TABLE_CLOSED,
      clientTxId: randomBytes(16).toString('hex'),
      occupancyVersionBefore: currentState.version,
      occupancyVersionAfter: currentState.version + 1,
      eventData: { reason: "Table released" },
      statusIdBefore: currentState.statusId,
      statusIdAfter: TableOccupancyStatus.AVAILABLE,
      serviceSessionId: currentState.serviceSessionId,
      reservationId: currentState.reservationId,
      posOrderId: null,
      occurredAt: new Date(),
      createdBy: input.updatedBy
    });

    const updatedState = await getTableOccupancyWithKysely(
      trx,
      input.companyId,
      input.outletId,
      input.tableId
    );

    if (!updatedState) {
      throw new Error("Failed to retrieve updated occupancy state");
    }

    return {
      occupancy: updatedState,
      newVersion: updatedState.version
    };
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

type TableEventData = {
  companyId: number;
  outletId: number;
  tableId: number;
  eventTypeId: number;
  clientTxId: string;
  occupancyVersionBefore: number;
  occupancyVersionAfter: number;
  eventData: Record<string, unknown> | null;
  statusIdBefore: number | null;
  statusIdAfter: number | null;
  serviceSessionId: number | null;
  reservationId: number | null;
  posOrderId: string | null;
  occurredAt: Date;
  createdBy: string;
};

/**
 * Get current occupancy state for a table using Kysely
 */
async function getTableOccupancyWithKysely(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<TableOccupancyState | null> {
  const result = await sql<TableOccupancyRow>`
    SELECT 
      id,
      company_id,
      outlet_id,
      table_id,
      status_id,
      version,
      service_session_id,
      reservation_id,
      occupied_at,
      reserved_until,
      guest_count,
      notes,
      created_at,
      updated_at,
      created_by,
      updated_by
    FROM table_occupancy
    WHERE company_id = ${companyId}
      AND outlet_id = ${outletId}
      AND table_id = ${tableId}
  `.execute(db);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0]!;
  return {
    id: row.id,
    companyId: row.company_id,
    outletId: row.outlet_id,
    tableId: row.table_id,
    statusId: row.status_id,
    version: row.version,
    serviceSessionId: row.service_session_id,
    reservationId: row.reservation_id,
    occupiedAt: row.occupied_at ? new Date(row.occupied_at) : null,
    reservedUntil: row.reserved_until ? new Date(row.reserved_until) : null,
    guestCount: row.guest_count,
    notes: row.notes,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by
  };
}

/**
 * Log table event using Kysely
 */
async function logTableEventWithKysely(
  db: KyselySchema,
  event: TableEventData
): Promise<void> {
  await sql`
    INSERT INTO table_events
    (company_id, outlet_id, table_id, event_type_id, client_tx_id,
     occupancy_version_before, occupancy_version_after, event_data,
     status_id_before, status_id_after, service_session_id, 
     reservation_id, pos_order_id, occurred_at, created_at, created_by)
    VALUES (
      ${event.companyId},
      ${event.outletId},
      ${event.tableId},
      ${event.eventTypeId},
      ${event.clientTxId},
      ${event.occupancyVersionBefore},
      ${event.occupancyVersionAfter},
      ${event.eventData ? JSON.stringify(event.eventData) : null},
      ${event.statusIdBefore},
      ${event.statusIdAfter},
      ${event.serviceSessionId},
      ${event.reservationId},
      ${event.posOrderId},
      ${event.occurredAt},
      NOW(),
      ${event.createdBy}
    )
  `.execute(db);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Ensure occupancy record exists for a table
 */
export async function ensureTableOccupancy(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  tableId: number,
  createdBy: string
): Promise<void> {
  const existing = await sql`
    SELECT id FROM table_occupancy
    WHERE company_id = ${companyId}
      AND outlet_id = ${outletId}
      AND table_id = ${tableId}
  `.execute(db);

  if (existing.rows.length === 0) {
    await sql`
      INSERT INTO table_occupancy
      (company_id, outlet_id, table_id, status_id, version, created_at, updated_at, created_by)
      VALUES (${companyId}, ${outletId}, ${tableId}, ${TableOccupancyStatus.AVAILABLE}, 1, NOW(), NOW(), ${createdBy})
    `.execute(db);
  }
}

/**
 * Verify that a table exists in the outlet
 */
export async function verifyTableExists(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<boolean> {
  const result = await sql`
    SELECT id FROM outlet_tables 
    WHERE company_id = ${companyId}
      AND outlet_id = ${outletId}
      AND id = ${tableId}
  `.execute(db);

  return result.rows.length > 0;
}
