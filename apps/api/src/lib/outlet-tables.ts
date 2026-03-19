// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { AuditService } from "@jurnapod/modules-platform";
import { getDbPool } from "./db";
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

type OutletTableRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  code: string;
  name: string;
  zone: string | null;
  capacity: number | null;
  status: "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";
  status_id: OutletTableStatusIdType | null;
  created_at: string;
  updated_at: string;
};

type OutletTableCodeRow = RowDataPacket & {
  code: string;
};

type OutletTableActor = {
  userId: number;
  outletId?: number | null;
  ipAddress?: string | null;
};

class ConnectionAuditDbClient {
  constructor(private readonly connection: PoolConnection) {}

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const [rows] = await this.connection.execute<RowDataPacket[]>(sql, params || []);
    return rows as T[];
  }

  async execute(
    sql: string,
    params?: any[]
  ): Promise<{ affectedRows: number; insertId?: number }> {
    const [result] = await this.connection.execute<ResultSetHeader>(sql, params || []);
    return {
      affectedRows: result.affectedRows,
      insertId: result.insertId
    };
  }

  async begin(): Promise<void> {
    // No-op: transaction is managed by caller.
  }

  async commit(): Promise<void> {
    // No-op: transaction is managed by caller.
  }

  async rollback(): Promise<void> {
    // No-op: transaction is managed by caller.
  }
}

function createAuditServiceForConnection(connection: PoolConnection): AuditService {
  const dbClient = new ConnectionAuditDbClient(connection);
  return new AuditService(dbClient);
}

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
  connection: PoolConnection,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<boolean> {
  const [rows] = await connection.execute<Array<RowDataPacket & { count_open: number }>>(
    `SELECT COUNT(*) AS count_open
     FROM pos_order_snapshots
     WHERE company_id = ?
       AND outlet_id = ?
       AND table_id = ?
       AND order_state = 'OPEN'
       AND service_type = 'DINE_IN'`,
    [companyId, outletId, tableId]
  );

  return Number(rows[0]?.count_open ?? 0) > 0;
}

async function hasActiveServiceSessions(
  connection: PoolConnection,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<boolean> {
  const [rows] = await connection.execute<Array<RowDataPacket & { count_active: number }>>(
    `SELECT COUNT(*) AS count_active
     FROM table_service_sessions
     WHERE company_id = ?
       AND outlet_id = ?
       AND table_id = ?
       AND status_id IN (1, 2)`,
    [companyId, outletId, tableId]
  );

  return Number(rows[0]?.count_active ?? 0) > 0;
}

async function hasBlockingReservations(
  connection: PoolConnection,
  companyId: number,
  outletId: number,
  tableId: number
): Promise<boolean> {
  const [rows] = await connection.execute<Array<RowDataPacket & { count_blocking: number }>>(
    `SELECT COUNT(*) AS count_blocking
     FROM reservations
     WHERE company_id = ?
       AND outlet_id = ?
       AND table_id = ?
       AND (
         status_id IN (1, 2, 3, 4)
         OR status IN ('BOOKED', 'CONFIRMED', 'ARRIVED', 'SEATED')
       )`,
    [companyId, outletId, tableId]
  );

  return Number(rows[0]?.count_blocking ?? 0) > 0;
}

async function syncOperationalStatusToOccupancy(
  connection: PoolConnection,
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
      hasOpenDineInOrders(connection, params.companyId, params.outletId, params.tableId),
      hasActiveServiceSessions(connection, params.companyId, params.outletId, params.tableId),
      hasBlockingReservations(connection, params.companyId, params.outletId, params.tableId)
    ]);

    if (hasOpenOrders || hasActiveSessions || hasBlockingResv) {
      throw new OutletTableStatusConflictError(
        "Cannot set table AVAILABLE while there are active dine-in orders, sessions, or reservations"
      );
    }

    await connection.execute(
      `INSERT INTO table_occupancy
       (company_id, outlet_id, table_id, status_id, version, service_session_id, reservation_id,
        occupied_at, reserved_until, guest_count, notes, created_by, updated_by)
       VALUES (?, ?, ?, ?, 1, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
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
         updated_at = CURRENT_TIMESTAMP`,
      [
        params.companyId,
        params.outletId,
        params.tableId,
        TableOccupancyStatus.AVAILABLE,
        String(params.actorUserId),
        String(params.actorUserId)
      ]
    );
    return;
  }

  await connection.execute(
    `INSERT INTO table_occupancy
     (company_id, outlet_id, table_id, status_id, version, created_by, updated_by)
     VALUES (?, ?, ?, ?, 1, ?, ?)
     ON DUPLICATE KEY UPDATE
       status_id = VALUES(status_id),
       version = version + 1,
       updated_by = VALUES(updated_by),
       updated_at = CURRENT_TIMESTAMP`,
    [
      params.companyId,
      params.outletId,
      params.tableId,
      TableOccupancyStatus.OUT_OF_SERVICE,
      String(params.actorUserId),
      String(params.actorUserId)
    ]
  );
}

