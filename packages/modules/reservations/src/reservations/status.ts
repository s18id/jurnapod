// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservations Module - Status Management
 *
 * Status transitions and management for reservations.
 */

import { sql } from "kysely";
import { randomBytes } from "node:crypto";
import type { KyselySchema } from "@jurnapod/db";

import type { UpdateReservationStatusInput } from "./types.js";
import {
  ReservationNotFoundError,
  ReservationValidationError,
  ReservationConflictError,
  InvalidStatusTransitionError,
} from "./errors.js";
import {
  canTransition,
  isFinalStatus,
  columnExists,
  generateReservationCodeWithConnection,
  mapDbRowToReservation,
} from "./utils.js";
import { checkReservationOverlap, getTableOccupancySnapshotWithConnection } from "./availability.js";
import { getReservation } from "./crud.js";
import type { ReservationDbRow } from "./types.js";

// Table Occupancy Status constants
const TABLE_OCCUPANCY_STATUS = {
  AVAILABLE: 1,
  RESERVED: 2,
  OCCUPIED: 3,
} as const;

const MAX_CODE_GENERATION_RETRIES = 3;

/**
 * Generate a unique reservation code for an outlet
 */
export async function generateReservationCode(outletId: number): Promise<string> {
  // This would need db access - for now use the one from utils
  return `RES-${randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;
}

/**
 * Update reservation status with validation and side effects
 */
export async function updateReservationStatus(
  db: KyselySchema,
  companyId: number,
  reservationId: number,
  input: UpdateReservationStatusInput
): Promise<ReturnType<typeof mapDbRowToReservation>> {
  return db.transaction().execute(async (trx) => {
    // Get current reservation state
    const current = await getReservation(trx, companyId, reservationId);

    if (!current) {
      throw new ReservationNotFoundError(reservationId);
    }

    // Validate status transition
    if (!canTransition(current.status, input.status)) {
      throw new InvalidStatusTransitionError(current.status, input.status);
    }

    // Handle side effects based on target status
    const tableId = input.tableId ?? current.tableId;

    // Check for overlap if table is assigned
    if (tableId && (input.tableId !== undefined || input.status === 2 /* CONFIRMED */)) {
      if (input.status === 2) { // CONFIRMED
        const overlapExists = await checkReservationOverlap(
          trx,
          companyId,
          current.outletId,
          tableId,
          current.reservationStartTs,
          (current.reservationEndTs - current.reservationStartTs) / 60_000,
          reservationId
        );

        if (overlapExists) {
          throw new ReservationConflictError('Table is already reserved for this time slot');
        }
      }
    }

    if (input.status === 2 /* CONFIRMED */ && tableId) {
      // CONFIRMED: Hold the table
      const occupancy = await getTableOccupancySnapshotWithConnection(
        trx,
        companyId,
        current.outletId,
        tableId
      );
      const expectedVersion = occupancy?.version ?? 1;

      // Calculate hold until time
      const heldUntil = new Date(current.reservationEndTs);

      await holdTableWithKysely(trx, {
        companyId,
        outletId: current.outletId,
        tableId,
        heldUntil,
        reservationId,
        notes: `Held for reservation`,
        expectedVersion,
        createdBy: input.updatedBy.userId.toString()
      });
    } else if (input.status === 5 /* CANCELLED */ && tableId) {
      // CANCELLED: Release held table if exists
      const occupancy = await getTableOccupancySnapshotWithConnection(
        trx,
        companyId,
        current.outletId,
        tableId
      );
      if (occupancy && occupancy.reservationId === reservationId) {
        await releaseTableWithKysely(trx, {
          companyId,
          outletId: current.outletId,
          tableId,
          expectedVersion: occupancy.version,
          updatedBy: input.updatedBy.userId.toString()
        });
      }
    } else if (input.status === 3 /* CHECKED_IN */ && tableId) {
      // CHECKED_IN: Verify table is reserved for this reservation and seat
      const occupancy = await getTableOccupancySnapshotWithConnection(
        trx,
        companyId,
        current.outletId,
        tableId
      );
      if (!occupancy || occupancy.reservationId !== reservationId) {
        throw new ReservationValidationError('Table is not reserved for this reservation');
      }

      // Seat the table
      await seatTableWithKysely(trx, {
        companyId,
        outletId: current.outletId,
        tableId,
        guestCount: current.partySize,
        reservationId,
        expectedVersion: occupancy.version,
        createdBy: input.updatedBy.userId.toString()
      });
    } else if (input.status === 6 /* NO_SHOW */ && tableId) {
      // NO_SHOW: Verify grace period has passed
      const now = Date.now();
      const gracePeriodMinutes = 15;
      const gracePeriodEnd = current.reservationEndTs;

      if (now < gracePeriodEnd + gracePeriodMinutes * 60_000) {
        throw new ReservationValidationError(
          `Grace period not yet passed. Cannot mark as NO_SHOW before ${new Date(gracePeriodEnd + gracePeriodMinutes * 60_000).toISOString()}`
        );
      }

      // Release held table if exists
      const occupancy = await getTableOccupancySnapshotWithConnection(
        trx,
        companyId,
        current.outletId,
        tableId
      );
      if (occupancy && occupancy.reservationId === reservationId) {
        await releaseTableWithKysely(trx, {
          companyId,
          outletId: current.outletId,
          tableId,
          expectedVersion: occupancy.version,
          updatedBy: input.updatedBy.userId.toString()
        });
      }
    }

    // Build update SQL dynamically
    const updates: ReturnType<typeof sql>[] = [];
    
    // Check which columns exist
    const hasStatusId = await columnExists(trx, 'reservations', 'status_id');
    const hasCancellationReason = await columnExists(trx, 'reservations', 'cancellation_reason');
    const hasUpdatedBy = await columnExists(trx, 'reservations', 'updated_by');
    
    // Map status to legacy status string
    const legacyStatusMap: Record<number, string> = {
      1: 'BOOKED',
      2: 'CONFIRMED',
      3: 'ARRIVED',
      4: 'COMPLETED',
      5: 'CANCELLED',
      6: 'NO_SHOW'
    };
    
    // Always update legacy status column
    updates.push(sql`status = ${legacyStatusMap[input.status] ?? 'BOOKED'}`);
    
    // Update status_id if column exists
    if (hasStatusId) {
      updates.push(sql`status_id = ${input.status}`);
    }

    if (input.tableId !== undefined && input.tableId !== null) {
      updates.push(sql`table_id = ${input.tableId}`);
    }

    if (input.cancellationReason !== undefined && hasCancellationReason) {
      updates.push(sql`cancellation_reason = ${input.cancellationReason}`);
    }

    if (input.notes !== undefined) {
      updates.push(sql`notes = ${input.notes}`);
    }

    if (hasUpdatedBy) {
      updates.push(sql`updated_by = ${input.updatedBy.userId.toString()}`);
    }

    // Update timestamp
    updates.push(sql`updated_at = NOW()`);

    const updateClause = sql.join(updates, sql`, `);

    // Execute update
    const updateResult = await sql`
      UPDATE reservations 
       SET ${updateClause}
       WHERE id = ${reservationId} AND company_id = ${companyId}
    `.execute(trx);

    if ((updateResult as any).affectedRows === 0) {
      throw new ReservationNotFoundError(reservationId);
    }

    // Fetch and return updated reservation
    const updated = await getReservation(trx, companyId, reservationId);
    if (!updated) {
      throw new Error('Failed to retrieve updated reservation');
    }

    return updated;
  });
}

// ============================================================================
// TABLE OCCUPANCY OPERATIONS (for reservation lifecycle)
// ============================================================================

type HoldTableInput = {
  companyId: number;
  outletId: number;
  tableId: number;
  heldUntil: Date;
  reservationId?: number;
  notes?: string | null;
  expectedVersion: number;
  createdBy: string;
};

type SeatTableInput = {
  companyId: number;
  outletId: number;
  tableId: number;
  guestCount: number;
  reservationId?: number;
  expectedVersion: number;
  createdBy: string;
};

type ReleaseTableInput = {
  companyId: number;
  outletId: number;
  tableId: number;
  expectedVersion: number;
  updatedBy: string;
};

/**
 * Hold a table for reservation
 */
async function holdTableWithKysely(
  db: KyselySchema,
  input: HoldTableInput
): Promise<void> {
  const updateResult = await sql`
    UPDATE table_occupancy
    SET status_id = ${TABLE_OCCUPANCY_STATUS.RESERVED},
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
    throw new ReservationConflictError("Table state has changed");
  }

  // Log event
  await logTableEventWithKysely(db, {
    companyId: input.companyId,
    outletId: input.outletId,
    tableId: input.tableId,
    eventTypeId: 1, // RESERVATION_CREATED
    clientTxId: randomBytes(16).toString('hex'),
    occupancyVersionBefore: input.expectedVersion,
    occupancyVersionAfter: input.expectedVersion + 1,
    eventData: { reason: "Table held for reservation", heldUntil: input.heldUntil.toISOString() },
    statusIdBefore: TABLE_OCCUPANCY_STATUS.AVAILABLE,
    statusIdAfter: TABLE_OCCUPANCY_STATUS.RESERVED,
    serviceSessionId: null,
    reservationId: input.reservationId ?? null,
    posOrderId: null,
    occurredAt: new Date(),
    createdBy: input.createdBy
  });
}

