import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { AuditService } from "@jurnapod/modules-platform";
import { getDbPool } from "./db";

export class CompanyNotFoundError extends Error {}
export class CompanyCodeExistsError extends Error {}
export class CompanyDeactivatedError extends Error {}
export class CompanyAlreadyActiveError extends Error {}

export type CompanyResponse = {
  id: number;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type CompanyActor = {
  userId: number;
  outletId?: number | null;
  ipAddress?: string | null;
};

type CompanyRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
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

function buildAuditContext(companyId: number, actor: CompanyActor) {
  return {
    company_id: companyId,
    user_id: actor.userId,
    outlet_id: actor.outletId ?? null,
    ip_address: actor.ipAddress ?? null
  };
}

function normalizeCompanyRow(row: CompanyRow): CompanyResponse {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null
  };
}

async function ensureCompanyExists(
  connection: PoolConnection,
  companyId: number,
  options?: { includeDeleted?: boolean }
): Promise<CompanyRow> {
  const includeDeleted = options?.includeDeleted ?? false;
  const [rows] = await connection.execute<CompanyRow[]>(
    `SELECT id, code, name, created_at, updated_at, deleted_at
     FROM companies
     WHERE id = ?
     ${includeDeleted ? "" : "AND deleted_at IS NULL"}`,
    [companyId]
  );

  if (rows.length === 0) {
    throw new CompanyNotFoundError(`Company with id ${companyId} not found`);
  }

  return rows[0];
}


/**
 * List companies (optionally scoped to a company id)
 */
export async function listCompanies(params: {
  companyId?: number;
  includeDeleted?: boolean;
}): Promise<CompanyResponse[]> {
  const pool = getDbPool();
  const conditions: string[] = [];
  const values: Array<number> = [];
  if (params.companyId) {
    conditions.push("id = ?");
    values.push(params.companyId);
  }
  if (!params.includeDeleted) {
    conditions.push("deleted_at IS NULL");
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.execute<CompanyRow[]>(
    `SELECT id, code, name, created_at, updated_at, deleted_at
     FROM companies
     ${whereClause}
     ORDER BY name ASC`,
    values
  );

  return rows.map((row) => normalizeCompanyRow(row));
}

/**
 * Get a single company by ID
 */
export async function getCompany(
  companyId: number,
  options?: { includeDeleted?: boolean }
): Promise<CompanyResponse> {
  const pool = getDbPool();
  const includeDeleted = options?.includeDeleted ?? false;
  const [rows] = await pool.execute<CompanyRow[]>(
    `SELECT id, code, name, created_at, updated_at, deleted_at
     FROM companies
     WHERE id = ?
     ${includeDeleted ? "" : "AND deleted_at IS NULL"}`,
    [companyId]
  );

  if (rows.length === 0) {
    throw new CompanyNotFoundError(`Company with id ${companyId} not found`);
  }

  return normalizeCompanyRow(rows[0]);
}

/**
 * Create a new company
 */
export async function createCompany(params: {
  code: string;
  name: string;
  actor: CompanyActor;
}): Promise<CompanyResponse> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

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
    const auditContext = buildAuditContext(companyId, params.actor);

    const [rows] = await connection.execute<CompanyRow[]>(
      `SELECT id, code, name, created_at, updated_at, deleted_at
       FROM companies
       WHERE id = ?`,
      [companyId]
    );

    const createdCompany = rows[0];
    if (!createdCompany) {
      throw new CompanyNotFoundError(`Company with id ${companyId} not found`);
    }

    await auditService.logCreate(auditContext, "company", companyId, {
      code: createdCompany.code,
      name: createdCompany.name
    });

    await connection.commit();

    return normalizeCompanyRow(createdCompany);
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
  actor: CompanyActor;
}): Promise<CompanyResponse> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();

    const currentCompany = await ensureCompanyExists(connection, params.companyId, {
      includeDeleted: true
    });

    // Update if name provided
    if (params.name && params.name !== currentCompany.name) {
      await connection.execute(
        `UPDATE companies
         SET name = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [params.name, params.companyId]
      );

      const auditContext = buildAuditContext(params.companyId, params.actor);
      await auditService.logUpdate(
        auditContext,
        "company",
        params.companyId,
        { name: currentCompany.name },
        { name: params.name }
      );
    }

    await connection.commit();

    return {
      id: Number(currentCompany.id),
      code: currentCompany.code,
      name: params.name ?? currentCompany.name,
      created_at: currentCompany.created_at.toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: currentCompany.deleted_at ? currentCompany.deleted_at.toISOString() : null
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
  actor: CompanyActor;
}): Promise<void> {
  await deactivateCompany(params);
}

export async function deactivateCompany(params: {
  companyId: number;
  actor: CompanyActor;
}): Promise<CompanyResponse> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();
    const company = await ensureCompanyExists(connection, params.companyId, {
      includeDeleted: true
    });

    if (company.deleted_at) {
      throw new CompanyDeactivatedError("Company is already deactivated");
    }

    await connection.execute(
      `UPDATE companies
       SET deleted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND deleted_at IS NULL`,
      [params.companyId]
    );

    const auditContext = buildAuditContext(params.companyId, params.actor);
    await auditService.logDeactivate(auditContext, "company", params.companyId, {
      code: company.code,
      name: company.name,
      forced: true
    });

    await connection.commit();

    return {
      id: Number(company.id),
      code: company.code,
      name: company.name,
      created_at: company.created_at.toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: new Date().toISOString()
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function reactivateCompany(params: {
  companyId: number;
  actor: CompanyActor;
}): Promise<CompanyResponse> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);

  try {
    await connection.beginTransaction();
    const company = await ensureCompanyExists(connection, params.companyId, {
      includeDeleted: true
    });

    if (!company.deleted_at) {
      throw new CompanyAlreadyActiveError("Company is already active");
    }

    await connection.execute(
      `UPDATE companies
       SET deleted_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [params.companyId]
    );

    const auditContext = buildAuditContext(params.companyId, params.actor);
    await auditService.logReactivate(auditContext, "company", params.companyId, {
      code: company.code,
      name: company.name
    });

    await connection.commit();

    return {
      id: Number(company.id),
      code: company.code,
      name: company.name,
      created_at: company.created_at.toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
