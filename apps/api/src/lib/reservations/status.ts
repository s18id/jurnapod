// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// /**
//  * Reservations Domain Module - Status Management
//  *
//  * This file contains status management functions for reservations.
//  * Part of Story 6.5d (Reservations Domain Extraction).
//  */

import { sql } from "kysely";
import { randomBytes } from "node:crypto";
import { getDb, type KyselySchema } from "@/lib/db";
import {
  ReservationStatusV2,
  TableOccupancyStatus,
  type ReservationStatus,
} from "@jurnapod/shared";
import {
  holdTableWithKysely,
  seatTableWithKysely,
  TableOccupancyConflictError,
  TableNotAvailableError,
} from "@/lib/table-occupancy";

// Import types from local types module
import type {
  Reservation,
  ReservationDbRow,
  UpdateStatusInput,
  OccupancySnapshotRow,
} from "./types";
import {
  ReservationNotFoundError,
  ReservationValidationError,
  ReservationConflictError,
  InvalidStatusTransitionError,
  VALID_TRANSITIONS,
  finalStatuses,
} from "./types";

// Import helpers from utils (single source of truth)
import {
  isFinalStatus,
  canTransition,
  columnExists,
  generateReservationCodeWithConnection as generateCodeWithConn,
  MAX_CODE_GENERATION_RETRIES,
} from "./utils";

// Re-export for backward compatibility
export { isFinalStatus, canTransition };

// Import getReservationV2WithConnection from crud module
import { getReservationV2WithConnection } from "./crud";

/**
 * Get table occupancy snapshot with row locking
 */
