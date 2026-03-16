// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { Pool, PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import {
  SETTINGS_REGISTRY,
  parseSettingValue,
  type FiscalYear,
  type FiscalYearCreateRequest,
  type FiscalYearListQuery,
  type FiscalYearStatus,
  type FiscalYearUpdateRequest,
  type SettingKey,
  type SettingValue
} from "@jurnapod/shared";
import { getDbPool } from "./db";

type QueryExecutor = {
  execute: PoolConnection["execute"] | Pool["execute"];
};

type FiscalYearRow = RowDataPacket & {
  id: number;
  company_id: number;
  code: string;
  name: string;
  start_date: string;
  end_date: string;
  status: FiscalYearStatus;
  created_at: string;
  updated_at: string;
};

type FiscalYearRangeRow = RowDataPacket & {
  id: number;
  start_date: string;
  end_date: string;
};

export class FiscalYearNotFoundError extends Error {}
export class FiscalYearCodeExistsError extends Error {}
export class FiscalYearDateRangeError extends Error {}
export class FiscalYearOverlapError extends Error {}
export class FiscalYearOpenConflictError extends Error {}
export class FiscalYearNotOpenError extends Error {}
export class FiscalYearSelectionError extends Error {}

const MYSQL_DUPLICATE_ERROR_CODE = 1062;
const ALLOW_MULTIPLE_OPEN_SETTING: SettingKey = "accounting.allow_multiple_open_fiscal_years";

function formatDateOnly(value: string): string {
  return value.slice(0, 10);
}

function formatDateTime(value: string): string {
  return value;
}

function normalizeFiscalYear(row: FiscalYearRow): FiscalYear {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: String(row.code),
    name: String(row.name),
    start_date: formatDateOnly(row.start_date),
    end_date: formatDateOnly(row.end_date),
    status: row.status,
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at)
  };
}

function hasOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
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

async function resolveCompanySettingOutletId(
  executor: QueryExecutor,
  companyId: number
): Promise<number> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM outlets
     WHERE company_id = ?
     ORDER BY id ASC
     LIMIT 1`,
    [companyId]
  );

  const outletId = rows[0]?.id;
  if (!outletId) {
    throw new Error("Default outlet not found");
  }

  return Number(outletId);
}

async function readCompanySetting(
  executor: QueryExecutor,
  companyId: number,
  outletId: number,
  key: SettingKey
): Promise<SettingValue> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT value_json
     FROM company_settings
     WHERE company_id = ?
       AND outlet_id = ?
       AND \`key\` = ?
     LIMIT 1`,
    [companyId, outletId, key]
  );

  const stored = rows[0]?.value_json;
  if (typeof stored === "string") {
    try {
      const parsed = JSON.parse(stored);
      return parseSettingValue(key, parsed);
    } catch {
      return SETTINGS_REGISTRY[key].defaultValue;
    }
  }

  return SETTINGS_REGISTRY[key].defaultValue;
}

async function allowMultipleOpenFiscalYears(
  executor: QueryExecutor,
  companyId: number,
  outletId?: number
): Promise<boolean> {
  const resolvedOutletId = outletId ?? (await resolveCompanySettingOutletId(executor, companyId));
  const value = await readCompanySetting(executor, companyId, resolvedOutletId, ALLOW_MULTIPLE_OPEN_SETTING);
  return Boolean(value);
}

async function listOpenFiscalYearRanges(
  executor: QueryExecutor,
  companyId: number,
  excludeId?: number
): Promise<FiscalYearRangeRow[]> {
  const params: Array<number> = [companyId];
  let filter = "";
  if (excludeId) {
    filter = "AND id <> ?";
    params.push(excludeId);
  }

  const [rows] = await executor.execute<FiscalYearRangeRow[]>(
    `SELECT id, start_date, end_date
     FROM fiscal_years
     WHERE company_id = ?
       AND status = 'OPEN'
       ${filter}
     ORDER BY start_date ASC, id ASC`,
    params
  );

  return rows;
}

