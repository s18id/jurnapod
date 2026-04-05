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
import { KyselySettingsAdapter } from "@jurnapod/modules-platform/settings";

export class FiscalYearNotFoundError extends Error {
  code = "FISCAL_YEAR_NOT_FOUND";
}
export class FiscalYearCodeExistsError extends Error {}
export class FiscalYearDateRangeError extends Error {}
export class FiscalYearOverlapError extends Error {}
export class FiscalYearOpenConflictError extends Error {}
export class FiscalYearNotOpenError extends Error {}
export class FiscalYearSelectionError extends Error {}
export class FiscalYearAlreadyClosedError extends Error {
  code = "FISCAL_YEAR_ALREADY_CLOSED";
}
export class FiscalYearCloseConflictError extends Error {
  code = "FISCAL_YEAR_CLOSE_CONFLICT";
}
export class FiscalYearClosePreconditionError extends Error {
  code = "FISCAL_YEAR_CLOSE_PRECONDITION_FAILED";
}

/**
 * Status values for fiscal year close request lifecycle
 */
export const FISCAL_YEAR_CLOSE_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED"
} as const;

export type FiscalYearCloseStatus = (typeof FISCAL_YEAR_CLOSE_STATUS)[keyof typeof FISCAL_YEAR_CLOSE_STATUS];

export interface CloseFiscalYearResult {
  success: boolean;
  fiscalYearId: number;
  closeRequestId: string;
  status: FiscalYearCloseStatus;
  previousStatus: string;
  newStatus: string;
  resultJson?: Record<string, unknown>;
  failureCode?: string;
  failureMessage?: string;
}

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

