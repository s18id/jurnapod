// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { randomUUID } from "node:crypto";
import { getDb, type KyselySchema } from "./db";
import { sql } from "kysely";
import {
  TableOccupancyStatus,
  TableEventType,
} from "@jurnapod/shared";

// ============================================================================
// ERROR CLASSES
// ============================================================================

export class TableOccupancyNotFoundError extends Error {
  constructor(tableId: bigint) {
    super(`Table occupancy not found for table ${tableId}`);
  }
}

export class TableOccupancyConflictError extends Error {
  constructor(
    message: string,
    public readonly currentState: TableOccupancyState
  ) {
    super(message);
  }
}

export class TableNotAvailableError extends Error {
  constructor(tableId: bigint, currentStatus: number) {
    super(`Table ${tableId} is not available (status: ${currentStatus})`);
  }
}

export class TableNotFoundError extends Error {
  constructor(tableId: bigint) {
    super(`Table ${tableId} not found`);
  }
}

export class TableNotOccupiedError extends Error {
  constructor(
    tableId: bigint,
    public readonly currentStatus: number
  ) {
    super(`Table ${tableId} is not occupied (status: ${currentStatus})`);
  }
}

// ============================================================================
// TYPES
// ============================================================================

export type TableOccupancyState = {
  id: bigint;
  companyId: bigint;
  outletId: bigint;
  tableId: bigint;
  statusId: number;
  version: number;
  serviceSessionId: bigint | null;
  reservationId: bigint | null;
  occupiedAt: Date | null;
  reservedUntil: Date | null;
  guestCount: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
};

export type TableBoardItem = {
  tableId: bigint;
  tableCode: string;
  tableName: string;
  capacity: number | null;
  zone: string | null;
  occupancyStatusId: number;
  availableNow: boolean;
  currentSessionId: bigint | null;
  currentReservationId: bigint | null;
  guestCount: number | null;
  version: number;
  nextReservationStartAt: Date | null;
  updatedAt: Date;
};

export type HoldTableInput = {
  companyId: bigint;
  outletId: bigint;
  tableId: bigint;
  heldUntil: Date;
  reservationId?: bigint | null;
  notes?: string | null;
  expectedVersion: number;
  createdBy: string;
};

export type SeatTableInput = {
  companyId: bigint;
  outletId: bigint;
  tableId: bigint;
  guestCount: number;
  guestName?: string | null;
  reservationId?: bigint | null;
  notes?: string | null;
  expectedVersion: number;
  createdBy: string;
};

export type ReleaseTableInput = {
  companyId: bigint;
  outletId: bigint;
  tableId: bigint;
  notes?: string | null;
  expectedVersion: number;
  updatedBy: string;
};

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
 * Returns all tables with their current occupancy status
 */
export async function getTableBoard(
  companyId: bigint,
  outletId: bigint
): Promise<TableBoardItem[]> {
  const db = getDb();

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
          AND (
            r.status_id IN (1, 2)
            OR (r.status_id IS NULL AND r.status IN ('BOOKED', 'CONFIRMED'))
          )
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
    tableId: BigInt(row.table_id),
    tableCode: row.table_code,
    tableName: row.table_name,
    capacity: row.capacity,
    zone: row.zone,
    occupancyStatusId: row.occupancy_status_id,
    availableNow: row.occupancy_status_id === TableOccupancyStatus.AVAILABLE,
    currentSessionId: row.current_session_id ? BigInt(row.current_session_id) : null,
    currentReservationId: row.current_reservation_id ? BigInt(row.current_reservation_id) : null,
    guestCount: row.guest_count,
    version: row.version,
    nextReservationStartAt:
      row.next_reservation_start_at == null
        ? null
        : Number.isFinite(Number(row.next_reservation_start_at))
          ? new Date(Number(row.next_reservation_start_at))
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
  companyId: bigint,
  outletId: bigint,
  tableId: bigint
): Promise<TableOccupancyState | null> {
  const db = getDb();

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
    id: BigInt(row.id),
    companyId: BigInt(row.company_id),
    outletId: BigInt(row.outlet_id),
    tableId: BigInt(row.table_id),
    statusId: row.status_id,
    version: row.version,
    serviceSessionId: row.service_session_id ? BigInt(row.service_session_id) : null,
    reservationId: row.reservation_id ? BigInt(row.reservation_id) : null,
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
 * Hold a table for reservation using Kysely transaction
 * Changes status to RESERVED and sets reserved_until
 */
export async function holdTable(
  input: HoldTableInput
): Promise<{ occupancy: TableOccupancyState; newVersion: number }> {
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    return holdTableWithKysely(trx, input);
  });
}

