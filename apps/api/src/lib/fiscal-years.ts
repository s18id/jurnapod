// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
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
import { getDb, type KyselySchema } from "./db";
import { toRfc3339Required } from "@jurnapod/shared";

export class FiscalYearNotFoundError extends Error {}
export class FiscalYearCodeExistsError extends Error {}
export class FiscalYearDateRangeError extends Error {}
export class FiscalYearOverlapError extends Error {}
export class FiscalYearOpenConflictError extends Error {}
export class FiscalYearNotOpenError extends Error {}
export class FiscalYearSelectionError extends Error {}

const MYSQL_DUPLICATE_ERROR_CODE = 1062;
const ALLOW_MULTIPLE_OPEN_SETTING: SettingKey = "accounting.allow_multiple_open_fiscal_years";

function formatDateOnly(value: string | Date): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  // Handle Date object - format as YYYY-MM-DD
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string): Date {
  // Parse YYYY-MM-DD string to Date object for database
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function normalizeFiscalYear(row: {
  id: number;
  company_id: number;
  code: string;
  name: string;
  start_date: string | Date;
  end_date: string | Date;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
}): FiscalYear {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: String(row.code),
    name: String(row.name),
    start_date: formatDateOnly(row.start_date),
    end_date: formatDateOnly(row.end_date),
    status: row.status as FiscalYearStatus,
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  };
}

function hasOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

async function resolveCompanySettingOutletId(
  db: KyselySchema,
  companyId: number
): Promise<number> {
  const row = await db
    .selectFrom("outlets")
    .where("company_id", "=", companyId)
    .orderBy("id", "asc")
    .limit(1)
    .select("id")
    .executeTakeFirst();

  const outletId = row?.id;
  if (!outletId) {
    throw new Error("Default outlet not found");
  }

  return Number(outletId);
}

async function readCompanySetting(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  key: SettingKey
): Promise<SettingValue> {
  const row = await db
    .selectFrom("company_settings")
    .where("company_id", "=", companyId)
    .where("outlet_id", "=", outletId)
    .where(sql`\`key\``, "=", key)
    .limit(1)
    .select("value_json")
    .executeTakeFirst();

  const stored = row?.value_json;
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
  db: KyselySchema,
  companyId: number,
  outletId?: number
): Promise<boolean> {
  const resolvedOutletId = outletId ?? (await resolveCompanySettingOutletId(db, companyId));
  const value = await readCompanySetting(db, companyId, resolvedOutletId, ALLOW_MULTIPLE_OPEN_SETTING);
  return Boolean(value);
}

async function listOpenFiscalYearRanges(
  db: KyselySchema,
  companyId: number,
  excludeId?: number
): Promise<Array<{ id: number; start_date: string | Date; end_date: string | Date }>> {
  let query = db
    .selectFrom("fiscal_years")
    .where("company_id", "=", companyId)
    .where("status", "=", "OPEN")
    .select(["id", "start_date", "end_date"])
    .orderBy("start_date", "asc")
    .orderBy("id", "asc");

  if (excludeId) {
    query = query.where("id", "!=", excludeId);
  }

  return query.execute();
}

function assertDateRange(startDate: string, endDate: string): void {
  if (startDate > endDate) {
    throw new FiscalYearDateRangeError("Start date must be before end date");
  }
}

async function assertOpenFiscalYearRules(
  db: KyselySchema,
  companyId: number,
  range: { start_date: string; end_date: string },
  options: { allowMultiple: boolean; excludeId?: number }
): Promise<void> {
  const openYears = await listOpenFiscalYearRanges(db, companyId, options.excludeId);
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
  const db = getDb();

  let q = db
    .selectFrom("fiscal_years")
    .where("company_id", "=", query.company_id)
    .select(["id", "company_id", "code", "name", "start_date", "end_date", "status", "created_at", "updated_at"])
    .orderBy("start_date", "desc")
    .orderBy("id", "desc");

  if (query.status) {
    q = q.where("status", "=", query.status);
  } else if (!query.include_closed) {
    q = q.where("status", "=", "OPEN");
  }

  const rows = await q.execute();
  return rows.map(normalizeFiscalYear);
}

export async function getFiscalYearById(
  companyId: number,
  fiscalYearId: number
): Promise<FiscalYear | null> {
  const db = getDb();
  return getFiscalYearByIdWithExecutor(db, companyId, fiscalYearId);
}

