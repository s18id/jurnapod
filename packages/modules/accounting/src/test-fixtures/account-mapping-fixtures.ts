// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { KyselySchema } from "@jurnapod/db";

/**
 * Fixture for account_mappings table (accounting domain).
 *
 * Creates an account mapping entry using the canonical Kysely query builder
 * (the same DB access pattern used by account-mappings-service.ts production code).
 *
 * FIXTURE MODE: Partial Fixture Mode
 * SCOPE: Single account_mappings row insertion for test seeding.
 * RATIONALE: The production `ensureSalesOutletMappings` and `ensurePaymentVarianceMappings`
 *   functions are orchestrators that create accounts AND mappings in a single flow,
 *   which is too broad for tests that need individual mapping rows. This fixture
 *   uses the canonical Kysely insertInto pattern — the same DB access used by
 *   production code — but at a decomposed level.
 * OWNER: modules-accounting (owner package for account_mappings domain)
 */
export interface AccountMappingFixture {
  id: number;
}

export interface CreateTestAccountMappingOpts {
  companyId: number;
  outletId?: number;
  mappingTypeId: number;
  mappingKey: string;
  accountId: number;
}

export async function createTestAccountMapping(
  db: KyselySchema,
  opts: CreateTestAccountMappingOpts,
): Promise<AccountMappingFixture> {
  const { companyId, outletId, mappingTypeId, mappingKey, accountId } = opts;

  const result = await db
    .insertInto("account_mappings")
    .values({
      company_id: companyId,
      outlet_id: outletId ?? null,
      mapping_type_id: mappingTypeId,
      mapping_key: mappingKey,
      account_id: accountId,
    })
    .executeTakeFirst();

  return {
    id: Number(result.insertId),
  };
}
