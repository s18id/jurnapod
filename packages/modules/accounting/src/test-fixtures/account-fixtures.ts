// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { AccountingAccountFixture } from "./types.js";

interface CreateAccountOptions {
  code: string;
  name: string;
  typeName: string;
  normalBalance?: "D" | "C";
  reportGroup?: string;
}

async function createTestAccount(
  db: KyselySchema,
  companyId: number,
  options: CreateAccountOptions,
): Promise<AccountingAccountFixture> {
  const result = await sql`
    INSERT INTO accounts (company_id, code, name, type_name, normal_balance, report_group, is_active)
    VALUES (
      ${companyId},
      ${options.code},
      ${options.name},
      ${options.typeName},
      ${options.normalBalance ?? "D"},
      ${options.reportGroup ?? "NRC"},
      1
    )
  `.execute(db);

  const accountId = Number(result.insertId);
  if (!Number.isSafeInteger(accountId) || accountId <= 0) {
    throw new Error(`Failed to create ${options.typeName} account fixture for company ${companyId}`);
  }

  return {
    id: accountId,
    companyId,
    code: options.code,
    name: options.name,
    typeName: options.typeName,
  };
}

export async function createTestInventoryGLAccount(
  db: KyselySchema,
  companyId: number,
  options: { code: string; name?: string },
): Promise<AccountingAccountFixture> {
  return createTestAccount(db, companyId, {
    code: options.code,
    name: options.name ?? "Inventory Asset Test Fixture",
    typeName: "INVENTORY",
    normalBalance: "D",
    reportGroup: "NRC",
  });
}

export async function createTestVarianceAccount(
  db: KyselySchema,
  companyId: number,
  options: { code: string; name?: string },
): Promise<AccountingAccountFixture> {
  return createTestAccount(db, companyId, {
    code: options.code,
    name: options.name ?? "Inventory Variance Test Fixture",
    typeName: "EXPENSE",
    normalBalance: "D",
    reportGroup: "PL",
  });
}
