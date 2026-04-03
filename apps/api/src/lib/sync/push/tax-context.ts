// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Tax Context Builder
 *
 * Builds the tax context needed for sync push processing.
 * These functions have zero HTTP knowledge.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@/lib/db";
import type { SyncPushTaxContext } from "./types.js";
import type { TaxRateRecord } from "../../../lib/taxes.js";

interface TaxRateRow {
  id: number;
  company_id: number;
  code: string;
  name: string;
  rate_percent: number;
  account_id: number | null;
  is_inclusive: number;
  is_active: number;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Build tax context for sync push processing.
 * 
 * Queries default tax rates and all active tax rates for a company.
 * 
 * @param db - Kysely database instance
 * @param companyId - Company ID for tenant isolation
 * @returns Tax context with default rates and rate lookup map
 */
export async function buildSyncPushTaxContext(
  db: KyselySchema,
  companyId: number
): Promise<SyncPushTaxContext> {
  // Get default tax rates for the company
  const defaultTaxRatesResult = await sql`
    SELECT tr.id, tr.company_id, tr.code, tr.name, tr.rate_percent, tr.account_id, 
           tr.is_inclusive, tr.is_active, tr.created_by_user_id, tr.updated_by_user_id,
           tr.created_at, tr.updated_at
    FROM tax_rates tr
    INNER JOIN company_tax_defaults ctd ON ctd.tax_rate_id = tr.id
    WHERE ctd.company_id = ${companyId}
      AND tr.is_active = 1
  `.execute(db);

  // Get all tax rates for the company
  const allTaxRatesResult = await sql`
    SELECT id, company_id, code, name, rate_percent, account_id, 
           is_inclusive, is_active, created_by_user_id, updated_by_user_id,
           created_at, updated_at
    FROM tax_rates
    WHERE company_id = ${companyId}
      AND is_active = 1
  `.execute(db);

  const defaultTaxRates: TaxRateRecord[] = (defaultTaxRatesResult.rows as TaxRateRow[]).map(row => ({
    id: row.id,
    company_id: row.company_id,
    code: row.code,
    name: row.name,
    rate_percent: Number(row.rate_percent),
    account_id: row.account_id,
    is_inclusive: row.is_inclusive === 1,
    is_active: row.is_active === 1,
    created_by_user_id: row.created_by_user_id,
    updated_by_user_id: row.updated_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));

  const allTaxRates: TaxRateRecord[] = (allTaxRatesResult.rows as TaxRateRow[]).map(row => ({
    id: row.id,
    company_id: row.company_id,
    code: row.code,
    name: row.name,
    rate_percent: Number(row.rate_percent),
    account_id: row.account_id,
    is_inclusive: row.is_inclusive === 1,
    is_active: row.is_active === 1,
    created_by_user_id: row.created_by_user_id,
    updated_by_user_id: row.updated_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));

  return {
    defaultTaxRates,
    taxRateById: new Map(allTaxRates.map(rate => [rate.id, rate]))
  };
}
