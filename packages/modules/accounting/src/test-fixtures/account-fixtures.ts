// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { KyselySchema } from "@jurnapod/db";
import type { AccountingAccountFixture } from "./types.js";
import {
  lookupOrCreateAccountType,
  insertAccount,
} from "../accounts-service.js";

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
// Uses canonical production functions lookupOrCreateAccountType() and
// insertAccount() from accounts-service.ts. This ensures the fixture
// follows the same production invariants as AccountsService.createAccount().
//
// Idempotency: handles ER_DUP_ENTRY by fetching the existing row.
// ---------------------------------------------------------------------------

export async function createTestAccount(
  db: KyselySchema,
  opts: CreateTestAccountOpts,
): Promise<AccountingAccountFixture> {
  const { companyId, code, name, typeName, isActive = true, parentId } = opts;

  // 1. Resolve account type metadata via canonical production function
  const typeMeta = await lookupOrCreateAccountType(db, companyId, typeName);

  // 2. INSERT via canonical production function
  try {
    await insertAccount(db, {
      companyId,
      code,
      name,
      typeName,
      normalBalance: typeMeta.normal_balance,
      reportGroup: typeMeta.report_group,
      parentAccountId: parentId ?? null,
      accountTypeId: typeMeta.id,
      isActive,
    });
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code !== "ER_DUP_ENTRY" && mysqlErr?.code !== "ER_DUP_KEY") {
      throw error;
    }
    // Duplicate — fall through to fetch existing row below
  }

  // 3. Fetch the row (idempotent — may already exist from prior run)
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
    typeName: "ASSET", // COGS posting validation requires ASSET type for inventory accounts
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
