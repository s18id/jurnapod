// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import {
  ACCOUNT_MAPPING_TYPE_ID_BY_CODE,
  accountMappingIdToCode,
  type AccountMappingCode
} from "@jurnapod/shared";
import type { SyncPushPostingContext, SyncPushPostingExecutor } from "@jurnapod/modules-accounting";
import { normalizeMoney } from "@jurnapod/modules-accounting";

function resolveMappingCode(row: { mapping_type_id?: number | null; mapping_key?: string | null }): AccountMappingCode | undefined {
  const fromId = accountMappingIdToCode(row.mapping_type_id);
  if (fromId) {
    return fromId;
  }

  if (typeof row.mapping_key === "string") {
    const normalized = row.mapping_key.trim().toUpperCase() as AccountMappingCode;
    if (ACCOUNT_MAPPING_TYPE_ID_BY_CODE[normalized]) {
      return normalized;
    }
  }

  return undefined;
}

function normalizePaymentMethodCode(method: string): string {
  const normalized = method.trim().toUpperCase();
  if (!normalized) {
    throw new Error("UNSUPPORTED_PAYMENT_METHOD");
  }
  return normalized;
}

export class KyselyPosSyncPushPostingExecutor implements SyncPushPostingExecutor {
  constructor(
    private readonly db: KyselySchema,
    private readonly context: SyncPushPostingContext
  ) {}

  async readOutletAccountMapping(
    companyId: number,
    outletId: number
  ): Promise<Record<"SALES_REVENUE" | "AR" | "SALES_RETURNS" | "SALES_DISCOUNTS", number>> {
    const requiredKeys = ["SALES_REVENUE", "AR"] as const;
    const requiredTypeIds = requiredKeys.map((key) => ACCOUNT_MAPPING_TYPE_ID_BY_CODE[key]);

    const outletRows = await this.db
      .selectFrom("account_mappings")
      .select(["mapping_type_id", "mapping_key", "account_id", "outlet_id"])
      .where("company_id", "=", companyId)
      .where("outlet_id", "=", outletId)
      .where((eb) => eb.or([
        eb("mapping_type_id", "in", requiredTypeIds),
        eb("mapping_key", "in", requiredKeys)
      ]))
      .execute();

    const companyRows = await this.db
      .selectFrom("account_mappings")
      .select(["mapping_type_id", "mapping_key", "account_id", "outlet_id"])
      .where("company_id", "=", companyId)
      .where("outlet_id", "is", null)
      .where((eb) => eb.or([
        eb("mapping_type_id", "in", requiredTypeIds),
        eb("mapping_key", "in", requiredKeys)
      ]))
      .execute();

    const accountByKey = new Map<string, number>();

    for (const row of companyRows) {
      const mappingCode = resolveMappingCode(row);
      if (!mappingCode || !Number.isFinite(row.account_id)) continue;
      if (!requiredKeys.includes(mappingCode as typeof requiredKeys[number])) continue;
      accountByKey.set(mappingCode, Number(row.account_id));
    }

    for (const row of outletRows) {
      const mappingCode = resolveMappingCode(row);
      if (!mappingCode || !Number.isFinite(row.account_id)) continue;
      if (!requiredKeys.includes(mappingCode as typeof requiredKeys[number])) continue;
      accountByKey.set(mappingCode, Number(row.account_id));
    }

    const missingKeys = requiredKeys.filter((key) => !accountByKey.has(key));
    if (missingKeys.length > 0) {
      throw new Error("OUTLET_ACCOUNT_MAPPING_MISSING");
    }

    const salesReturnsAccountId = accountByKey.get("SALES_RETURNS") ?? accountByKey.get("SALES_REVENUE");
    const salesDiscountsAccountId = accountByKey.get("SALES_DISCOUNTS") ?? accountByKey.get("SALES_REVENUE");

    return {
      SALES_REVENUE: accountByKey.get("SALES_REVENUE") as number,
      AR: accountByKey.get("AR") as number,
      SALES_RETURNS: salesReturnsAccountId as number,
      SALES_DISCOUNTS: salesDiscountsAccountId as number
    };
  }

