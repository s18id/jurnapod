// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservation Groups Module - Service
 *
 * Business logic for multi-table reservation group operations.
 * Package-owned implementation that was previously duplicated in API libs.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { ReservationAuditPort } from "../interfaces/audit-port.js";
import { NOOP_AUDIT_PORT } from "../interfaces/audit-port.js";
import { toUnixMs } from "../time/timestamp.js";
import { toDbDateTime } from "../reservations/utils.js";
import {
  RESERVATION_STATUS,
  BLOCKING_STATUS_IDS,
  isBlockingStatusId,
  resolveStatusId,
} from "../reservations/status-policy.js";
import type {
  CreateReservationGroupInput,
  CreateReservationGroupResult,
  CheckMultiTableAvailabilityInput,
  CheckMultiTableAvailabilityResult,
  SuggestTableCombinationsInput,
  GetReservationGroupInput,
  UpdateReservationGroupInput,
  UpdateReservationGroupResult,
  DeleteReservationGroupInput,
  DeleteReservationGroupResult,
  ReservationGroupDetail,
  TableSuggestion,
} from "./types.js";

/**
 * Create a reservation group with multiple linked reservations.
 *
 * All reservations in the group share:
 * - Same reservation time (start/end timestamps)
 * - Same customer information
 * - Same group_id
 *
 * @param db - Kysely database instance
 * @param input - Group creation parameters
 * @param deps - Optional dependencies (audit port)
 * @returns Group ID and array of reservation IDs
 */
export async function createReservationGroupWithTables(
  db: KyselySchema,
  input: CreateReservationGroupInput,
  deps?: { audit?: ReservationAuditPort }
): Promise<CreateReservationGroupResult> {
  const audit = deps?.audit ?? NOOP_AUDIT_PORT;

  // Validate input
  if (input.tableIds.length < 2) {
    throw new Error("Multi-table reservation requires at least 2 tables");
  }
  if (input.tableIds.length > 10) {
    throw new Error("Cannot reserve more than 10 tables at once");
  }

  // Calculate canonical Unix timestamps using Temporal
  const startTs = toUnixMs(input.reservationAt);
  const durationMs = (input.durationMinutes ?? 120) * 60 * 1000;
  const endTs = startTs + durationMs;

  return await db.transaction().execute(async (trx) => {
    // 1. Lock selected table rows to prevent concurrent modifications
    //    This also serializes concurrent group bookings that share tables.
    const lockedTables = await sql`
      SELECT id FROM outlet_tables
      WHERE company_id = ${input.companyId}
        AND outlet_id = ${input.outletId}
        AND id IN (${sql.join(input.tableIds.map(id => sql`${id}`))})
        AND status = 'AVAILABLE'
      FOR UPDATE
    `.execute(trx);

    if (lockedTables.rows.length !== input.tableIds.length) {
      // One or more tables unavailable or not found
      throw new Error("One or more tables are not available");
    }

    // 2. Re-check for overlapping reservations inside the transaction.
    //    Uses blocking status IDs instead of legacy string check.
    const conflicts = await sql`
      SELECT r.id, r.table_id, t.code as table_code, t.name as table_name,
             r.reservation_start_ts, r.reservation_end_ts
       FROM reservations r
       JOIN outlet_tables t ON r.table_id = t.id
       WHERE r.company_id = ${input.companyId}
         AND r.outlet_id = ${input.outletId}
         AND r.table_id IN (${sql.join(input.tableIds.map(id => sql`${id}`))})
         AND r.status_id IN (${sql.join([...BLOCKING_STATUS_IDS].map(id => sql`${id}`))})
         AND r.reservation_start_ts IS NOT NULL
         AND r.reservation_end_ts IS NOT NULL
         AND r.reservation_start_ts < ${endTs}
         AND r.reservation_end_ts > ${startTs}
       FOR UPDATE
    `.execute(trx);

    if (conflicts.rows.length > 0) {
      const conflictTables = [
        ...new Set(conflicts.rows.map((c) => (c as { table_code: string }).table_code)),
      ];
      throw new Error(`Tables not available: ${conflictTables.join(", ")}`);
    }

    // 3. Create reservation group
    const groupResult = await sql`
      INSERT INTO reservation_groups (company_id, outlet_id, total_guest_count)
      VALUES (${input.companyId}, ${input.outletId}, ${input.guestCount})
    `.execute(trx);

    const groupId = Number(groupResult.insertId);
    const reservationIds: number[] = [];

    // 4. Create individual reservations (one per table)
    for (const tableId of input.tableIds) {
      const resResult = await sql`
        INSERT INTO reservations
        (company_id, outlet_id, reservation_group_id, table_id,
         customer_name, customer_phone, guest_count,
         reservation_at, reservation_start_ts, reservation_end_ts,
         duration_minutes, notes, status, status_id)
        VALUES (
          ${input.companyId},
          ${input.outletId},
          ${groupId},
          ${tableId},
          ${input.customerName},
          ${input.customerPhone},
          ${input.guestCount},
          ${toDbDateTime(input.reservationAt)},
          ${startTs},
          ${endTs},
          ${input.durationMinutes ?? 120},
          ${input.notes},
          'BOOKED',
          ${RESERVATION_STATUS.PENDING}
        )
      `.execute(trx);
      reservationIds.push(Number(resResult.insertId));
    }

    // 5. Emit audit event (only if caller explicitly provided an audit adapter)
    if (deps?.audit) {
      await deps.audit.log({
        action: "reservation_group.create",
        companyId: input.companyId,
        outletId: input.outletId,
        actorUserId: input.actor.userId,
        entityId: groupId,
        after: {
          groupId,
          reservationIds,
          tableIds: input.tableIds,
          guestCount: input.guestCount,
        },
      });
    }

    return { groupId, reservationIds };
  });
}

