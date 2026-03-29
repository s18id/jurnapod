// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { DbConn } from "@jurnapod/db";
import type { RowDataPacket } from "mysql2";

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
export async function getTaxRatesForSync(db: DbConn, companyId: number): Promise<TaxRateQueryResult[]> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT id, company_id, code, name, rate_percent, is_inclusive, account_id, is_active, updated_at
     FROM tax_rates 
     WHERE company_id = ? AND is_active = 1
     ORDER BY code ASC`,
    [companyId]
  );
  
  return rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: row.code,
    name: row.name,
    rate_percent: Number(row.rate_percent),
    is_inclusive: row.is_inclusive === 1,
    account_id: row.account_id == null ? null : Number(row.account_id),
    is_active: row.is_active === 1,
    updated_at: row.updated_at
  }));
}

/**
 * Get tax rates changed since a specific version for incremental sync.
 */
export async function getTaxRatesChangedSince(
  db: DbConn,
  companyId: number,
  updatedSince: string
): Promise<TaxRateQueryResult[]> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT id, company_id, code, name, rate_percent, is_inclusive, account_id, is_active, updated_at
     FROM tax_rates 
     WHERE company_id = ? AND updated_at >= ?
     ORDER BY code ASC`,
    [companyId, updatedSince]
  );
  
  return rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: row.code,
    name: row.name,
    rate_percent: Number(row.rate_percent),
    is_inclusive: row.is_inclusive === 1,
    account_id: row.account_id == null ? null : Number(row.account_id),
    is_active: row.is_active === 1,
    updated_at: row.updated_at
  }));
}

/**
 * Get default tax rate IDs for a company.
 */
export async function getDefaultTaxRateIds(db: DbConn, companyId: number): Promise<number[]> {
  const rows = await db.queryAll<RowDataPacket & { tax_rate_id: number }>(
    `SELECT tax_rate_id FROM company_tax_defaults WHERE company_id = ?`,
    [companyId]
  );
  
  return rows.map((row) => Number(row.tax_rate_id));
}
