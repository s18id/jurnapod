// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { Pool, PoolConnection } from "mysql2/promise";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { getDbPool } from "./db";

// =============================================================================
// Types
// =============================================================================

export type TaxRateRecord = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  rate_percent: number;
  account_id: number | null;
  is_inclusive: boolean;
  is_active: boolean;
};

export type TaxRate = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  rate_percent: number;
  account_id: number | null;
  is_inclusive: boolean;
  is_active: boolean;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

type QueryExecutor = {
  execute: PoolConnection["execute"] | Pool["execute"];
};

type MutationActor = {
  userId: number;
};

// =============================================================================
// Error Classes
// =============================================================================

export class TaxRateNotFoundError extends Error {
  constructor(message = "Tax rate not found") {
    super(message);
    this.name = "TaxRateNotFoundError";
  }
}

export class TaxRateConflictError extends Error {
  constructor(message = "Tax rate conflict") {
    super(message);
    this.name = "TaxRateConflictError";
  }
}

export class TaxRateValidationError extends Error {
  constructor(message = "Tax rate validation error") {
    super(message);
    this.name = "TaxRateValidationError";
  }
}

export class TaxRateReferenceError extends Error {
  constructor(message = "Invalid reference") {
    super(message);
    this.name = "TaxRateReferenceError";
  }
}

// =============================================================================
// Helpers
// =============================================================================

function normalizeMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeRate(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

type TaxRateRow = RowDataPacket & {
  id: number;
  company_id: number;
  code: string;
  name: string;
  rate_percent: number | string;
  account_id: number | null;
  is_inclusive: number;
  is_active: number;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at?: string | Date;
  updated_at?: string | Date;
};

type TaxRateRowFull = RowDataPacket & {
  id: number;
  company_id: number;
  code: string;
  name: string;
  rate_percent: number | string;
  account_id: number | null;
  is_inclusive: number;
  is_active: number;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function normalizeTaxRate(row: TaxRateRowFull): TaxRate {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: row.code,
    name: row.name,
    rate_percent: Number(row.rate_percent),
    account_id: row.account_id ? Number(row.account_id) : null,
    is_inclusive: Boolean(row.is_inclusive),
    is_active: Boolean(row.is_active),
    created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    updated_by_user_id: row.updated_by_user_id ? Number(row.updated_by_user_id) : null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)
  };
}

async function findTaxRateByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  taxRateId: number,
  options: { forUpdate?: boolean } = {}
): Promise<TaxRate | null> {
  const forUpdateClause = options.forUpdate ? "FOR UPDATE" : "";
  
  const [rows] = await executor.execute<TaxRateRowFull[]>(
    `SELECT id, company_id, code, name, rate_percent, account_id, is_inclusive, is_active,
            created_by_user_id, updated_by_user_id, created_at, updated_at
     FROM tax_rates 
     WHERE company_id = ? AND id = ?
     ${forUpdateClause}`,
    [companyId, taxRateId]
  );

  if (rows.length === 0) {
    return null;
  }

  return normalizeTaxRate(rows[0]);
}

async function withTransaction<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// =============================================================================
// Tax Rate CRUD Functions
// =============================================================================

export async function findTaxRateById(
  companyId: number,
  taxRateId: number
): Promise<TaxRate | null> {
  const pool = getDbPool();
  return findTaxRateByIdWithExecutor(pool, companyId, taxRateId);
}

