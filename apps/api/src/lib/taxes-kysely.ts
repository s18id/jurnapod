// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Kysely-based Tax Rate Functions
 * 
 * Library-first pattern: These functions handle database access internally
 * using Kysely, without requiring external pool/executor injection.
 */

import { getDb } from "./db.js";

import type { TaxRateRecord } from "./taxes.js";
export { TaxRateNotFoundError, TaxRateConflictError, TaxRateValidationError, TaxRateReferenceError } from "./taxes.js";

// Re-export from taxes for functions that already work
export { createTaxRate, updateTaxRate, deleteTaxRate, listTaxRates } from "./taxes.js";

/**
 * Normalize a tax rate row to TaxRateRecord format
 */
function normalizeTaxRateRow(row: {
  id: number;
  company_id: number;
  code: string;
  name: string;
  rate_percent: number | string;
  account_id: number | null;
  is_inclusive: number;
  is_active: number;
}): TaxRateRecord {
  const normalizeRate = (value: number | string): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };

  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: String(row.code),
    name: String(row.name),
    rate_percent: normalizeRate(row.rate_percent),
    account_id: row.account_id ? Number(row.account_id) : null,
    is_inclusive: row.is_inclusive === 1,
    is_active: row.is_active === 1
  };
}

/**
 * List all tax rates for a company (Kysely-based, no executor needed)
 */
export async function listCompanyTaxRatesKysely(
  companyId: number
): Promise<TaxRateRecord[]> {
  const db = getDb();

  const rows = await db
    .selectFrom('tax_rates')
    .where('company_id', '=', companyId)
    .select([
      'id',
      'company_id',
      'code',
      'name',
      'rate_percent',
      'account_id',
      'is_inclusive',
      'is_active'
    ])
    .orderBy('name', 'asc')
    .orderBy('id', 'asc')
    .execute();

  return rows.map(normalizeTaxRateRow);
}

/**
 * List default tax rate IDs for a company (Kysely-based, no executor needed)
 */
export async function listCompanyDefaultTaxRateIdsKysely(
  companyId: number
): Promise<number[]> {
  const db = getDb();

  const rows = await db
    .selectFrom('company_tax_defaults')
    .where('company_id', '=', companyId)
    .select(['tax_rate_id'])
    .orderBy('tax_rate_id', 'asc')
    .execute();

  return rows.map((row) => Number(row.tax_rate_id)).filter((id) => id > 0);
}

/**
 * List default tax rates for a company (Kysely-based, no executor needed)
 */
export async function listCompanyDefaultTaxRatesKysely(
  companyId: number
): Promise<TaxRateRecord[]> {
  const db = getDb();

  const rows = await db
    .selectFrom('company_tax_defaults as ctd')
    .innerJoin('tax_rates as tr', 'tr.id', 'ctd.tax_rate_id')
    .where('ctd.company_id', '=', companyId)
    .where('tr.company_id', '=', companyId)
    .where('tr.is_active', '=', 1)
    .select([
      'tr.id',
      'tr.company_id',
      'tr.code',
      'tr.name',
      'tr.rate_percent',
      'tr.account_id',
      'tr.is_inclusive',
      'tr.is_active'
    ])
    .orderBy('tr.name', 'asc')
    .orderBy('tr.id', 'asc')
    .execute();

  return rows.map(normalizeTaxRateRow);
}

/**
 * Set default tax rates for a company (Kysely-based, no executor needed)
 */
export async function setCompanyDefaultTaxRatesKysely(
  companyId: number,
  taxRateIds: number[],
  userId: number
): Promise<number[]> {
  const db = getDb();

  // Delete existing defaults
  await db
    .deleteFrom('company_tax_defaults')
    .where('company_id', '=', companyId)
    .execute();

  // Insert new defaults
  for (const taxRateId of taxRateIds) {
    await db
      .insertInto('company_tax_defaults')
      .values({
        company_id: companyId,
        tax_rate_id: taxRateId,
        created_by_user_id: userId,
        updated_by_user_id: userId
      })
      .execute();
  }

  // Return the updated default tax rate IDs
  return listCompanyDefaultTaxRateIdsKysely(companyId);
}
