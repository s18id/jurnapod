// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Outlet Tables Module - Service Operations
 *
 * CRUD operations for outlet tables.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import { withTransaction } from "@jurnapod/db";
import type {
  OutletTableFullResponse,
  CreateOutletTableInput,
  UpdateOutletTableInput,
  CreateOutletTablesBulkInput,
  OutletTableActor,
} from "./types.js";
import {
  OutletTableStatus,
  OutletTableNotFoundError,
  OutletTableCodeExistsError,
  OutletTableStatusConflictError,
  OutletTableBulkConflictError,
} from "./types.js";
import { TableOccupancyStatus } from "../table-occupancy/types.js";

const MYSQL_DUPLICATE_ERROR_CODE = 1062;

interface OutletTableRow {
  id: number;
  company_id: number;
  outlet_id: number;
  code: string;
  name: string;
  zone: string | null;
  capacity: number | null;
  status: "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";
  status_id: number | null;
  created_at: Date;
  updated_at: Date;
}

interface OutletTableCodeRow {
  code: string;
}

function toIsoString(val: Date | string): string {
  if (typeof val === 'string') return val;
  return val.toISOString();
}

function normalizeOutletTable(row: OutletTableRow): OutletTableFullResponse {
  const normalizedStatusId = row.status_id ?? OutletTableStatus.AVAILABLE;
  return {
    id: row.id,
    company_id: row.company_id,
    outlet_id: row.outlet_id,
    code: row.code,
    name: row.name,
    zone: row.zone,
    capacity: row.capacity,
    status: row.status,
    status_id: normalizedStatusId,
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at)
  };
}

function resolveOperationalStatusInput(params: {
  status?: "AVAILABLE" | "UNAVAILABLE";
  status_id?: number;
}): { status: "AVAILABLE" | "UNAVAILABLE"; status_id: 1 | 7 } {
  if (params.status_id !== undefined) {
    const status = params.status_id === 7 ? "UNAVAILABLE" : "AVAILABLE";
    return {
      status,
      status_id: params.status_id === 7 ? 7 : 1
    };
  }

  const status = params.status ?? "AVAILABLE";
  return {
    status,
    status_id: status === "UNAVAILABLE" ? 7 : 1
  };
}

function normalizeTableCode(value: string): string {
  return value.trim().toUpperCase();
}

