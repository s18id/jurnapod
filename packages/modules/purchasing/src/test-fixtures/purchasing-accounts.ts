// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { KyselySchema } from "@jurnapod/db";
import type { PurchasingAccountsFixture } from "./types.js";
import { insertAccount } from "@jurnapod/modules-accounting";
import { upsertPurchasingModuleSettings } from "../services/purchasing-settings-db.js";

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

  // Create AP account (creditor/payable type) — canonical insertAccount() function
  const apAccountName = options?.apAccountName ?? `Test AP Account ${runId}`;

  let apAccountId: number | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const attemptRunId = attempt === 0 ? runId : makeRunId();
    const apAccountCode = `TEST-AP-${attemptRunId}`.slice(0, 20);

    try {
      apAccountId = await insertAccount(db, {
        companyId,
        code: apAccountCode,
        name: apAccountName,
        typeName: "CREDITOR",
        isPayable: true,
        isActive: true,
      });
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

  // Create Expense account — canonical insertAccount() function
  const expenseAccountName = options?.expenseAccountName ?? `Test Expense Account ${runId}`;

  let expenseAccountId: number | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const attemptRunId = attempt === 0 ? runId : makeRunId();
    const expenseAccountCode = `TEST-EXP-${attemptRunId}`.slice(0, 20);

    try {
      expenseAccountId = await insertAccount(db, {
        companyId,
        code: expenseAccountCode,
        name: expenseAccountName,
        typeName: "EXPENSE",
        isPayable: false,
        isActive: true,
      });
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

  // Upsert company_modules — canonical upsertPurchasingModuleSettings() function
  await upsertPurchasingModuleSettings(db, companyId, apAccountId, expenseAccountId);

  return { ap_account_id: apAccountId, expense_account_id: expenseAccountId };
}
