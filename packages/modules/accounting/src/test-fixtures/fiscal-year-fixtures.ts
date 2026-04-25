// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { FiscalYearFixture } from "./types.js";

// Deterministic run ID for fixture code/name generation (matches API fixture behavior)
// Uses process identity + pool ID to reduce cross-worker collisions
const _runIdSeed = (Date.now() ^ (process.pid << 8) ^ (Number(process.env.VITEST_POOL_ID ?? 0) << 16)) & 0x7fffffff;
let _runIdCounter = _runIdSeed;

function makeRunId(): string {
  return (++_runIdCounter).toString(36);
}

/**
 * Create a test fiscal year for Epic 47 (cutoff date handling, period close guardrails).
 * Story linkage: 47.1 (cutoff date handling), 47.5 (period close guardrails).
 *
 * @param db - KyselySchema database instance
 * @param companyId - Parent company ID
 * @param options - Fiscal year options
 * @param options.year - Fiscal year number (e.g., 2026)
 * @param options.startDate - Start date in 'YYYY-MM-DD' format
 * @param options.endDate - End date in 'YYYY-MM-DD' format
 * @param options.status - 'OPEN' | 'CLOSED' (default: 'OPEN')
 * @returns Fiscal year fixture with id, year, startDate, endDate, status
 */
export async function createTestFiscalYear(
  db: KyselySchema,
  companyId: number,
  options?: Partial<{
    year: number;
    startDate: string;
    endDate: string;
    status: "OPEN" | "CLOSED";
  }>
): Promise<FiscalYearFixture> {
  const runId = makeRunId();

  const year = options?.year ?? new Date().getFullYear();
  const code = `FY${year}-${runId}`.slice(0, 32);
  const name = `Fiscal Year ${year}`;
  const startDate = options?.startDate ?? `${year}-01-01`;
  const endDate = options?.endDate ?? `${year}-12-31`;
  const status = options?.status ?? "OPEN";

  try {
    await sql`
      INSERT INTO fiscal_years (company_id, code, name, start_date, end_date, status, created_at, updated_at)
      VALUES (${companyId}, ${code}, ${name}, ${startDate}, ${endDate}, ${status}, NOW(), NOW())
    `.execute(db);

    const result = await sql`SELECT id, code, name, start_date, end_date, status FROM fiscal_years WHERE company_id = ${companyId} AND code = ${code} LIMIT 1`.execute(db);
    if (result.rows.length === 0) {
      throw new Error(`Failed to create fiscal year with code ${code}`);
    }
    const row = result.rows[0] as { id: number; code: string; name: string; start_date: Date; end_date: Date; status: string };
    const fixture: FiscalYearFixture = {
      id: Number(row.id),
      company_id: companyId,
      code: row.code,
      year,
      startDate: row.start_date instanceof Date ? row.start_date.toISOString().split("T")[0] : String(row.start_date),
      endDate: row.end_date instanceof Date ? row.end_date.toISOString().split("T")[0] : String(row.end_date),
      status: row.status as "OPEN" | "CLOSED",
    };
    return fixture;
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === 'ER_DUP_ENTRY' || mysqlErr?.code === 'ER_DUP_KEY') {
      const result = await sql`SELECT id, code, name, start_date, end_date, status FROM fiscal_years WHERE company_id = ${companyId} AND code = ${code} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: number; code: string; name: string; start_date: Date; end_date: Date; status: string };
        return {
          id: Number(row.id),
          company_id: companyId,
          code: row.code,
          year,
          startDate: row.start_date instanceof Date ? row.start_date.toISOString().split("T")[0] : String(row.start_date),
          endDate: row.end_date instanceof Date ? row.end_date.toISOString().split("T")[0] : String(row.end_date),
          status: row.status as "OPEN" | "CLOSED",
        };
      }
    }
    throw error;
  }
}