async function allowMultipleOpenFiscalYears(
  db: KyselySchema,
  companyId: number,
  outletId?: number
): Promise<boolean> {
  const resolvedOutletId = outletId ?? (await resolveCompanySettingOutletId(db, companyId));
  const settingsPort = new KyselySettingsAdapter(db);
  const value = await settingsPort.resolve<boolean>(companyId, ALLOW_MULTIPLE_OPEN_SETTING, {
    outletId: resolvedOutletId
  });
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

interface CloseFiscalYearContext {
  companyId: number;
  requestedByUserId: number;
  requestedAtEpochMs: number;
  reason?: string;
}

/**
 * Closes a fiscal year with idempotency protection.
 * 
 * Idempotency logic:
 * 1. Check if (company_id, fiscal_year_id, close_request_id) exists → return existing result
 * 2. If not exists, insert with status = PENDING
 * 3. Use SELECT ... FOR UPDATE to lock fiscal_year row first
 * 4. Transition through states: PENDING → IN_PROGRESS → SUCCEEDED/FAILED
 * 
 * Lock ordering (prevent deadlocks):
 * - Always lock fiscal_year row FIRST
 * - Then lock period rows ordered by period_start_date ASC (if periods table exists)
 * 
 * @param db Database instance
 * @param fiscalYearId The fiscal year ID to close
 * @param closeRequestId Unique idempotency key for this close operation
 * @param context Company and user context for the operation
 * @returns CloseFiscalYearResult with the outcome
 */
export async function closeFiscalYear(
  db: KyselySchema,
  fiscalYearId: number,
  closeRequestId: string,
  context: CloseFiscalYearContext
): Promise<CloseFiscalYearResult> {
  const { companyId, requestedByUserId, requestedAtEpochMs } = context;
  const now = requestedAtEpochMs;

  // Step 1: Check for existing close request (idempotency)
  const existingRequest = await db
    .selectFrom("fiscal_year_close_requests")
    .where("company_id", "=", companyId)
    .where("fiscal_year_id", "=", fiscalYearId)
    .where("close_request_id", "=", closeRequestId)
    .select([
      "id",
      "status",
      "fiscal_year_status_before",
      "fiscal_year_status_after",
      "result_json",
      "failure_code",
      "failure_message"
    ])
    .executeTakeFirst();

  if (existingRequest) {
    // Return existing result for idempotent replay
    return {
      success: existingRequest.status === FISCAL_YEAR_CLOSE_STATUS.SUCCEEDED,
      fiscalYearId,
      closeRequestId,
      status: existingRequest.status as FiscalYearCloseStatus,
      previousStatus: existingRequest.fiscal_year_status_before,
      newStatus: existingRequest.fiscal_year_status_after,
      resultJson: existingRequest.result_json
        ? JSON.parse(existingRequest.result_json)
        : undefined,
      failureCode: existingRequest.failure_code ?? undefined,
      failureMessage: existingRequest.failure_message ?? undefined
    };
  }

  // Step 2: Insert new close request with PENDING status
  const insertResult = await db
    .insertInto("fiscal_year_close_requests")
    .values({
      company_id: companyId,
      fiscal_year_id: fiscalYearId,
      close_request_id: closeRequestId,
      status: FISCAL_YEAR_CLOSE_STATUS.PENDING,
      fiscal_year_status_before: "UNKNOWN",
      fiscal_year_status_after: "CLOSED",
      requested_by_user_id: requestedByUserId,
      requested_at_ts: requestedAtEpochMs,
      created_at_ts: now,
      updated_at_ts: now
    })
    .executeTakeFirst();

  const closeRequestDbId = Number(insertResult.insertId);

  // Step 3: Execute close with row locking and retry logic
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await db.transaction().execute(async (trx) => {
        // Lock fiscal_year row FIRST to prevent deadlocks
        const lockedFiscalYear = await trx
          .selectFrom("fiscal_years")
          .where("id", "=", fiscalYearId)
          .forUpdate()
          .select(["id", "company_id", "status"])
          .executeTakeFirst();

        if (!lockedFiscalYear) {
          throw new FiscalYearNotFoundError(`Fiscal year ${fiscalYearId} not found`);
        }

        // Verify company ownership
        if (Number(lockedFiscalYear.company_id) !== companyId) {
          throw new FiscalYearNotFoundError(`Fiscal year ${fiscalYearId} not found for company ${companyId}`);
        }

        // Check if already closed
        if (lockedFiscalYear.status === "CLOSED") {
          throw new FiscalYearAlreadyClosedError(
            `Fiscal year ${fiscalYearId} is already closed`
          );
        }

        // Transition to IN_PROGRESS
        await trx
          .updateTable("fiscal_year_close_requests")
          .set({
            status: FISCAL_YEAR_CLOSE_STATUS.IN_PROGRESS,
            fiscal_year_status_before: lockedFiscalYear.status,
            started_at_ts: Date.now(),
            updated_at_ts: Date.now()
          })
          .where("id", "=", closeRequestDbId)
          .execute();

        // Perform the actual close operation
        // Update fiscal year status to CLOSED
        await trx
          .updateTable("fiscal_years")
          .set({
            status: "CLOSED",
            updated_by_user_id: requestedByUserId
          })
          .where("id", "=", fiscalYearId)
          .execute();

        // Complete the close request
        const completedAt = Date.now();
        await trx
          .updateTable("fiscal_year_close_requests")
          .set({
            status: FISCAL_YEAR_CLOSE_STATUS.SUCCEEDED,
            result_json: JSON.stringify({
              closedAt: completedAt,
              closedByUserId: requestedByUserId,
              reason: context.reason ?? null
            }),
            completed_at_ts: completedAt,
            updated_at_ts: completedAt
          })
          .where("id", "=", closeRequestDbId)
          .execute();

        return {
          success: true,
          fiscalYearId,
          closeRequestId,
          status: FISCAL_YEAR_CLOSE_STATUS.SUCCEEDED as FiscalYearCloseStatus,
          previousStatus: lockedFiscalYear.status,
          newStatus: "CLOSED",
          resultJson: {
            closedAt: completedAt,
            closedByUserId: requestedByUserId,
            reason: context.reason ?? null
          }
        };
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Handle lock timeout with retry
      if (lastError.message.includes("Lock wait timeout") && attempt < maxRetries) {
        // Exponential backoff
        const backoffMs = Math.pow(2, attempt) * 100;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      // Handle deadlock - rollback and retry
      if (lastError.message.includes("Deadlock") && attempt < maxRetries) {
        // Exponential backoff
        const backoffMs = Math.pow(2, attempt) * 100;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      // Max retries exceeded or non-retryable error - mark as failed
      break;
    }
  }

  // Handle failure case
  const failureAt = Date.now();
  const failureCode = lastError instanceof FiscalYearAlreadyClosedError
    ? "FISCAL_YEAR_ALREADY_CLOSED"
    : lastError instanceof FiscalYearNotFoundError
      ? "FISCAL_YEAR_NOT_FOUND"
      : "CLOSE_FAILED";

  // Update close request as failed
  try {
    await db
      .updateTable("fiscal_year_close_requests")
      .set({
        status: FISCAL_YEAR_CLOSE_STATUS.FAILED,
        failure_code: failureCode,
        failure_message: lastError?.message ?? "Unknown error",
        completed_at_ts: failureAt,
        updated_at_ts: failureAt
      })
      .where("id", "=", closeRequestDbId)
      .execute();
  } catch {
    // Ignore update errors on failure path
  }

  // Re-throw appropriate error types
  if (lastError instanceof FiscalYearNotFoundError) {
    throw lastError;
  }
  if (lastError instanceof FiscalYearAlreadyClosedError) {
    throw lastError;
  }
  if (lastError instanceof Error) {
    throw new FiscalYearCloseConflictError(
      `Failed to close fiscal year after ${maxRetries} attempts: ${lastError.message}`
    );
  }
  // This should never be reached since lastError is always an Error from catch block
  const unknownError = lastError ?? new Error("Unknown error during fiscal year close");
  throw new FiscalYearCloseConflictError(
    `Failed to close fiscal year: ${unknownError.message}`
  );
}

/**
 * Check if a fiscal year is closed (for journal posting guards)
 */
export async function isFiscalYearClosed(
  db: KyselySchema,
  companyId: number,
  fiscalYearId: number
): Promise<boolean> {
  const fiscalYear = await db
    .selectFrom("fiscal_years")
    .where("id", "=", fiscalYearId)
    .where("company_id", "=", companyId)
    .select(["status"])
    .executeTakeFirst();

  return fiscalYear?.status === "CLOSED";
}
