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

export interface ExchangeRateResponse {
  id: number;
  company_id: number;
  currency_code: string;
  rate: string;
  effective_date: string;
  notes: string | null;
  is_active: boolean;
  created_by_user_id: number;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

function toIso(value: Date | string | null): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value == null) {
    return new Date(0).toISOString();
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function mapExchangeRate(row: {
  id: number;
  company_id: number;
  currency_code: string;
  rate: unknown;
  effective_date: Date | string;
  notes: string | null;
  is_active: number;
  created_by_user_id: number;
  updated_by_user_id: number | null;
  created_at: Date | string;
  updated_at: Date | string;
}): ExchangeRateResponse {
  return {
    id: row.id,
    company_id: row.company_id,
    currency_code: row.currency_code,
    rate: String(row.rate),
    effective_date: toIso(row.effective_date),
    notes: row.notes,
    is_active: Boolean(row.is_active),
    created_by_user_id: row.created_by_user_id,
    updated_by_user_id: row.updated_by_user_id,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

export async function listExchangeRates(input: {
  companyId: number;
  currencyCode?: string;
  isActive?: boolean;
  limit: number;
  offset: number;
}): Promise<{ exchange_rates: ExchangeRateResponse[]; total: number; limit: number; offset: number }> {
  const db = getDb() as KyselySchema;

  const countResult = await db
    .selectFrom("exchange_rates")
    .where((eb) => {
      const preds = [eb("company_id", "=", input.companyId)];
      if (input.currencyCode) {
        preds.push(eb("currency_code", "=", input.currencyCode));
      }
      if (input.isActive !== undefined) {
        preds.push(eb("is_active", "=", input.isActive ? 1 : 0));
      }
      return eb.and(preds);
    })
    .select((eb) => eb.fn.countAll().as("count"))
    .executeTakeFirst();

  let listQuery = db
    .selectFrom("exchange_rates")
    .where("company_id", "=", input.companyId);

  if (input.currencyCode) {
    listQuery = listQuery.where("currency_code", "=", input.currencyCode);
  }
  if (input.isActive !== undefined) {
    listQuery = listQuery.where("is_active", "=", input.isActive ? 1 : 0);
  }

  const rows = await listQuery
    .select([
      "id",
      "company_id",
      "currency_code",
      "rate",
      "effective_date",
      "notes",
      "is_active",
      "created_by_user_id",
      "updated_by_user_id",
      "created_at",
      "updated_at",
    ])
    .orderBy("effective_date", "desc")
    .orderBy("created_at", "desc")
    .limit(input.limit)
    .offset(input.offset)
    .execute();

  return {
    exchange_rates: rows.map((r) => mapExchangeRate(r as never)),
    total: Number((countResult as { count?: string })?.count ?? 0),
    limit: input.limit,
    offset: input.offset,
  };
}

export async function getExchangeRateById(companyId: number, rateId: number): Promise<ExchangeRateResponse | null> {
  const db = getDb() as KyselySchema;

  const rate = await db
    .selectFrom("exchange_rates")
    .where("id", "=", rateId)
    .where("company_id", "=", companyId)
    .select([
      "id",
      "company_id",
      "currency_code",
      "rate",
      "effective_date",
      "notes",
      "is_active",
      "created_by_user_id",
      "updated_by_user_id",
      "created_at",
      "updated_at",
    ])
    .executeTakeFirst();

  return rate ? mapExchangeRate(rate as never) : null;
}

export async function createExchangeRate(input: {
  companyId: number;
  currencyCode: string;
  rate: string;
  effectiveDate: Date;
  notes?: string;
  userId: number;
}): Promise<ExchangeRateResponse> {
  const db = getDb() as KyselySchema;

  const insertResult = await db
    .insertInto("exchange_rates")
    .values({
      company_id: input.companyId,
      currency_code: input.currencyCode,
      rate: input.rate,
      effective_date: input.effectiveDate,
      notes: input.notes ?? null,
      is_active: 1,
      created_by_user_id: input.userId,
    })
    .executeTakeFirst();

  const insertedId = Number(insertResult.insertId);
  if (!insertedId) {
    throw new Error("Failed to create exchange rate");
  }

  const created = await getExchangeRateById(input.companyId, insertedId);
  if (!created) {
    throw new Error("Failed to load created exchange rate");
  }
  return created;
}

export async function updateExchangeRate(input: {
  companyId: number;
  rateId: number;
  rate?: string;
  effectiveDate?: Date;
  notes?: string;
  isActive?: boolean;
  userId: number;
}): Promise<ExchangeRateResponse | null> {
  const db = getDb() as KyselySchema;

  const existing = await db
    .selectFrom("exchange_rates")
    .where("id", "=", input.rateId)
    .where("company_id", "=", input.companyId)
    .select(["id"])
    .executeTakeFirst();

  if (!existing) {
    return null;
  }

  const updateValues: Record<string, unknown> = {
    updated_by_user_id: input.userId,
  };

  if (input.rate !== undefined) updateValues.rate = input.rate;
  if (input.effectiveDate !== undefined) updateValues.effective_date = input.effectiveDate;
  if (input.notes !== undefined) updateValues.notes = input.notes;
  if (input.isActive !== undefined) updateValues.is_active = input.isActive ? 1 : 0;

  await db
    .updateTable("exchange_rates")
    .set(updateValues)
    .where("id", "=", input.rateId)
    .where("company_id", "=", input.companyId)
    .executeTakeFirst();

  return getExchangeRateById(input.companyId, input.rateId);
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
