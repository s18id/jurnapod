// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import { getDb, type KyselySchema } from "./db";
import { withTransaction } from "@jurnapod/db";
import { AuditService } from "@jurnapod/modules-platform";
import {
  TableOccupancyStatus,
  type OutletTableStatusIdType,
  outletTableStatusFromId,
  outletTableStatusToId,
  toRfc3339Required
} from "@jurnapod/shared";

const MYSQL_DUPLICATE_ERROR_CODE = 1062;

export class OutletTableNotFoundError extends Error {}
export class OutletTableCodeExistsError extends Error {}
export class OutletTableStatusConflictError extends Error {}
export class OutletTableBulkConflictError extends Error {
  constructor(
    message: string,
    public readonly conflictingCodes: string[]
  ) {
    super(message);
  }
}

export type OutletTableFullResponse = {
  id: number;
  company_id: number;
  outlet_id: number;
  code: string;
  name: string;
  zone: string | null;
  capacity: number | null;
  status: "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";
  status_id: OutletTableStatusIdType;
  created_at: string;
  updated_at: string;
};

interface OutletTableRow {
  id: number;
  company_id: number;
  outlet_id: number;
  code: string;
  name: string;
  zone: string | null;
  capacity: number | null;
  status: "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";
  status_id: OutletTableStatusIdType | null;
  created_at: Date;
  updated_at: Date;
}

interface OutletTableCodeRow {
  code: string;
}

type OutletTableActor = {
  userId: number;
  outletId?: number | null;
  ipAddress?: string | null;
};

function buildAuditContext(companyId: number, actor: OutletTableActor) {
  return {
    company_id: companyId,
    user_id: actor.userId,
    outlet_id: actor.outletId ?? null,
    ip_address: actor.ipAddress ?? null
  };
}

function normalizeOutletTable(row: OutletTableRow): OutletTableFullResponse {
  const normalizedStatusId =
    row.status_id ?? outletTableStatusToId(row.status);
  const normalizedStatus = outletTableStatusFromId(normalizedStatusId);
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    code: row.code,
    name: row.name,
    zone: row.zone,
    capacity: row.capacity,
    status: normalizedStatus,
    status_id: normalizedStatusId,
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  };
}