/**
 * Seat guests at a table
 */
async function seatTableWithKysely(
  db: KyselySchema,
  input: SeatTableInput
): Promise<void> {
  // Create service session
  const insertResult = await sql`
    INSERT INTO table_service_sessions
    (company_id, outlet_id, table_id, status_id, started_at, guest_count, notes, created_at, updated_at, created_by)
    VALUES (
      ${input.companyId},
      ${input.outletId},
      ${input.tableId},
      1,
      NOW(),
      ${input.guestCount},
      NULL,
      NOW(),
      NOW(),
      ${input.createdBy}
    )
  `.execute(db);

  const sessionId = Number((insertResult as any).insertId);

  // Update occupancy to OCCUPIED
  const updateResult = await sql`
    UPDATE table_occupancy
    SET status_id = ${TABLE_OCCUPANCY_STATUS.OCCUPIED},
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
    throw new ReservationConflictError("Table state has changed");
  }

  // Log event
  await logTableEventWithKysely(db, {
    companyId: input.companyId,
    outletId: input.outletId,
    tableId: input.tableId,
    eventTypeId: 2, // TABLE_OPENED
    clientTxId: randomBytes(16).toString('hex'),
    occupancyVersionBefore: input.expectedVersion,
    occupancyVersionAfter: input.expectedVersion + 1,
    eventData: { reason: "Guests seated", guestCount: input.guestCount },
    statusIdBefore: TABLE_OCCUPANCY_STATUS.RESERVED,
    statusIdAfter: TABLE_OCCUPANCY_STATUS.OCCUPIED,
    serviceSessionId: sessionId,
    reservationId: input.reservationId ?? null,
    posOrderId: null,
    occurredAt: new Date(),
    createdBy: input.createdBy
  });
}

/**
 * Release a table
 */
async function releaseTableWithKysely(
  db: KyselySchema,
  input: ReleaseTableInput
): Promise<void> {
  // Update service session to CLOSED
  const sessionResult = await sql`
    SELECT service_session_id FROM table_occupancy
    WHERE company_id = ${input.companyId}
      AND outlet_id = ${input.outletId}
      AND table_id = ${input.tableId}
  `.execute(db);

  if (sessionResult.rows.length > 0) {
    const sessionId = (sessionResult.rows[0] as { service_session_id: number | null }).service_session_id;
    if (sessionId) {
      await sql`
        UPDATE table_service_sessions
        SET status_id = 3,
            closed_at = NOW(),
            updated_at = NOW(),
            updated_by = ${input.updatedBy}
        WHERE id = ${sessionId}
      `.execute(db);
    }
  }

  // Update occupancy to AVAILABLE
  const updateResult = await sql`
    UPDATE table_occupancy
    SET status_id = ${TABLE_OCCUPANCY_STATUS.AVAILABLE},
        service_session_id = NULL,
        occupied_at = NULL,
        guest_count = NULL,
        reservation_id = NULL,
        version = version + 1,
        updated_at = NOW(),
        updated_by = ${input.updatedBy}
    WHERE company_id = ${input.companyId}
      AND outlet_id = ${input.outletId}
      AND table_id = ${input.tableId}
      AND version = ${input.expectedVersion}
  `.execute(db);

  if ((updateResult as any).affectedRows === 0) {
    throw new ReservationConflictError("Table state has changed");
  }

  // Log event
  await logTableEventWithKysely(db, {
    companyId: input.companyId,
    outletId: input.outletId,
    tableId: input.tableId,
    eventTypeId: 3, // TABLE_CLOSED
    clientTxId: randomBytes(16).toString('hex'),
    occupancyVersionBefore: input.expectedVersion,
    occupancyVersionAfter: input.expectedVersion + 1,
    eventData: { reason: "Table released" },
    statusIdBefore: TABLE_OCCUPANCY_STATUS.OCCUPIED,
    statusIdAfter: TABLE_OCCUPANCY_STATUS.AVAILABLE,
    serviceSessionId: null,
    reservationId: null,
    posOrderId: null,
    occurredAt: new Date(),
    createdBy: input.updatedBy
  });
}

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
