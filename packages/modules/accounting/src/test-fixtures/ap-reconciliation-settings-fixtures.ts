// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { APReconciliationSettingsFixture } from "./types.js";
import { upsertCompanyStringSetting } from "../reconciliation/subledger/ap-reconciliation-service.js";

/**
 * Create AP reconciliation account settings for Epic 47.1 (configurable AP control account set).
 * Story linkage: 47.1 AC1 - configurable AP control account set (not hardcoded single account).
 *
 * Uses canonical production function upsertCompanyStringSetting()
 * from ap-reconciliation-service.ts.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Company ID
 * @param accountIds - Array of GL account IDs that form the AP control account set
 * @param options - Optional settings
 * @param options.description - Optional description (stored in settings_strings as metadata)
 * @returns AP reconciliation settings fixture with companyId and accountIds
 */
export async function createTestAPReconciliationSettings(
  db: KyselySchema,
  companyId: number,
  accountIds: number[],
  _options?: Partial<{
    description: string;
  }>
): Promise<APReconciliationSettingsFixture> {
  const settingKey = "ap_reconciliation_account_ids";
  const settingValue = JSON.stringify(accountIds);

  // Use canonical upsertCompanyStringSetting() — shared with production service
  await upsertCompanyStringSetting(db, companyId, settingKey, settingValue);

  return {
    companyId,
    accountIds,
  };
}

/**
 * Clear AP reconciliation settings and fallback AP account defaults for a company.
 *
 * This helper enforces the explicit "settings missing" state used by fail-closed
 * and warning-path tests.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Company ID
 */
export async function clearTestAPReconciliationSettings(
  db: KyselySchema,
  companyId: number
): Promise<void> {
  const settingKey = "ap_reconciliation_account_ids";

  await sql`
    DELETE FROM settings_strings
    WHERE company_id = ${companyId}
      AND outlet_id IS NULL
      AND setting_key = ${settingKey}
  `.execute(db);

  await sql`
    UPDATE company_modules cm
    INNER JOIN modules m ON m.id = cm.module_id
    SET cm.purchasing_default_ap_account_id = NULL
    WHERE cm.company_id = ${companyId}
      AND m.code = 'purchasing'
  `.execute(db);
}

/**
 * Canonical helper for company-level string settings.
 * Uses canonical production function upsertCompanyStringSetting().
 *
 * @param db - KyselySchema database instance
 * @param companyId - Company ID
 * @param settingKey - Setting key
 * @param settingValue - Setting value
 */
export async function setTestCompanyStringSetting(
  db: KyselySchema,
  companyId: number,
  settingKey: string,
  settingValue: string
): Promise<void> {
  // Use canonical upsertCompanyStringSetting() — shared with production service
  await upsertCompanyStringSetting(db, companyId, settingKey, settingValue);
}
