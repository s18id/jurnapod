// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { CustomerFixture } from "./types.js";

// Deterministic run ID for fixture code/name generation (matches API fixture behavior)
const _runIdSeed = (Date.now() ^ (process.pid << 8) ^ (Number(process.env.VITEST_POOL_ID ?? 0) << 16)) & 0x7fffffff;
let _runIdCounter = _runIdSeed;

function makeRunId(): string {
  return (++_runIdCounter).toString(36);
}

/**
 * Create a deterministic customer fixture.
 *
 * Inserts a customer record using the production database path.
 * Follows the same conventions as the API customer-creation endpoint
 * (code truncated to 32 chars, type=1 (PERSON), is_active=1).
 *
 * @param db - KyselySchema database instance
 * @param opts - Customer options
 * @param opts.companyId - Company ID (required)
 * @param opts.code - Customer code (default: "CUST-{runId}", truncated to 32 chars)
 * @param opts.name - Display name (default: "Test Customer {runId}")
 * @param opts.email - Email address (default: null)
 * @returns Customer fixture with id, company_id, code
 */
export async function createTestCustomer(
  db: KyselySchema,
  opts: {
    companyId: number;
    code?: string;
    name?: string;
    email?: string;
  }
): Promise<CustomerFixture> {
  const runId = makeRunId();
  const code = (opts.code ?? `CUST-${runId}`).slice(0, 32);
  const name = opts.name ?? `Test Customer ${runId}`;

  try {
    await sql`
      INSERT INTO customers (company_id, code, display_name, type, is_active, email, created_at, updated_at)
      VALUES (${opts.companyId}, ${code}, ${name}, 1, 1, ${opts.email ?? null}, NOW(), NOW())
    `.execute(db);

    // SELECT to get the generated ID (reliable across mysql2/Kysely sql template)
    const result = await sql<{ id: number }>`
      SELECT id FROM customers WHERE company_id = ${opts.companyId} AND code = ${code} LIMIT 1
    `.execute(db);

    if (result.rows.length === 0) {
      throw new Error(`Failed to create customer with code ${code}`);
    }

    return {
      id: Number(result.rows[0].id),
      company_id: opts.companyId,
      code,
    };
  } catch (error: unknown) {
    // Handle duplicate - fetch existing
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === "ER_DUP_ENTRY" || mysqlErr?.code === "ER_DUP_KEY") {
      const existing = await sql<{ id: number }>`
        SELECT id FROM customers WHERE company_id = ${opts.companyId} AND code = ${code} LIMIT 1
      `.execute(db);
      if (existing.rows.length > 0) {
        return {
          id: Number(existing.rows[0].id),
          company_id: opts.companyId,
          code,
        };
      }
    }
    throw error;
  }
}
