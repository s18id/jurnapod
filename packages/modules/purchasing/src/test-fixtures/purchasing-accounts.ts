// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { PurchasingAccountsFixture } from "./types.js";

// Deterministic run ID for fixture code/name generation (matches API fixture behavior)
const _runIdSeed = (Date.now() ^ (process.pid << 8) ^ (Number(process.env.VITEST_POOL_ID ?? 0) << 16)) & 0x7fffffff;
let _runIdCounter = _runIdSeed;

function makeRunId(): string {
  return (++_runIdCounter).toString(36);
}

/**
 * Create AP and expense accounts for purchasing tests.
 *
 * Creates accounts using the canonical Kysely insertInto pattern
 * (same DB access layer used by production AccountsService.createAccount()).
 * The company_modules upsert uses sql`` due to columns
 * (purchasing_default_ap_account_id) not yet present in the auto-generated
 * Kysely types.
 *
 * FIXTURE MODE: Partial Fixture Mode
 * SCOPE: Account creation + company_modules configuration for purchasing tests.
 * RATIONALE: The production AccountsService.createAccount() performs
 *   full validation (code uniqueness, parent validation, type resolution),
 *   which requires a fully-seeded account structure that is overkill for
 *   fixture accounts. This fixture uses the same Kysely insertInto pattern
 *   as the production service but at a decomposed level.
 * OWNER: modules-accounting (accounts), modules-purchasing (company_modules)
 *
 * @param db - KyselySchema database instance
 * @param options - Account options
 * @returns Object with ap_account_id and expense_account_id
 */
export async function createPurchasingAccountsFixture(
  db: KyselySchema,
  options?: {
    companyId: number;
    apAccountName?: string;
    expenseAccountName?: string;
  }
): Promise<PurchasingAccountsFixture> {
  const companyId = options?.companyId ?? 0;
  const runId = makeRunId();

  // Find the purchasing module id — canonical Kysely query builder
  const moduleRow = await db
    .selectFrom("modules")
    .where("code", "=", "purchasing")
    .select(["id"])
    .executeTakeFirst();

  if (!moduleRow) {
    throw new Error('Purchasing module not found');
  }
  const purchasingModuleId = Number(moduleRow.id);

  // Create AP account (creditor/payable type) — canonical Kysely insertInto pattern
  const apAccountName = options?.apAccountName ?? `Test AP Account ${runId}`;

  let apAccountId: number | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const attemptRunId = attempt === 0 ? runId : makeRunId();
    const apAccountCode = `TEST-AP-${attemptRunId}`.slice(0, 20);

    try {
      const apResult = await db
        .insertInto("accounts")
        .values({
          company_id: companyId,
          code: apAccountCode,
          name: apAccountName,
          type_name: "CREDITOR",
          is_active: 1,
          is_payable: 1,
        })
        .executeTakeFirst();
      apAccountId = Number(apResult.insertId ?? 0);
      break;
    } catch (error: unknown) {
      const mysqlError = error as { code?: string };
      if (mysqlError?.code === 'ER_DUP_ENTRY' || mysqlError?.code === 'ER_DUP_KEY') {
        continue;
      }
      throw error;
    }
  }

  if (!apAccountId) {
    throw new Error('Failed to create unique AP account fixture after retries');
  }

  // Create Expense account — canonical Kysely insertInto pattern
  const expenseAccountName = options?.expenseAccountName ?? `Test Expense Account ${runId}`;

  let expenseAccountId: number | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const attemptRunId = attempt === 0 ? runId : makeRunId();
    const expenseAccountCode = `TEST-EXP-${attemptRunId}`.slice(0, 20);

    try {
      const expenseResult = await db
        .insertInto("accounts")
        .values({
          company_id: companyId,
          code: expenseAccountCode,
          name: expenseAccountName,
          type_name: "EXPENSE",
          is_active: 1,
          is_payable: 0,
        })
        .executeTakeFirst();
      expenseAccountId = Number(expenseResult.insertId ?? 0);
      break;
    } catch (error: unknown) {
      const mysqlError = error as { code?: string };
      if (mysqlError?.code === 'ER_DUP_ENTRY' || mysqlError?.code === 'ER_DUP_KEY') {
        continue;
      }
      throw error;
    }
  }

  if (!expenseAccountId) {
    throw new Error('Failed to create unique expense account fixture after retries');
  }

  // Upsert company_modules entry — sql`` required for purchasing_default_ap_account_id
  // (column exists in DB via migration 0177 but not yet in auto-generated Kysely types)
  await sql`
    INSERT INTO company_modules (company_id, module_id, enabled, config_json, updated_at,
      purchasing_default_ap_account_id, purchasing_default_expense_account_id)
    VALUES (${companyId}, ${purchasingModuleId}, 1, '{}', CURRENT_TIMESTAMP, ${apAccountId}, ${expenseAccountId})
    ON DUPLICATE KEY UPDATE
      purchasing_default_ap_account_id = ${apAccountId},
      purchasing_default_expense_account_id = ${expenseAccountId}
  `.execute(db);

  return { ap_account_id: apAccountId, expense_account_id: expenseAccountId };
}