export async function createTaxRate(
  companyId: number,
  input: {
    code: string;
    name: string;
    rate_percent: number;
    account_id?: number | null;
    is_inclusive?: boolean;
    is_active?: boolean;
  },
  actor?: MutationActor
): Promise<TaxRate> {
  return withTransaction(async (connection) => {
    // Validate input
    if (!input.code?.trim()) {
      throw new TaxRateValidationError("Tax rate code is required");
    }
    if (!input.name?.trim()) {
      throw new TaxRateValidationError("Tax rate name is required");
    }
    if (input.rate_percent < 0 || input.rate_percent > 100) {
      throw new TaxRateValidationError("Tax rate percent must be between 0 and 100");
    }

    // Validate account exists if provided
    if (input.account_id) {
      const [accountRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM accounts WHERE company_id = ? AND id = ?`,
        [companyId, input.account_id]
      );
      if (accountRows.length === 0) {
        throw new TaxRateReferenceError("Account not found");
      }
    }

    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO tax_rates (company_id, code, name, rate_percent, account_id, is_inclusive, is_active, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          input.code.trim(),
          input.name.trim(),
          input.rate_percent,
          input.account_id || null,
          input.is_inclusive ?? false,
          input.is_active ?? true,
          actor?.userId || null
        ]
      );

      const taxRate = await findTaxRateByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!taxRate) {
        throw new Error("Created tax rate not found");
      }

      return taxRate;
    } catch (dbError: any) {
      if (dbError.code === 'ER_DUP_ENTRY') {
        throw new TaxRateConflictError("Tax rate code already exists");
      }
      if (dbError.code === 'ER_NO_REFERENCED_ROW_2' || dbError.code === 'ER_NO_REFERENCED_ROW') {
        throw new TaxRateReferenceError("Invalid account reference");
      }
      throw dbError;
    }
  });
}

export async function updateTaxRate(
  companyId: number,
  taxRateId: number,
  input: {
    code?: string;
    name?: string;
    rate_percent?: number;
    account_id?: number | null;
    is_inclusive?: boolean;
    is_active?: boolean;
  },
  actor?: MutationActor
): Promise<TaxRate> {
  return withTransaction(async (connection) => {
    // Check if tax rate exists
    const existing = await findTaxRateByIdWithExecutor(connection, companyId, taxRateId, { forUpdate: true });
    if (!existing) {
      throw new TaxRateNotFoundError("Tax rate not found");
    }

    // Validate input
    if (input.code !== undefined && !input.code?.trim()) {
      throw new TaxRateValidationError("Tax rate code cannot be empty");
    }
    if (input.name !== undefined && !input.name?.trim()) {
      throw new TaxRateValidationError("Tax rate name cannot be empty");
    }
    if (input.rate_percent !== undefined && (input.rate_percent < 0 || input.rate_percent > 100)) {
      throw new TaxRateValidationError("Tax rate percent must be between 0 and 100");
    }

    // Validate account exists if provided
    if (input.account_id !== undefined && input.account_id !== null) {
      const [accountRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM accounts WHERE company_id = ? AND id = ?`,
        [companyId, input.account_id]
      );
      if (accountRows.length === 0) {
        throw new TaxRateReferenceError("Account not found");
      }
    }

    // Build dynamic UPDATE query
    const updates: string[] = [];
    const values: any[] = [];

    if (input.code !== undefined) {
      updates.push("code = ?");
      values.push(input.code.trim());
    }
    if (input.name !== undefined) {
      updates.push("name = ?");
      values.push(input.name.trim());
    }
    if (input.rate_percent !== undefined) {
      updates.push("rate_percent = ?");
      values.push(input.rate_percent);
    }
    if (input.account_id !== undefined) {
      updates.push("account_id = ?");
      values.push(input.account_id);
    }
    if (input.is_inclusive !== undefined) {
      updates.push("is_inclusive = ?");
      values.push(input.is_inclusive);
    }
    if (input.is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(input.is_active);
    }

    if (updates.length === 0) {
      return existing; // No changes
    }

    updates.push("updated_by_user_id = ?");
    values.push(actor?.userId || null);
    values.push(companyId, taxRateId);

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE tax_rates SET ${updates.join(", ")} WHERE company_id = ? AND id = ?`,
        values
      );

      const updatedTaxRate = await findTaxRateByIdWithExecutor(connection, companyId, taxRateId);
      if (!updatedTaxRate) {
        throw new TaxRateNotFoundError("Tax rate not found after update");
      }

      return updatedTaxRate;
    } catch (dbError: any) {
      if (dbError.code === 'ER_DUP_ENTRY') {
        throw new TaxRateConflictError("Tax rate code already exists");
      }
      if (dbError.code === 'ER_NO_REFERENCED_ROW_2' || dbError.code === 'ER_NO_REFERENCED_ROW') {
        throw new TaxRateReferenceError("Invalid account reference");
      }
      throw dbError;
    }
  });
}

export async function deleteTaxRate(
  companyId: number,
  taxRateId: number,
  actor?: MutationActor
): Promise<void> {
  return withTransaction(async (connection) => {
    // Check if tax rate exists
    const existing = await findTaxRateByIdWithExecutor(connection, companyId, taxRateId, { forUpdate: true });
    if (!existing) {
      throw new TaxRateNotFoundError("Tax rate not found");
    }

    // Check if tax rate is in use (basic check - can be expanded)
    const [usageRows] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM sales_invoice_taxes WHERE tax_rate_id = ?
       UNION ALL
       SELECT COUNT(*) as count FROM pos_transaction_taxes WHERE tax_rate_id = ?`,
      [taxRateId, taxRateId]
    );

    const totalUsage = usageRows.reduce((sum: number, row: any) => sum + Number(row.count), 0);
    if (totalUsage > 0) {
      throw new TaxRateValidationError("Cannot delete tax rate that is in use");
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `DELETE FROM tax_rates WHERE company_id = ? AND id = ?`,
      [companyId, taxRateId]
    );

    if (result.affectedRows === 0) {
      throw new TaxRateNotFoundError("Tax rate not found");
    }
  });
}