/**
 * Hold a table for reservation with provided transaction
 * Changes status to RESERVED and sets reserved_until
 */
export async function holdTableWithKysely(
  db: KyselySchema,
  input: HoldTableInput
): Promise<{ occupancy: TableOccupancyState; newVersion: number }> {
  // 1. Get current occupancy state
  const currentState = await getTableOccupancyWithKysely(
    db,
    input.companyId,
    input.outletId,
    input.tableId
  );

  if (!currentState) {
    throw new TableOccupancyNotFoundError(input.tableId);
  }

  // 2. Check optimistic locking version
  if (currentState.version !== input.expectedVersion) {
    throw new TableOccupancyConflictError(
      "Table state has changed",
      currentState
    );
  }

  // 3. Check table is available
  if (currentState.statusId !== TableOccupancyStatus.AVAILABLE) {
    throw new TableNotAvailableError(input.tableId, currentState.statusId);
  }

  // 4. Update occupancy to RESERVED
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((updateResult as any).affectedRows === 0) {
    throw new TableOccupancyConflictError(
      "Table state has changed during update",
      currentState
    );
  }

  // 5. Log the event
  await logTableEventWithKysely(db, {
    companyId: input.companyId,
    outletId: input.outletId,
    tableId: input.tableId,
    eventTypeId: TableEventType.RESERVATION_CREATED,
    clientTxId: randomUUID(),
    occupancyVersionBefore: currentState.version,
    occupancyVersionAfter: currentState.version + 1,
    eventData: { reason: "Table held for reservation", heldUntil: input.heldUntil.toISOString() },
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
 * Seat guests at a table using Kysely transaction
 * Creates service session and updates occupancy to OCCUPIED
 */
export async function seatTable(
  input: SeatTableInput
): Promise<{ sessionId: bigint; occupancy: TableOccupancyState }> {
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    return seatTableWithKysely(trx, input);
  });
}

/**
 * Seat guests at a table with provided transaction
 * Creates service session and updates occupancy to OCCUPIED
 */
export async function seatTableWithKysely(
  db: KyselySchema,
  input: SeatTableInput
): Promise<{ sessionId: bigint; occupancy: TableOccupancyState }> {
  // 1. Get current occupancy state
  const currentState = await getTableOccupancyWithKysely(
    db,
    input.companyId,
    input.outletId,
    input.tableId
  );

  if (!currentState) {
    throw new TableOccupancyNotFoundError(input.tableId);
  }

  // 2. Check optimistic locking version
  if (currentState.version !== input.expectedVersion) {
    throw new TableOccupancyConflictError(
      "Table state has changed",
      currentState
    );
  }

  // 3. Check table is available or reserved (not occupied)
  if (currentState.statusId === TableOccupancyStatus.OCCUPIED) {
    throw new TableNotAvailableError(input.tableId, currentState.statusId);
  }

  // 4. Create service session using sql template
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionId = BigInt((insertResult as any).insertId);

  // 5. Update occupancy to OCCUPIED
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((updateResult as any).affectedRows === 0) {
    throw new TableOccupancyConflictError(
      "Table state has changed during update",
      currentState
    );
  }

  // 6. Log the event
  await logTableEventWithKysely(db, {
    companyId: input.companyId,
    outletId: input.outletId,
    tableId: input.tableId,
    eventTypeId: TableEventType.TABLE_OPENED,
    clientTxId: randomUUID(),
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
 * Release a table after service using Kysely transaction
 * Marks session as CLOSED and resets occupancy to AVAILABLE
 */
export async function releaseTable(
  input: ReleaseTableInput
): Promise<{ occupancy: TableOccupancyState; newVersion: number }> {
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    // 1. Get current occupancy state
    const currentState = await getTableOccupancyWithKysely(
      trx,
      input.companyId,
      input.outletId,
      input.tableId
    );

    if (!currentState) {
      throw new TableOccupancyNotFoundError(input.tableId);
    }

    // 2. Check optimistic locking version
    if (currentState.version !== input.expectedVersion) {
      throw new TableOccupancyConflictError(
        "Table state has changed",
        currentState
      );
    }

    // 3. Check table is occupied
    if (currentState.statusId !== TableOccupancyStatus.OCCUPIED) {
      throw new TableNotOccupiedError(input.tableId, currentState.statusId);
    }

    // 4. Update service session to CLOSED (Story 12.5: status 3 = CLOSED)
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

    // 5. Update occupancy to AVAILABLE
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((updateResult as any).affectedRows === 0) {
      throw new TableOccupancyConflictError(
        "Table state has changed during update",
        currentState
      );
    }

    // 6. Log the event
    await logTableEventWithKysely(trx, {
      companyId: input.companyId,
      outletId: input.outletId,
      tableId: input.tableId,
      eventTypeId: TableEventType.TABLE_CLOSED,
      clientTxId: randomUUID(),
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
  companyId: bigint;
  outletId: bigint;
  tableId: bigint;
  eventTypeId: number;
  clientTxId: string;
  occupancyVersionBefore: number;
  occupancyVersionAfter: number;
  eventData: Record<string, unknown> | null;
  statusIdBefore: number | null;
  statusIdAfter: number | null;
  serviceSessionId: bigint | null;
  reservationId: bigint | null;
  posOrderId: string | null;
  occurredAt: Date;
  createdBy: string;
};

// ============================================================================
// KYSELY-NATIVE FUNCTIONS
// ============================================================================

/**
 * Get current occupancy state for a table using Kysely
 */
async function getTableOccupancyWithKysely(
  db: KyselySchema,
  companyId: bigint,
  outletId: bigint,
  tableId: bigint
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
    id: BigInt(row.id),
    companyId: BigInt(row.company_id),
    outletId: BigInt(row.outlet_id),
    tableId: BigInt(row.table_id),
    statusId: row.status_id,
    version: row.version,
    serviceSessionId: row.service_session_id ? BigInt(row.service_session_id) : null,
    reservationId: row.reservation_id ? BigInt(row.reservation_id) : null,
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
 * Creates one with AVAILABLE status if not exists
 */
export async function ensureTableOccupancy(
  companyId: bigint,
  outletId: bigint,
  tableId: bigint,
  createdBy: string
): Promise<void> {
  const db = getDb();

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
 * Verify that a table exists in the outlet using Kysely
 * Returns true if the table exists, false otherwise
 */
export async function verifyTableExists(
  companyId: bigint,
  outletId: bigint,
  tableId: bigint
): Promise<boolean> {
  const db = getDb();

  const result = await sql`
    SELECT id FROM outlet_tables 
    WHERE company_id = ${companyId}
      AND outlet_id = ${outletId}
      AND id = ${tableId}
  `.execute(db);

  return result.rows.length > 0;
}

/**
 * Verify that a table exists in the outlet (transactional version)
 * Returns true if the table exists, false otherwise
 */
export async function verifyTableExistsWithTransaction(
  db: KyselySchema,
  companyId: bigint,
  outletId: bigint,
  tableId: bigint
): Promise<boolean> {
  const result = await sql`
    SELECT id FROM outlet_tables 
    WHERE company_id = ${companyId}
      AND outlet_id = ${outletId}
      AND id = ${tableId}
  `.execute(db);

  return result.rows.length > 0;
}
