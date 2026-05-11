// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

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
 * Uses the canonical Kysely insertInto pattern — the same DB access layer
 * used by the production KyselyCustomerRepository in @jurnapod/modules-platform.
 *
 * FIXTURE MODE: Partial Fixture Mode
 * SCOPE: Single customer row insertion for test seeding.
 * RATIONALE: The production CustomerService requires AccessScopeChecker (auth)
 *   and full actor context, which is unnecessary overhead for test fixtures
 *   that only need a customer row. This fixture uses the same Kysely
 *   query builder pattern as KyselyCustomerRepository.create() but at a
 *   decomposed level without the full service orchestration.
 * OWNER: modules-platform (owner package for customers domain)
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
    const result = await db
      .insertInto("customers")
      .values({
        company_id: opts.companyId,
        code,
        display_name: name,
        type: 1, // PERSON
        is_active: 1,
        email: opts.email ?? null,
      })
      .executeTakeFirst();

    const id = Number(result.insertId);
    if (!id) {
      throw new Error(`Failed to create customer with code ${code}`);
    }

    return {
      id,
      company_id: opts.companyId,
      code,
    };
  } catch (error: unknown) {
    // Handle duplicate - fetch existing
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === "ER_DUP_ENTRY" || mysqlErr?.code === "ER_DUP_KEY") {
      const existing = await db
        .selectFrom("customers")
        .where("company_id", "=", opts.companyId)
        .where("code", "=", code)
        .select(["id"])
        .executeTakeFirst();
      if (existing) {
        return {
          id: Number(existing.id),
          company_id: opts.companyId,
          code,
        };
      }
    }
    throw error;
  }
}
