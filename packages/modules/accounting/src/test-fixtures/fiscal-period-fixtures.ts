// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { FiscalPeriodFixture } from "./types.js";
import { toUtcIso, fromUtcIso } from "@jurnapod/shared";

// Status tinyint mapping (matches migration 0180 schema)
const STATUS_OPEN_INT = 1;
const STATUS_CLOSED_INT = 2;

/**
 * Create a test fiscal period for Epic 47 (cutoff date handling, period close guardrails).
 * Story linkage: 47.1 (cutoff date handling), 47.5 (period close guardrails).
 *
 * Schema mapping:
 *  - fiscal_periods.period_no (not period_number)
 *  - status is tinyint: OPEN=1, CLOSED=2
 *
 * @param db - KyselySchema database instance
 * @param fiscalYearId - Parent fiscal year ID
 * @param options - Period options
 * @param options.periodNumber - Period within fiscal year (1-12) [internal field: period_no]
 * @param options.startDate - Start date in 'YYYY-MM-DD' format
 * @param options.endDate - End date in 'YYYY-MM-DD' format
 * @param options.status - 'OPEN' | 'CLOSED' (default: 'OPEN')
 * @returns Fiscal period fixture with id, fiscalYearId, periodNumber, startDate, endDate, status
 */
export async function createTestFiscalPeriod(
  db: KyselySchema,
  fiscalYearId: number,
  options?: Partial<{
    periodNumber: number;
    startDate: string;
    endDate: string;
    status: "OPEN" | "CLOSED";
  }>
): Promise<FiscalPeriodFixture> {
  // Check if fiscal_periods table exists before attempting insert
  const tableCheck = await sql`SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'fiscal_periods'`.execute(db);
  const tableExists = Number((tableCheck.rows[0] as { cnt: number }).cnt) > 0;

  if (!tableExists) {
    throw new Error(
      "fiscal_periods table does not exist. Schema gap: Story 47.1/47.5 requires a fiscal_periods table " +
      "(typically: id, fiscal_year_id, period_no, start_date, end_date, status). " +
      "This fixture will work once migration 0180 (or similar) creates the table."
    );
  }

  const periodNo = options?.periodNumber ?? 1;
  // Derive default dates from fiscal year if not provided
  const fyResult = await sql`SELECT start_date, end_date FROM fiscal_years WHERE id = ${fiscalYearId} LIMIT 1`.execute(db);
  let startDate = options?.startDate ?? "2026-01-01";
  let endDate = options?.endDate ?? "2026-01-31";

  if (fyResult.rows.length > 0) {
    const fyRow = fyResult.rows[0] as { start_date: Date; end_date: Date };
    if (!options?.startDate) {
      startDate = fromUtcIso.dateOnly(toUtcIso.dateLike(fyRow.start_date) as string);
    }
    if (!options?.endDate) {
      endDate = fromUtcIso.dateOnly(toUtcIso.dateLike(fyRow.end_date) as string);
    }
  }

  const statusInput = options?.status ?? "OPEN";
  // Map label to tinyint
  const statusInt = statusInput === "OPEN" ? STATUS_OPEN_INT : STATUS_CLOSED_INT;

  try {
    // Derive company_id from parent fiscal_year_id (fiscal_periods.company_id is NOT NULL)
    const fyCompanyResult = await sql`SELECT company_id FROM fiscal_years WHERE id = ${fiscalYearId} LIMIT 1`.execute(db);
    if (fyCompanyResult.rows.length === 0) {
      throw new Error(`Fiscal year ${fiscalYearId} not found — cannot derive company_id for fiscal period`);
    }
    const periodCompanyId = Number((fyCompanyResult.rows[0] as { company_id: number }).company_id);

    // FIX(47.5-WP-B): use period_no (not period_number), status as tinyint, and company_id from parent FY
    await sql`
      INSERT INTO fiscal_periods (fiscal_year_id, company_id, period_no, start_date, end_date, status, created_at, updated_at)
      VALUES (${fiscalYearId}, ${periodCompanyId}, ${periodNo}, ${startDate}, ${endDate}, ${statusInt}, NOW(), NOW())
    `.execute(db);

    const result = await sql`SELECT id, fiscal_year_id, period_no, start_date, end_date, status FROM fiscal_periods WHERE fiscal_year_id = ${fiscalYearId} AND period_no = ${periodNo} LIMIT 1`.execute(db);
    if (result.rows.length === 0) {
      throw new Error(`Failed to create fiscal period for fiscal_year_id ${fiscalYearId}`);
    }
    const row = result.rows[0] as { id: number; fiscal_year_id: number; period_no: number; start_date: Date; end_date: Date; status: number };
    // Map status tinyint back to label for ergonomics
    const fixture: FiscalPeriodFixture = {
      id: Number(row.id),
      fiscalYearId: Number(row.fiscal_year_id),
      periodNumber: Number(row.period_no),
      startDate: fromUtcIso.dateOnly(toUtcIso.dateLike(row.start_date) as string),
      endDate: fromUtcIso.dateOnly(toUtcIso.dateLike(row.end_date) as string),
      status: row.status === STATUS_OPEN_INT ? "OPEN" : "CLOSED",
    };
    return fixture;
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === 'ER_DUP_ENTRY' || mysqlErr?.code === 'ER_DUP_KEY') {
      const result = await sql`SELECT id, fiscal_year_id, period_no, start_date, end_date, status FROM fiscal_periods WHERE fiscal_year_id = ${fiscalYearId} AND period_no = ${periodNo} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: number; fiscal_year_id: number; period_no: number; start_date: Date; end_date: Date; status: number };
        return {
          id: Number(row.id),
          fiscalYearId: Number(row.fiscal_year_id),
          periodNumber: Number(row.period_no),
          startDate: fromUtcIso.dateOnly(toUtcIso.dateLike(row.start_date) as string),
          endDate: fromUtcIso.dateOnly(toUtcIso.dateLike(row.end_date) as string),
          status: row.status === STATUS_OPEN_INT ? "OPEN" : "CLOSED",
        };
      }
    }
    throw error;
  }
}
