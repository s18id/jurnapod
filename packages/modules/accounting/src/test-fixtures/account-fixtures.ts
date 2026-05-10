// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { AccountingAccountFixture } from "./types.js";

// ---------------------------------------------------------------------------
// Public interface for createTestAccount
// ---------------------------------------------------------------------------

export interface CreateTestAccountOpts {
  companyId: number;
  code: string;
  name: string;
  /** Account type name — MUST match a row in account_types (e.g. 'ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE', 'INVENTORY', 'COGS') */
  typeName: string;
  isActive?: boolean;
  parentId?: number;
}

// ---------------------------------------------------------------------------
// Core fixture: createTestAccount
//
// Follows the same production pattern as ensureSystemAccounts() in
// company-service.ts:
//   1. Look up account_types by name (global lookup, no company_id filter)
//   2. Create account_types row if not found (INSERT IGNORE, scoped to companyId)
//   3. INSERT the account with account_type_id set AT CREATION TIME
//      (no backfill UPDATE needed)
//   4. Use INSERT IGNORE for idempotency (safe re-run)
// ---------------------------------------------------------------------------

export async function createTestAccount(
  db: KyselySchema,
  opts: CreateTestAccountOpts,
): Promise<AccountingAccountFixture> {
  const { companyId, code, name, typeName, isActive = true, parentId } = opts;

  // 1. Look up account_type_id by name (matches production ensureSystemAccounts pattern — no company_id filter)
  let typeRow = await db
    .selectFrom("account_types")
    .where("name", "=", typeName)
    .select(["id", "name", "normal_balance", "report_group"])
    .executeTakeFirst();

  if (!typeRow) {
    // 2. Create account_types row for this company (idempotent)
    await sql`
      INSERT IGNORE INTO account_types (company_id, name, category, normal_balance)
      VALUES (${companyId}, ${typeName}, ${typeName}, 'D')
    `.execute(db);

    typeRow = await db
      .selectFrom("account_types")
      .where("name", "=", typeName)
      .where("company_id", "=", companyId)
      .select(["id", "name", "normal_balance", "report_group"])
      .executeTakeFirst();
  }

  if (!typeRow) {
    throw new Error(
      `Account type "${typeName}" not found and could not be created for company ${companyId}`,
    );
  }

  const accountTypeId = Number(typeRow.id);

  // 3. INSERT IGNORE — sets account_type_id at creation time (no backfill needed)
  await sql`
    INSERT IGNORE INTO accounts (
      company_id, code, name,
      account_type_id, type_name, normal_balance, report_group,
      parent_account_id, is_active,
      created_at, updated_at
    ) VALUES (
      ${companyId}, ${code}, ${name},
      ${accountTypeId}, ${typeName}, ${typeRow.normal_balance}, ${typeRow.report_group},
      ${parentId ?? null}, ${isActive ? 1 : 0},
      NOW(), NOW()
    )
  `.execute(db);

  // 4. Fetch the row (idempotent — may already exist from prior run)
  const accountRow = await db
    .selectFrom("accounts")
    .where("company_id", "=", companyId)
    .where("code", "=", code)
    .select(["id", "code", "name", "account_type_id", "type_name"])
    .executeTakeFirst();

  if (!accountRow) {
    throw new Error(
      `Failed to create account "${code}" for company ${companyId}`,
    );
  }

  return {
    id: accountRow.id,
    companyId,
    code: accountRow.code,
    name: accountRow.name,
    typeName: (accountRow.type_name as string) ?? typeName,
    accountTypeId: Number(accountRow.account_type_id ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Convenience wrappers — preserved signatures for backward compatibility
// ---------------------------------------------------------------------------

export async function createTestInventoryGLAccount(
  db: KyselySchema,
  companyId: number,
  options: { code: string; name?: string },
): Promise<AccountingAccountFixture> {
  return createTestAccount(db, {
    companyId,
    code: options.code,
    name: options.name ?? "Inventory Asset Test Fixture",
    typeName: "INVENTORY",
  });
}

export async function createTestVarianceAccount(
  db: KyselySchema,
  companyId: number,
  options: { code: string; name?: string },
): Promise<AccountingAccountFixture> {
  return createTestAccount(db, {
    companyId,
    code: options.code,
    name: options.name ?? "Inventory Variance Test Fixture",
    typeName: "EXPENSE",
  });
}
