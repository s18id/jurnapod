// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { Pool, PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { getDbPool } from "./db";

export type TaxRateRecord = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  rate_percent: number;
  is_inclusive: boolean;
  is_active: boolean;
};

type QueryExecutor = {
  execute: PoolConnection["execute"] | Pool["execute"];
};

function normalizeMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeRate(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

type TaxRateRow = RowDataPacket & {
  id: number;
  company_id: number;
  code: string;
  name: string;
  rate_percent: number | string;
  is_inclusive: number;
  is_active: number;
};

export async function listCompanyTaxRates(
  executor: QueryExecutor,
  companyId: number
): Promise<TaxRateRecord[]> {
  const [rows] = await executor.execute<TaxRateRow[]>(
    `SELECT id, company_id, code, name, rate_percent, is_inclusive, is_active
     FROM tax_rates
     WHERE company_id = ?
     ORDER BY name ASC, id ASC`,
    [companyId]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: String(row.code),
    name: String(row.name),
    rate_percent: normalizeRate(row.rate_percent),
    is_inclusive: row.is_inclusive === 1,
    is_active: row.is_active === 1
  }));
}

export async function listCompanyDefaultTaxRateIds(
  executor: QueryExecutor,
  companyId: number
): Promise<number[]> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT tax_rate_id
     FROM company_tax_defaults
     WHERE company_id = ?
     ORDER BY tax_rate_id ASC`,
    [companyId]
  );

  return (rows as Array<{ tax_rate_id?: number }>).map((row) => Number(row.tax_rate_id)).filter((id) => id > 0);
}

export async function listCompanyDefaultTaxRates(
  executor: QueryExecutor,
  companyId: number
): Promise<TaxRateRecord[]> {
  const [rows] = await executor.execute<TaxRateRow[]>(
    `SELECT tr.id, tr.company_id, tr.code, tr.name, tr.rate_percent, tr.is_inclusive, tr.is_active
     FROM company_tax_defaults ctd
     INNER JOIN tax_rates tr ON tr.id = ctd.tax_rate_id
     WHERE ctd.company_id = ?
       AND tr.is_active = 1
     ORDER BY tr.name ASC, tr.id ASC`,
    [companyId]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: String(row.code),
    name: String(row.name),
    rate_percent: normalizeRate(row.rate_percent),
    is_inclusive: row.is_inclusive === 1,
    is_active: row.is_active === 1
  }));
}

export function resolveCombinedTaxConfig(
  rates: TaxRateRecord[]
): { rate: number; inclusive: boolean } {
  if (rates.length === 0) {
    return { rate: 0, inclusive: false };
  }

  const inclusive = rates[0].is_inclusive;
  const rate = rates.reduce((acc, item) => acc + normalizeRate(item.rate_percent), 0);
  return {
    rate: normalizeMoney(rate),
    inclusive
  };
}

export function calculateTaxLines(params: {
  grossAmount: number;
  rates: TaxRateRecord[];
}): Array<{ tax_rate_id: number; amount: number }> {
  const { grossAmount, rates } = params;
  if (rates.length === 0) {
    return [];
  }

  const inclusive = rates[0].is_inclusive;
  const totalRate = rates.reduce((acc, rate) => acc + normalizeRate(rate.rate_percent), 0);
  if (totalRate <= 0) {
    return rates.map((rate) => ({ tax_rate_id: rate.id, amount: 0 }));
  }

  const baseAmount = inclusive
    ? normalizeMoney(grossAmount / (1 + totalRate / 100))
    : normalizeMoney(grossAmount);

  const rawAmounts = rates.map((rate) =>
    normalizeMoney(baseAmount * (normalizeRate(rate.rate_percent) / 100))
  );

  const totalRaw = normalizeMoney(rawAmounts.reduce((acc, amount) => acc + amount, 0));
  const expectedTotal = inclusive
    ? normalizeMoney(grossAmount - baseAmount)
    : normalizeMoney(grossAmount * (totalRate / 100));
  const adjustment = normalizeMoney(expectedTotal - totalRaw);

  const adjusted = rawAmounts.slice();
  if (adjusted.length > 0 && adjustment !== 0) {
    adjusted[adjusted.length - 1] = normalizeMoney(adjusted[adjusted.length - 1] + adjustment);
  }

  return rates.map((rate, index) => ({
    tax_rate_id: rate.id,
    amount: adjusted[index]
  }));
}

export async function withTaxExecutor<T>(
  executor: QueryExecutor | null,
  operation: (executor: QueryExecutor) => Promise<T>
): Promise<T> {
  if (executor) {
    return operation(executor);
  }

  const pool = getDbPool();
  return operation(pool);
}