function assertDateRange(startDate: string, endDate: string): void {
  if (startDate > endDate) {
    throw new FiscalYearDateRangeError("Start date must be before end date");
  }
}

async function assertOpenFiscalYearRules(
  executor: QueryExecutor,
  companyId: number,
  range: { start_date: string; end_date: string },
  options: { allowMultiple: boolean; excludeId?: number }
): Promise<void> {
  const openYears = await listOpenFiscalYearRanges(executor, companyId, options.excludeId);
  if (!options.allowMultiple && openYears.length > 0) {
    throw new FiscalYearOpenConflictError("Only one open fiscal year allowed");
  }

  for (const openYear of openYears) {
    const openStart = formatDateOnly(openYear.start_date);
    const openEnd = formatDateOnly(openYear.end_date);
    if (hasOverlap(range.start_date, range.end_date, openStart, openEnd)) {
      throw new FiscalYearOverlapError("Open fiscal years cannot overlap");
    }
  }
}

export async function listFiscalYears(query: FiscalYearListQuery): Promise<FiscalYear[]> {
  const pool = getDbPool();
  const params: Array<string | number> = [query.company_id];
  let where = "WHERE company_id = ?";

  if (query.status) {
    where += " AND status = ?";
    params.push(query.status);
  } else if (!query.include_closed) {
    where += " AND status = 'OPEN'";
  }

  const [rows] = await pool.execute<FiscalYearRow[]>(
    `SELECT id, company_id, code, name, start_date, end_date, status, created_at, updated_at
     FROM fiscal_years
     ${where}
     ORDER BY start_date DESC, id DESC`,
    params
  );

  return rows.map(normalizeFiscalYear);
}

export async function getFiscalYearById(
  companyId: number,
  fiscalYearId: number
): Promise<FiscalYear | null> {
  const pool = getDbPool();
  return getFiscalYearByIdWithExecutor(pool, companyId, fiscalYearId);
}

async function getFiscalYearByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  fiscalYearId: number
): Promise<FiscalYear | null> {
  const [rows] = await executor.execute<FiscalYearRow[]>(
    `SELECT id, company_id, code, name, start_date, end_date, status, created_at, updated_at
     FROM fiscal_years
     WHERE company_id = ?
       AND id = ?
     LIMIT 1`,
    [companyId, fiscalYearId]
  );

  const row = rows[0];
  return row ? normalizeFiscalYear(row) : null;
}

export async function createFiscalYear(
  input: FiscalYearCreateRequest,
  actorUserId?: number
): Promise<FiscalYear> {
  return withTransaction(async (connection) => {
    const status: FiscalYearStatus = input.status ?? "OPEN";
    assertDateRange(input.start_date, input.end_date);

    if (status === "OPEN") {
      const allowMultiple = await allowMultipleOpenFiscalYears(connection, input.company_id);
      await assertOpenFiscalYearRules(
        connection,
        input.company_id,
        {
          start_date: input.start_date,
          end_date: input.end_date
        },
        {
          allowMultiple
        }
      );
    }

    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO fiscal_years (
           company_id,
           code,
           name,
           start_date,
           end_date,
           status,
           created_by_user_id,
           updated_by_user_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.company_id,
          input.code,
          input.name,
          input.start_date,
          input.end_date,
          status,
          actorUserId ?? null,
          actorUserId ?? null
        ]
      );

      const fiscalYearId = Number(result.insertId);
      const created = await getFiscalYearByIdWithExecutor(connection, input.company_id, fiscalYearId);
      if (!created) {
        throw new FiscalYearNotFoundError("Fiscal year not found after create");
      }

      return created;
    } catch (error) {
      if (typeof error === "object" && error && "errno" in error) {
        const errno = (error as { errno?: number }).errno;
        if (errno === MYSQL_DUPLICATE_ERROR_CODE) {
          throw new FiscalYearCodeExistsError("Fiscal year code already exists");
        }
      }

      throw error;
    }
  });
}

