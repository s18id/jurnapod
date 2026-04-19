// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Exchange Rate Utility Functions
 *
 * Provides exchange rate lookup functionality for the purchasing module.
 * The most recent rate on or before a given date is returned.
 */

import { getDb } from "../db.js";
import type { KyselySchema } from "@jurnapod/db";

/**
 * Lookup result shape (internal - not a shared type)
 */
export interface LookupResult {
  currency_code: string;
  rate: string;
  effective_date: Date;
}

/**
 * Get the most recent exchange rate for a currency on or before a given date.
 *
 * @param companyId - Company ID
 * @param currencyCode - ISO 4217 currency code (e.g., "USD", "EUR")
 * @param date - Date to lookup rate for
 * @returns The exchange rate record, or null if not found
 */
export async function getExchangeRate(
  companyId: number,
  currencyCode: string,
  date: Date
): Promise<LookupResult | null> {
  const db = getDb() as KyselySchema;

  const rate = await db
    .selectFrom("exchange_rates")
    .where("company_id", "=", companyId)
    .where("currency_code", "=", currencyCode)
    .where("effective_date", "<=", date)
    .where("is_active", "=", 1)
    .orderBy("effective_date", "desc")
    .orderBy("created_at", "desc")
    .limit(1)
    .select(["currency_code", "rate", "effective_date"])
    .executeTakeFirst();

  return rate
    ? {
        currency_code: rate.currency_code,
        rate: String(rate.rate),
        effective_date: new Date(rate.effective_date)
      }
    : null;
}