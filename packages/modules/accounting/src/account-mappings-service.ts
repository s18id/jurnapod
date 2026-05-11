import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import { ACCOUNT_MAPPING_TYPE_ID_BY_CODE } from "@jurnapod/shared";

/**
 * Insert or update an account_mappings row (idempotent: ON DUPLICATE KEY UPDATE).
 * This is the canonical production insert path for account_mappings.
 * Both domain-level functions and test fixtures MUST use this.
 */
export async function insertAccountMapping(
  db: KyselySchema,
  opts: {
    companyId: number;
    outletId?: number | null;
    mappingTypeId: number;
    mappingKey: string;
    accountId: number;
  }
): Promise<void> {
  await sql`
    INSERT INTO account_mappings (company_id, outlet_id, mapping_type_id, mapping_key, account_id, created_at, updated_at)
    VALUES (${opts.companyId}, ${opts.outletId ?? null}, ${opts.mappingTypeId}, ${opts.mappingKey}, ${opts.accountId}, NOW(), NOW())
    ON DUPLICATE KEY UPDATE account_id = VALUES(account_id), updated_at = NOW()
  `.execute(db);
}

async function findOrCreateAccount(
  db: KyselySchema,
  input: {
    companyId: number;
    code: string;
    name: string;
    accountTypeName: "ASSET" | "REVENUE" | "EXPENSE";
  }
): Promise<number> {
  const existing = await sql`
    SELECT id FROM accounts
    WHERE company_id = ${input.companyId}
      AND code = ${input.code}
    LIMIT 1
  `.execute(db);

  if (existing.rows.length > 0) {
    return Number((existing.rows[0] as { id: number }).id);
  }

  const accountType = await sql`
    SELECT id FROM account_types
    WHERE name = ${input.accountTypeName}
    LIMIT 1
  `.execute(db);

  const accountTypeId = accountType.rows.length > 0
    ? Number((accountType.rows[0] as { id: number }).id)
    : null;

  const inserted = await sql`
    INSERT INTO accounts (company_id, code, name, account_type_id, is_active, is_payable, is_receivable, created_at, updated_at)
    VALUES (${input.companyId}, ${input.code}, ${input.name}, ${accountTypeId}, 1, 0, ${input.code === "AR" || input.code === "RECEIVABLE" ? 1 : 0}, NOW(), NOW())
  `.execute(db);

  return Number((inserted as { insertId?: number }).insertId ?? 0);
}

export async function ensureSalesOutletMappings(
  db: KyselySchema,
  input: { companyId: number; outletId: number }
): Promise<{ arAccountId: number; salesRevenueAccountId: number }> {
  const arAccountId = await findOrCreateAccount(db, {
    companyId: input.companyId,
    code: "AR",
    name: "Accounts Receivable",
    accountTypeName: "ASSET"
  });

  const salesRevenueAccountId = await findOrCreateAccount(db, {
    companyId: input.companyId,
    code: "SALES",
    name: "Sales Revenue",
    accountTypeName: "REVENUE"
  });

  await insertAccountMapping(db, {
    companyId: input.companyId,
    outletId: input.outletId,
    mappingTypeId: ACCOUNT_MAPPING_TYPE_ID_BY_CODE.AR,
    mappingKey: 'AR',
    accountId: arAccountId,
  });

  await insertAccountMapping(db, {
    companyId: input.companyId,
    outletId: input.outletId,
    mappingTypeId: ACCOUNT_MAPPING_TYPE_ID_BY_CODE.SALES_REVENUE,
    mappingKey: 'SALES_REVENUE',
    accountId: salesRevenueAccountId,
  });

  return { arAccountId, salesRevenueAccountId };
}

export async function ensurePaymentVarianceMappings(
  db: KyselySchema,
  input: { companyId: number }
): Promise<{ gainAccountId: number; lossAccountId: number }> {
  const gainAccountId = await findOrCreateAccount(db, {
    companyId: input.companyId,
    code: "PAYMENT_VARIANCE_GAIN",
    name: "Payment Variance Gain",
    accountTypeName: "REVENUE"
  });

  const lossAccountId = await findOrCreateAccount(db, {
    companyId: input.companyId,
    code: "PAYMENT_VARIANCE_LOSS",
    name: "Payment Variance Loss",
    accountTypeName: "EXPENSE"
  });

  await insertAccountMapping(db, {
    companyId: input.companyId,
    mappingTypeId: ACCOUNT_MAPPING_TYPE_ID_BY_CODE.PAYMENT_VARIANCE_GAIN,
    mappingKey: 'PAYMENT_VARIANCE_GAIN',
    accountId: gainAccountId,
  });

  await insertAccountMapping(db, {
    companyId: input.companyId,
    mappingTypeId: ACCOUNT_MAPPING_TYPE_ID_BY_CODE.PAYMENT_VARIANCE_LOSS,
    mappingKey: 'PAYMENT_VARIANCE_LOSS',
    accountId: lossAccountId,
  });

  return { gainAccountId, lossAccountId };
}
