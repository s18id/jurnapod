// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
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
export async function getOutlet(outletId: number): Promise<OutletFullResponse> {
  const pool = getDbPool();
  const [rows] = await pool.execute<OutletRow[]>(
    `SELECT id, company_id, code, name, created_at, updated_at
     FROM outlets
     WHERE id = ?`,
    [outletId]
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
}): Promise<OutletFullResponse> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

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

    await connection.commit();

    return {
      id: outletId,
      company_id: params.company_id,
      code: params.code,
      name: params.name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
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
  outletId: number;
  name?: string;
}): Promise<OutletFullResponse> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get current outlet
    const [rows] = await connection.execute<OutletRow[]>(
      `SELECT id, company_id, code, name FROM outlets WHERE id = ?`,
      [params.outletId]
    );

    if (rows.length === 0) {
      throw new OutletNotFoundError(`Outlet with id ${params.outletId} not found`);
    }

    const currentOutlet = rows[0];

    // Update if name provided
    if (params.name) {
      await connection.execute(
        `UPDATE outlets SET name = ? WHERE id = ?`,
        [params.name, params.outletId]
      );
    }

    await connection.commit();

    return {
      id: Number(currentOutlet.id),
      company_id: Number(currentOutlet.company_id),
      code: currentOutlet.code,
      name: params.name ?? currentOutlet.name,
      created_at: currentOutlet.created_at.toISOString(),
      updated_at: new Date().toISOString()
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
  outletId: number;
}): Promise<void> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get current outlet
    const [rows] = await connection.execute<OutletRow[]>(
      `SELECT id, code, name FROM outlets WHERE id = ?`,
      [params.outletId]
    );

    if (rows.length === 0) {
      throw new OutletNotFoundError(`Outlet with id ${params.outletId} not found`);
    }

    // Check if outlet is in use (has users)
    const [users] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM user_outlets WHERE outlet_id = ?`,
      [params.outletId]
    );

    if (users[0].count > 0) {
      throw new Error(`Cannot delete outlet: ${users[0].count} users are assigned to this outlet`);
    }

    // Delete outlet
    await connection.execute(
      `DELETE FROM outlets WHERE id = ?`,
      [params.outletId]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