export async function listTaxRates(
  companyId: number,
  filters: {
    isActive?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<TaxRate[]> {
  const pool = getDbPool();
  
  let sql = `
    SELECT id, company_id, code, name, rate_percent, account_id, is_inclusive, is_active,
           created_by_user_id, updated_by_user_id, created_at, updated_at
    FROM tax_rates 
    WHERE company_id = ?
  `;
  
  const values: any[] = [companyId];
  
  if (filters.isActive !== undefined) {
    sql += " AND is_active = ?";
    values.push(filters.isActive);
  }
  
  sql += " ORDER BY code ASC";
  
  if (filters.limit) {
    sql += " LIMIT ?";
    values.push(filters.limit);
    
    if (filters.offset) {
      sql += " OFFSET ?";
      values.push(filters.offset);
    }
  }
  
  const [rows] = await pool.execute<TaxRateRowFull[]>(sql, values);
  return rows.map(normalizeTaxRate);
}

// =============================================================================
// Company Tax Rates Functions
// =============================================================================

export async function listCompanyTaxRates(
  executor: QueryExecutor,
  companyId: number
): Promise<TaxRateRecord[]> {
  const [rows] = await executor.execute<TaxRateRow[]>(
    `SELECT id, company_id, code, name, rate_percent, account_id, is_inclusive, is_active
     FROM tax_rates
     WHERE company_id = ?
     ORDER BY name ASC, id ASC`,
    [companyId]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: String(row.code),
    name: String(row.name),
    rate_percent: normalizeRate(row.rate_percent),
    account_id: row.account_id ? Number(row.account_id) : null,
    is_inclusive: row.is_inclusive === 1,
    is_active: row.is_active === 1
  }));
}

