// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Fiscal Year Service
 * 
 * Framework-agnostic business logic for fiscal year management.
 * This service handles CRUD operations, close procedures, and
 * validation for fiscal years within a company.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import { withTransactionRetry } from "@jurnapod/db";
import {
  type FiscalYear,
  type FiscalYearCreateRequest,
  type FiscalYearListQuery,
  type FiscalYearStatus,
  type FiscalYearUpdateRequest,
  toRfc3339Required
} from "@jurnapod/shared";

import type {
  FiscalYearCloseStatus,
  CloseFiscalYearResult,
  CloseFiscalYearContext,
  ClosePreviewResult,
  ClosingEntryLine,
  FiscalYearStatusResult,
  PeriodStatus
} from "./types.js";
import {
  FiscalYearNotFoundError,
  FiscalYearCodeExistsError,
  FiscalYearDateRangeError,
  FiscalYearOverlapError,
  FiscalYearOpenConflictError,
  FiscalYearNotOpenError,
  FiscalYearSelectionError,
  FiscalYearAlreadyClosedError,
  FiscalYearCloseConflictError,
  FiscalYearClosePreviewError,
  RetainedEarningsAccountNotFoundError
} from "./errors.js";
import { FISCAL_YEAR_CLOSE_STATUS } from "./types.js";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Database client interface for dependency injection
 */
export interface FiscalYearDbClient extends KyselySchema {}

/**
 * Settings port interface for dependency injection
 * Abstracts settings access to allow different implementations (e.g., testing)
 */
export interface FiscalYearSettingsPort {
  /**
   * Resolve a boolean setting value with optional outlet context
   */
  resolveBoolean(
    companyId: number,
    key: string,
    options?: { outletId?: number }
  ): Promise<boolean>;
}

// =============================================================================
// Helper Functions
// =============================================================================

const MYSQL_DUPLICATE_ERROR_CODE = 1062;
const ALLOW_MULTIPLE_OPEN_SETTING = "accounting.allow_multiple_open_fiscal_years";

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

function isMysqlError(error: unknown): error is { errno?: number } {
  return typeof error === "object" && error !== null && "errno" in error;
}

function formatDateOnlyFromUnknown(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  if (typeof value === "number") {
    // Assume Unix timestamp in milliseconds
    return new Date(value).toISOString().split("T")[0];
  }
  // Fallback: convert to string and slice
  return String(value).slice(0, 10);
}

// =============================================================================
// Fiscal Year Service
// =============================================================================

export class FiscalYearService {
  constructor(
    private readonly db: FiscalYearDbClient,
    private readonly settings: FiscalYearSettingsPort
  ) {}

