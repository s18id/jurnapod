import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDbPool } from "./db";

export class CompanyNotFoundError extends Error {}
export class CompanyCodeExistsError extends Error {}

export type CompanyResponse = {
  id: number;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type CompanyRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
  created_at: Date;
  updated_at: Date;
};

/**
 * List all companies
 */
export async function listCompanies(): Promise<CompanyResponse[]> {
  const pool = getDbPool();
  const [rows] = await pool.execute<CompanyRow[]>(
    `SELECT id, code, name, created_at, updated_at
     FROM companies
     ORDER BY name ASC`
  );

  return rows.map((row) => ({
    id: Number(row.id),
    code: row.code,
    name: row.name,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  }));
}

/**
 * Get a single company by ID
 */
export async function getCompany(companyId: number): Promise<CompanyResponse> {
  const pool = getDbPool();
  const [rows] = await pool.execute<CompanyRow[]>(
    `SELECT id, code, name, created_at, updated_at
     FROM companies
     WHERE id = ?`,
    [companyId]
  );

  if (rows.length === 0) {
    throw new CompanyNotFoundError(`Company with id ${companyId} not found`);
  }

  const row = rows[0];
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

/**
 * Create a new company
 */
export async function createCompany(params: {
  code: string;
  name: string;
}): Promise<CompanyResponse> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Check if code already exists
    const [existing] = await connection.execute<CompanyRow[]>(
      `SELECT id FROM companies WHERE code = ?`,
      [params.code]
    );

    if (existing.length > 0) {
      throw new CompanyCodeExistsError(`Company with code ${params.code} already exists`);
    }

    // Insert company
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO companies (code, name) VALUES (?, ?)`,
      [params.code, params.name]
    );

    const companyId = Number(result.insertId);

    await connection.commit();

    return {
      id: companyId,
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
 * Update a company
 */
export async function updateCompany(params: {
  companyId: number;
  name?: string;
}): Promise<CompanyResponse> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get current company
    const [rows] = await connection.execute<CompanyRow[]>(
      `SELECT id, code, name FROM companies WHERE id = ?`,
      [params.companyId]
    );

    if (rows.length === 0) {
      throw new CompanyNotFoundError(`Company with id ${params.companyId} not found`);
    }

    const currentCompany = rows[0];

    // Update if name provided
    if (params.name) {
      await connection.execute(
        `UPDATE companies SET name = ? WHERE id = ?`,
        [params.name, params.companyId]
      );
    }

    await connection.commit();

    return {
      id: Number(currentCompany.id),
      code: currentCompany.code,
      name: params.name ?? currentCompany.name,
      created_at: currentCompany.created_at.toISOString(),
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
 * Delete a company
 */
export async function deleteCompany(params: {
  companyId: number;
}): Promise<void> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get current company
    const [rows] = await connection.execute<CompanyRow[]>(
      `SELECT id, code, name FROM companies WHERE id = ?`,
      [params.companyId]
    );

    if (rows.length === 0) {
      throw new CompanyNotFoundError(`Company with id ${params.companyId} not found`);
    }

    // Check if company is in use (has users)
    const [users] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM users WHERE company_id = ?`,
      [params.companyId]
    );

    if (users[0].count > 0) {
      throw new Error(`Cannot delete company: ${users[0].count} users are assigned to this company`);
    }

    // Check if company has outlets
    const [outlets] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM outlets WHERE company_id = ?`,
      [params.companyId]
    );

    if (outlets[0].count > 0) {
      throw new Error(`Cannot delete company: ${outlets[0].count} outlets are assigned to this company`);
    }

    // Delete company
    await connection.execute(
      `DELETE FROM companies WHERE id = ?`,
      [params.companyId]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
