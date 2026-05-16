// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { FiscalPeriodFixture } from "./types.js";
import { insertFiscalPeriod } from "../fiscal-year/service.js";

const STATUS_OPEN_INT = 1;

/**
 * Create a test fiscal period for Epic 47 (cutoff date handling, period close guardrails).
 * Story linkage: 47.1 (cutoff date handling), 47.5 (period close guardrails).
 *
 * Uses canonical production function insertFiscalPeriod() from fiscal-year/service.ts.
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
/**
 * Set a test fiscal period status.
 *
 * Test/test-fixture helper — operates directly on the fiscal_periods table to
 * change period status for period-close enforcement tests.
 * NOT a production business-write path.
 *
 * Status mapping:
 *   'OPEN'   → 1
 *   'CLOSED' → 2
 *
 * @param db - KyselySchema database instance
 * @param periodId - Fiscal period ID
 * @param status - 'OPEN' | 'CLOSED'
 */
export async function setTestFiscalPeriodStatus(
  db: KyselySchema,
  periodId: number,
  status: "OPEN" | "CLOSED"
): Promise<void> {
  const statusInt = status === "CLOSED" ? 2 : 1;
  await sql`UPDATE fiscal_periods SET status = ${statusInt} WHERE id = ${periodId}`.execute(db);
}

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
  let startDate = options?.startDate ?? "2026-01-01";
  let endDate = options?.endDate ?? "2026-01-31";
  const statusInput = options?.status ?? "OPEN";

  try {
    const created = await insertFiscalPeriod(db, {
      fiscalYearId,
      periodNo,
      startDate,
      endDate,
      status: statusInput,
    });

    const fixture: FiscalPeriodFixture = {
      id: created.id,
      fiscalYearId: created.fiscalYearId,
      periodNumber: created.periodNo,
      startDate: created.startDate,
      endDate: created.endDate,
      status: created.status,
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
          startDate: (row.start_date instanceof Date ? row.start_date.toISOString().slice(0, 10) : String(row.start_date).slice(0, 10)),
          endDate: (row.end_date instanceof Date ? row.end_date.toISOString().slice(0, 10) : String(row.end_date).slice(0, 10)),
          status: row.status === STATUS_OPEN_INT ? "OPEN" : "CLOSED",
        };
      }
    }
    throw error;
  }
}
