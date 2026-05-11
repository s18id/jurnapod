// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

/**
 * Fixture for account_mappings table (accounting domain).
 *
 * Creates an account mapping entry with deterministic defaults.
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
  const { companyId, outletId = null, mappingTypeId, mappingKey, accountId } = opts;

  const result = await sql`
    INSERT INTO account_mappings (company_id, outlet_id, mapping_type_id, mapping_key, account_id)
    VALUES (${companyId}, ${outletId}, ${mappingTypeId}, ${mappingKey}, ${accountId})
  `.execute(db);

  return {
    id: Number(result.insertId),
  };
}
