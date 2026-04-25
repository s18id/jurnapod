// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { KyselySchema } from "@jurnapod/db";
import { sql } from "kysely";
import { CompanyService } from "../companies/services/company-service.js";
import { CompanyCodeExistsError } from "../companies/interfaces/index.js";
import type { CompanyFixture } from "./types.js";

// Deterministic run ID for fixture code/name generation (matches API fixture behavior)
// Uses process identity + pool ID to reduce cross-worker collisions
const _runIdSeed = (Date.now() ^ (process.pid << 8) ^ (Number(process.env.VITEST_POOL_ID ?? 0) << 16)) & 0x7fffffff;
let _runIdCounter = _runIdSeed;

function makeRunId(): string {
  return (++_runIdCounter).toString(36);
}

/**
 * Create a test company with PARTIAL (row-only) creation path.
 *
 * Uses CompanyService.createCompanyBasic() for production-invariant path.
 * Duplicate handling: catches CompanyCodeExistsError and fetches existing row.
 *
 * @param db - KyselySchema database instance
 * @param options - Partial company options
 * @returns Company fixture with id, code, name
 */
export async function createTestCompanyMinimal(
  db: KyselySchema,
  options?: Partial<{
    code: string;
    name: string;
    timezone: string;
    currency_code: string;
  }>
): Promise<CompanyFixture> {
  const runId = makeRunId();

  const code = (options?.code ?? `TEST-CO-${runId}`).slice(0, 20).toUpperCase();
  const name = options?.name ?? `Test Company ${runId}`;

  const service = new CompanyService(db);

  try {
    const result = await service.createCompanyBasic({
      code,
      name,
      timezone: options?.timezone ?? "Asia/Jakarta",
      currency_code: options?.currency_code ?? "IDR",
    });

    return {
      id: result.id,
      code: result.code,
      name: result.name,
      timezone: options?.timezone ?? "Asia/Jakarta",
      currency_code: options?.currency_code ?? "IDR",
    };
  } catch (error: unknown) {
    // Handle duplicate - fetch existing row
    if (error instanceof CompanyCodeExistsError) {
      const row = await db
        .selectFrom("companies")
        .where("code", "=", code)
        .select(["id", "code", "name", "timezone", "currency_code"])
        .executeTakeFirst();

      if (row) {
        return {
          id: Number(row.id),
          code: row.code,
          name: row.name,
          timezone: row.timezone ?? undefined,
          currency_code: row.currency_code ?? undefined,
        };
      }
    }
    throw error;
  }
}

/**
 * Create a test company with NULL timezone for tests validating
 * fail-closed behavior when no outlet/company timezone is configured.
 *
 * @param db - KyselySchema database instance
 * @param options - Partial company options (timezone must NOT be set here)
 * @returns Company fixture with id, code, name, and null timezone
 */
export async function createTestCompanyWithoutTimezone(
  db: KyselySchema,
  options?: Partial<{
    code: string;
    name: string;
    currency_code: string;
  }>
): Promise<CompanyFixture> {
  const runId = makeRunId();

  const code = (options?.code ?? `TEST-CO-${runId}`).slice(0, 20).toUpperCase();
  const name = options?.name ?? `Test Company ${runId}`;

  // Insert with explicit NULL timezone
  await sql`
    INSERT INTO companies (code, name, timezone, currency_code, created_at, updated_at)
    VALUES (${code}, ${name}, NULL, ${options?.currency_code ?? "IDR"}, NOW(), NOW())
  `.execute(db);

  const row = await db
    .selectFrom("companies")
    .where("code", "=", code)
    .select(["id", "code", "name", "timezone", "currency_code"])
    .executeTakeFirst();

  if (!row) {
    throw new Error(`Failed to create company without timezone: ${code}`);
  }

  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    timezone: row.timezone ?? undefined,
    currency_code: row.currency_code ?? undefined,
  };
}
