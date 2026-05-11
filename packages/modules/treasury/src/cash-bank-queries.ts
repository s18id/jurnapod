// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Cash-bank aggregation query helpers.
 *
 * Provides read-only aggregation functions for cash_bank_transactions.
 * These functions use Kysely raw sql for type-safe parameterized queries
 * and follow the same pattern as test fixtures (take a KyselySchema instance).
 *
 * Aggregation rules (canonical treasury computation):
 * - Inflows:  TOP_UP + MUTATION transactions contribute positively
 * - Outflows: WITHDRAWAL transactions contribute negatively
 * - Balance:  net of all POSTED transactions (inflows - outflows)
 * - FOREX:    treated as positive (same as TOP_UP/MUTATION)
 * - Status:   only POSTED transactions are counted (VOID/DRAFT excluded)
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

// ---------------------------------------------------------------------------
// Balance query options
// ---------------------------------------------------------------------------

export interface CashBalanceOptions {
  /**
   * Inclusive upper bound on transaction_date (<= dateTo).
   * Omit for no upper bound.
   */
  dateTo?: string;

  /**
   * Exclusive upper bound on transaction_date (< dateToExclusive).
   * Used for "before period" opening balance queries.
   * Mutually exclusive with dateTo — if both provided, dateToExclusive takes precedence.
   */
  dateToExclusive?: string;

  /**
   * Inclusive lower bound on transaction_date (>= dateFrom).
   * Omit for no lower bound.
   */
  dateFrom?: string;

  /**
   * Transaction status filter. Default: 'POSTED'.
   */
  status?: string;
}

// ---------------------------------------------------------------------------
// getCashBalance — net balance with WITHDRAWAL as negative
// ---------------------------------------------------------------------------

/**
 * Get the net cash-bank balance for a company.
 *
 * Computes SUM(CASE WHEN WITHDRAWAL THEN -amount ELSE amount END)
 * for all matching POSTED cash_bank_transactions.
 *
 * @param db        - Kysely database instance
 * @param companyId - Tenant ID
 * @param opts      - Optional date range and status filters
 * @returns Net balance as a number (DECIMAL(18,2) precision)
 */
export async function getCashBalance(
  db: KyselySchema,
  companyId: number,
  opts?: CashBalanceOptions,
): Promise<number> {
  const status = opts?.status ?? "POSTED";

  const result = await sql<{ total: string | null }>`
    SELECT CAST(COALESCE(SUM(
      CASE WHEN transaction_type = 'WITHDRAWAL' THEN -amount ELSE amount END
    ), 0) AS DECIMAL(18,2)) AS total
    FROM cash_bank_transactions
    WHERE company_id = ${companyId}
      AND status = ${status}
      ${
        opts?.dateToExclusive !== undefined
          ? sql`AND transaction_date < ${opts.dateToExclusive}`
          : opts?.dateTo !== undefined
            ? sql`AND transaction_date <= ${opts.dateTo}`
            : sql``
      }
      ${opts?.dateFrom !== undefined ? sql`AND transaction_date >= ${opts.dateFrom}` : sql``}
  `.execute(db);

  return Number(result.rows[0]?.total ?? "0");
}

// ---------------------------------------------------------------------------
// getCashInflows — period inflows (TOP_UP + MUTATION)
// ---------------------------------------------------------------------------

/**
 * Get total cash inflows for a date range.
 *
 * Sums amount for all POSTED TOP_UP and MUTATION transactions
 * within the given date range (inclusive on both ends).
 *
 * @param db        - Kysely database instance
 * @param companyId - Tenant ID
 * @param dateFrom  - Inclusive start date (YYYY-MM-DD)
 * @param dateTo    - Inclusive end date (YYYY-MM-DD)
 * @returns Total inflows as a number (DECIMAL(18,2) precision)
 */
export async function getCashInflows(
  db: KyselySchema,
  companyId: number,
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  const result = await sql<{ inflows: string | null }>`
    SELECT CAST(COALESCE(SUM(amount), 0) AS DECIMAL(18,2)) AS inflows
    FROM cash_bank_transactions
    WHERE company_id = ${companyId}
      AND transaction_type IN ('TOP_UP', 'MUTATION')
      AND status = 'POSTED'
      AND transaction_date >= ${dateFrom}
      AND transaction_date <= ${dateTo}
  `.execute(db);

  return Number(result.rows[0]?.inflows ?? "0");
}

// ---------------------------------------------------------------------------
// getCashOutflows — period outflows (WITHDRAWAL)
// ---------------------------------------------------------------------------

/**
 * Get total cash outflows for a date range.
 *
 * Sums amount for all POSTED WITHDRAWAL transactions
 * within the given date range (inclusive on both ends).
 *
 * @param db        - Kysely database instance
 * @param companyId - Tenant ID
 * @param dateFrom  - Inclusive start date (YYYY-MM-DD)
 * @param dateTo    - Inclusive end date (YYYY-MM-DD)
 * @returns Total outflows as a number (DECIMAL(18,2) precision)
 */
export async function getCashOutflows(
  db: KyselySchema,
  companyId: number,
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  const result = await sql<{ outflows: string | null }>`
    SELECT CAST(COALESCE(SUM(amount), 0) AS DECIMAL(18,2)) AS outflows
    FROM cash_bank_transactions
    WHERE company_id = ${companyId}
      AND transaction_type = 'WITHDRAWAL'
      AND status = 'POSTED'
      AND transaction_date >= ${dateFrom}
      AND transaction_date <= ${dateTo}
  `.execute(db);

  return Number(result.rows[0]?.outflows ?? "0");
}
