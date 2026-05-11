// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { PurchasingSettingsFixture } from "./types.js";

/**
 * Configure purchasing module settings for a company.
 *
 * Sets purchasing_default_ap_account_id and purchasing_default_expense_account_id
 * on company_modules for the purchasing module.
 *
 * FIXTURE MODE: Partial Fixture Mode
 * SCOPE: company_modules configuration for purchasing tests.
 * RATIONALE: No production service exists for setting purchasing-specific
 *   company_module columns. The production `ensureCompanyModules()` only does
 *   INSERT IGNORE with default config. The company_modules upsert (INSERT ...
 *   ON DUPLICATE KEY UPDATE) is the canonical MySQL pattern for upserting
 *   module settings. The sql`` escape hatch is required for columns
 *   (purchasing_default_ap_account_id) not yet in the auto-generated Kysely types.
 * OWNER: modules-purchasing
 *
 * @param db - KyselySchema database instance
 * @param companyId - Company ID
 * @param apAccountId - Default AP account ID
 * @param expenseAccountId - Default expense account ID
 * @returns Purchasing settings fixture
 */
export async function createPurchasingSettingsFixture(
  db: KyselySchema,
  companyId: number,
  apAccountId: number,
  expenseAccountId: number
): Promise<PurchasingSettingsFixture> {
  const moduleRow = await db
    .selectFrom("modules")
    .where("code", "=", "purchasing")
    .select(["id"])
    .executeTakeFirst();

  if (!moduleRow) {
    throw new Error('Purchasing module not found');
  }
  const purchasingModuleId = Number(moduleRow.id);

  // sql`` required: purchasing_default_ap_account_id not in auto-generated Kysely types
  await sql`
    INSERT INTO company_modules (company_id, module_id, enabled, config_json, updated_at,
      purchasing_default_ap_account_id, purchasing_default_expense_account_id)
    VALUES (${companyId}, ${purchasingModuleId}, 1, '{}', CURRENT_TIMESTAMP, ${apAccountId}, ${expenseAccountId})
    ON DUPLICATE KEY UPDATE
      purchasing_default_ap_account_id = ${apAccountId},
      purchasing_default_expense_account_id = ${expenseAccountId}
  `.execute(db);

  return {
    company_id: companyId,
    ap_account_id: apAccountId,
    expense_account_id: expenseAccountId,
  };
}

/**
 * Override purchasing default AP account id for AP posting validation tests.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Company ID
 * @param accountId - New default AP account ID
 */
export async function setPurchasingDefaultApAccountFixture(
  db: KyselySchema,
  companyId: number,
  accountId: number
): Promise<void> {
  // sql`` required: purchasing_default_ap_account_id not in auto-generated Kysely types
  await sql`
    UPDATE company_modules cm
    INNER JOIN modules m ON m.id = cm.module_id
    SET cm.purchasing_default_ap_account_id = ${accountId}, cm.updated_at = NOW()
    WHERE cm.company_id = ${companyId}
      AND m.code = 'purchasing'
  `.execute(db);
}
