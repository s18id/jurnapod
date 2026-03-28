// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { AuditService } from "@jurnapod/modules-platform";
import { getDbPool } from "./db";
import { toRfc3339, toRfc3339Required } from "@jurnapod/shared";
import { newKyselyConnection } from "@jurnapod/db";

export class OutletNotFoundError extends Error {}
export class OutletCodeExistsError extends Error {}

export type OutletProfile = {
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  is_active: boolean;
};

export type OutletFullResponse = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type OutletRow = RowDataPacket & {
  id: number;
  company_id: number;
  code: string;
  name: string;
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type OutletActor = {
  userId: number;
  outletId?: number | null;
  ipAddress?: string | null;
};

class ConnectionAuditDbClient {
  constructor(private readonly connection: PoolConnection) {}

  get kysely() {
    return newKyselyConnection(this.connection);
  }

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

function mapRowToOutlet(row: OutletRow): OutletFullResponse {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: row.code,
    name: row.name,
    city: row.city,
    address_line1: row.address_line1,
    address_line2: row.address_line2,
    postal_code: row.postal_code,
    phone: row.phone,
    email: row.email,
    timezone: row.timezone,
    is_active: Boolean(row.is_active),
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  };
}

const BASE_SELECT = `SELECT id, company_id, code, name, city, address_line1, address_line2, 
  postal_code, phone, email, timezone, is_active, created_at, updated_at`;

/**
 * List all outlets for a company
 */
export async function listOutletsByCompany(companyId: number): Promise<OutletFullResponse[]> {
  const pool = getDbPool();
  const [rows] = await pool.execute<OutletRow[]>(
    `${BASE_SELECT}
     FROM outlets
     WHERE company_id = ?
     ORDER BY name ASC`,
    [companyId]
  );

  return rows.map(mapRowToOutlet);
}

/**
 * List all outlets (for OWNER role)
 */
export async function listAllOutlets(): Promise<OutletFullResponse[]> {
  const pool = getDbPool();
  const [rows] = await pool.execute<OutletRow[]>(
    `${BASE_SELECT}
     FROM outlets
     ORDER BY company_id ASC, name ASC`
  );

  return rows.map(mapRowToOutlet);
}

/**
 * Get a single outlet by ID
 */
export async function getOutlet(companyId: number, outletId: number): Promise<OutletFullResponse> {
  const pool = getDbPool();
  const [rows] = await pool.execute<OutletRow[]>(
    `${BASE_SELECT}
     FROM outlets
     WHERE id = ? AND company_id = ?`,
    [outletId, companyId]
  );

  if (rows.length === 0) {
    throw new OutletNotFoundError(`Outlet with id ${outletId} not found`);
  }

  return mapRowToOutlet(rows[0]);
}

export type CreateOutletParams = {
  company_id: number;
  code: string;
  name: string;
  city?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
  actor: OutletActor;
};

/**
 * Create a new outlet
 */
export async function createOutlet(params: CreateOutletParams): Promise<OutletFullResponse> {
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

    // Insert outlet with profile fields
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO outlets (company_id, code, name, city, address_line1, address_line2, 
        postal_code, phone, email, timezone, is_active) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        params.company_id,
        params.code,
        params.name,
        params.city ?? null,
        params.address_line1 ?? null,
        params.address_line2 ?? null,
        params.postal_code ?? null,
        params.phone ?? null,
        params.email ?? null,
        params.timezone ?? null
      ]
    );

    const outletId = Number(result.insertId);
    const auditContext = buildAuditContext(params.company_id, params.actor);

    await auditService.logCreate(auditContext, "outlet", outletId, {
      code: params.code,
      name: params.name,
      city: params.city,
      address_line1: params.address_line1,
      address_line2: params.address_line2,
      postal_code: params.postal_code,
      phone: params.phone,
      email: params.email,
      timezone: params.timezone,
      is_active: true
    });

    const [rows] = await connection.execute<OutletRow[]>(
      `${BASE_SELECT} FROM outlets WHERE id = ? AND company_id = ?`,
      [outletId, params.company_id]
    );

    if (rows.length === 0) {
      throw new OutletNotFoundError(`Outlet with id ${outletId} not found`);
    }

    await connection.commit();

    return mapRowToOutlet(rows[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export type UpdateOutletParams = {
  companyId: number;
  outletId: number;
  name?: string;
  city?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
  is_active?: boolean;
  actor: OutletActor;
};

/**
 * Update an outlet
 */
export async function updateOutlet(params: UpdateOutletParams): Promise<OutletFullResponse> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    // Get current outlet
    const [rows] = await connection.execute<OutletRow[]>(
      `${BASE_SELECT} FROM outlets WHERE id = ? AND company_id = ?`,
      [params.outletId, params.companyId]
    );

    if (rows.length === 0) {
      throw new OutletNotFoundError(`Outlet with id ${params.outletId} not found`);
    }

    const currentOutlet = rows[0];
    const updates: string[] = [];
    const values: any[] = [];
    const oldData: Record<string, any> = {};
    const newData: Record<string, any> = {};

    // Track and apply updates
    if (params.name !== undefined && params.name !== currentOutlet.name) {
      updates.push("name = ?");
      values.push(params.name);
      oldData.name = currentOutlet.name;
      newData.name = params.name;
    }

    if (params.city !== undefined && params.city !== currentOutlet.city) {
      updates.push("city = ?");
      values.push(params.city);
      oldData.city = currentOutlet.city;
      newData.city = params.city;
    }

    if (params.address_line1 !== undefined && params.address_line1 !== currentOutlet.address_line1) {
      updates.push("address_line1 = ?");
      values.push(params.address_line1);
      oldData.address_line1 = currentOutlet.address_line1;
      newData.address_line1 = params.address_line1;
    }

    if (params.address_line2 !== undefined && params.address_line2 !== currentOutlet.address_line2) {
      updates.push("address_line2 = ?");
      values.push(params.address_line2);
      oldData.address_line2 = currentOutlet.address_line2;
      newData.address_line2 = params.address_line2;
    }

    if (params.postal_code !== undefined && params.postal_code !== currentOutlet.postal_code) {
      updates.push("postal_code = ?");
      values.push(params.postal_code);
      oldData.postal_code = currentOutlet.postal_code;
      newData.postal_code = params.postal_code;
    }

    if (params.phone !== undefined && params.phone !== currentOutlet.phone) {
      updates.push("phone = ?");
      values.push(params.phone);
      oldData.phone = currentOutlet.phone;
      newData.phone = params.phone;
    }

    if (params.email !== undefined && params.email !== currentOutlet.email) {
      updates.push("email = ?");
      values.push(params.email);
      oldData.email = currentOutlet.email;
      newData.email = params.email;
    }

    if (params.timezone !== undefined && params.timezone !== currentOutlet.timezone) {
      updates.push("timezone = ?");
      values.push(params.timezone);
      oldData.timezone = currentOutlet.timezone;
      newData.timezone = params.timezone;
    }

    if (params.is_active !== undefined && params.is_active !== Boolean(currentOutlet.is_active)) {
      updates.push("is_active = ?");
      values.push(params.is_active ? 1 : 0);
      oldData.is_active = Boolean(currentOutlet.is_active);
      newData.is_active = params.is_active;
    }

    let outletForResponse = currentOutlet;

    if (updates.length > 0) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      values.push(params.outletId, params.companyId);

      await connection.execute(
        `UPDATE outlets SET ${updates.join(", ")} WHERE id = ? AND company_id = ?`,
        values
      );

      const auditContext = buildAuditContext(params.companyId, params.actor);
      await auditService.logUpdate(auditContext, "outlet", params.outletId, oldData, newData);

      const [updatedRows] = await connection.execute<OutletRow[]>(
        `${BASE_SELECT} FROM outlets WHERE id = ? AND company_id = ?`,
        [params.outletId, params.companyId]
      );

      if (updatedRows.length === 0) {
        throw new OutletNotFoundError(`Outlet with id ${params.outletId} not found`);
      }

      outletForResponse = updatedRows[0];
    }

    await connection.commit();

    return mapRowToOutlet(outletForResponse);
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
      `SELECT id, code, name FROM outlets WHERE id = ? AND company_id = ?`,
      [params.outletId, params.companyId]
    );

    if (rows.length === 0) {
      throw new OutletNotFoundError(`Outlet with id ${params.outletId} not found`);
    }

    // Check if outlet is in use (has users)
    const [users] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM user_role_assignments WHERE outlet_id = ?`,
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

/**
 * Deactivate an outlet (soft delete - preserves historical data)
 */
export async function deactivateOutlet(params: {
  companyId: number;
  outletId: number;
  actor: OutletActor;
}): Promise<OutletFullResponse> {
  return updateOutlet({
    companyId: params.companyId,
    outletId: params.outletId,
    is_active: false,
    actor: params.actor
  });
}

/**
 * Create an outlet with minimal setup (no audit logging).
 * Use this for testing - it only inserts the outlet row.
 * For production use, use createOutlet() which includes audit.
 */
export async function createOutletBasic(params: {
  company_id: number;
  code: string;
  name: string;
  city?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
}): Promise<{ id: number; company_id: number; code: string; name: string }> {
  const pool = getDbPool();

  // Check for duplicate company_id + code combination
  const [existing] = await pool.execute<OutletRow[]>(
    `SELECT id FROM outlets WHERE company_id = ? AND code = ?`,
    [params.company_id, params.code]
  );

  if (existing.length > 0) {
    throw new OutletCodeExistsError(
      `Outlet with code ${params.code} already exists for this company`
    );
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO outlets (company_id, code, name, city, address_line1, address_line2, 
      postal_code, phone, email, timezone, is_active) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      params.company_id,
      params.code,
      params.name,
      params.city ?? null,
      params.address_line1 ?? null,
      params.address_line2 ?? null,
      params.postal_code ?? null,
      params.phone ?? null,
      params.email ?? null,
      params.timezone ?? null
    ]
  );

  return {
    id: Number(result.insertId),
    company_id: params.company_id,
    code: params.code,
    name: params.name
  };
}