export async function listCompanyDefaultTaxRateIds(
  executor: QueryExecutor,
  companyId: number
): Promise<number[]> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT tax_rate_id
     FROM company_tax_defaults
     WHERE company_id = ?
     ORDER BY tax_rate_id ASC`,
    [companyId]
  );

  return (rows as Array<{ tax_rate_id?: number }>).map((row) => Number(row.tax_rate_id)).filter((id) => id > 0);
}

export async function listCompanyDefaultTaxRates(
  executor: QueryExecutor,
  companyId: number
): Promise<TaxRateRecord[]> {
  const [rows] = await executor.execute<TaxRateRow[]>(
    `SELECT tr.id, tr.company_id, tr.code, tr.name, tr.rate_percent, tr.account_id, tr.is_inclusive, tr.is_active
     FROM company_tax_defaults ctd
     INNER JOIN tax_rates tr
       ON tr.id = ctd.tax_rate_id
       AND tr.company_id = ctd.company_id
     WHERE ctd.company_id = ?
       AND tr.company_id = ?
       AND tr.is_active = 1
     ORDER BY tr.name ASC, tr.id ASC`,
    [companyId, companyId]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: String(row.code),
    name: String(row.name),
    rate_percent: normalizeRate(row.rate_percent),
    account_id: row.account_id ? Number(row.account_id) : null,
    is_inclusive: row.is_inclusive === 1,
    is_active: row.is_active === 1
  }));
}

export async function setCompanyDefaultTaxRates(
  executor: QueryExecutor,
  companyId: number,
  taxRateIds: number[],
  userId: number
): Promise<number[]> {
  // Delete existing defaults
  await executor.execute(
    "DELETE FROM company_tax_defaults WHERE company_id = ?",
    [companyId]
  );

  // Insert new defaults
  for (const taxRateId of taxRateIds) {
    await executor.execute(
      `INSERT INTO company_tax_defaults (company_id, tax_rate_id, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?)`,
      [companyId, taxRateId, userId, userId]
    );
  }

  // Return the updated default tax rate IDs
  const defaultIds = await listCompanyDefaultTaxRateIds(executor, companyId);
  return defaultIds;
}

// =============================================================================
// Tax Calculation Functions
// =============================================================================

export function resolveCombinedTaxConfig(
  rates: TaxRateRecord[]
): { rate: number; inclusive: boolean } {
  if (rates.length === 0) {
    return { rate: 0, inclusive: false };
  }

  const inclusive = rates[0].is_inclusive;
  const rate = rates.reduce((acc, item) => acc + normalizeRate(item.rate_percent), 0);
  return {
    rate: normalizeMoney(rate),
    inclusive
  };
}

export function calculateTaxLines(params: {
  grossAmount: number;
  rates: TaxRateRecord[];
}): Array<{ tax_rate_id: number; amount: number }> {
  const { grossAmount, rates } = params;
  if (rates.length === 0) {
    return [];
  }

  const inclusive = rates[0].is_inclusive;
  const totalRate = rates.reduce((acc, rate) => acc + normalizeRate(rate.rate_percent), 0);
  if (totalRate <= 0) {
    return rates.map((rate) => ({ tax_rate_id: rate.id, amount: 0 }));
  }

  const baseAmount = inclusive
    ? normalizeMoney(grossAmount / (1 + totalRate / 100))
    : normalizeMoney(grossAmount);

  const rawAmounts = rates.map((rate) =>
    normalizeMoney(baseAmount * (normalizeRate(rate.rate_percent) / 100))
  );

  const totalRaw = normalizeMoney(rawAmounts.reduce((acc, amount) => acc + amount, 0));
  const expectedTotal = inclusive
    ? normalizeMoney(grossAmount - baseAmount)
    : normalizeMoney(grossAmount * (totalRate / 100));
  const adjustment = normalizeMoney(expectedTotal - totalRaw);

  const adjusted = rawAmounts.slice();
  if (adjusted.length > 0 && adjustment !== 0) {
    adjusted[adjusted.length - 1] = normalizeMoney(adjusted[adjusted.length - 1] + adjustment);
  }

  return rates.map((rate, index) => ({
    tax_rate_id: rate.id,
    amount: adjusted[index]
  }));
}

export async function withTaxExecutor<T>(
  executor: QueryExecutor | null,
  operation: (executor: QueryExecutor) => Promise<T>
): Promise<T> {
  if (executor) {
    return operation(executor);
  }

  const pool = getDbPool();
  return operation(pool);
}