/**
 * List all tables for a specific outlet
 */
export async function listOutletTablesByOutlet(
  companyId: number,
  outletId: number
): Promise<OutletTableFullResponse[]> {
  const pool = getDbPool();
  const [rows] = await pool.execute<OutletTableRow[]>(
    `SELECT id, company_id, outlet_id, code, name, zone, capacity, status, status_id, created_at, updated_at
     FROM outlet_tables
     WHERE company_id = ? AND outlet_id = ?
     ORDER BY zone ASC, code ASC`,
    [companyId, outletId]
  );

  return rows.map(normalizeOutletTable);
}

/**
 * Get a single table by ID
 */
export async function getOutletTable(
  companyId: number,
  outletId: number,
  tableId: number
): Promise<OutletTableFullResponse> {
  const pool = getDbPool();
  const [rows] = await pool.execute<OutletTableRow[]>(
    `SELECT id, company_id, outlet_id, code, name, zone, capacity, status, status_id, created_at, updated_at
     FROM outlet_tables
     WHERE id = ? AND company_id = ? AND outlet_id = ?`,
    [tableId, companyId, outletId]
  );

  if (rows.length === 0) {
    throw new OutletTableNotFoundError(`Table with id ${tableId} not found`);
  }

  return normalizeOutletTable(rows[0]);
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
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    // Check if code already exists for this outlet
    const normalizedCode = normalizeTableCode(params.code);
    const normalizedStatus = resolveOperationalStatusInput({
      status: params.status,
      status_id: params.status_id
    });

    const [existing] = await connection.execute<OutletTableRow[]>(
      `SELECT id FROM outlet_tables WHERE company_id = ? AND outlet_id = ? AND code = ?`,
      [params.company_id, params.outlet_id, normalizedCode]
    );

    if (existing.length > 0) {
      throw new OutletTableCodeExistsError(
        `Table with code ${params.code} already exists for this outlet`
      );
    }

    // Insert table
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO outlet_tables (company_id, outlet_id, code, name, zone, capacity, status, status_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.company_id,
        params.outlet_id,
        normalizedCode,
        params.name,
        params.zone ?? null,
        params.capacity ?? null,
        normalizedStatus.status,
        normalizedStatus.status_id
      ]
    );

    const tableId = Number(result.insertId);

    await syncOperationalStatusToOccupancy(connection, {
      companyId: params.company_id,
      outletId: params.outlet_id,
      tableId,
      status: normalizedStatus.status,
      actorUserId: params.actor.userId
    });

    const auditContext = buildAuditContext(params.company_id, params.actor);

    await auditService.logCreate(auditContext, "outlet_table", tableId, {
      code: normalizedCode,
      name: params.name,
      zone: params.zone ?? null,
      capacity: params.capacity ?? null,
      status: normalizedStatus.status,
      status_id: normalizedStatus.status_id
    });

    const [rows] = await connection.execute<OutletTableRow[]>(
      `SELECT id, company_id, outlet_id, code, name, zone, capacity, status, status_id, created_at, updated_at
       FROM outlet_tables
       WHERE id = ? AND company_id = ? AND outlet_id = ?`,
      [tableId, params.company_id, params.outlet_id]
    );

    if (rows.length === 0) {
      throw new OutletTableNotFoundError(`Table with id ${tableId} not found`);
    }

    await connection.commit();

    return normalizeOutletTable(rows[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();
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
    const placeholders = generatedCodes.map(() => "?").join(", ");
    const [existingRows] = await connection.execute<OutletTableCodeRow[]>(
      `SELECT code FROM outlet_tables WHERE company_id = ? AND outlet_id = ? AND code IN (${placeholders})`,
      [params.company_id, params.outlet_id, ...generatedCodes]
    );

    if (existingRows.length > 0) {
      const conflicts = [...new Set(existingRows.map((row) => row.code))].sort();
      throw new OutletTableBulkConflictError(
        `Table code already exists for this outlet: ${conflicts.join(", ")}`,
        conflicts
      );
    }

    const insertedIds: number[] = [];
    for (const item of generated) {
      try {
        const [insertResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO outlet_tables (company_id, outlet_id, code, name, zone, capacity, status, status_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            params.company_id,
            params.outlet_id,
            item.code,
            item.name,
            params.zone ?? null,
            params.capacity ?? null,
            normalizedStatus.status,
            normalizedStatus.status_id
          ]
        );

        const tableId = Number(insertResult.insertId);
        insertedIds.push(tableId);

        await syncOperationalStatusToOccupancy(connection, {
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
      } catch (insertError: any) {
        const errno = insertError?.errno;
        if (errno === MYSQL_DUPLICATE_ERROR_CODE) {
          throw new OutletTableBulkConflictError(
            `Table code already exists for this outlet: ${item.code}`,
            [item.code]
          );
        }
        throw insertError;
      }
    }

    const idPlaceholders = insertedIds.map(() => "?").join(", ");
    const [rows] = await connection.execute<OutletTableRow[]>(
      `SELECT id, company_id, outlet_id, code, name, zone, capacity, status, status_id, created_at, updated_at
       FROM outlet_tables
       WHERE company_id = ? AND outlet_id = ? AND id IN (${idPlaceholders})
       ORDER BY code ASC`,
      [params.company_id, params.outlet_id, ...insertedIds]
    );

    await connection.commit();
    return rows.map(normalizeOutletTable);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    // Get current table
    const [rows] = await connection.execute<OutletTableRow[]>(
      `SELECT id, company_id, outlet_id, code, name, zone, capacity, status, status_id, created_at, updated_at
       FROM outlet_tables
       WHERE id = ? AND company_id = ? AND outlet_id = ?`,
      [params.tableId, params.companyId, params.outletId]
    );

    if (rows.length === 0) {
      throw new OutletTableNotFoundError(`Table with id ${params.tableId} not found`);
    }

    const currentTable = rows[0];
    const oldData: Record<string, any> = {};
    const newData: Record<string, any> = {};
    let hasChanges = false;

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];

    if (params.code !== undefined) {
      const normalizedCode = normalizeTableCode(params.code);

      if (normalizedCode !== currentTable.code) {
        const [codeRows] = await connection.execute<OutletTableRow[]>(
          `SELECT id FROM outlet_tables
           WHERE company_id = ? AND outlet_id = ? AND code = ? AND id <> ?
           LIMIT 1`,
          [params.companyId, params.outletId, normalizedCode, params.tableId]
        );

        if (codeRows.length > 0) {
          throw new OutletTableCodeExistsError(
            `Table with code ${normalizedCode} already exists for this outlet`
          );
        }

        updates.push("code = ?");
        values.push(normalizedCode);
        oldData.code = currentTable.code;
        newData.code = normalizedCode;
        hasChanges = true;
      }
    }

    if (params.name !== undefined && params.name !== currentTable.name) {
      updates.push("name = ?");
      values.push(params.name);
      oldData.name = currentTable.name;
      newData.name = params.name;
      hasChanges = true;
    }

    if (params.zone !== undefined && params.zone !== currentTable.zone) {
      updates.push("zone = ?");
      values.push(params.zone);
      oldData.zone = currentTable.zone;
      newData.zone = params.zone;
      hasChanges = true;
    }

    if (params.capacity !== undefined && params.capacity !== currentTable.capacity) {
      updates.push("capacity = ?");
      values.push(params.capacity);
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
      updates.push("status = ?");
      values.push(requestedStatus);
      updates.push("status_id = ?");
      values.push(requestedStatusId);
      oldData.status = currentTable.status;
      newData.status = requestedStatus;
      oldData.status_id = currentTable.status_id ?? outletTableStatusToId(currentTable.status);
      newData.status_id = requestedStatusId;
      hasChanges = true;

      await syncOperationalStatusToOccupancy(connection, {
        companyId: params.companyId,
        outletId: params.outletId,
        tableId: params.tableId,
        status: requestedStatus,
        actorUserId: params.actor.userId
      });
    }

    let outletTableForResponse = currentTable;

    if (hasChanges) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      values.push(params.tableId, params.companyId, params.outletId);

      await connection.execute(
        `UPDATE outlet_tables
         SET ${updates.join(", ")}
         WHERE id = ? AND company_id = ? AND outlet_id = ?`,
        values
      );

      const auditContext = buildAuditContext(params.companyId, params.actor);
      await auditService.logUpdate(auditContext, "outlet_table", params.tableId, oldData, newData);

      const [updatedRows] = await connection.execute<OutletTableRow[]>(
        `SELECT id, company_id, outlet_id, code, name, zone, capacity, status, status_id, created_at, updated_at
         FROM outlet_tables
         WHERE id = ? AND company_id = ? AND outlet_id = ?`,
        [params.tableId, params.companyId, params.outletId]
      );

      if (updatedRows.length === 0) {
        throw new OutletTableNotFoundError(`Table with id ${params.tableId} not found`);
      }

      outletTableForResponse = updatedRows[0];
    }

    await connection.commit();

    return normalizeOutletTable(outletTableForResponse);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    // Get current table
    const [rows] = await connection.execute<OutletTableRow[]>(
      `SELECT id, code, name, zone, capacity, status, status_id
       FROM outlet_tables
       WHERE id = ? AND company_id = ? AND outlet_id = ?`,
      [params.tableId, params.companyId, params.outletId]
    );

    if (rows.length === 0) {
      throw new OutletTableNotFoundError(`Table with id ${params.tableId} not found`);
    }

    // Check if table is in use (has reservations or active orders)
    const [openOrders] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM pos_order_snapshots
       WHERE company_id = ? AND outlet_id = ? AND table_id = ?
       AND order_state = 'OPEN' AND service_type = 'DINE_IN'`,
      [params.companyId, params.outletId, params.tableId]
    );

    if (openOrders[0].count > 0) {
      throw new Error(
        `Cannot delete table: ${openOrders[0].count} active dine-in orders are linked to this table`
      );
    }

    const [reservations] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM reservations 
       WHERE company_id = ? AND outlet_id = ? AND table_id = ? 
       AND status IN ('BOOKED', 'CONFIRMED', 'ARRIVED', 'SEATED')`,
      [params.companyId, params.outletId, params.tableId]
    );

    if (reservations[0].count > 0) {
      throw new Error(
        `Cannot delete table: ${reservations[0].count} active reservations are linked to this table`
      );
    }

    const auditContext = buildAuditContext(params.companyId, params.actor);
    if (rows[0].status !== "UNAVAILABLE") {
      await connection.execute(
        `UPDATE outlet_tables
         SET status = 'UNAVAILABLE', status_id = 7, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND company_id = ? AND outlet_id = ?`,
        [params.tableId, params.companyId, params.outletId]
      );

      await syncOperationalStatusToOccupancy(connection, {
        companyId: params.companyId,
        outletId: params.outletId,
        tableId: params.tableId,
        status: "UNAVAILABLE",
        actorUserId: params.actor.userId
      });

      await auditService.logUpdate(
        auditContext,
        "outlet_table",
        params.tableId,
        {
          status: rows[0].status,
          status_id: rows[0].status_id ?? outletTableStatusToId(rows[0].status)
        },
        { status: "UNAVAILABLE", status_id: 7 }
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