  async readOutletPaymentMethodMappings(companyId: number, outletId: number): Promise<Map<string, number>> {
    const accountByMethod = new Map<string, number>();

    const outletPaymentRows = await this.db
      .selectFrom("payment_method_mappings")
      .select(["method_code", "account_id", "outlet_id"])
      .where("company_id", "=", companyId)
      .where("outlet_id", "=", outletId)
      .execute();

    for (const row of outletPaymentRows) {
      if (!row.method_code || !Number.isFinite(row.account_id)) continue;
      const methodCode = normalizePaymentMethodCode(String(row.method_code));
      accountByMethod.set(methodCode, Number(row.account_id));
    }

    const companyPaymentRows = await this.db
      .selectFrom("payment_method_mappings")
      .select(["method_code", "account_id", "outlet_id"])
      .where("company_id", "=", companyId)
      .where("outlet_id", "is", null)
      .execute();

    for (const row of companyPaymentRows) {
      if (!row.method_code || !Number.isFinite(row.account_id)) continue;
      const methodCode = normalizePaymentMethodCode(String(row.method_code));
      if (!accountByMethod.has(methodCode)) {
        accountByMethod.set(methodCode, Number(row.account_id));
      }
    }

    const fallbackKeys = ["CASH", "QRIS", "CARD"] as const;
    const fallbackTypeIds = fallbackKeys.map((key) => ACCOUNT_MAPPING_TYPE_ID_BY_CODE[key]);

    const outletMappingRows = await this.db
      .selectFrom("account_mappings")
      .select(["mapping_type_id", "mapping_key", "account_id"])
      .where("company_id", "=", companyId)
      .where("outlet_id", "=", outletId)
      .where((eb) => eb.or([
        eb("mapping_type_id", "in", fallbackTypeIds),
        eb("mapping_key", "in", fallbackKeys)
      ]))
      .execute();

    for (const row of outletMappingRows) {
      const mappingCode = resolveMappingCode(row);
      if (!mappingCode || !Number.isFinite(row.account_id)) continue;
      const methodCode = normalizePaymentMethodCode(mappingCode);
      if (!accountByMethod.has(methodCode)) {
        accountByMethod.set(methodCode, Number(row.account_id));
      }
    }

    const companyMappingRows = await this.db
      .selectFrom("account_mappings")
      .select(["mapping_type_id", "mapping_key", "account_id"])
      .where("company_id", "=", companyId)
      .where("outlet_id", "is", null)
      .where((eb) => eb.or([
        eb("mapping_type_id", "in", fallbackTypeIds),
        eb("mapping_key", "in", fallbackKeys)
      ]))
      .execute();

    for (const row of companyMappingRows) {
      const mappingCode = resolveMappingCode(row);
      if (!mappingCode || !Number.isFinite(row.account_id)) continue;
      const methodCode = normalizePaymentMethodCode(mappingCode);
      if (!accountByMethod.has(methodCode)) {
        accountByMethod.set(methodCode, Number(row.account_id));
      }
    }

    return accountByMethod;
  }

  async readPosPaymentsByMethod(posTransactionId: number): Promise<Array<{ method: string; amount: number }>> {
    const result = await sql<{ method: string | null; amount: number | string }>`
      SELECT method, SUM(amount) AS amount
      FROM pos_transaction_payments
      WHERE pos_transaction_id = ${posTransactionId}
      GROUP BY method
      ORDER BY method ASC
    `.execute(this.db);

    const payments = result.rows.map((row) => ({
      method: String(row.method ?? "").trim(),
      amount: normalizeMoney(Number(row.amount ?? 0))
    })).filter((row) => row.method.length > 0 && row.amount > 0);

    if (payments.length === 0) {
      throw new Error("POS_EMPTY_PAYMENT_SET");
    }

    return payments;
  }

  async readPosGrossSalesAmount(posTransactionId: number): Promise<number> {
    const result = await sql<{ gross_sales: number | string | null }>`
      SELECT SUM(qty * price_snapshot) AS gross_sales
      FROM pos_transaction_items
      WHERE pos_transaction_id = ${posTransactionId}
    `.execute(this.db);

    const grossSales = normalizeMoney(Number(result.rows[0]?.gross_sales ?? 0));
    if (grossSales <= 0) {
      throw new Error("UNBALANCED_JOURNAL");
    }

    return grossSales;
  }

  async readPosDiscount(posTransactionId: number): Promise<{ percent: number; fixed: number; code: string | null }> {
    const result = await sql<{ discount_percent: number | string | null; discount_fixed: number | string | null; discount_code: string | null }>`
      SELECT discount_percent, discount_fixed, discount_code
      FROM pos_transactions
      WHERE id = ${posTransactionId}
    `.execute(this.db);

    const row = result.rows[0];
    if (!row) {
      return { percent: 0, fixed: 0, code: null };
    }

    return {
      percent: normalizeMoney(Number(row.discount_percent ?? 0)),
      fixed: normalizeMoney(Number(row.discount_fixed ?? 0)),
      code: row.discount_code ?? null
    };
  }

