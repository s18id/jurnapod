// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { KyselySchema } from "@jurnapod/db";
import { insertAccountMapping } from "../account-mappings-service.js";

/**
 * Fixture for account_mappings table (accounting domain).
 *
 * Uses the production `insertAccountMapping()` function — the same canonical
 * insert path used by production domain functions (`ensureSalesOutletMappings`,
 * `ensurePaymentVarianceMappings`).
 *
 * FIXTURE MODE: Full Fixture Mode
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
  await insertAccountMapping(db, {
    companyId: opts.companyId,
    outletId: opts.outletId ?? null,
    mappingTypeId: opts.mappingTypeId,
    mappingKey: opts.mappingKey,
    accountId: opts.accountId,
  });

  // Fetch the idempotent row
  const result = await db
    .selectFrom("account_mappings")
    .select(["id"])
    .where("company_id", "=", opts.companyId)
    .where("mapping_key", "=", opts.mappingKey)
    .executeTakeFirst();

  return { id: Number(result?.id ?? 0) };
}
