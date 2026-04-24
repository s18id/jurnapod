// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Exchange rate API adapter.
 *
 * Delegates to @jurnapod/modules-purchasing services.
 * This file is a thin adapter — all business logic lives in the package.
 */

import { getDb } from "../db.js";
import { ExchangeRateService } from "@jurnapod/modules-purchasing";
import type {
  ListExchangeRatesParams,
  GetExchangeRateByIdParams,
  CreateExchangeRateInput,
  UpdateExchangeRateInput,
  ExchangeRateLookupParams,
  ExchangeRate,
} from "@jurnapod/modules-purchasing";

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

function toApiRate(rate: ExchangeRate): ExchangeRateResponse {
  return {
    id: rate.id,
    company_id: rate.company_id,
    currency_code: rate.currency_code,
    rate: rate.rate,
    effective_date: rate.effective_date,
    notes: rate.notes,
    is_active: rate.is_active,
    created_by_user_id: rate.created_by_user_id,
    updated_by_user_id: rate.updated_by_user_id,
    created_at: rate.created_at,
    updated_at: rate.updated_at,
  };
}

export async function listExchangeRates(input: {
  companyId: number;
  currencyCode?: string;
  isActive?: boolean;
  limit: number;
  offset: number;
}): Promise<{ exchange_rates: ExchangeRateResponse[]; total: number; limit: number; offset: number }> {
  const db = getDb();
  const service = new ExchangeRateService(db);

  const result = await service.listRates(input as ListExchangeRatesParams);

  return {
    exchange_rates: result.exchange_rates.map(toApiRate),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  };
}

export async function getExchangeRateById(companyId: number, rateId: number): Promise<ExchangeRateResponse | null> {
  const db = getDb();
  const service = new ExchangeRateService(db);

  const rate = await service.getRateById({ companyId, rateId } as GetExchangeRateByIdParams);
  return rate ? toApiRate(rate) : null;
}

export async function createExchangeRate(input: {
  companyId: number;
  currencyCode: string;
  rate: string;
  effectiveDate: Date;
  notes?: string;
  userId: number;
}): Promise<ExchangeRateResponse> {
  const db = getDb();
  const service = new ExchangeRateService(db);

  const rate = await service.createRate(input as CreateExchangeRateInput);
  return toApiRate(rate);
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
  const db = getDb();
  const service = new ExchangeRateService(db);

  const rate = await service.updateRate(input as UpdateExchangeRateInput);
  return rate ? toApiRate(rate) : null;
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
  const db = getDb();
  const service = new ExchangeRateService(db);

  return service.getRate({ companyId, currencyCode, date } as ExchangeRateLookupParams);
}