  async readPosTaxSummary(
    posTransactionId: number,
    companyId: number
  ): Promise<{
    total: number;
    inclusive: boolean;
    lines: Array<{ tax_rate_id: number; amount: number; code: string; account_id: number | null }>;
  } | null> {
    const result = await sql<{ tax_rate_id: number | null; amount: number | string | null; is_inclusive: number | null; code: string | null; account_id: number | null }>`
      SELECT ptt.tax_rate_id, ptt.amount, tr.is_inclusive, tr.code, tr.account_id
      FROM pos_transaction_taxes ptt
      INNER JOIN tax_rates tr ON tr.id = ptt.tax_rate_id
      WHERE ptt.pos_transaction_id = ${posTransactionId} AND tr.company_id = ${companyId}
    `.execute(this.db);

    const parsed = result.rows.map((row) => ({
      tax_rate_id: Number(row.tax_rate_id),
      amount: normalizeMoney(Number(row.amount ?? 0)),
      is_inclusive: row.is_inclusive === 1,
      code: String(row.code ?? ""),
      account_id: row.account_id ? Number(row.account_id) : null
    })).filter((row) => row.amount > 0);

    if (parsed.length === 0) {
      return null;
    }

    const inclusiveFlag = parsed[0].is_inclusive;
    if (parsed.some((row) => row.is_inclusive !== inclusiveFlag)) {
      throw new Error("MIXED_TAX_INCLUSIVE");
    }

    const total = normalizeMoney(parsed.reduce((acc, row) => acc + row.amount, 0));
    return {
      total,
      inclusive: inclusiveFlag,
      lines: parsed
    };
  }

  async readCompanyPosTaxConfig(companyId: number): Promise<{ rate: number; inclusive: boolean } | null> {
    const defaults = await this.listCompanyDefaultTaxRates(companyId);
    return resolveCombinedTaxConfig(defaults);
  }

  async listCompanyDefaultTaxRates(companyId: number): Promise<
    Array<{
      id: number;
      code: string;
      rate_percent: number;
      account_id: number | null;
      is_inclusive: boolean;
    }>
  > {
    const result = await sql<{
      id: number;
      company_id: number;
      code: string;
      name: string;
      rate_percent: number;
      account_id: number | null;
      is_inclusive: number;
      is_active: number;
    }>`
      SELECT tr.id, tr.company_id, tr.code, tr.name, tr.rate_percent, tr.account_id, tr.is_inclusive, tr.is_active
      FROM company_tax_defaults ctd
      INNER JOIN tax_rates tr
        ON tr.id = ctd.tax_rate_id
        AND tr.company_id = ctd.company_id
      WHERE ctd.company_id = ${companyId}
        AND tr.company_id = ${companyId}
        AND tr.is_active = 1
      ORDER BY tr.name ASC, tr.id ASC
    `.execute(this.db);

    return result.rows.map((row) => ({
      id: Number(row.id),
      code: String(row.code),
      rate_percent: normalizeMoney(Number(row.rate_percent)),
      account_id: row.account_id ? Number(row.account_id) : null,
      is_inclusive: row.is_inclusive === 1
    }));
  }

  async ensureDateWithinOpenFiscalYear(db: KyselySchema, companyId: number, date: string): Promise<void> {
    const result = await sql<{ id: number }>`
      SELECT id FROM fiscal_years
      WHERE company_id = ${companyId}
        AND status = 'OPEN'
        AND start_date <= ${date}
        AND end_date >= ${date}
      LIMIT 1
    `.execute(db);

    if (result.rows.length === 0) {
      throw new Error("Date is outside any open fiscal year");
    }
  }
}

function resolveCombinedTaxConfig(
  defaultRates: Array<{ rate_percent: number; is_inclusive: boolean }>
): { rate: number; inclusive: boolean } | null {
  if (defaultRates.length === 0) {
    return null;
  }

  const totalRate = defaultRates.reduce((sum, tr) => sum + tr.rate_percent, 0);
  const isInclusive = defaultRates.every((tr) => tr.is_inclusive);

  return {
    rate: normalizeMoney(totalRate),
    inclusive: isInclusive
  };
}