/**
 * Check if all requested tables are available during the time range.
 * Uses canonical Unix timestamps for conflict detection.
 *
 * @param db - Kysely database instance
 * @param input - Availability check parameters
 * @returns Availability status, conflicts, and table details
 */
export async function checkMultiTableAvailability(
  db: KyselySchema,
  input: CheckMultiTableAvailabilityInput
): Promise<CheckMultiTableAvailabilityResult> {
  // 1. Get table details (tenant-scoped)
  const tablesResult = await sql`
    SELECT ot.id, ot.code, ot.name, ot.capacity
    FROM outlet_tables ot
    JOIN outlets o ON ot.outlet_id = o.id
    WHERE o.company_id = ${input.companyId}
      AND ot.outlet_id = ${input.outletId}
      AND ot.id IN (${sql.join(input.tableIds.map((id) => sql`${id}`))})
      AND ot.status = 'AVAILABLE'
  `.execute(db);

  const tables = tablesResult.rows.map((row) => ({
    id: (row as { id: number }).id,
    code: (row as { code: string }).code,
    name: (row as { name: string }).name,
    capacity: (row as { capacity: number }).capacity,
  }));

  const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);

  // 2. Check for conflicts using canonical timestamps
  // Overlap logic: a_start < b_end AND b_start < a_end
  const excludeClause =
    input.excludeReservationIds?.length
      ? sql`AND r.id NOT IN (${sql.join(input.excludeReservationIds!.map((id) => sql`${id}`))})`
      : sql``;

  const conflictsResult = await sql`
    SELECT r.id, r.table_id, r.reservation_start_ts, r.reservation_end_ts,
            t.code as table_code, t.name as table_name
     FROM reservations r
     JOIN outlet_tables t ON r.table_id = t.id
     WHERE r.company_id = ${input.companyId}
       AND r.outlet_id = ${input.outletId}
       AND r.table_id IN (${sql.join(input.tableIds.map((id) => sql`${id}`))})
       AND r.status_id IN (${sql.join([...BLOCKING_STATUS_IDS].map((id) => sql`${id}`))})
       AND r.reservation_start_ts IS NOT NULL
       AND r.reservation_end_ts IS NOT NULL
       AND r.reservation_start_ts < ${input.endTs}
       AND r.reservation_end_ts > ${input.startTs}
       ${excludeClause}
  `.execute(db);

  const conflicts = conflictsResult.rows.map((c) => ({
    tableId: (c as { table_id: number }).table_id,
    tableName: (c as { table_name: string }).table_name,
    tableCode: (c as { table_code: string }).table_code,
    conflictingReservationId: (c as { id: number }).id,
    conflictStart: (c as { reservation_start_ts: number }).reservation_start_ts,
    conflictEnd: (c as { reservation_end_ts: number }).reservation_end_ts,
  }));

  return {
    available: conflicts.length === 0,
    conflicts,
    tables,
    totalCapacity,
  };
}

