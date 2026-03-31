// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { KyselySchema } from "@jurnapod/db";

export type TaxRateQueryResult = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  rate_percent: number;
  is_inclusive: boolean;
  account_id: number | null;
  is_active: boolean;
  updated_at: string;
};

/**
 * Get all active tax rates for a company.
 */
export async function getTaxRatesForSync(db: KyselySchema, companyId: number): Promise<TaxRateQueryResult[]> {
  const result = await db
    .selectFrom('tax_rates')
    .select(['id', 'company_id', 'code', 'name', 'rate_percent', 'is_inclusive', 'account_id', 'is_active', 'updated_at'])
    .where('company_id', '=', companyId)
    .where('is_active', '=', 1)
    .orderBy('code')
    .execute();
  
  return result.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: row.code,
    name: row.name,
    rate_percent: Number(row.rate_percent),
    is_inclusive: row.is_inclusive === 1,
    account_id: row.account_id == null ? null : Number(row.account_id),
    is_active: row.is_active === 1,
    updated_at: row.updated_at.toISOString()
  }));
}

/**
 * Get tax rates changed since a specific version for incremental sync.
 */
export async function getTaxRatesChangedSince(
  db: KyselySchema,
  companyId: number,
  updatedSince: string
): Promise<TaxRateQueryResult[]> {
  const result = await db
    .selectFrom('tax_rates')
    .select(['id', 'company_id', 'code', 'name', 'rate_percent', 'is_inclusive', 'account_id', 'is_active', 'updated_at'])
    .where('company_id', '=', companyId)
    .where('updated_at', '>=', updatedSince as any)
    .orderBy('code')
    .execute();
  
  return result.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: row.code,
    name: row.name,
    rate_percent: Number(row.rate_percent),
    is_inclusive: row.is_inclusive === 1,
    account_id: row.account_id == null ? null : Number(row.account_id),
    is_active: row.is_active === 1,
    updated_at: row.updated_at.toISOString()
  }));
}

/**
 * Get default tax rate IDs for a company.
 */
export async function getDefaultTaxRateIds(db: KyselySchema, companyId: number): Promise<number[]> {
  const result = await db
    .selectFrom('company_tax_defaults')
    .select(['tax_rate_id'])
    .where('company_id', '=', companyId)
    .execute();
  
  return result.map((row) => Number(row.tax_rate_id));
}
