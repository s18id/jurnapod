// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Exchange rate service for purchasing module.
 *
 * Provides exchange rate CRUD operations with date-based lookup semantics.
 */

import type { KyselySchema } from "@jurnapod/db";
import { toUtcIso } from "@jurnapod/shared";
import type {
  ExchangeRate,
  ExchangeRateRow,
  ListExchangeRatesParams,
  ListExchangeRatesResult,
  GetExchangeRateByIdParams,
  CreateExchangeRateInput,
  UpdateExchangeRateInput,
  ExchangeRateLookupParams,
  ExchangeRateLookupResult,
} from "../types/exchange-rate.js";

// =============================================================================
// Helpers
// =============================================================================

function mapExchangeRate(row: ExchangeRateRow): ExchangeRate {
  return {
    id: row.id,
    company_id: row.company_id,
    currency_code: row.currency_code,
    rate: String(row.rate),
    effective_date: toUtcIso.dateLike(row.effective_date) as string,
    notes: row.notes,
    is_active: Boolean(row.is_active),
    created_by_user_id: row.created_by_user_id,
    updated_by_user_id: row.updated_by_user_id,
    created_at: toUtcIso.dateLike(row.created_at) as string,
    updated_at: toUtcIso.dateLike(row.updated_at) as string,
  };
}

// =============================================================================
// Service
// =============================================================================

export class ExchangeRateService {
  constructor(private readonly db: KyselySchema) {}

  async listRates(params: ListExchangeRatesParams): Promise<ListExchangeRatesResult> {
    const countResult = await this.db
      .selectFrom("exchange_rates")
      .where((eb) => {
        const preds = [eb("company_id", "=", params.companyId)];
        if (params.currencyCode) {
          preds.push(eb("currency_code", "=", params.currencyCode));
        }
        if (params.isActive !== undefined) {
          preds.push(eb("is_active", "=", params.isActive ? 1 : 0));
        }
        return eb.and(preds);
      })
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirst();

    let listQuery = this.db
      .selectFrom("exchange_rates")
      .where("company_id", "=", params.companyId);

    if (params.currencyCode) {
      listQuery = listQuery.where("currency_code", "=", params.currencyCode);
    }
    if (params.isActive !== undefined) {
      listQuery = listQuery.where("is_active", "=", params.isActive ? 1 : 0);
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
      .limit(params.limit)
      .offset(params.offset)
      .execute();

    return {
      exchange_rates: rows.map((r) => mapExchangeRate(r as ExchangeRateRow)),
      total: Number((countResult as { count?: string })?.count ?? 0),
      limit: params.limit,
      offset: params.offset,
    };
  }

  async getRateById(params: GetExchangeRateByIdParams): Promise<ExchangeRate | null> {
    const rate = await this.db
      .selectFrom("exchange_rates")
      .where("id", "=", params.rateId)
      .where("company_id", "=", params.companyId)
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

    return rate ? mapExchangeRate(rate as ExchangeRateRow) : null;
  }

  async createRate(input: CreateExchangeRateInput): Promise<ExchangeRate> {
    const insertResult = await this.db
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

    const created = await this.getRateById({ companyId: input.companyId, rateId: insertedId });
    if (!created) {
      throw new Error("Failed to load created exchange rate");
    }
    return created;
  }

  async updateRate(input: UpdateExchangeRateInput): Promise<ExchangeRate | null> {
    const existing = await this.db
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

    await this.db
      .updateTable("exchange_rates")
      .set(updateValues)
      .where("id", "=", input.rateId)
      .where("company_id", "=", input.companyId)
      .executeTakeFirst();

    return this.getRateById({ companyId: input.companyId, rateId: input.rateId });
  }

  /**
   * Get the most recent exchange rate for a currency on or before a given date.
   *
   * @param params - Lookup parameters
   * @returns The exchange rate record, or null if not found
   */
  async getRate(params: ExchangeRateLookupParams): Promise<ExchangeRateLookupResult | null> {
    const rate = await this.db
      .selectFrom("exchange_rates")
      .where("company_id", "=", params.companyId)
      .where("currency_code", "=", params.currencyCode)
      .where("effective_date", "<=", params.date)
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
          effective_date: new Date(rate.effective_date),
        }
      : null;
  }
}