/**
 * Generate all combinations of size k from array
 */
function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];

  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map((combo) => [first, ...combo]);
  const withoutFirst = getCombinations(rest, k);

  return [...withFirst, ...withoutFirst];
}

/**
 * Score combination - lower is better
 * Prefers: fewer tables, less excess capacity
 */
function scoreCombination(
  tables: Array<{ id: number; capacity: number }>,
  guestCount: number
): number {
  const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);
  const excess = totalCapacity - guestCount;

  // Penalties: prefer fewer tables, less excess capacity
  const tableCountPenalty = tables.length * 100;
  const excessPenalty = Math.abs(excess) * 10;

  return tableCountPenalty + excessPenalty;
}

/**
 * Suggest optimal table combinations for a large party.
 * Uses Unix timestamps to find available tables during time range.
 * Prefers fewer tables with least excess capacity.
 *
 * @param db - Kysely database instance
 * @param input - Suggestion query parameters
 * @returns Array of suggestions sorted by score (lower is better)
 */
export async function suggestTableCombinations(
  db: KyselySchema,
  input: SuggestTableCombinationsInput
): Promise<TableSuggestion[]> {
  // 1. Get all available tables (not in conflict during time range)
  const availableTablesResult = await sql`
    SELECT t.id, t.code, t.name, t.capacity, t.zone
    FROM outlet_tables t
    WHERE t.company_id = ${input.companyId}
      AND t.outlet_id = ${input.outletId}
      AND t.status = 'AVAILABLE'
      AND t.id NOT IN (
        SELECT DISTINCT r.table_id
        FROM reservations r
        WHERE r.company_id = ${input.companyId}
          AND r.outlet_id = ${input.outletId}
          AND r.table_id IS NOT NULL
          AND r.status_id IN (${sql.join([...BLOCKING_STATUS_IDS].map((id) => sql`${id}`))})
          AND r.reservation_start_ts IS NOT NULL
          AND r.reservation_end_ts IS NOT NULL
          AND r.reservation_start_ts < ${input.endTs}
          AND r.reservation_end_ts > ${input.startTs}
      )
    ORDER BY t.capacity DESC, t.id ASC
  `.execute(db);

  interface TableRow {
    id: number;
    code: string;
    name: string;
    capacity: number;
    zone: string | null;
  }

  const availableTables: TableRow[] = availableTablesResult.rows.map((row) => ({
    id: (row as TableRow).id,
    code: (row as TableRow).code,
    name: (row as TableRow).name,
    capacity: (row as TableRow).capacity,
    zone: (row as TableRow).zone,
  }));

  if (availableTables.length === 0) {
    return [];
  }

  // 2. Generate valid combinations
  const maxCapacity = Math.max(...availableTables.map((t) => t.capacity));
  const minTables = Math.ceil(input.guestCount / maxCapacity);
  const maxTables = Math.min(5, availableTables.length);

  const allCombinations: TableRow[][] = [];

  for (let count = minTables; count <= maxTables; count++) {
    const combos = getCombinations(availableTables, count);
    for (const combo of combos) {
      const totalCapacity = combo.reduce((sum, t) => sum + t.capacity, 0);
      // Accept if capacity is sufficient (up to 50% excess allowed)
      if (totalCapacity >= input.guestCount && totalCapacity <= input.guestCount * 1.5) {
        allCombinations.push(combo);
      }
    }
  }

  // 3. Score and sort
  const suggestions = allCombinations
    .map((combo) => {
      const totalCapacity = combo.reduce((sum, t) => sum + t.capacity, 0);
      return {
        tables: combo.map((t) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          capacity: t.capacity,
          zone: t.zone,
        })),
        total_capacity: totalCapacity,
        excess_capacity: totalCapacity - input.guestCount,
        score: scoreCombination(combo, input.guestCount),
      };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, input.maxSuggestions ?? 5);

  return suggestions;
}

/**
 * Get reservation group details including all linked reservations.
 *
 * @param db - Kysely database instance
 * @param input - Group lookup parameters
 * @returns Group details or null if not found
 */
