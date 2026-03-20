// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import type {
  ReservationGroupDetail,
  TableSuggestion
} from "@jurnapod/shared";

/**
 * Get database connection from pool
 */
async function getConnection(): Promise<PoolConnection> {
  const pool = getDbPool();
  return pool.getConnection();
}

/**
 * Convert ISO 8601 datetime string to Unix milliseconds
 */
function toUnixMs(isoString: string): number {
  return new Date(isoString).getTime();
}

/**
 * Create a reservation group with multiple linked reservations.
 * 
 * All reservations in the group share:
 * - Same reservation time (start/end timestamps)
 * - Same customer information
 * - Same group_id
 * 
 * @param input - Group creation parameters
 * @returns Group ID and array of reservation IDs
 */
export async function createReservationGroupWithTables(input: {
  companyId: number;
  outletId: number;
  customerName: string;
  customerPhone: string | null;
  guestCount: number;
  tableIds: number[];
  reservationAt: string; // ISO 8601 datetime
  durationMinutes: number | null;
  notes: string | null;
}): Promise<{ groupId: number; reservationIds: number[] }> {
  // Validate input
  if (input.tableIds.length < 2) {
    throw new Error("Multi-table reservation requires at least 2 tables");
  }
  if (input.tableIds.length > 10) {
    throw new Error("Cannot reserve more than 10 tables at once");
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    // Calculate canonical Unix timestamps
    const startTs = toUnixMs(input.reservationAt);
    const durationMs = (input.durationMinutes ?? 120) * 60 * 1000;
    const endTs = startTs + durationMs;

    // 1. Create reservation group
    const [groupResult] = await conn.execute<ResultSetHeader>(
      `INSERT INTO reservation_groups (company_id, outlet_id, total_guest_count)
       VALUES (?, ?, ?)`,
      [input.companyId, input.outletId, input.guestCount]
    );

    const groupId = groupResult.insertId;
    const reservationIds: number[] = [];

    // 2. Create individual reservations (one per table)
    for (const tableId of input.tableIds) {
      const [resResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO reservations 
         (company_id, outlet_id, reservation_group_id, table_id,
          customer_name, customer_phone, guest_count,
          reservation_at, reservation_start_ts, reservation_end_ts,
          duration_minutes, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED')`,
        [
          input.companyId,
          input.outletId,
          groupId,
          tableId,
          input.customerName,
          input.customerPhone,
          input.guestCount,
          input.reservationAt, // Legacy DATETIME
          startTs, // Canonical start (Unix ms)
          endTs, // Canonical end (Unix ms)
          input.durationMinutes ?? 120,
          input.notes
        ]
      );
      reservationIds.push(resResult.insertId);
    }

    await conn.commit();
    return { groupId, reservationIds };

  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Check if all requested tables are available during the time range.
 * Uses canonical Unix timestamps for conflict detection.
 * 
 * @returns Availability status, conflicts, and table details
 */
export async function checkMultiTableAvailability(input: {
  companyId: number;
  outletId: number;
  tableIds: number[];
  startTs: number; // Unix ms
  endTs: number; // Unix ms
  excludeReservationIds?: number[];
}): Promise<{
  available: boolean;
  conflicts: Array<{
    tableId: number;
    tableName: string;
    tableCode: string;
    conflictingReservationId: number;
    conflictStart: number;
    conflictEnd: number;
  }>;
  tables: Array<{
    id: number;
    code: string;
    name: string;
    capacity: number;
  }>;
  totalCapacity: number;
}> {
  const conn = await getConnection();
  try {
    // 1. Get table details
    const [tables] = await conn.execute<Array<RowDataPacket & {
      id: number;
      code: string;
      name: string;
      capacity: number;
    }>>(
      `SELECT id, code, name, capacity 
       FROM outlet_tables 
       WHERE outlet_id = ? 
         AND id IN (?)
         AND status = 'AVAILABLE'`,
      [input.outletId, input.tableIds]
    );

    const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);

    // 2. Check for conflicts using canonical timestamps
    // Overlap logic: a_start < b_end AND b_start < a_end
    const excludeClause = input.excludeReservationIds?.length
      ? `AND r.id NOT IN (${input.excludeReservationIds.map(() => '?').join(',')})`
      : '';

    const params = [
      input.companyId,
      input.outletId,
      input.tableIds,
      input.endTs, // reservation starts before our end
      input.startTs, // reservation ends after our start
      ...(input.excludeReservationIds ?? [])
    ];

    const [conflicts] = await conn.execute<Array<RowDataPacket & {
      id: number;
      table_id: number;
      reservation_start_ts: number;
      reservation_end_ts: number;
      table_code: string;
      table_name: string;
    }>>(
      `SELECT r.id, r.table_id, r.reservation_start_ts, r.reservation_end_ts,
              t.code as table_code, t.name as table_name
       FROM reservations r
       JOIN outlet_tables t ON r.table_id = t.id
       WHERE r.company_id = ?
         AND r.outlet_id = ?
         AND r.table_id IN (?)
         AND r.status NOT IN ('COMPLETED', 'CANCELLED', 'NO_SHOW')
         AND r.reservation_start_ts IS NOT NULL
         AND r.reservation_end_ts IS NOT NULL
         AND r.reservation_start_ts < ?
         AND r.reservation_end_ts > ?
         ${excludeClause}`,
      params
    );

    return {
      available: conflicts.length === 0,
      conflicts: conflicts.map(c => ({
        tableId: c.table_id,
        tableName: c.table_name,
        tableCode: c.table_code,
        conflictingReservationId: c.id,
        conflictStart: c.reservation_start_ts,
        conflictEnd: c.reservation_end_ts
      })),
      tables: tables.map(t => ({
        id: t.id,
        code: t.code,
        name: t.name,
        capacity: t.capacity
      })),
      totalCapacity
    };

  } finally {
    conn.release();
  }
}

/**
 * Generate all combinations of size k from array
 */
function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];

  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map(combo => [first, ...combo]);
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
 * @returns Array of suggestions sorted by score (lower is better)
 */
export async function suggestTableCombinations(input: {
  companyId: number;
  outletId: number;
  guestCount: number;
  startTs: number; // Unix ms
  endTs: number; // Unix ms
  maxSuggestions?: number;
}): Promise<TableSuggestion[]> {
  const conn = await getConnection();
  try {
    // 1. Get all available tables (not in conflict during time range)
    const [availableTables] = await conn.execute<Array<RowDataPacket & {
      id: number;
      code: string;
      name: string;
      capacity: number;
      zone: string | null;
    }>>(
      `SELECT t.id, t.code, t.name, t.capacity, t.zone
       FROM outlet_tables t
       WHERE t.company_id = ?
         AND t.outlet_id = ?
         AND t.status = 'AVAILABLE'
         AND t.id NOT IN (
           SELECT DISTINCT r.table_id
           FROM reservations r
           WHERE r.company_id = ?
             AND r.outlet_id = ?
             AND r.table_id IS NOT NULL
             AND r.status NOT IN ('COMPLETED', 'CANCELLED', 'NO_SHOW')
             AND r.reservation_start_ts IS NOT NULL
             AND r.reservation_end_ts IS NOT NULL
             AND r.reservation_start_ts < ?
             AND r.reservation_end_ts > ?
         )
       ORDER BY t.capacity DESC, t.id ASC`,
      [input.companyId, input.outletId, input.companyId, input.outletId, input.endTs, input.startTs]
    );

    if (availableTables.length === 0) {
      return [];
    }

    // 2. Generate valid combinations
    const minTables = Math.ceil(input.guestCount / Math.max(...availableTables.map(t => t.capacity)));
    const maxTables = Math.min(5, availableTables.length);

    const allCombinations: Array<Array<typeof availableTables[0]>> = [];

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
      .map(combo => {
        const totalCapacity = combo.reduce((sum, t) => sum + t.capacity, 0);
        return {
          tables: combo.map(t => ({
            id: t.id,
            code: t.code,
            name: t.name,
            capacity: t.capacity,
            zone: t.zone
          })),
          total_capacity: totalCapacity,
          excess_capacity: totalCapacity - input.guestCount,
          score: scoreCombination(combo, input.guestCount)
        };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, input.maxSuggestions ?? 5);

    return suggestions;

  } finally {
    conn.release();
  }
}

/**
 * Get reservation group details including all linked reservations.
 */
export async function getReservationGroup(input: {
  companyId: number;
  groupId: number;
}): Promise<ReservationGroupDetail | null> {
  const conn = await getConnection();
  try {
    // 1. Get group
    const [groups] = await conn.execute<Array<RowDataPacket & {
      id: number;
      company_id: number;
      outlet_id: number;
      group_name: string | null;
      total_guest_count: number;
      created_at: string;
      updated_at: string;
    }>>(
      `SELECT * FROM reservation_groups WHERE id = ? AND company_id = ?`,
      [input.groupId, input.companyId]
    );

    if (groups.length === 0) {
      return null;
    }

    const group = groups[0]!;

    // 2. Get all reservations in group with table details
    const [reservations] = await conn.execute<Array<RowDataPacket & {
      reservation_id: number;
      table_id: number;
      table_code: string;
      table_name: string;
      status: string;
      reservation_at: string;
      reservation_start_ts: number | null;
      reservation_end_ts: number | null;
    }>>(
      `SELECT 
         r.id as reservation_id,
         r.table_id,
         t.code as table_code,
         t.name as table_name,
         r.status,
         r.reservation_at,
         r.reservation_start_ts,
         r.reservation_end_ts
       FROM reservations r
       JOIN outlet_tables t ON r.table_id = t.id
       WHERE r.reservation_group_id = ?
       ORDER BY t.id ASC`,
      [group.id]
    );

    return {
      id: group.id,
      company_id: group.company_id,
      outlet_id: group.outlet_id,
      group_name: group.group_name,
      total_guest_count: group.total_guest_count,
      created_at: group.created_at,
      updated_at: group.updated_at,
      reservations: reservations.map(r => ({
        reservation_id: r.reservation_id,
        table_id: r.table_id,
        table_code: r.table_code,
        table_name: r.table_name,
        status: r.status,
        reservation_at: r.reservation_at,
        reservation_start_ts: r.reservation_start_ts,
        reservation_end_ts: r.reservation_end_ts
      }))
    };

  } finally {
    conn.release();
  }
}

/**
 * Safely delete a reservation group.
 * 
 * Safety checks:
 * 1. Verify group exists and belongs to user's company
 * 2. Verify all reservations in group have status BOOKED or CONFIRMED
 * 3. Update all reservation_group_id to NULL (ungroup them)
 * 4. Delete the group
 * 
 * @returns Deletion result with count of ungrouped reservations
 */
export async function deleteReservationGroupSafe(input: {
  companyId: number;
  groupId: number;
}): Promise<{ deleted: boolean; ungroupedCount: number }> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    // 1. Verify group exists and belongs to company
    const [groups] = await conn.execute<Array<RowDataPacket>>(
      `SELECT id FROM reservation_groups WHERE id = ? AND company_id = ?`,
      [input.groupId, input.companyId]
    );

    if (groups.length === 0) {
      throw new Error("Reservation group not found or access denied");
    }

    // 2. Check all reservations in group are cancellable
    const [reservations] = await conn.execute<Array<RowDataPacket & {
      id: number;
      status: string;
    }>>(
      `SELECT id, status FROM reservations 
       WHERE reservation_group_id = ? AND company_id = ?`,
      [input.groupId, input.companyId]
    );

    const hasFinalStatus = reservations.some(
      r => ['SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(r.status)
    );

    if (hasFinalStatus) {
      throw new Error("Cannot delete group with reservations in final status");
    }

    // 3. Ungroup all reservations (set group_id to NULL)
    await conn.execute(
      `UPDATE reservations 
       SET reservation_group_id = NULL, updated_at = NOW()
       WHERE reservation_group_id = ? AND company_id = ?`,
      [input.groupId, input.companyId]
    );

    const ungroupedCount = reservations.length;

    // 4. Delete the group
    await conn.execute(
      `DELETE FROM reservation_groups WHERE id = ? AND company_id = ?`,
      [input.groupId, input.companyId]
    );

    await conn.commit();

    return { deleted: true, ungroupedCount };

  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}