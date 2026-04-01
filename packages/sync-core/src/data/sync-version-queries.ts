// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

/**
 * Get current sync data version for a company.
 * Uses the unified sync_versions table with tier = NULL for data sync.
 */
export async function getSyncDataVersion(db: KyselySchema, companyId: number): Promise<number> {
  const result = await db
    .selectFrom('sync_versions')
    .select(['current_version'])
    .where('company_id', '=', companyId)
    .where('tier', 'is', null)
    .executeTakeFirst();
  
  return Number(result?.current_version ?? 0);
}

/**
 * Increment sync data version for a company.
 * Returns the new version number.
 */
export async function incrementSyncDataVersion(db: KyselySchema, companyId: number): Promise<number> {
  // Use raw SQL for INSERT ... ON DUPLICATE KEY UPDATE since Kysely's
  // query builder doesn't directly support this MySQL-specific syntax
  await db
    .insertInto('sync_versions')
    .values({
      company_id: companyId,
      tier: null,
      current_version: 1
    })
    .onDuplicateKeyUpdate({
      current_version: (eb: any) => eb('current_version', '+', 1)
    })
    .execute();
  
  return getSyncDataVersion(db, companyId);
}