  /**
   * List fiscal years with optional filtering
   */
  async listFiscalYears(query: FiscalYearListQuery): Promise<FiscalYear[]> {
    let q = this.db
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

  /**
   * Get a fiscal year by ID
   */
  async getFiscalYearById(companyId: number, fiscalYearId: number): Promise<FiscalYear | null> {
    const row = await this.db
      .selectFrom("fiscal_years")
      .where("company_id", "=", companyId)
      .where("id", "=", fiscalYearId)
      .limit(1)
      .select(["id", "company_id", "code", "name", "start_date", "end_date", "status", "created_at", "updated_at"])
      .executeTakeFirst();

    return row ? normalizeFiscalYear(row) : null;
  }

  /**
   * Create a new fiscal year
   */
  async createFiscalYear(
    input: FiscalYearCreateRequest,
    actorUserId?: number
  ): Promise<FiscalYear> {
    const status: FiscalYearStatus = input.status ?? "OPEN";
    this.assertDateRange(input.start_date, input.end_date);

    return await withTransactionRetry(this.db, async (trx) => {
      if (status === "OPEN") {
        const allowMultiple = await this.allowMultipleOpenFiscalYears(trx, input.company_id);
        await this.assertOpenFiscalYearRules(
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
        const created = await this.getFiscalYearByIdWithExecutor(trx, input.company_id, fiscalYearId);
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

  /**
   * Update an existing fiscal year
   */
  async updateFiscalYear(
    companyId: number,
    fiscalYearId: number,
    input: FiscalYearUpdateRequest,
    actorUserId?: number
  ): Promise<FiscalYear | null> {
    return await withTransactionRetry(this.db, async (trx) => {
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
      this.assertDateRange(nextStartDate, nextEndDate);

      if (nextStatus === "OPEN") {
        const allowMultiple = await this.allowMultipleOpenFiscalYears(trx, companyId);
        await this.assertOpenFiscalYearRules(
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

      const updated = await this.getFiscalYearByIdWithExecutor(trx, companyId, fiscalYearId);
      if (!updated) {
        throw new FiscalYearNotFoundError("Fiscal year not found after update");
      }

      return updated;
    });
  }

  /**
   * List open fiscal years that contain a specific date
   */
  async listOpenFiscalYearsForDate(companyId: number, date: string): Promise<FiscalYear[]> {
    const dateValue = parseDateOnly(date);
    const rows = await this.db
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

  /**
   * Ensure a date falls within an open fiscal year
   */
  async ensureDateWithinOpenFiscalYear(companyId: number, date: string): Promise<void> {
    const matches = await this.listOpenFiscalYearsForDate(companyId, date);
    if (matches.length === 0) {
      throw new FiscalYearNotOpenError("Date is outside any open fiscal year");
    }
  }

  /**
   * Ensure a date falls within an open fiscal year (with explicit executor)
   */
  async ensureDateWithinOpenFiscalYearWithExecutor(
    db: FiscalYearDbClient,
    companyId: number,
    date: string
  ): Promise<void> {
    const matches = await this.listOpenFiscalYearsForDateWithExecutor(db, companyId, date);
    if (matches.length === 0) {
      throw new FiscalYearNotOpenError("Date is outside any open fiscal year");
    }
  }

  /**
   * Resolve default fiscal year date range for a company
   */
  async resolveDefaultFiscalYearDateRange(
    companyId: number,
    referenceDate?: string
  ): Promise<{ dateFrom: string; dateTo: string }> {
    const today = referenceDate ?? new Date().toISOString().slice(0, 10);
    const matches = await this.listOpenFiscalYearsForDate(companyId, today);
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

  /**
   * Check if a fiscal year is closed
   */
  async isFiscalYearClosed(companyId: number, fiscalYearId: number): Promise<boolean> {
    const fiscalYear = await this.db
      .selectFrom("fiscal_years")
      .where("id", "=", fiscalYearId)
      .where("company_id", "=", companyId)
      .select(["status"])
      .executeTakeFirst();

    return fiscalYear?.status === "CLOSED";
  }

  /**
   * Close a fiscal year with idempotency protection.
   * All idempotency claims, state transitions, and writes happen inside a single retried transaction.
   */
  async closeFiscalYear(
    fiscalYearId: number,
    closeRequestId: string,
    context: CloseFiscalYearContext,
    trx?: FiscalYearDbClient
  ): Promise<CloseFiscalYearResult> {
    const { companyId, requestedByUserId, requestedAtEpochMs } = context;

    // If external transaction provided, use it for atomic operations (unchanged)
    if (trx) {
      return await this.closeFiscalYearWithTransaction(trx, fiscalYearId, closeRequestId, context);
    }

    // Single atomic path: all idempotency-claim/write/state transitions inside retried transaction
    return await withTransactionRetry(this.db, async (innerTrx) => {
      // Step 1: Atomically claim idempotency key via INSERT...ON DUPLICATE KEY
      // This replaces the pre-transactional insert + retry pattern.
      const { closeRequestDbId, existingRequest } = await this.claimCloseRequestIdempotency(
        innerTrx,
        companyId,
        fiscalYearId,
        closeRequestId,
        context
      );

      // If duplicate found, return existing result immediately
      if (existingRequest) {
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
          failureMessage: existingRequest.failure_message ?? undefined,
        };
      }

      // Step 2: Execute the close with row locking (same as before, now inside same tx)
      return await this.executeCloseWithLocking(
        innerTrx,
        fiscalYearId,
        closeRequestDbId,
        closeRequestId,
        context,
        companyId,
        requestedByUserId
      );
    });
  }

  /**
   * Get preview of closing entries for a fiscal year
   */
  async getFiscalYearClosePreview(
    companyId: number,
    fiscalYearId: number
  ): Promise<ClosePreviewResult> {
    // Get fiscal year info
    const fiscalYear = await this.db
      .selectFrom("fiscal_years")
      .where("id", "=", fiscalYearId)
      .where("company_id", "=", companyId)
      .select(["id", "code", "name", "start_date", "end_date", "status"])
      .executeTakeFirst();

    if (!fiscalYear) {
      throw new FiscalYearNotFoundError(`Fiscal year ${fiscalYearId} not found`);
    }

    if (fiscalYear.status === "CLOSED") {
      throw new FiscalYearAlreadyClosedError(`Fiscal year ${fiscalYearId} is already closed`);
    }

    // Find retained earnings account
    const retainedEarnings = await this.findRetainedEarningsAccountId(companyId);

    // Get PL account balances for the fiscal year
    const { incomeAccounts, expenseAccounts, totalIncome, totalExpenses } =
      await this.getPlAccountBalances(
        companyId,
        formatDateOnlyFromUnknown(fiscalYear.start_date),
        formatDateOnlyFromUnknown(fiscalYear.end_date)
      );

    // For closing entries, net income is income minus expenses (signs preserved)
    const netIncome = totalIncome - totalExpenses;

    // Use the end date of fiscal year as entry date for closing entries
    const entryDate = formatDateOnlyFromUnknown(fiscalYear.end_date);

    // Generate closing entries
    const closingEntries = this.generateClosingEntries(
      incomeAccounts,
      expenseAccounts,
      totalIncome,
      totalExpenses,
      retainedEarnings.id,
      retainedEarnings.code,
      retainedEarnings.name,
      entryDate
    );

    return {
      fiscalYearId: Number(fiscalYear.id),
      fiscalYearCode: String(fiscalYear.code),
      fiscalYearName: String(fiscalYear.name),
      startDate: formatDateOnlyFromUnknown(fiscalYear.start_date),
      endDate: formatDateOnlyFromUnknown(fiscalYear.end_date),
      totalIncome: totalIncome,
      totalExpenses: totalExpenses,
      netIncome,
      retainedEarningsAccountId: retainedEarnings.id,
      retainedEarningsAccountCode: retainedEarnings.code,
      closingEntries,
      entryDate,
      description: `Fiscal Year ${fiscalYear.code} Closing Entries`
    };
  }

  /**
   * Get the status of a fiscal year including period information
   */
  async getFiscalYearStatus(companyId: number, fiscalYearId: number): Promise<FiscalYearStatusResult> {
    // Get fiscal year info
    const fiscalYear = await this.db
      .selectFrom("fiscal_years")
      .where("id", "=", fiscalYearId)
      .where("company_id", "=", companyId)
      .select(["id", "code", "name", "start_date", "end_date", "status"])
      .executeTakeFirst();

    if (!fiscalYear) {
      throw new FiscalYearNotFoundError(`Fiscal year ${fiscalYearId} not found`);
    }

    // Get the latest close request if any
    const closeRequest = await this.db
      .selectFrom("fiscal_year_close_requests")
      .where("fiscal_year_id", "=", fiscalYearId)
      .where("company_id", "=", companyId)
      .orderBy("requested_at_ts", "desc")
      .limit(1)
      .select([
        "close_request_id",
        "status as request_status"
      ])
      .executeTakeFirst();

    const startDate = formatDateOnlyFromUnknown(fiscalYear.start_date);
    const endDate = formatDateOnlyFromUnknown(fiscalYear.end_date);

    // Determine if the fiscal year can be closed
    let canClose = fiscalYear.status === "OPEN";
    let cannotCloseReason: string | null = null;

    if (fiscalYear.status === "CLOSED") {
      canClose = false;
      cannotCloseReason = "Fiscal year is already closed";
    }

    return {
      fiscalYearId: Number(fiscalYear.id),
      fiscalYearCode: String(fiscalYear.code),
      fiscalYearName: String(fiscalYear.name),
      status: fiscalYear.status as FiscalYearStatus,
      startDate,
      endDate,
      periods: [
        {
          periodId: Number(fiscalYear.id),
          periodCode: String(fiscalYear.code),
          startDate,
          endDate,
          status: fiscalYear.status as "OPEN" | "ADJUSTED" | "CLOSED",
          hasTransactions: true
        }
      ],
      closeRequestId: closeRequest?.close_request_id ?? null,
      closeRequestStatus: closeRequest?.request_status as FiscalYearCloseStatus ?? null,
      canClose,
      cannotCloseReason
    };
  }

  /**
   * Claim idempotency key for fiscal year close without performing the actual close.
   * 
   * This implements the two-step close contract:
   * - Step 1 (initiate): Claim idempotency key, transition to PENDING
   * - Step 2 (approve): Post journals and close fiscal year atomically
   * 
   * This method ONLY claims the idempotency key. It does NOT:
   * - Transition fiscal year status to IN_PROGRESS
   * - Transition fiscal year status to CLOSED
   * - Post any journal entries
   * 
   * All of those side effects are reserved for the approveFiscalYearClose path.
   */
  async claimIdempotencyKeyOnly(
    fiscalYearId: number,
    closeRequestId: string,
    context: CloseFiscalYearContext
  ): Promise<CloseFiscalYearResult> {
    const { companyId, requestedByUserId, requestedAtEpochMs } = context;

    return await withTransactionRetry(this.db, async (trx) => {
      // Check if fiscal year exists and is not already closed
      const fiscalYear = await trx
        .selectFrom("fiscal_years")
        .where("id", "=", fiscalYearId)
        .where("company_id", "=", companyId)
        .select(["id", "company_id", "status"])
        .executeTakeFirst();

      if (!fiscalYear) {
        throw new FiscalYearNotFoundError(`Fiscal year ${fiscalYearId} not found`);
      }

      if (fiscalYear.status === "CLOSED") {
        throw new FiscalYearAlreadyClosedError(`Fiscal year ${fiscalYearId} is already closed`);
      }

      // Atomically claim idempotency key via INSERT...ON DUPLICATE KEY
      const { closeRequestDbId, existingRequest } = await this.claimCloseRequestIdempotency(
        trx,
        companyId,
        fiscalYearId,
        closeRequestId,
        context
      );

      // If duplicate found, return existing result immediately
      if (existingRequest) {
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
          failureMessage: existingRequest.failure_message ?? undefined,
        };
      }

      // Return the PENDING status - initiate is just claiming the key
      // The fiscal year remains OPEN at this point
      return {
        success: true,
        fiscalYearId,
        closeRequestId,
        status: FISCAL_YEAR_CLOSE_STATUS.PENDING,
        previousStatus: fiscalYear.status,
        newStatus: fiscalYear.status, // No change - remains OPEN
        resultJson: {
          claimed: true,
          closeRequestDbId,
          message: "Fiscal year close initiated. Proceed to approve to post closing entries."
        }
      };
    });
  }

  // =============================================================================
  // Private Helper Methods
  // =============================================================================

  private async getFiscalYearByIdWithExecutor(
    db: FiscalYearDbClient,
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

  private async listOpenFiscalYearsForDateWithExecutor(
    db: FiscalYearDbClient,
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

  private async resolveCompanySettingOutletId(
    db: FiscalYearDbClient,
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

  private async allowMultipleOpenFiscalYears(
    db: FiscalYearDbClient,
    companyId: number,
    outletId?: number
  ): Promise<boolean> {
    const resolvedOutletId = outletId ?? (await this.resolveCompanySettingOutletId(db, companyId));
    const value = await this.settings.resolveBoolean(companyId, ALLOW_MULTIPLE_OPEN_SETTING, {
      outletId: resolvedOutletId
    });
    return Boolean(value);
  }

  private async listOpenFiscalYearRanges(
    db: FiscalYearDbClient,
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

  private assertDateRange(startDate: string, endDate: string): void {
    if (startDate > endDate) {
      throw new FiscalYearDateRangeError("Start date must be before end date");
    }
  }

  private async assertOpenFiscalYearRules(
    db: FiscalYearDbClient,
    companyId: number,
    range: { start_date: string; end_date: string },
    options: { allowMultiple: boolean; excludeId?: number }
  ): Promise<void> {
    const openYears = await this.listOpenFiscalYearRanges(db, companyId, options.excludeId);
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

  private async executeCloseWithLocking(
    trx: FiscalYearDbClient,
    fiscalYearId: number,
    closeRequestDbId: number,
    closeRequestId: string,
    context: CloseFiscalYearContext,
    companyId: number,
    requestedByUserId: number
  ): Promise<CloseFiscalYearResult> {

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

    // Perform the actual close operation - Update fiscal year status to CLOSED
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
  }

  /**
   * Atomically claim an idempotency key for fiscal year close.
   * Returns either the new insert ID, or an existing request record if duplicate.
   * All happens inside a single transaction — no partial state possible.
   */
  private async claimCloseRequestIdempotency(
    db: FiscalYearDbClient,
    companyId: number,
    fiscalYearId: number,
    closeRequestId: string,
    context: CloseFiscalYearContext
  ): Promise<{
    closeRequestDbId: number;
    existingRequest: null;
  } | {
    closeRequestDbId: null;
    existingRequest: {
      status: string;
      fiscal_year_status_before: string;
      fiscal_year_status_after: string;
      result_json: string | null;
      failure_code: string | null;
      failure_message: string | null;
    };
  }> {
    const { requestedByUserId, requestedAtEpochMs } = context;
    const now = requestedAtEpochMs;

    try {
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
          updated_at_ts: now,
        })
        .executeTakeFirst();

      return { closeRequestDbId: Number(insertResult.insertId), existingRequest: null };
    } catch (dbError: unknown) {
      if (
        typeof dbError === "object" &&
        dbError !== null &&
        "code" in dbError &&
        (dbError as { code: string }).code === "ER_DUP_ENTRY"
      ) {
        const existingRequest = await db
          .selectFrom("fiscal_year_close_requests")
          .where("company_id", "=", companyId)
          .where("fiscal_year_id", "=", fiscalYearId)
          .where("close_request_id", "=", closeRequestId)
          .select([
            "status",
            "fiscal_year_status_before",
            "fiscal_year_status_after",
            "result_json",
            "failure_code",
            "failure_message",
          ])
          .executeTakeFirst();

        if (existingRequest) {
          return { closeRequestDbId: null, existingRequest };
        }
      }
      throw dbError;
    }

    throw new Error("Failed to claim fiscal year close idempotency key");
  }

  private async closeFiscalYearWithTransaction(
    trx: FiscalYearDbClient,
    fiscalYearId: number,
    closeRequestId: string,
    context: CloseFiscalYearContext
  ): Promise<CloseFiscalYearResult> {
    const { companyId, requestedByUserId, requestedAtEpochMs } = context;
    const now = requestedAtEpochMs;

    // Step 1: Atomically claim idempotency key by insert.
    let closeRequestDbId: number;
    try {
      const insertResult = await trx
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

      closeRequestDbId = Number(insertResult.insertId);
    } catch (dbError: unknown) {
      if (
        typeof dbError === "object" &&
        dbError !== null &&
        "code" in dbError &&
        (dbError as { code: string }).code === "ER_DUP_ENTRY"
      ) {
        const existingRequest = await trx
          .selectFrom("fiscal_year_close_requests")
          .where("company_id", "=", companyId)
          .where("fiscal_year_id", "=", fiscalYearId)
          .where("close_request_id", "=", closeRequestId)
          .select([
            "status",
            "fiscal_year_status_before",
            "fiscal_year_status_after",
            "result_json",
            "failure_code",
            "failure_message"
          ])
          .executeTakeFirst();

        if (existingRequest) {
          // If already succeeded, return existing result
          if (existingRequest.status === FISCAL_YEAR_CLOSE_STATUS.SUCCEEDED) {
            return {
              success: true,
              fiscalYearId,
              closeRequestId,
              status: FISCAL_YEAR_CLOSE_STATUS.SUCCEEDED as FiscalYearCloseStatus,
              previousStatus: existingRequest.fiscal_year_status_before,
              newStatus: existingRequest.fiscal_year_status_after,
              resultJson: existingRequest.result_json
                ? JSON.parse(existingRequest.result_json)
                : undefined,
              failureCode: existingRequest.failure_code ?? undefined,
              failureMessage: existingRequest.failure_message ?? undefined
            };
          }

          // If PENDING or IN_PROGRESS (partial completion), throw conflict
          // The approve step must not re-process an in-progress close attempt
          throw new FiscalYearCloseConflictError(
            `Fiscal year close request is already ${existingRequest.status}`
          );
        }
      }

      throw dbError;
    }

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
  }

  /**
   * Find the Retained Earnings account for a company
   */
  private async findRetainedEarningsAccountId(
    companyId: number
  ): Promise<{ id: number; code: string; name: string }> {
    // First try to find a dedicated retained earnings account,
    // but constrain candidates to equity-classified accounts.
    const retainedAccount = await this.db
      .selectFrom("accounts as a")
      .leftJoin("account_types as at", "at.id", "a.account_type_id")
      .where("a.company_id", "=", companyId)
      .where("a.is_active", "=", 1)
      .where((eb) => eb.or([
        eb("a.report_group", "=", "EQ"),
        eb("at.name", "like", "%Equity%"),
        eb("at.name", "like", "%Modal%"), // Indonesian
      ]))
      .where((eb) => eb.or([
        eb("a.name", "like", "%Retained%"),
        eb("a.name", "like", "%Undivided%"),
        eb("a.name", "like", "%Undistributed%"),
        eb("a.name", "like", "%Laba%"), // Indonesian
        eb("a.name", "like", "%Labad%"), // Indonesian variant
      ]))
      .select(["a.id", "a.code", "a.name"])
      .limit(1)
      .executeTakeFirst();

    if (retainedAccount) {
      return {
        id: Number(retainedAccount.id),
        code: String(retainedAccount.code),
        name: String(retainedAccount.name)
      };
    }

    // Fallback: look for any equity account
    const equityAccount = await this.db
      .selectFrom("accounts as a")
      .leftJoin("account_types as at", "at.id", "a.account_type_id")
      .where("a.company_id", "=", companyId)
      .where("a.is_active", "=", 1)
      .where((eb) => eb.or([
        eb("at.name", "like", "%Equity%"),
        eb("at.name", "like", "%Modal%"), // Indonesian
        eb("a.report_group", "=", "EQ"),
      ]))
      .select(["a.id", "a.code", "a.name"])
      .limit(1)
      .executeTakeFirst();

    if (equityAccount) {
      return {
        id: Number(equityAccount.id),
        code: String(equityAccount.code),
        name: String(equityAccount.name)
      };
    }

    throw new RetainedEarningsAccountNotFoundError(companyId);
  }

  /**
   * Get account balances for P&L accounts within a fiscal year
   */
  private async getPlAccountBalances(
    companyId: number,
    fiscalYearStartDate: string,
    fiscalYearEndDate: string
  ): Promise<{
    incomeAccounts: Array<{ id: number; code: string; name: string; balance: number; normalBalance: string }>;
    expenseAccounts: Array<{ id: number; code: string; name: string; balance: number; normalBalance: string }>;
    totalIncome: number;
    totalExpenses: number;
  }> {
    // Scope P&L balances to the fiscal-year window to avoid closing entries
    // being polluted by transactions outside the target year.
    const startDate = parseDateOnly(fiscalYearStartDate);
    const endDate = parseDateOnly(fiscalYearEndDate);

    const plAccounts = await this.db
      .selectFrom("accounts as a")
      .leftJoin("account_types as at", "at.id", "a.account_type_id")
      .leftJoin("journal_lines as jl", (join) =>
        join
          .onRef("jl.account_id", "=", "a.id")
          .onRef("jl.company_id", "=", "a.company_id")
          .on("jl.line_date", ">=", startDate)
          .on("jl.line_date", "<=", endDate)
      )
      .where("a.company_id", "=", companyId)
      .where("a.is_active", "=", 1)
      .where("a.report_group", "=", "PL")
      .select([
        "a.id",
        "a.code",
        "a.name",
        "at.normal_balance as account_type_normal_balance",
        "a.normal_balance as account_normal_balance",
        sql<number>`COALESCE(SUM(jl.debit), 0)`.as("debit_sum"),
        sql<number>`COALESCE(SUM(jl.credit), 0)`.as("credit_sum")
      ])
      .groupBy(["a.id", "a.code", "a.name", "at.normal_balance", "a.normal_balance"])
      .execute();

    const incomeAccounts: Array<{ id: number; code: string; name: string; balance: number; normalBalance: string }> = [];
    const expenseAccounts: Array<{ id: number; code: string; name: string; balance: number; normalBalance: string }> = [];

    let totalIncome = 0;
    let totalExpenses = 0;

    for (const account of plAccounts) {
      const normalBalance = account.account_type_normal_balance
        || account.account_normal_balance
        || "D";
      const debitSum = Number(account.debit_sum ?? 0);
      const creditSum = Number(account.credit_sum ?? 0);
      const computedBalance = normalBalance === "K"
        ? creditSum - debitSum
        : debitSum - creditSum;

      if (normalBalance === "K") {
        incomeAccounts.push({
          id: Number(account.id),
          code: String(account.code),
          name: String(account.name),
          balance: computedBalance,
          normalBalance
        });
        totalIncome += computedBalance;
      } else {
        expenseAccounts.push({
          id: Number(account.id),
          code: String(account.code),
          name: String(account.name),
          balance: computedBalance,
          normalBalance
        });
        totalExpenses += computedBalance;
      }
    }

    return { incomeAccounts, expenseAccounts, totalIncome, totalExpenses };
  }

  /**
   * Generate closing entries for a fiscal year
   */
  private generateClosingEntries(
    incomeAccounts: Array<{ id: number; code: string; name: string; balance: number }>,
    expenseAccounts: Array<{ id: number; code: string; name: string; balance: number }>,
    totalIncome: number,
    totalExpenses: number,
    retainedEarningsAccountId: number,
    retainedEarningsAccountCode: string,
    retainedEarningsAccountName: string,
    entryDate: string
  ): ClosingEntryLine[] {
    const closingEntries: ClosingEntryLine[] = [];
    const netIncome = totalIncome - totalExpenses;

    // Step 1: Close income accounts by debiting them
    for (const account of incomeAccounts) {
      if (account.balance !== 0) {
        const closeAmount = Math.abs(account.balance);
        if (closeAmount > 0.001) {
          closingEntries.push({
            accountId: account.id,
            accountCode: account.code,
            accountName: account.name,
            debit: closeAmount,
            credit: 0,
            description: `Closing ${account.name} for fiscal year`
          });
        }
      }
    }

    // Step 2: Close expense accounts by crediting them
    for (const account of expenseAccounts) {
      if (account.balance !== 0) {
        const closeAmount = Math.abs(account.balance);
        if (closeAmount > 0.001) {
          closingEntries.push({
            accountId: account.id,
            accountCode: account.code,
            accountName: account.name,
            debit: 0,
            credit: closeAmount,
            description: `Closing ${account.name} for fiscal year`
          });
        }
      }
    }

    // Step 3: Transfer net income/loss to Retained Earnings
    if (netIncome > 0.001) {
      closingEntries.push({
        accountId: retainedEarningsAccountId,
        accountCode: retainedEarningsAccountCode,
        accountName: retainedEarningsAccountName,
        debit: 0,
        credit: netIncome,
        description: `Net income for fiscal year transferred to retained earnings`
      });
    } else if (netIncome < -0.001) {
      const netLoss = Math.abs(netIncome);
      closingEntries.push({
        accountId: retainedEarningsAccountId,
        accountCode: retainedEarningsAccountCode,
        accountName: retainedEarningsAccountName,
        debit: netLoss,
        credit: 0,
        description: `Net loss for fiscal year transferred to retained earnings`
      });
    }

    return closingEntries;
  }
}