async function getFiscalYearByIdWithExecutor(
  db: KyselySchema,
  companyId: number,
  fiscalYearId: number
): Promise<FiscalYear | null> {
  const row = await db
    .selectFrom("fiscal_years")
    .where("company_id", "=", companyId)
    .where("id", "=", fiscalYearId)
    .limit(1)
    .select(["id", "company_id", "code", "name", "start_date", "end_date", "status", "created_at", "updated_at"])
    .executeTakeFirst();

  return row ? normalizeFiscalYear(row) : null;
}

export async function createFiscalYear(
  input: FiscalYearCreateRequest,
  actorUserId?: number
): Promise<FiscalYear> {
  const db = getDb();
  const status: FiscalYearStatus = input.status ?? "OPEN";
  assertDateRange(input.start_date, input.end_date);

  return await db.transaction().execute(async (trx) => {
    if (status === "OPEN") {
      const allowMultiple = await allowMultipleOpenFiscalYears(trx, input.company_id);
      await assertOpenFiscalYearRules(
        trx,
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
      const result = await trx
        .insertInto("fiscal_years")
        .values({
          company_id: input.company_id,
          code: input.code,
          name: input.name,
          start_date: parseDateOnly(input.start_date),
          end_date: parseDateOnly(input.end_date),
          status: status,
          created_by_user_id: actorUserId ?? null,
          updated_by_user_id: actorUserId ?? null
        })
        .executeTakeFirst();

      const fiscalYearId = Number(result.insertId);
      const created = await getFiscalYearByIdWithExecutor(trx, input.company_id, fiscalYearId);
      if (!created) {
        throw new FiscalYearNotFoundError("Fiscal year not found after create");
      }

      return created;
    } catch (error) {
      if (isMysqlError(error) && error.errno === MYSQL_DUPLICATE_ERROR_CODE) {
        throw new FiscalYearCodeExistsError("Fiscal year code already exists");
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
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    const current = await trx
      .selectFrom("fiscal_years")
      .where("company_id", "=", companyId)
      .where("id", "=", fiscalYearId)
      .limit(1)
      .select(["id", "company_id", "code", "name", "start_date", "end_date", "status", "created_at", "updated_at"])
      .executeTakeFirst();

    if (!current) {
      return null;
    }

    const nextStartDate = input.start_date ?? formatDateOnly(current.start_date);
    const nextEndDate = input.end_date ?? formatDateOnly(current.end_date);
    const nextStatus = input.status ?? current.status;
    assertDateRange(nextStartDate, nextEndDate);

    if (nextStatus === "OPEN") {
      const allowMultiple = await allowMultipleOpenFiscalYears(trx, companyId);
      await assertOpenFiscalYearRules(
        trx,
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
      await trx
        .updateTable("fiscal_years")
        .set({
          code: input.code ?? current.code,
          name: input.name ?? current.name,
          start_date: parseDateOnly(nextStartDate),
          end_date: parseDateOnly(nextEndDate),
          status: nextStatus,
          updated_by_user_id: actorUserId ?? null
        })
        .where("company_id", "=", companyId)
        .where("id", "=", fiscalYearId)
        .execute();
    } catch (error) {
      if (isMysqlError(error) && error.errno === MYSQL_DUPLICATE_ERROR_CODE) {
        throw new FiscalYearCodeExistsError("Fiscal year code already exists");
      }
      throw error;
    }

    const updated = await getFiscalYearByIdWithExecutor(trx, companyId, fiscalYearId);
    if (!updated) {
      throw new FiscalYearNotFoundError("Fiscal year not found after update");
    }

    return updated;
  });
}

async function listOpenFiscalYearsForDateWithExecutor(
  db: KyselySchema,
  companyId: number,
  date: string
): Promise<FiscalYear[]> {
  const dateValue = parseDateOnly(date);
  const rows = await db
    .selectFrom("fiscal_years")
    .where("company_id", "=", companyId)
    .where("status", "=", "OPEN")
    .where("start_date", "<=", dateValue)
    .where("end_date", ">=", dateValue)
    .orderBy("start_date", "asc")
    .orderBy("id", "asc")
    .select(["id", "company_id", "code", "name", "start_date", "end_date", "status", "created_at", "updated_at"])
    .execute();

  return rows.map(normalizeFiscalYear);
}

export async function listOpenFiscalYearsForDate(
  companyId: number,
  date: string
): Promise<FiscalYear[]> {
  const db = getDb();
  return listOpenFiscalYearsForDateWithExecutor(db, companyId, date);
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
  db: KyselySchema,
  companyId: number,
  date: string
): Promise<void> {
  const matches = await listOpenFiscalYearsForDateWithExecutor(db, companyId, date);
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

function isMysqlError(error: unknown): error is { errno?: number } {
  return typeof error === "object" && error !== null && "errno" in error;
}