export async function getReservationGroup(
  db: KyselySchema,
  input: GetReservationGroupInput
): Promise<ReservationGroupDetail | null> {
  // 1. Get group
  const groupsResult = await sql`
    SELECT * FROM reservation_groups WHERE id = ${input.groupId} AND company_id = ${input.companyId}
  `.execute(db);

  if (groupsResult.rows.length === 0) {
    return null;
  }

  const group = groupsResult.rows[0] as {
    id: number;
    company_id: number;
    outlet_id: number;
    group_name: string | null;
    total_guest_count: number;
    created_at: string;
    updated_at: string;
  };

  // 2. Get all reservations in group with table details
  //    Strictly scoped to the group's company + outlet to prevent data-integrity drift leakage.
  const reservationsResult = await sql`
    SELECT
       r.id as reservation_id,
       r.table_id,
       t.code as table_code,
       t.name as table_name,
       r.status,
       r.status_id,
       r.reservation_at,
       r.reservation_start_ts,
       r.reservation_end_ts
     FROM reservations r
     JOIN outlet_tables t ON r.table_id = t.id
     WHERE r.reservation_group_id = ${group.id}
       AND r.company_id = ${group.company_id}
       AND r.outlet_id = ${group.outlet_id}
     ORDER BY t.id ASC
  `.execute(db);

  const reservations = reservationsResult.rows.map((r) => ({
    reservation_id: (r as { reservation_id: number }).reservation_id,
    table_id: (r as { table_id: number }).table_id,
    table_code: (r as { table_code: string }).table_code,
    table_name: (r as { table_name: string }).table_name,
    status: (r as { status: string }).status,
    reservation_at: (r as { reservation_at: string }).reservation_at,
  }));

  return {
    id: group.id,
    company_id: group.company_id,
    outlet_id: group.outlet_id,
    group_name: group.group_name,
    total_guest_count: group.total_guest_count,
    created_at: group.created_at,
    updated_at: group.updated_at,
    reservations,
  };
}

/**
 * Safely delete a reservation group.
 *
 * Safety checks:
 * 1. Verify group exists and belongs to user's company
 * 2. Verify all reservations in group have non-blocking status (BOOKED or CONFIRMED)
 * 3. Update all reservation_group_id to NULL (ungroup them)
 * 4. Delete the group
 *
 * @param db - Kysely database instance
 * @param input - Deletion parameters
 * @param deps - Optional dependencies (audit port)
 * @returns Deletion result with count of ungrouped reservations
 */
export async function deleteReservationGroupSafe(
  db: KyselySchema,
  input: DeleteReservationGroupInput,
  deps?: { audit?: ReservationAuditPort }
): Promise<DeleteReservationGroupResult> {
  const audit = deps?.audit ?? NOOP_AUDIT_PORT;

  return await db.transaction().execute(async (trx) => {
    // 1. Verify group exists and belongs to company
    const groups = await sql<{ id: number; outlet_id: number }>`
      SELECT id, outlet_id FROM reservation_groups WHERE id = ${input.groupId} AND company_id = ${input.companyId}
    `.execute(trx);

    if (groups.rows.length === 0) {
      throw new Error("Reservation group not found or access denied");
    }

    const groupRow = groups.rows[0];
    const groupOutletId = groupRow.outlet_id;

    // 2. Check all reservations in group are cancellable (only PENDING or CONFIRMED allowed)
    const reservations = await sql`
      SELECT id, status, status_id FROM reservations
      WHERE reservation_group_id = ${input.groupId} AND company_id = ${input.companyId}
    `.execute(trx);

    const reservationRows = reservations.rows as Array<{
      id: number;
      status: string;
      status_id: number | null;
    }>;

    // Check using status_id (canonical) with fallback to legacy status
    for (const r of reservationRows) {
      const statusId = resolveStatusId({ status_id: r.status_id, status: r.status });
      if (isBlockingStatusId(statusId)) {
        // But allow PENDING (1) and CONFIRMED (2) only
        if (statusId !== RESERVATION_STATUS.PENDING && statusId !== RESERVATION_STATUS.CONFIRMED) {
          throw new Error("Cannot cancel group with reservations that have already started");
        }
      }
    }

    const hasNonCancellableStatus = reservationRows.some((r) => {
      const statusId = resolveStatusId({ status_id: r.status_id, status: r.status });
      // Terminal statuses cannot be cancelled
      return (
        statusId === RESERVATION_STATUS.COMPLETED ||
        statusId === RESERVATION_STATUS.CANCELLED ||
        statusId === RESERVATION_STATUS.NO_SHOW
      );
    });

    if (hasNonCancellableStatus) {
      throw new Error("Cannot cancel group with reservations that have already started");
    }

    const ungroupedCount = reservationRows.length;

    // 3. Cancel all linked reservations (set status + timestamp, then unlink)
    await sql`
      UPDATE reservations
      SET status = 'CANCELLED',
          status_id = ${RESERVATION_STATUS.CANCELLED},
          cancelled_at = NOW(),
          reservation_group_id = NULL,
          updated_at = NOW()
       WHERE reservation_group_id = ${input.groupId} AND company_id = ${input.companyId}
    `.execute(trx);

    // 4. Delete the group
    await sql`
      DELETE FROM reservation_groups WHERE id = ${input.groupId} AND company_id = ${input.companyId}
    `.execute(trx);

    // 5. Emit audit event (only if caller explicitly provided an audit adapter)
    if (deps?.audit) {
      await deps.audit.log({
        action: "reservation_group.delete",
        companyId: input.companyId,
        outletId: groupOutletId,
        actorUserId: input.actor.userId,
        entityId: input.groupId,
        before: {
          ungroupedCount,
        },
      });
    }

    return { deleted: true, ungroupedCount };
  });
}