function resolveOperationalStatusInput(params: {
  status?: "AVAILABLE" | "UNAVAILABLE";
  status_id?: OutletTableStatusIdType;
}): { status: "AVAILABLE" | "UNAVAILABLE"; status_id: 1 | 7 } {
  if (params.status_id !== undefined) {
    const statusFromId = outletTableStatusFromId(params.status_id);
    const status = statusFromId === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE";
    return {
      status,
      status_id: status === "UNAVAILABLE" ? 7 : 1
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
      AND (
        status_id IN (1, 2, 3, 4)
        OR status IN ('BOOKED', 'CONFIRMED', 'ARRIVED', 'SEATED')
      )
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

/**
 * List all tables for a specific outlet
 */
export async function listOutletTablesByOutlet(
  companyId: number,
  outletId: number
): Promise<OutletTableFullResponse[]> {
  const db = getDb();
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
  companyId: number,
  outletId: number,
  tableId: number
): Promise<OutletTableFullResponse> {
  const db = getDb();
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
export async function createOutletTable(params: {
  company_id: number;
  outlet_id: number;
  code: string;
  name: string;
  zone?: string | null;
  capacity?: number | null;
  status?: "AVAILABLE" | "UNAVAILABLE";
  status_id?: OutletTableStatusIdType;
  actor: OutletTableActor;
}): Promise<OutletTableFullResponse> {
  const db = getDb();

  // Check if code already exists for this outlet
  const normalizedCode = normalizeTableCode(params.code);
  const normalizedStatus = resolveOperationalStatusInput({
    status: params.status,
    status_id: params.status_id
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

    const auditContext = buildAuditContext(params.company_id, params.actor);
    const auditService = new AuditService(trx);

    await auditService.logCreate(auditContext, "outlet_table", tableId, {
      code: normalizedCode,
      name: params.name,
      zone: params.zone ?? null,
      capacity: params.capacity ?? null,
      status: normalizedStatus.status,
      status_id: normalizedStatus.status_id
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

export async function createOutletTablesBulk(params: {
  company_id: number;
  outlet_id: number;
  code_template: string;
  name_template: string;
  start_seq: number;
  count: number;
  zone?: string | null;
  capacity?: number | null;
  status?: "AVAILABLE" | "UNAVAILABLE";
  status_id?: OutletTableStatusIdType;
  actor: OutletTableActor;
}): Promise<OutletTableFullResponse[]> {
  const db = getDb();

  const normalizedStatus = resolveOperationalStatusInput({
    status: params.status,
    status_id: params.status_id
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
    const auditService = new AuditService(trx);
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

        const auditContext = buildAuditContext(params.company_id, params.actor);
        await auditService.logCreate(auditContext, "outlet_table", tableId, {
          code: item.code,
          name: item.name,
          zone: params.zone ?? null,
          capacity: params.capacity ?? null,
          status: normalizedStatus.status,
          status_id: normalizedStatus.status_id
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
export async function updateOutletTable(params: {
  companyId: number;
  outletId: number;
  tableId: number;
  code?: string;
  name?: string;
  zone?: string | null;
  capacity?: number | null;
  status?: "AVAILABLE" | "UNAVAILABLE";
  status_id?: OutletTableStatusIdType;
  actor: OutletTableActor;
}): Promise<OutletTableFullResponse> {
  const db = getDb();

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
  const oldData: Record<string, unknown> = {};
  const newData: Record<string, unknown> = {};
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
      oldData.code = currentTable.code;
      newData.code = normalizedCode;
      hasChanges = true;
    }
  }

  if (params.name !== undefined && params.name !== currentTable.name) {
    updates.push(sql`name = ${params.name}`);
    oldData.name = currentTable.name;
    newData.name = params.name;
    hasChanges = true;
  }

  if (params.zone !== undefined && params.zone !== currentTable.zone) {
    updates.push(sql`zone = ${params.zone}`);
    oldData.zone = currentTable.zone;
    newData.zone = params.zone;
    hasChanges = true;
  }

  if (params.capacity !== undefined && params.capacity !== currentTable.capacity) {
    updates.push(sql`capacity = ${params.capacity}`);
    oldData.capacity = currentTable.capacity;
    newData.capacity = params.capacity;
    hasChanges = true;
  }

  const currentOperationalStatus =
    currentTable.status === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE";
  const currentOperationalStatusId =
    currentOperationalStatus === "UNAVAILABLE" ? 7 : 1;

  const resolvedRequestStatus =
    params.status_id !== undefined
      ? resolveOperationalStatusInput({ status_id: params.status_id })
      : params.status !== undefined
        ? resolveOperationalStatusInput({ status: params.status })
        : undefined;

  if (
    resolvedRequestStatus !== undefined &&
    (
      resolvedRequestStatus.status !== currentOperationalStatus ||
      resolvedRequestStatus.status_id !== currentOperationalStatusId
    )
  ) {
    const requestedStatus = resolvedRequestStatus.status;
    const requestedStatusId = resolvedRequestStatus.status_id;
    updates.push(sql`status = ${requestedStatus}`);
    updates.push(sql`status_id = ${requestedStatusId}`);
    oldData.status = currentTable.status;
    newData.status = requestedStatus;
    oldData.status_id = currentTable.status_id ?? outletTableStatusToId(currentTable.status as "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE");
    newData.status_id = requestedStatusId;
    hasChanges = true;

    await syncOperationalStatusToOccupancy(db, {
      companyId: params.companyId,
      outletId: params.outletId,
      tableId: params.tableId,
      status: requestedStatus,
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

    // Log audit within transaction
    await withTransaction(db, async (trx) => {
      const auditContext = buildAuditContext(params.companyId, params.actor);
      const auditService = new AuditService(trx);
      await auditService.logUpdate(auditContext, "outlet_table", params.tableId, oldData, newData);
    });
  }

  return normalizeOutletTable(outletTableForResponse);
}

/**
 * Delete an outlet table
 */
export async function deleteOutletTable(params: {
  companyId: number;
  outletId: number;
  tableId: number;
  actor: OutletTableActor;
}): Promise<void> {
  const db = getDb();

  // Get current table
  const rows = await sql<OutletTableRow>`
    SELECT id, code, name, zone, capacity, status, status_id
    FROM outlet_tables
    WHERE id = ${params.tableId} AND company_id = ${params.companyId} AND outlet_id = ${params.outletId}
  `.execute(db);

  if (rows.rows.length === 0) {
    throw new OutletTableNotFoundError(`Table with id ${params.tableId} not found`);
  }

  // Check if table is in use (has reservations or active orders)
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

      const auditContext = buildAuditContext(params.companyId, params.actor);
      const auditService = new AuditService(trx);
      await auditService.logUpdate(
        auditContext,
        "outlet_table",
        params.tableId,
        {
          status: rows.rows[0].status,
          status_id: rows.rows[0].status_id ?? outletTableStatusToId(rows.rows[0].status as "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE")
        },
        { status: "UNAVAILABLE", status_id: 7 }
      );
    });
  }
}
