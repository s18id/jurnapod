// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Exchange rate types for purchasing module.
 */

export interface ExchangeRateRow {
  id: number;
  company_id: number;
  currency_code: string;
  rate: string;
  effective_date: Date;
  notes: string | null;
  is_active: number;
  created_by_user_id: number;
  updated_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface ExchangeRate {
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

export interface ListExchangeRatesParams {
  companyId: number;
  currencyCode?: string;
  isActive?: boolean;
  limit: number;
  offset: number;
}

export interface ListExchangeRatesResult {
  exchange_rates: ExchangeRate[];
  total: number;
  limit: number;
  offset: number;
}

export interface GetExchangeRateByIdParams {
  companyId: number;
  rateId: number;
}

export interface CreateExchangeRateInput {
  companyId: number;
  currencyCode: string;
  rate: string;
  effectiveDate: Date;
  notes?: string;
  userId: number;
}

export interface UpdateExchangeRateInput {
  companyId: number;
  rateId: number;
  rate?: string;
  effectiveDate?: Date;
  notes?: string;
  isActive?: boolean;
  userId: number;
}

export interface ExchangeRateLookupParams {
  companyId: number;
  currencyCode: string;
  date: Date;
}

export interface ExchangeRateLookupResult {
  currency_code: string;
  rate: string;
  effective_date: Date;
}