/**
 * Update an existing reservation group with optional table changes.
 *
 * Supports:
 * - Metadata updates (customer info, guest count, notes)
 * - Time/duration changes (affects all reservations)
 * - Table changes (add/remove tables from group)
 *
 * All changes are atomic - if validation fails, entire update rolls back.
 *
 * @param db - Kysely database instance
 * @param input - Group update parameters
 * @param deps - Optional dependencies (audit port)
 * @returns Update result with group ID, reservation IDs, and table changes
 */
export async function updateReservationGroup(
  db: KyselySchema,
  input: UpdateReservationGroupInput,
  deps?: { audit?: ReservationAuditPort }
): Promise<UpdateReservationGroupResult> {
  const audit = deps?.audit ?? NOOP_AUDIT_PORT;

  return await db.transaction().execute(async (trx) => {
    // 1. Lock group + all linked reservations FOR UPDATE
    const groups = await sql`
      SELECT id, company_id, outlet_id, total_guest_count
      FROM reservation_groups
      WHERE id = ${input.groupId} AND company_id = ${input.companyId} AND outlet_id = ${input.outletId}
      FOR UPDATE
    `.execute(trx);

    if (groups.rows.length === 0) {
      throw new Error("Reservation group not found or access denied");
    }

    const group = groups.rows[0] as {
      id: number;
      company_id: number;
      outlet_id: number;
      total_guest_count: number;
    };

    // 2. Get current reservations in group (locked)
    const currentReservationsResult = await sql`
      SELECT id, table_id, status, status_id
      FROM reservations
      WHERE reservation_group_id = ${input.groupId} AND company_id = ${input.companyId}
      FOR UPDATE
    `.execute(trx);

    interface ReservationRow {
      id: number;
      table_id: number;
      status: string;
      status_id: number | null;
    }

    const currentReservations: ReservationRow[] = currentReservationsResult.rows.map(
      (row) => row as ReservationRow
    );

    // 3. Validate no reservations have started (using canonical status_id)
    const hasStartedReservations = currentReservations.some((r) => {
      const statusId = resolveStatusId({ status_id: r.status_id, status: r.status });
      // ARRIVED (3), CHECKED_IN (3), COMPLETED (4), CANCELLED (5), NO_SHOW (6) are started/terminal
      return (
        statusId === 3 || // ARRIVED/CHECKED_IN
        statusId === RESERVATION_STATUS.COMPLETED ||
        statusId === RESERVATION_STATUS.CANCELLED ||
        statusId === RESERVATION_STATUS.NO_SHOW
      );
    });

    if (hasStartedReservations) {
      throw new Error("Cannot edit group with reservations that have already started");
    }

    const currentTableIds = currentReservations.map((r) => r.table_id);

    // 4. Handle table changes (if tableIds provided)
    let finalTableIds = currentTableIds;
    let removedTableIds: number[] = [];

    if (input.updates.tableIds !== undefined) {
      // Validate table count
      if (input.updates.tableIds.length < 2) {
        throw new Error("Multi-table reservation requires at least 2 tables");
      }
      if (input.updates.tableIds.length > 10) {
        throw new Error("Cannot reserve more than 10 tables");
      }

      finalTableIds = input.updates.tableIds;
      removedTableIds = currentTableIds.filter((id) => !finalTableIds.includes(id));
      const addedTableIds = finalTableIds.filter((id) => !currentTableIds.includes(id));

      // Calculate time range for conflict check
      // If reservationAt is provided (string RFC3339), parse it; otherwise use stored timestamp (unix ms)
      let startTs: number;
      if (input.updates.reservationAt) {
        startTs = toUnixMs(input.updates.reservationAt);
      } else {
        startTs = await getFirstReservationTime(trx, input.groupId);
      }
      const durationMs = (input.updates.durationMinutes ?? 120) * 60 * 1000;
      const endTs = startTs + durationMs;

      // Lock and validate new tables
      if (addedTableIds.length > 0) {
        const lockedTables = await sql`
          SELECT id FROM outlet_tables
          WHERE company_id = ${input.companyId} AND outlet_id = ${group.outlet_id}
            AND id IN (${sql.join(addedTableIds.map((id) => sql`${id}`))})
            AND status = 'AVAILABLE'
          FOR UPDATE
        `.execute(trx);

        if (lockedTables.rows.length !== addedTableIds.length) {
          throw new Error("One or more new tables are not available");
        }

        // Check conflicts on new tables using blocking status IDs
        const conflicts = await sql`
          SELECT r.id, t.code as table_code
          FROM reservations r
          JOIN outlet_tables t ON r.table_id = t.id
          WHERE r.company_id = ${input.companyId} AND r.outlet_id = ${group.outlet_id}
            AND r.table_id IN (${sql.join(addedTableIds.map((id) => sql`${id}`))})
            AND r.status_id IN (${sql.join([...BLOCKING_STATUS_IDS].map((id) => sql`${id}`))})
            AND r.reservation_start_ts < ${endTs} AND r.reservation_end_ts > ${startTs}
          FOR UPDATE
        `.execute(trx);

        if (conflicts.rows.length > 0) {
          const conflictCodes = [
            ...new Set(conflicts.rows.map((c) => (c as { table_code: string }).table_code)),
          ];
          throw new Error(
            `New tables not available during requested time: ${conflictCodes.join(", ")}`
          );
        }
      }

      // Validate capacity after table changes
      const tableCapacities = await sql`
        SELECT SUM(capacity) as capacity
        FROM outlet_tables
        WHERE company_id = ${input.companyId} AND outlet_id = ${group.outlet_id}
          AND id IN (${sql.join(finalTableIds.map((id) => sql`${id}`))})
      `.execute(trx);

      const totalCapacity =
        (tableCapacities.rows[0] as { capacity: number } | undefined)?.capacity ?? 0;
      const requiredGuests = input.updates.guestCount ?? group.total_guest_count;

      if (totalCapacity < requiredGuests) {
        throw new Error(
          `Insufficient capacity: ${totalCapacity} seats for ${requiredGuests} guests`
        );
      }
    }

    // 5. Handle time/duration changes (conflict check on ALL tables)
    if (input.updates.reservationAt !== undefined || input.updates.durationMinutes !== undefined) {
      // If reservationAt is provided (string RFC3339), parse it; otherwise use stored timestamp (unix ms)
      let startTs: number;
      if (input.updates.reservationAt) {
        startTs = toUnixMs(input.updates.reservationAt);
      } else {
        startTs = await getFirstReservationTime(trx, input.groupId);
      }
      const durationMs = (input.updates.durationMinutes ?? 120) * 60 * 1000;
      const endTs = startTs + durationMs;

      // Check conflicts on ALL final tables (excluding current reservations)
      const currentResIds = currentReservations.map((r) => r.id);

      let conflicts;
      if (currentResIds.length > 0) {
        conflicts = await sql`
          SELECT r.id, t.code as table_code
          FROM reservations r
          JOIN outlet_tables t ON r.table_id = t.id
          WHERE r.company_id = ${input.companyId} AND r.outlet_id = ${group.outlet_id}
            AND r.table_id IN (${sql.join(finalTableIds.map((id) => sql`${id}`))})
            AND r.status_id IN (${sql.join([...BLOCKING_STATUS_IDS].map((id) => sql`${id}`))})
            AND r.reservation_start_ts < ${endTs} AND r.reservation_end_ts > ${startTs}
            AND r.id NOT IN (${sql.join(currentResIds.map((id) => sql`${id}`))})
        `.execute(trx);
      } else {
        conflicts = await sql`
          SELECT r.id, t.code as table_code
          FROM reservations r
          JOIN outlet_tables t ON r.table_id = t.id
          WHERE r.company_id = ${input.companyId} AND r.outlet_id = ${group.outlet_id}
            AND r.table_id IN (${sql.join(finalTableIds.map((id) => sql`${id}`))})
            AND r.status_id IN (${sql.join([...BLOCKING_STATUS_IDS].map((id) => sql`${id}`))})
            AND r.reservation_start_ts < ${endTs} AND r.reservation_end_ts > ${startTs}
        `.execute(trx);
      }

      if (conflicts.rows.length > 0) {
        const conflictCodes = [
          ...new Set(conflicts.rows.map((c) => (c as { table_code: string }).table_code)),
        ];
        throw new Error(`Time conflict detected on: ${conflictCodes.join(", ")}`);
      }
    }

    // 6. Update group metadata
    if (input.updates.guestCount !== undefined) {
      await sql`
        UPDATE reservation_groups
        SET total_guest_count = ${input.updates.guestCount}, updated_at = NOW()
        WHERE id = ${input.groupId} AND company_id = ${input.companyId}
      `.execute(trx);
    }

    // 7. Update all existing reservations (metadata + time changes)
    if (
      input.updates.customerName ||
      input.updates.customerPhone !== undefined ||
      input.updates.guestCount ||
      input.updates.reservationAt ||
      input.updates.notes !== undefined
    ) {
      let updateQuery = sql`UPDATE reservations SET updated_at = NOW()`;

      if (input.updates.customerName) {
        updateQuery = sql`${updateQuery}, customer_name = ${input.updates.customerName}`;
      }
      if (input.updates.customerPhone !== undefined) {
        updateQuery = sql`${updateQuery}, customer_phone = ${input.updates.customerPhone}`;
      }
      if (input.updates.guestCount) {
        updateQuery = sql`${updateQuery}, guest_count = ${input.updates.guestCount}`;
      }
      if (input.updates.reservationAt) {
        const startTs = toUnixMs(input.updates.reservationAt);
        const durationMs = (input.updates.durationMinutes ?? 120) * 60 * 1000;
        const endTs = startTs + durationMs;
        updateQuery = sql`${updateQuery}, reservation_at = ${toDbDateTime(input.updates.reservationAt)}`;
        updateQuery = sql`${updateQuery}, reservation_start_ts = ${startTs}`;
        updateQuery = sql`${updateQuery}, reservation_end_ts = ${endTs}`;
        updateQuery = sql`${updateQuery}, duration_minutes = ${input.updates.durationMinutes ?? 120}`;
      }
      if (input.updates.notes !== undefined) {
        updateQuery = sql`${updateQuery}, notes = ${input.updates.notes}`;
      }

      updateQuery = sql`${updateQuery} WHERE reservation_group_id = ${input.groupId} AND company_id = ${input.companyId}`;
      await updateQuery.execute(trx);
    }

    // 8. Handle removed tables (unlink from group)
    if (removedTableIds.length > 0) {
      await sql`
        UPDATE reservations
        SET reservation_group_id = NULL, updated_at = NOW()
        WHERE reservation_group_id = ${input.groupId} AND company_id = ${input.companyId}
          AND table_id IN (${sql.join(removedTableIds.map((id) => sql`${id}`))})
      `.execute(trx);

      // Audit table changes (only if caller explicitly provided an audit adapter)
      if (deps?.audit) {
        await deps.audit.log({
          action: "reservation_group.tables_changed",
          companyId: input.companyId,
          outletId: input.outletId,
          actorUserId: input.actor.userId,
          entityId: input.groupId,
          metadata: {
            removedTableIds,
          },
        });
      }
    }

    // 9. Add new tables (create new reservation rows)
    const addedTableIds = finalTableIds.filter((id) => !currentTableIds.includes(id));
    const newReservationIds: number[] = [];

    if (addedTableIds.length > 0) {
      // If reservationAt is provided (string RFC3339), parse it; otherwise use stored timestamp (unix ms)
      let startTs: number;
      if (input.updates.reservationAt) {
        startTs = toUnixMs(input.updates.reservationAt);
      } else {
        startTs = await getFirstReservationTime(trx, input.groupId);
      }
      const durationMs = (input.updates.durationMinutes ?? 120) * 60 * 1000;
      const endTs = startTs + durationMs;

      // Get current customer info from first reservation
      const firstRes = await sql`
        SELECT customer_name, customer_phone, notes FROM reservations
        WHERE reservation_group_id = ${input.groupId} LIMIT 1
      `.execute(trx);

      const firstReservation = firstRes.rows[0] as {
        customer_name: string;
        customer_phone: string | null;
        notes: string | null;
      } | undefined;

      for (const tableId of addedTableIds) {
        const resResult = await sql`
          INSERT INTO reservations
          (company_id, outlet_id, reservation_group_id, table_id,
           customer_name, customer_phone, guest_count,
           reservation_at, reservation_start_ts, reservation_end_ts,
           duration_minutes, notes, status, status_id)
          VALUES (
            ${input.companyId},
            ${group.outlet_id},
            ${input.groupId},
            ${tableId},
            ${input.updates.customerName ?? firstReservation?.customer_name ?? "Group Reservation"},
            ${input.updates.customerPhone !== undefined
              ? input.updates.customerPhone
              : firstReservation?.customer_phone ?? null},
            ${input.updates.guestCount ?? group.total_guest_count},
            ${toDbDateTime(new Date(startTs))},
            ${startTs},
            ${endTs},
            ${input.updates.durationMinutes ?? 120},
            ${input.updates.notes !== undefined
              ? input.updates.notes
              : firstReservation?.notes ?? null},
            'BOOKED',
            ${RESERVATION_STATUS.PENDING}
          )
        `.execute(trx);
        newReservationIds.push(Number(resResult.insertId));
      }

      // Audit table changes (only if caller explicitly provided an audit adapter)
      if (deps?.audit) {
        await deps.audit.log({
          action: "reservation_group.tables_changed",
          companyId: input.companyId,
          outletId: input.outletId,
          actorUserId: input.actor.userId,
          entityId: input.groupId,
          metadata: {
            addedTableIds,
            newReservationIds,
          },
        });
      }
    }

    // Emit update audit (only if caller explicitly provided an audit adapter)
    if (deps?.audit) {
      await deps.audit.log({
        action: "reservation_group.update",
        companyId: input.companyId,
        outletId: input.outletId,
        actorUserId: input.actor.userId,
        entityId: input.groupId,
        after: {
          updatedTables: finalTableIds,
          removedTables: removedTableIds,
        },
      });
    }

    return {
      groupId: input.groupId,
      reservationIds: [
        ...currentReservations
          .map((r) => r.id)
          .filter((id) => {
            const res = currentReservations.find((r) => r.id === id);
            return res && !removedTableIds.includes(res.table_id);
          }),
        ...newReservationIds,
      ],
      updatedTables: finalTableIds,
      removedTables: removedTableIds,
    };
  });
}

/**
 * Get the reservation time from the first reservation in a group.
 * Used when time is not provided in update request.
 *
 * @param trx - Transaction or database instance
 * @param groupId - Reservation group ID
 * @returns Unix milliseconds (canonical timestamp storage)
 * @throws Error if group has no reservations (data integrity violation)
 */
async function getFirstReservationTime(trx: KyselySchema, groupId: number): Promise<number> {
  const rows = await sql`
    SELECT reservation_start_ts FROM reservations WHERE reservation_group_id = ${groupId} LIMIT 1
  `.execute(trx);

  if (!rows.rows[0]) {
    throw new Error(`Reservation group ${groupId} has no reservations - data integrity violation`);
  }

  return (rows.rows[0] as { reservation_start_ts: number }).reservation_start_ts;
}
