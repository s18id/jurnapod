// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { OutletFixture } from "./types.js";

// Deterministic run ID for fixture code/name generation (matches API fixture behavior)
// Uses process identity + pool ID to reduce cross-worker collisions
const _runIdSeed = (Date.now() ^ (process.pid << 8) ^ (Number(process.env.VITEST_POOL_ID ?? 0) << 16)) & 0x7fffffff;
let _runIdCounter = _runIdSeed;

function makeRunId(): string {
  return (++_runIdCounter).toString(36);
}

/**
 * Create a test outlet with PARTIAL (row-only) creation path.
 *
 * PARTIAL FIXTURE MODE — EXCEPTION: No package-level createOutlet service exists
 * for test-only fixture creation with audit logging. This partial path creates
 * only the row using raw SQL INSERT.
 *
 * RATIONALE FOR EXCEPTION: Full outlet bootstrap requires audit logging and is owned
 * by this package but no CompanyService.createOutletBasic() method exists yet.
 * This scope is narrow (outlets INSERT only) and bounded (company_id + code unique key).
 *
 * @param db - KyselySchema database instance
 * @param companyId - Parent company ID
 * @param options - Partial outlet options
 * @returns Outlet fixture with id, company_id, code, name
 */
export async function createTestOutletMinimal(
  db: KyselySchema,
  companyId: number,
  options?: Partial<{
    code: string;
    name: string;
    timezone: string;
  }>
): Promise<OutletFixture> {
  const runId = makeRunId();

  const code = (options?.code ?? `TEST-OL-${runId}`).slice(0, 20).toUpperCase();
  const name = options?.name ?? `Test Outlet ${runId}`;

  try {
    await sql`
      INSERT INTO outlets (company_id, code, name, timezone, created_at, updated_at)
      VALUES (${companyId}, ${code}, ${name}, ${options?.timezone ?? "Asia/Jakarta"}, NOW(), NOW())
    `.execute(db);

    const result = await sql`SELECT id, company_id, code, name, timezone FROM outlets WHERE company_id = ${companyId} AND code = ${code} LIMIT 1`.execute(db);
    if (result.rows.length === 0) {
      throw new Error(`Failed to create outlet with code ${code} for company ${companyId}`);
    }
    const row = result.rows[0] as {
      id: number;
      company_id: number;
      code: string;
      name: string;
      timezone: string | null;
    };
    const fixture: OutletFixture = {
      id: Number(row.id),
      company_id: Number(row.company_id),
      code: row.code,
      name: row.name,
      timezone: row.timezone,
    };
    return fixture;
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === 'ER_DUP_ENTRY' || mysqlErr?.code === 'ER_DUP_KEY') {
      const result = await sql`SELECT id, company_id, code, name, timezone FROM outlets WHERE company_id = ${companyId} AND code = ${code} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as {
          id: number;
          company_id: number;
          code: string;
          name: string;
          timezone: string | null;
        };
        return {
          id: Number(row.id),
          company_id: Number(row.company_id),
          code: row.code,
          name: row.name,
          timezone: row.timezone,
        };
      }
    }
    throw error;
  }
}

/**
 * Create a test outlet with NULL timezone for a given company.
 * Use with createTestCompanyWithoutTimezone() to produce a company+outlet
 * pair that triggers the no-UTC-fallback error path.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Parent company ID
 * @param options - Partial outlet options (timezone must NOT be set here)
 * @returns Outlet fixture with id, company_id, code, name, and null timezone
 */
export async function createTestOutletWithoutTimezone(
  db: KyselySchema,
  companyId: number,
  options?: Partial<{
    code: string;
    name: string;
  }>
): Promise<OutletFixture> {
  const runId = makeRunId();

  const code = (options?.code ?? `TEST-OL-${runId}`).slice(0, 20).toUpperCase();
  const name = options?.name ?? `Test Outlet ${runId}`;

  try {
    // Insert outlet row directly with explicit NULL timezone.
    await sql`
      INSERT INTO outlets (company_id, code, name, timezone, created_at, updated_at)
      VALUES (${companyId}, ${code}, ${name}, NULL, NOW(), NOW())
    `.execute(db);

    const result = await sql`SELECT id, company_id, code, name, timezone FROM outlets WHERE company_id = ${companyId} AND code = ${code} LIMIT 1`.execute(db);
    if (result.rows.length === 0) {
      throw new Error(`Failed to create outlet without timezone for company ${companyId}`);
    }
    const row = result.rows[0] as {
      id: number;
      company_id: number;
      code: string;
      name: string;
      timezone: string | null;
    };
    return {
      id: Number(row.id),
      company_id: Number(row.company_id),
      code: row.code,
      name: row.name,
      timezone: row.timezone,
    };
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === 'ER_DUP_ENTRY' || mysqlErr?.code === 'ER_DUP_KEY') {
      const result = await sql`SELECT id, company_id, code, name, timezone FROM outlets WHERE company_id = ${companyId} AND code = ${code} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as {
          id: number;
          company_id: number;
          code: string;
          name: string;
          timezone: string | null;
        };
        return {
          id: Number(row.id),
          company_id: Number(row.company_id),
          code: row.code,
          name: row.name,
          timezone: row.timezone,
        };
      }
    }
    throw error;
  }
}