export async function updateFiscalYear(
  companyId: number,
  fiscalYearId: number,
  input: FiscalYearUpdateRequest,
  actorUserId?: number
): Promise<FiscalYear | null> {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute<FiscalYearRow[]>(
      `SELECT id, company_id, code, name, start_date, end_date, status, created_at, updated_at
       FROM fiscal_years
       WHERE company_id = ?
         AND id = ?
       LIMIT 1
       FOR UPDATE`,
      [companyId, fiscalYearId]
    );

    const current = rows[0];
    if (!current) {
      return null;
    }

    const nextStartDate = input.start_date ?? formatDateOnly(current.start_date);
    const nextEndDate = input.end_date ?? formatDateOnly(current.end_date);
    const nextStatus = input.status ?? current.status;
    assertDateRange(nextStartDate, nextEndDate);

    if (nextStatus === "OPEN") {
      const allowMultiple = await allowMultipleOpenFiscalYears(connection, companyId);
      await assertOpenFiscalYearRules(
        connection,
        companyId,
        {
          start_date: nextStartDate,
          end_date: nextEndDate
        },
        {
          allowMultiple,
          excludeId: fiscalYearId
        }
      );
    }

    try {
      await connection.execute(
        `UPDATE fiscal_years
         SET code = ?,
             name = ?,
             start_date = ?,
             end_date = ?,
             status = ?,
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        [
          input.code ?? current.code,
          input.name ?? current.name,
          nextStartDate,
          nextEndDate,
          nextStatus,
          actorUserId ?? null,
          companyId,
          fiscalYearId
        ]
      );
    } catch (error) {
      if (typeof error === "object" && error && "errno" in error) {
        const errno = (error as { errno?: number }).errno;
        if (errno === MYSQL_DUPLICATE_ERROR_CODE) {
          throw new FiscalYearCodeExistsError("Fiscal year code already exists");
        }
      }

      throw error;
    }

    const updated = await getFiscalYearByIdWithExecutor(connection, companyId, fiscalYearId);
    if (!updated) {
      throw new FiscalYearNotFoundError("Fiscal year not found after update");
    }

    return updated;
  });
}

async function listOpenFiscalYearsForDateWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  date: string
): Promise<FiscalYear[]> {
  const [rows] = await executor.execute<FiscalYearRow[]>(
    `SELECT id, company_id, code, name, start_date, end_date, status, created_at, updated_at
     FROM fiscal_years
     WHERE company_id = ?
       AND status = 'OPEN'
       AND start_date <= ?
       AND end_date >= ?
     ORDER BY start_date ASC, id ASC`,
    [companyId, date, date]
  );

  return rows.map(normalizeFiscalYear);
}

export async function listOpenFiscalYearsForDate(
  companyId: number,
  date: string
): Promise<FiscalYear[]> {
  const pool = getDbPool();
  return listOpenFiscalYearsForDateWithExecutor(pool, companyId, date);
}

export async function ensureDateWithinOpenFiscalYear(
  companyId: number,
  date: string
): Promise<void> {
  const matches = await listOpenFiscalYearsForDate(companyId, date);
  if (matches.length === 0) {
    throw new FiscalYearNotOpenError("Date is outside any open fiscal year");
  }
}

export async function ensureDateWithinOpenFiscalYearWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  date: string
): Promise<void> {
  const matches = await listOpenFiscalYearsForDateWithExecutor(executor, companyId, date);
  if (matches.length === 0) {
    throw new FiscalYearNotOpenError("Date is outside any open fiscal year");
  }
}

export async function resolveDefaultFiscalYearDateRange(
  companyId: number,
  referenceDate?: string
): Promise<{ dateFrom: string; dateTo: string }>
{
  const today = referenceDate ?? new Date().toISOString().slice(0, 10);
  const matches = await listOpenFiscalYearsForDate(companyId, today);
  if (matches.length === 1) {
    return {
      dateFrom: matches[0].start_date,
      dateTo: matches[0].end_date
    };
  }

  if (matches.length === 0) {
    throw new FiscalYearSelectionError("No open fiscal year contains the default date");
  }

  throw new FiscalYearSelectionError("Multiple open fiscal years contain the default date");
}
