// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { AuditService } from "@jurnapod/modules-platform";
import { getDbPool } from "./db";

export class OutletNotFoundError extends Error {}
export class OutletCodeExistsError extends Error {}

export type OutletFullResponse = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type OutletRow = RowDataPacket & {
  id: number;
  company_id: number;
  code: string;
  name: string;
  created_at: Date;
  updated_at: Date;
};

type OutletActor = {
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

function buildAuditContext(companyId: number, actor: OutletActor) {
  return {
    company_id: companyId,
    user_id: actor.userId,
    outlet_id: actor.outletId ?? null,
    ip_address: actor.ipAddress ?? null
  };
}

/**
 * List all outlets for a company
 */
export async function listOutletsByCompany(companyId: number): Promise<OutletFullResponse[]> {
  const pool = getDbPool();
  const [rows] = await pool.execute<OutletRow[]>(
    `SELECT id, company_id, code, name, created_at, updated_at
     FROM outlets
     WHERE company_id = ?
     ORDER BY name ASC`,
    [companyId]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: row.code,
    name: row.name,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  }));
}

/**
 * List all outlets (for OWNER role)
 */
export async function listAllOutlets(): Promise<OutletFullResponse[]> {
  const pool = getDbPool();
  const [rows] = await pool.execute<OutletRow[]>(
    `SELECT id, company_id, code, name, created_at, updated_at
     FROM outlets
     ORDER BY company_id ASC, name ASC`
  );

  return rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: row.code,
    name: row.name,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  }));
}

/**
 * Get a single outlet by ID
 */
export async function getOutlet(companyId: number, outletId: number): Promise<OutletFullResponse> {
  const pool = getDbPool();
  const [rows] = await pool.execute<OutletRow[]>(
    `SELECT id, company_id, code, name, created_at, updated_at
     FROM outlets
     WHERE id = ? AND company_id = ?`,
    [outletId, companyId]
  );

  if (rows.length === 0) {
    throw new OutletNotFoundError(`Outlet with id ${outletId} not found`);
  }

  const row = rows[0];
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: row.code,
    name: row.name,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

/**
 * Create a new outlet
 */
export async function createOutlet(params: {
  company_id: number;
  code: string;
  name: string;
  actor: OutletActor;
}): Promise<OutletFullResponse> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    // Check if code already exists for this company
    const [existing] = await connection.execute<OutletRow[]>(
      `SELECT id FROM outlets WHERE company_id = ? AND code = ?`,
      [params.company_id, params.code]
    );

    if (existing.length > 0) {
      throw new OutletCodeExistsError(`Outlet with code ${params.code} already exists for this company`);
    }

    // Insert outlet
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?)`,
      [params.company_id, params.code, params.name]
    );

    const outletId = Number(result.insertId);
    const auditContext = buildAuditContext(params.company_id, params.actor);

    await auditService.logCreate(auditContext, "outlet", outletId, {
      code: params.code,
      name: params.name
    });

    const [rows] = await connection.execute<OutletRow[]>(
      `SELECT id, company_id, code, name, created_at, updated_at
       FROM outlets
       WHERE id = ? AND company_id = ?`,
      [outletId, params.company_id]
    );

    if (rows.length === 0) {
      throw new OutletNotFoundError(`Outlet with id ${outletId} not found`);
    }

    const outlet = rows[0];

    await connection.commit();

    return {
      id: Number(outlet.id),
      company_id: Number(outlet.company_id),
      code: outlet.code,
      name: outlet.name,
      created_at: outlet.created_at.toISOString(),
      updated_at: outlet.updated_at.toISOString()
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Update an outlet
 */
export async function updateOutlet(params: {
  companyId: number;
  outletId: number;
  name?: string;
  actor: OutletActor;
}): Promise<OutletFullResponse> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    // Get current outlet
    const [rows] = await connection.execute<OutletRow[]>(
      `SELECT id, company_id, code, name, created_at, updated_at
       FROM outlets
       WHERE id = ? AND company_id = ?`,
      [params.outletId, params.companyId]
    );

    if (rows.length === 0) {
      throw new OutletNotFoundError(`Outlet with id ${params.outletId} not found`);
    }

    const currentOutlet = rows[0];

    let outletForResponse = currentOutlet;

    // Update if name provided
    if (params.name && params.name !== currentOutlet.name) {
      await connection.execute(
        `UPDATE outlets
         SET name = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND company_id = ?`,
        [params.name, params.outletId, params.companyId]
      );

      const auditContext = buildAuditContext(params.companyId, params.actor);
      await auditService.logUpdate(
        auditContext,
        "outlet",
        params.outletId,
        { name: currentOutlet.name },
        { name: params.name }
      );

      const [updatedRows] = await connection.execute<OutletRow[]>(
        `SELECT id, company_id, code, name, created_at, updated_at
         FROM outlets
         WHERE id = ? AND company_id = ?`,
        [params.outletId, params.companyId]
      );

      if (updatedRows.length === 0) {
        throw new OutletNotFoundError(`Outlet with id ${params.outletId} not found`);
      }

      outletForResponse = updatedRows[0];
    }

    await connection.commit();

    return {
      id: Number(outletForResponse.id),
      company_id: Number(outletForResponse.company_id),
      code: outletForResponse.code,
      name: outletForResponse.name,
      created_at: outletForResponse.created_at.toISOString(),
      updated_at: outletForResponse.updated_at.toISOString()
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Delete an outlet
 */
export async function deleteOutlet(params: {
  companyId: number;
  outletId: number;
  actor: OutletActor;
}): Promise<void> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    // Get current outlet
    const [rows] = await connection.execute<OutletRow[]>(
      `SELECT id, code, name
       FROM outlets
       WHERE id = ? AND company_id = ?`,
      [params.outletId, params.companyId]
    );

    if (rows.length === 0) {
      throw new OutletNotFoundError(`Outlet with id ${params.outletId} not found`);
    }

    // Check if outlet is in use (has users)
    const [users] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM user_outlet_roles WHERE outlet_id = ?`,
      [params.outletId]
    );

    if (users[0].count > 0) {
      throw new Error(`Cannot delete outlet: ${users[0].count} users are assigned to this outlet`);
    }

    // Delete outlet
    await connection.execute(
      `DELETE FROM outlets WHERE id = ? AND company_id = ?`,
      [params.outletId, params.companyId]
    );

    const auditContext = buildAuditContext(params.companyId, params.actor);
    await auditService.logDelete(auditContext, "outlet", params.outletId, {
      code: rows[0].code,
      name: rows[0].name
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
