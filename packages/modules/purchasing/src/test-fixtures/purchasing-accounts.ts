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
 * Creates CREDITOR-type account for AP and EXPENSE-type account for expense,
 * then upserts company_modules entry with the default account IDs.
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

  // Find the purchasing module id
  const purchasingModuleResult = await sql`SELECT id FROM modules WHERE code = 'purchasing' LIMIT 1`.execute(db);
  if (purchasingModuleResult.rows.length === 0) {
    throw new Error('Purchasing module not found');
  }
  const purchasingModuleId = Number((purchasingModuleResult.rows[0] as { id: number }).id);

  // Create AP account (creditor/payable type)
  const apAccountName = options?.apAccountName ?? `Test AP Account ${runId}`;

  let apAccountId: number | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const attemptRunId = attempt === 0 ? runId : makeRunId();
    const apAccountCode = `TEST-AP-${attemptRunId}`.slice(0, 20);

    try {
      const apResult = await sql`
        INSERT INTO accounts (company_id, code, name, type_name, is_active, is_payable, created_at, updated_at)
        VALUES (${companyId}, ${apAccountCode}, ${apAccountName}, 'CREDITOR', 1, 1, NOW(), NOW())
      `.execute(db);
      apAccountId = Number((apResult as { insertId?: number }).insertId ?? 0);
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

  // Create Expense account
  const expenseAccountName = options?.expenseAccountName ?? `Test Expense Account ${runId}`;

  let expenseAccountId: number | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const attemptRunId = attempt === 0 ? runId : makeRunId();
    const expenseAccountCode = `TEST-EXP-${attemptRunId}`.slice(0, 20);

    try {
      const expenseResult = await sql`
        INSERT INTO accounts (company_id, code, name, type_name, is_active, is_payable, created_at, updated_at)
        VALUES (${companyId}, ${expenseAccountCode}, ${expenseAccountName}, 'EXPENSE', 1, 0, NOW(), NOW())
      `.execute(db);
      expenseAccountId = Number((expenseResult as { insertId?: number }).insertId ?? 0);
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

  // Upsert company_modules entry for purchasing with the AP and expense accounts
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
