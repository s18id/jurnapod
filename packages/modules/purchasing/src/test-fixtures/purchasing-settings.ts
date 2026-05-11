// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { PurchasingSettingsFixture } from "./types.js";
import { upsertPurchasingModuleSettings } from "../services/purchasing-settings-db.js";

/**
 * Configure purchasing module settings for a company.
 *
 * Uses the canonical `upsertPurchasingModuleSettings()` production function
 * extracted from the same INSERT ... ON DUPLICATE KEY UPDATE pattern.
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
  await upsertPurchasingModuleSettings(db, companyId, apAccountId, expenseAccountId);

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
