// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Standalone purchasing settings DB functions.
 *
 * Extracted from the purchasing test fixtures `purchasing-accounts.ts` and
 * `purchasing-settings.ts` — provides reusable upsert for company_modules
 * purchasing configuration columns.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

/**
 * Resolve the purchasing module ID.
 *
 * @param db - KyselySchema database instance
 * @returns Purchasing module ID
 * @throws Error if purchasing module not found
 */
export async function getPurchasingModuleId(db: KyselySchema): Promise<number> {
  const moduleRow = await db
    .selectFrom("modules")
    .where("code", "=", "purchasing")
    .select(["id"])
    .executeTakeFirst();

  if (!moduleRow) {
    throw new Error("Purchasing module not found");
  }
  return Number(moduleRow.id);
}

/**
 * Upsert purchasing module settings on company_modules.
 *
 * Sets purchasing_default_ap_account_id and purchasing_default_expense_account_id.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE — the canonical MySQL pattern for
 * upserting module settings.
 *
 * sql`` escape hatch is required because purchasing_default_ap_account_id and
 * purchasing_default_expense_account_id columns are not yet present in the
 * auto-generated Kysely types (added via migration 0177).
 *
 * @param db - KyselySchema database instance
 * @param companyId - Company ID
 * @param apAccountId - Default AP account ID
 * @param expenseAccountId - Default expense account ID
 */
export async function upsertPurchasingModuleSettings(
  db: KyselySchema,
  companyId: number,
  apAccountId: number,
  expenseAccountId: number
): Promise<void> {
  const purchasingModuleId = await getPurchasingModuleId(db);

  await sql`
    INSERT INTO company_modules (company_id, module_id, enabled, config_json, updated_at,
      purchasing_default_ap_account_id, purchasing_default_expense_account_id)
    VALUES (${companyId}, ${purchasingModuleId}, 1, '{}', CURRENT_TIMESTAMP, ${apAccountId}, ${expenseAccountId})
    ON DUPLICATE KEY UPDATE
      purchasing_default_ap_account_id = ${apAccountId},
      purchasing_default_expense_account_id = ${expenseAccountId}
  `.execute(db);
}