async function getTableOccupancySnapshotWithConnection(
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
// CODE GENERATION FUNCTIONS
// ============================================================================

/**
 * Generate a unique reservation code for an outlet
 * Format: RES-{random alphanumeric 6 chars}
 * Retries up to 3 times if collision occurs
 */
export async function generateReservationCode(outletId: bigint): Promise<string> {
  const db = getDb();
  
  // Check if reservation_code column exists
  let hasReservationCodeColumn = false;
  try {
    const result = await sql`
      SELECT 1 FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'reservations' 
         AND COLUMN_NAME = 'reservation_code'
       LIMIT 1
    `.execute(db);
    hasReservationCodeColumn = result.rows.length > 0;
  } catch {
    hasReservationCodeColumn = false;
  }
  
  for (let attempt = 0; attempt < MAX_CODE_GENERATION_RETRIES; attempt++) {
    // Generate code: RES- + 6 random alphanumeric characters
    const randomPart = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
    const code = `RES-${randomPart}`;
    
    // Check uniqueness against database only if column exists
    if (hasReservationCodeColumn) {
      try {
        const result = await sql`
          SELECT 1 FROM reservations 
           WHERE outlet_id = ${outletId} AND reservation_code = ${code}
           LIMIT 1
        `.execute(db);
        
        if (result.rows.length === 0) {
          return code;
        }
        // Collision detected, retry
      } catch {
        // If query fails (column doesn't exist), just return the code
        return code;
      }
    } else {
      // Column doesn't exist, return code without checking
      return code;
    }
  }
  
  // If all retries failed, use timestamp-based code as fallback
  const timestamp = Date.now().toString(36).toUpperCase();
  return `RES-${timestamp.slice(-6)}`;
}

/**
 * Generate a unique reservation code using an existing connection
 * Used within transactions to ensure consistency
 */
export async function generateReservationCodeWithConnection(
  db: KyselySchema,
  outletId: bigint
): Promise<string> {
  // Check if reservation_code column exists
  const hasReservationCodeColumn = await columnExists(db, 'reservations', 'reservation_code');
  
  for (let attempt = 0; attempt < MAX_CODE_GENERATION_RETRIES; attempt++) {
    const randomPart = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
    const code = `RES-${randomPart}`;
    
    // Only check uniqueness if the column exists
    if (hasReservationCodeColumn) {
      try {
        const result = await sql`
          SELECT 1 FROM reservations 
           WHERE outlet_id = ${outletId} AND reservation_code = ${code}
           LIMIT 1
        `.execute(db);
        
        if (result.rows.length === 0) {
          return code;
        }
        // Collision detected, retry
      } catch {
        // If query fails (column doesn't exist), just return the code
        return code;
      }
    } else {
      // Column doesn't exist, return code without checking
      return code;
    }
  }
  
  const timestamp = Date.now().toString(36).toUpperCase();
  return `RES-${timestamp.slice(-6)}`;
}

// ============================================================================
// STATUS UPDATE FUNCTIONS
// ============================================================================

/**
 * Check if a reservation overlaps with existing reservations for the same table
 * Overlap exists if: existing_start < new_end AND existing_end > new_start
 */
async function checkReservationOverlap(
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

  const newStartTs = reservationTime.getTime();
  const newEndTs = newStartTs + durationMinutes * 60000;

  let canonicalQuery;
  if (excludeReservationId) {
    canonicalQuery = sql<{ count: number }>`
      SELECT COUNT(*) as count
      FROM reservations
      WHERE company_id = ${companyId}
        AND outlet_id = ${outletId}
        AND table_id = ${tableId}
        AND status_id NOT IN (${ReservationStatusV2.CANCELLED}, ${ReservationStatusV2.COMPLETED}, ${ReservationStatusV2.NO_SHOW})
        AND id <> ${excludeReservationId}
        AND reservation_start_ts IS NOT NULL
        AND reservation_end_ts IS NOT NULL
        AND reservation_start_ts < ${newEndTs}
        AND reservation_end_ts > ${newStartTs}
      LIMIT 1
    `;
  } else {
    canonicalQuery = sql<{ count: number }>`
      SELECT COUNT(*) as count
      FROM reservations
      WHERE company_id = ${companyId}
        AND outlet_id = ${outletId}
        AND table_id = ${tableId}
        AND status_id NOT IN (${ReservationStatusV2.CANCELLED}, ${ReservationStatusV2.COMPLETED}, ${ReservationStatusV2.NO_SHOW})
        AND reservation_start_ts IS NOT NULL
        AND reservation_end_ts IS NOT NULL
        AND reservation_start_ts < ${newEndTs}
        AND reservation_end_ts > ${newStartTs}
      LIMIT 1
    `;
  }

  const result = await canonicalQuery.execute(db);
  return (result.rows[0]?.count ?? 0) > 0;
}

/**
 * Update reservation status with validation and side effects (Story 12.4 interface)
 */
export async function updateReservationStatus(
  id: bigint,
  companyId: bigint,
  outletId: bigint,
  input: UpdateStatusInput
): Promise<Reservation> {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    // Get current reservation state
    const currentReservation = await getReservationV2WithConnection(
      trx,
      id,
      companyId,
      outletId
    );

    if (!currentReservation) {
      throw new ReservationNotFoundError(id);
    }

    // Validate status transition
    const validTransitions = VALID_TRANSITIONS[currentReservation.statusId] ?? [];
    if (!validTransitions.includes(input.statusId)) {
      throw new InvalidStatusTransitionError(currentReservation.statusId, input.statusId);
    }

    // Handle side effects based on target status
    let tableId = currentReservation.tableId ?? input.tableId ?? null;

    // Check for overlap if table is assigned (either existing or new table)
    // This handles both new table assignments and confirming existing reservations
    const isTableChanged = input.tableId !== undefined && input.tableId !== currentReservation.tableId;
    const isConfirming = input.statusId === ReservationStatusV2.CONFIRMED && 
                         currentReservation.statusId !== ReservationStatusV2.CONFIRMED;
    
    if (tableId && (isTableChanged || isConfirming)) {
      // Check for overlapping reservations on this table
      const overlapExists = await checkReservationOverlap(
        trx,
        companyId,
        outletId,
        tableId,
        currentReservation.reservationTime,
        currentReservation.durationMinutes,
        id
      );

      if (overlapExists) {
        throw new ReservationConflictError('Table is already reserved for this time slot');
      }
    }

    if (input.statusId === ReservationStatusV2.CONFIRMED) {
      // CONFIRMED: Hold the table if tableId is provided
      if (tableId) {
        // Calculate hold until time (reservation time + duration)
        const heldUntil = new Date(currentReservation.reservationTime);
        heldUntil.setMinutes(heldUntil.getMinutes() + currentReservation.durationMinutes);

        const occupancy = await getTableOccupancySnapshotWithConnection(
          trx,
          companyId,
          outletId,
          tableId
        );
        const expectedVersion = occupancy?.version ?? 1;

        await holdTableWithKysely(trx, {
          companyId,
          outletId,
          tableId,
          heldUntil,
          reservationId: id,
          notes: `Held for reservation ${currentReservation.reservationCode}`,
          expectedVersion,
          createdBy: input.updatedBy
        });
      }
    } else if (input.statusId === ReservationStatusV2.CANCELLED) {
      // CANCELLED: Release held table if exists
      if (tableId) {
        const occupancy = await getTableOccupancySnapshotWithConnection(
          trx,
          companyId,
          outletId,
          tableId
        );
        if (occupancy && occupancy.reservationId === id) {
          // Table is held for this reservation, release it
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const releaseResult = await sql`
            UPDATE table_occupancy 
             SET status_id = ${TableOccupancyStatus.AVAILABLE}, 
                  reservation_id = NULL, 
                  reserved_until = NULL,
                  version = version + 1,
                  updated_at = NOW(),
                  updated_by = ${input.updatedBy}
             WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND table_id = ${tableId} AND version = ${occupancy.version}
          `.execute(trx);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((releaseResult as any).affectedRows === 0) {
            throw new ReservationConflictError("Table state has changed, please retry");
          }
        }
      }
    } else if (input.statusId === ReservationStatusV2.CHECKED_IN) {
      // CHECKED_IN: Seat the table and create a service session
      if (tableId) {
        // Verify table is reserved for this reservation
        const occupancy = await getTableOccupancySnapshotWithConnection(
          trx,
          companyId,
          outletId,
          tableId
        );
        if (!occupancy || occupancy.reservationId !== id) {
          throw new ReservationValidationError(
            'Table is not reserved for this reservation'
          );
        }

        // Seat the table - creates service session and updates occupancy
        try {
          await seatTableWithKysely(trx, {
            companyId,
            outletId,
            tableId,
            guestCount: currentReservation.partySize,
            reservationId: id,
            guestName: currentReservation.customerName,
            expectedVersion: occupancy.version,
            createdBy: input.updatedBy
          });
        } catch (error) {
          if (error instanceof TableOccupancyConflictError) {
            throw new ReservationConflictError(
              'Table state has changed, please retry'
            );
          }
          if (error instanceof TableNotAvailableError) {
            throw new ReservationValidationError(
              `Table is not available for seating`
            );
          }
          throw error;
        }
      }
    } else if (input.statusId === ReservationStatusV2.NO_SHOW) {
      // NO_SHOW: Verify grace period has passed before allowing the transition
      const now = new Date();
      const reservationTime = new Date(currentReservation.reservationTime);
      const gracePeriodMinutes = 15; // Default grace period
      const gracePeriodEnd = new Date(reservationTime.getTime() + gracePeriodMinutes * 60000);

      if (now < gracePeriodEnd) {
        throw new ReservationValidationError(
          `Grace period not yet passed. Cannot mark as NO_SHOW before ${gracePeriodEnd.toISOString()}`
        );
      }

      // Release held table if exists (similar to CANCELLED handling)
      if (tableId) {
        const occupancy = await getTableOccupancySnapshotWithConnection(
          trx,
          companyId,
          outletId,
          tableId
        );
        if (occupancy && occupancy.reservationId === id) {
          // Table is held for this reservation, release it
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const releaseResult = await sql`
            UPDATE table_occupancy 
             SET status_id = ${TableOccupancyStatus.AVAILABLE}, 
                  reservation_id = NULL, 
                  reserved_until = NULL,
                  version = version + 1,
                  updated_at = NOW(),
                  updated_by = ${input.updatedBy}
             WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND table_id = ${tableId} AND version = ${occupancy.version}
          `.execute(trx);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((releaseResult as any).affectedRows === 0) {
            throw new ReservationConflictError("Table state has changed, please retry");
          }
        }
      }
    }

    // Build update SQL dynamically based on provided fields
    const updates: ReturnType<typeof sql>[] = [];
    
    // Check which columns exist
    const hasStatusId = await columnExists(trx, 'reservations', 'status_id');
    const hasCancellationReason = await columnExists(trx, 'reservations', 'cancellation_reason');
    const hasUpdatedBy = await columnExists(trx, 'reservations', 'updated_by');
    
    // Map V2 status to legacy status string
    const legacyStatusMap: Record<number, string> = {
      [ReservationStatusV2.PENDING]: 'BOOKED',
      [ReservationStatusV2.CONFIRMED]: 'CONFIRMED',
      [ReservationStatusV2.CHECKED_IN]: 'ARRIVED',
      [ReservationStatusV2.NO_SHOW]: 'NO_SHOW',
      [ReservationStatusV2.CANCELLED]: 'CANCELLED',
      [ReservationStatusV2.COMPLETED]: 'COMPLETED'
    };
    
    // Always update legacy status column
    updates.push(sql`status = ${legacyStatusMap[input.statusId] ?? 'BOOKED'}`);
    
    // Update status_id if column exists
    if (hasStatusId) {
      updates.push(sql`status_id = ${input.statusId}`);
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
      updates.push(sql`updated_by = ${input.updatedBy}`);
    }

    // Update timestamp
    updates.push(sql`updated_at = NOW()`);

    const updateClause = sql.join(updates, sql`, `);

    // Execute update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateResult = await sql`
      UPDATE reservations 
       SET ${updateClause}
       WHERE id = ${id} AND company_id = ${companyId} AND outlet_id = ${outletId}
    `.execute(trx);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((updateResult as any).affectedRows === 0) {
      throw new ReservationNotFoundError(id);
    }

    // Fetch and return updated reservation
    const updatedReservation = await getReservationV2WithConnection(
      trx,
      id,
      companyId,
      outletId
    );

    if (!updatedReservation) {
      throw new Error('Failed to retrieve updated reservation');
    }

    return updatedReservation;
  });
}
