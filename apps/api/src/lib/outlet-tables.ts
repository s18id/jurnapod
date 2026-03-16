// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { AuditService } from "@jurnapod/modules-platform";
import { getDbPool } from "./db";

const MYSQL_DUPLICATE_ERROR_CODE = 1062;

export class OutletTableNotFoundError extends Error {}
export class OutletTableCodeExistsError extends Error {}
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
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    code: row.code,
    name: row.name,
    zone: row.zone,
    capacity: row.capacity,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeTableCode(value: string): string {
  return value.trim().toUpperCase();
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
    `SELECT id, company_id, outlet_id, code, name, zone, capacity, status, created_at, updated_at
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
    `SELECT id, company_id, outlet_id, code, name, zone, capacity, status, created_at, updated_at
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
  actor: OutletTableActor;
}): Promise<OutletTableFullResponse> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    // Check if code already exists for this outlet
    const normalizedCode = normalizeTableCode(params.code);

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
      `INSERT INTO outlet_tables (company_id, outlet_id, code, name, zone, capacity, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        params.company_id,
        params.outlet_id,
        normalizedCode,
        params.name,
        params.zone ?? null,
        params.capacity ?? null,
        params.status ?? "AVAILABLE"
      ]
    );

    const tableId = Number(result.insertId);
    const auditContext = buildAuditContext(params.company_id, params.actor);

    await auditService.logCreate(auditContext, "outlet_table", tableId, {
      code: normalizedCode,
      name: params.name,
      zone: params.zone ?? null,
      capacity: params.capacity ?? null,
      status: params.status ?? "AVAILABLE"
    });

    const [rows] = await connection.execute<OutletTableRow[]>(
      `SELECT id, company_id, outlet_id, code, name, zone, capacity, status, created_at, updated_at
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
  actor: OutletTableActor;
}): Promise<OutletTableFullResponse[]> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

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
          `INSERT INTO outlet_tables (company_id, outlet_id, code, name, zone, capacity, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            params.company_id,
            params.outlet_id,
            item.code,
            item.name,
            params.zone ?? null,
            params.capacity ?? null,
            params.status ?? "AVAILABLE"
          ]
        );

        const tableId = Number(insertResult.insertId);
        insertedIds.push(tableId);

        const auditContext = buildAuditContext(params.company_id, params.actor);
        await auditService.logCreate(auditContext, "outlet_table", tableId, {
          code: item.code,
          name: item.name,
          zone: params.zone ?? null,
          capacity: params.capacity ?? null,
          status: params.status ?? "AVAILABLE"
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
      `SELECT id, company_id, outlet_id, code, name, zone, capacity, status, created_at, updated_at
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
  actor: OutletTableActor;
}): Promise<OutletTableFullResponse> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    // Get current table
    const [rows] = await connection.execute<OutletTableRow[]>(
      `SELECT id, company_id, outlet_id, code, name, zone, capacity, status, created_at, updated_at
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

    if (params.status !== undefined && params.status !== currentTable.status) {
      updates.push("status = ?");
      values.push(params.status);
      oldData.status = currentTable.status;
      newData.status = params.status;
      hasChanges = true;
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
        `SELECT id, company_id, outlet_id, code, name, zone, capacity, status, created_at, updated_at
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
      `SELECT id, code, name, zone, capacity, status
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
         SET status = 'UNAVAILABLE', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND company_id = ? AND outlet_id = ?`,
        [params.tableId, params.companyId, params.outletId]
      );

      await auditService.logUpdate(
        auditContext,
        "outlet_table",
        params.tableId,
        { status: rows[0].status },
        { status: "UNAVAILABLE" }
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