async function hasOpenDineInOrders(
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

async function hasActiveServiceSessions(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<boolean> {
  const result = await sql<{ count_active: number }>`
    SELECT COUNT(*) AS count_active
    FROM table_service_sessions
    WHERE company_id = ${companyId}
      AND outlet_id = ${outletId}
      AND table_id = ${tableId}
      AND status_id IN (1, 2)
  `.execute(db);

  return Number(result.rows[0]?.count_active ?? 0) > 0;
}

async function hasBlockingReservations(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<boolean> {
  const result = await sql<{ count_blocking: number }>`
    SELECT COUNT(*) AS count_blocking
    FROM reservations
    WHERE company_id = ${companyId}
      AND outlet_id = ${outletId}
      AND table_id = ${tableId}
      AND status_id IN (1, 2)
  `.execute(db);

  return Number(result.rows[0]?.count_blocking ?? 0) > 0;
}

async function syncOperationalStatusToOccupancy(
  db: KyselySchema,
  params: {
    companyId: number;
    outletId: number;
    tableId: number;
    status: "AVAILABLE" | "UNAVAILABLE";
    actorUserId: number;
  }
): Promise<void> {
  if (params.status === "AVAILABLE") {
    const [hasOpenOrders, hasActiveSessions, hasBlockingResv] = await Promise.all([
      hasOpenDineInOrders(db, params.companyId, params.outletId, params.tableId),
      hasActiveServiceSessions(db, params.companyId, params.outletId, params.tableId),
      hasBlockingReservations(db, params.companyId, params.outletId, params.tableId)
    ]);

    if (hasOpenOrders || hasActiveSessions || hasBlockingResv) {
      throw new OutletTableStatusConflictError(
        "Cannot set table AVAILABLE while there are active dine-in orders, sessions, or reservations"
      );
    }

    await sql`
      INSERT INTO table_occupancy
        (company_id, outlet_id, table_id, status_id, version, service_session_id, reservation_id,
         occupied_at, reserved_until, guest_count, notes, created_by, updated_by)
      VALUES (${params.companyId}, ${params.outletId}, ${params.tableId}, ${TableOccupancyStatus.AVAILABLE}, 1, NULL, NULL, NULL, NULL, NULL, NULL, ${params.actorUserId}, ${params.actorUserId})
      ON DUPLICATE KEY UPDATE
        status_id = VALUES(status_id),
        version = version + 1,
        service_session_id = NULL,
        reservation_id = NULL,
        occupied_at = NULL,
        reserved_until = NULL,
        guest_count = NULL,
        notes = NULL,
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP
    `.execute(db);
    return;
  }

  await sql`
    INSERT INTO table_occupancy
      (company_id, outlet_id, table_id, status_id, version, created_by, updated_by)
    VALUES (${params.companyId}, ${params.outletId}, ${params.tableId}, ${TableOccupancyStatus.OUT_OF_SERVICE}, 1, ${params.actorUserId}, ${params.actorUserId})
    ON DUPLICATE KEY UPDATE
      status_id = VALUES(status_id),
      version = version + 1,
      updated_by = VALUES(updated_by),
      updated_at = CURRENT_TIMESTAMP
  `.execute(db);
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * List all tables for a specific outlet
 */
export async function listOutletTablesByOutlet(
  db: KyselySchema,
  companyId: number,
  outletId: number
): Promise<OutletTableFullResponse[]> {
  const rows = await sql<OutletTableRow>`
    SELECT id, company_id, outlet_id, code, name, zone, capacity, status, status_id, created_at, updated_at
    FROM outlet_tables
    WHERE company_id = ${companyId} AND outlet_id = ${outletId}
    ORDER BY zone ASC, code ASC
  `.execute(db);

  return rows.rows.map(normalizeOutletTable);
}

/**
 * Get a single table by ID
 */
export async function getOutletTable(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<OutletTableFullResponse> {
  const rows = await sql<OutletTableRow>`
    SELECT id, company_id, outlet_id, code, name, zone, capacity, status, status_id, created_at, updated_at
    FROM outlet_tables
    WHERE id = ${tableId} AND company_id = ${companyId} AND outlet_id = ${outletId}
  `.execute(db);

  if (rows.rows.length === 0) {
    throw new OutletTableNotFoundError(`Table with id ${tableId} not found`);
  }

  return normalizeOutletTable(rows.rows[0]);
}

/**
 * Create a new outlet table
 */
export async function createOutletTable(
  db: KyselySchema,
  params: CreateOutletTableInput
): Promise<OutletTableFullResponse> {
  // Check if code already exists for this outlet
  const normalizedCode = normalizeTableCode(params.code);
  const normalizedStatus = resolveOperationalStatusInput({
    status: params.status,
  });

  const existing = await sql<{ id: number }>`
    SELECT id FROM outlet_tables WHERE company_id = ${params.company_id} AND outlet_id = ${params.outlet_id} AND code = ${normalizedCode}
  `.execute(db);

  if (existing.rows.length > 0) {
    throw new OutletTableCodeExistsError(
      `Table with code ${params.code} already exists for this outlet`
    );
  }

  // Insert table
  const insertResult = await sql`
    INSERT INTO outlet_tables (company_id, outlet_id, code, name, zone, capacity, status, status_id)
    VALUES (${params.company_id}, ${params.outlet_id}, ${normalizedCode}, ${params.name}, ${params.zone ?? null}, ${params.capacity ?? null}, ${normalizedStatus.status}, ${normalizedStatus.status_id})
  `.execute(db);

  const tableId = Number(insertResult.insertId);

  // Use withTransaction for the rest of the operations
  return await withTransaction(db, async (trx) => {
    await syncOperationalStatusToOccupancy(trx, {
      companyId: params.company_id,
      outletId: params.outlet_id,
      tableId,
      status: normalizedStatus.status,
      actorUserId: params.actor.userId
    });

    const rows = await sql<OutletTableRow>`
      SELECT id, company_id, outlet_id, code, name, zone, capacity, status, status_id, created_at, updated_at
      FROM outlet_tables
      WHERE id = ${tableId} AND company_id = ${params.company_id} AND outlet_id = ${params.outlet_id}
    `.execute(trx);

    if (rows.rows.length === 0) {
      throw new OutletTableNotFoundError(`Table with id ${tableId} not found`);
    }

    return normalizeOutletTable(rows.rows[0]);
  });
}

/**
 * Create multiple outlet tables
 */
export async function createOutletTablesBulk(
  db: KyselySchema,
  params: CreateOutletTablesBulkInput
): Promise<OutletTableFullResponse[]> {
  const normalizedStatus = resolveOperationalStatusInput({
    status: params.status,
  });

  const generated = Array.from({ length: params.count }, (_, index) => {
    const seq = params.start_seq + index;
    const code = normalizeTableCode(params.code_template.replaceAll("{seq}", String(seq)));
    const name = params.name_template.replaceAll("{seq}", String(seq)).trim();

    if (code.length === 0 || code.length > 32) {
      throw new Error(`Generated table code is invalid for seq ${seq}`);
    }

    if (name.length === 0 || name.length > 191) {
      throw new Error(`Generated table name is invalid for seq ${seq}`);
    }

    return {
      seq,
      code,
      name
    };
  });

  const requestCodeSet = new Set<string>();
  const duplicateRequestCodes: string[] = [];
  for (const item of generated) {
    if (requestCodeSet.has(item.code)) {
      duplicateRequestCodes.push(item.code);
    } else {
      requestCodeSet.add(item.code);
    }
  }

  if (duplicateRequestCodes.length > 0) {
    const uniqueDuplicates = [...new Set(duplicateRequestCodes)].sort();
    throw new OutletTableBulkConflictError(
      `Generated duplicate table codes in request: ${uniqueDuplicates.join(", ")}`,
      uniqueDuplicates
    );
  }

  const generatedCodes = generated.map((item) => item.code);
  const existingRows = await sql<OutletTableCodeRow>`
    SELECT code FROM outlet_tables 
    WHERE company_id = ${params.company_id} 
      AND outlet_id = ${params.outlet_id} 
      AND code IN (${sql.join(generatedCodes.map(c => sql`${c}`), sql`, `)})
  `.execute(db);

  if (existingRows.rows.length > 0) {
    const conflicts = [...new Set(existingRows.rows.map((row: OutletTableCodeRow) => row.code))].sort();
    throw new OutletTableBulkConflictError(
      `Table code already exists for this outlet: ${conflicts.join(", ")}`,
      conflicts
    );
  }

  return await withTransaction(db, async (trx) => {
    const insertedIds: number[] = [];

    for (const item of generated) {
      try {
        const insertResult = await sql`
          INSERT INTO outlet_tables (company_id, outlet_id, code, name, zone, capacity, status, status_id)
          VALUES (${params.company_id}, ${params.outlet_id}, ${item.code}, ${item.name}, ${params.zone ?? null}, ${params.capacity ?? null}, ${normalizedStatus.status}, ${normalizedStatus.status_id})
        `.execute(trx);

        const tableId = Number(insertResult.insertId);
        insertedIds.push(tableId);

        await syncOperationalStatusToOccupancy(trx, {
          companyId: params.company_id,
          outletId: params.outlet_id,
          tableId,
          status: normalizedStatus.status,
          actorUserId: params.actor.userId
        });
      } catch (insertError: unknown) {
        const mysqlError = insertError as { errno?: number };
        const errno = mysqlError?.errno;
        if (errno === MYSQL_DUPLICATE_ERROR_CODE) {
          throw new OutletTableBulkConflictError(
            `Table code already exists for this outlet: ${item.code}`,
            [item.code]
          );
        }
        throw insertError;
      }
    }

    const rows = await sql<OutletTableRow>`
      SELECT id, company_id, outlet_id, code, name, zone, capacity, status, status_id, created_at, updated_at
      FROM outlet_tables
      WHERE company_id = ${params.company_id} AND outlet_id = ${params.outlet_id} AND id IN (${sql.join(insertedIds.map(id => sql`${id}`), sql`, `)})
      ORDER BY code ASC
    `.execute(trx);

    return rows.rows.map(normalizeOutletTable);
  });
}

/**
 * Update an outlet table
 */
export async function updateOutletTable(
  db: KyselySchema,
  params: UpdateOutletTableInput
): Promise<OutletTableFullResponse> {
  // Get current table
  const rows = await sql<OutletTableRow>`
    SELECT id, company_id, outlet_id, code, name, zone, capacity, status, status_id, created_at, updated_at
    FROM outlet_tables
    WHERE id = ${params.tableId} AND company_id = ${params.companyId} AND outlet_id = ${params.outletId}
  `.execute(db);

  if (rows.rows.length === 0) {
    throw new OutletTableNotFoundError(`Table with id ${params.tableId} not found`);
  }

  const currentTable = rows.rows[0];
  let hasChanges = false;

  // Build update query dynamically
  const updates: ReturnType<typeof sql>[] = [];

  if (params.code !== undefined) {
    const normalizedCode = normalizeTableCode(params.code);

    if (normalizedCode !== currentTable.code) {
      const codeRows = await sql<{ id: number }>`
        SELECT id FROM outlet_tables
        WHERE company_id = ${params.companyId} AND outlet_id = ${params.outletId} AND code = ${normalizedCode} AND id <> ${params.tableId}
        LIMIT 1
      `.execute(db);

      if (codeRows.rows.length > 0) {
        throw new OutletTableCodeExistsError(
          `Table with code ${normalizedCode} already exists for this outlet`
        );
      }

      updates.push(sql`code = ${normalizedCode}`);
      hasChanges = true;
    }
  }

  if (params.name !== undefined && params.name !== currentTable.name) {
    updates.push(sql`name = ${params.name}`);
    hasChanges = true;
  }

  if (params.zone !== undefined && params.zone !== currentTable.zone) {
    updates.push(sql`zone = ${params.zone}`);
    hasChanges = true;
  }

  if (params.capacity !== undefined && params.capacity !== currentTable.capacity) {
    updates.push(sql`capacity = ${params.capacity}`);
    hasChanges = true;
  }

  const currentOperationalStatus =
    currentTable.status === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE";

  const resolvedRequestStatus =
    params.status !== undefined
      ? resolveOperationalStatusInput({ status: params.status })
      : undefined;

  if (
    resolvedRequestStatus !== undefined &&
    resolvedRequestStatus.status !== currentOperationalStatus
  ) {
    updates.push(sql`status = ${resolvedRequestStatus.status}`);
    updates.push(sql`status_id = ${resolvedRequestStatus.status_id}`);
    hasChanges = true;

    await syncOperationalStatusToOccupancy(db, {
      companyId: params.companyId,
      outletId: params.outletId,
      tableId: params.tableId,
      status: resolvedRequestStatus.status,
      actorUserId: params.actor.userId
    });
  }

  let outletTableForResponse = currentTable;

  if (hasChanges) {
    updates.push(sql`updated_at = CURRENT_TIMESTAMP`);

    await sql`
      UPDATE outlet_tables
      SET ${sql.join(updates, sql`, `)}
      WHERE id = ${params.tableId} AND company_id = ${params.companyId} AND outlet_id = ${params.outletId}
    `.execute(db);

    const updatedRows = await sql<OutletTableRow>`
      SELECT id, company_id, outlet_id, code, name, zone, capacity, status, status_id, created_at, updated_at
      FROM outlet_tables
      WHERE id = ${params.tableId} AND company_id = ${params.companyId} AND outlet_id = ${params.outletId}
    `.execute(db);

    if (updatedRows.rows.length === 0) {
      throw new OutletTableNotFoundError(`Table with id ${params.tableId} not found`);
    }

    outletTableForResponse = updatedRows.rows[0];
  }

  return normalizeOutletTable(outletTableForResponse);
}

/**
 * Delete an outlet table
 */
export async function deleteOutletTable(
  db: KyselySchema,
  params: {
    companyId: number;
    outletId: number;
    tableId: number;
    actor: OutletTableActor;
  }
): Promise<void> {
  // Get current table
  const rows = await sql<OutletTableRow>`
    SELECT id, code, name, zone, capacity, status, status_id
    FROM outlet_tables
    WHERE id = ${params.tableId} AND company_id = ${params.companyId} AND outlet_id = ${params.outletId}
  `.execute(db);

  if (rows.rows.length === 0) {
    throw new OutletTableNotFoundError(`Table with id ${params.tableId} not found`);
  }

  // Check if table is in use
  const openOrders = await sql<{ count: number }>`
    SELECT COUNT(*) as count FROM pos_order_snapshots
    WHERE company_id = ${params.companyId} AND outlet_id = ${params.outletId} AND table_id = ${params.tableId}
    AND order_state = 'OPEN' AND service_type = 'DINE_IN'
  `.execute(db);

  if (openOrders.rows[0]?.count && openOrders.rows[0].count > 0) {
    throw new Error(
      `Cannot delete table: ${openOrders.rows[0].count} active dine-in orders are linked to this table`
    );
  }

  const reservations = await sql<{ count: number }>`
    SELECT COUNT(*) as count FROM reservations
    WHERE company_id = ${params.companyId} AND outlet_id = ${params.outletId} AND table_id = ${params.tableId}
  `.execute(db);

  if (reservations.rows[0]?.count && reservations.rows[0].count > 0) {
    throw new Error(
      `Cannot delete table: ${reservations.rows[0].count} reservations are linked to this table`
    );
  }

  if (rows.rows[0].status !== "UNAVAILABLE") {
    await sql`
      UPDATE outlet_tables
      SET status = 'UNAVAILABLE', status_id = 7, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${params.tableId} AND company_id = ${params.companyId} AND outlet_id = ${params.outletId}
    `.execute(db);

    await withTransaction(db, async (trx) => {
      await syncOperationalStatusToOccupancy(trx, {
        companyId: params.companyId,
        outletId: params.outletId,
        tableId: params.tableId,
        status: "UNAVAILABLE",
        actorUserId: params.actor.userId
      });
    });
  }
}
