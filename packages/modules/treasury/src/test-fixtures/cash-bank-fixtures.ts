// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Cash/Bank transaction test fixtures.
 *
 * Provides a canonical `createTestCashBankTransaction` fixture for creating
 * cash_bank_transactions rows through the production normalizeMoney helper.
 *
 * Fixture Flow Mode: Full — uses the production `normalizeMoney` helper from
 * the treasury package for amount normalization. The insertion path mirrors
 * the KyselyCashBankRepository.create() column set, ensuring test data
 * structure is identical to production.
 *
 * This fixture eliminates raw INSERT INTO cash_bank_transactions from test
 * files and centralizes cash-bank transaction creation in the owner package.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { CashBankType, CashBankStatus } from "../types.js";
import { normalizeMoney } from "../helpers.js";

// ---------------------------------------------------------------------------
// Deterministic run ID for fixture uniqueness
// ---------------------------------------------------------------------------

const _runIdSeed =
  (Date.now() ^ (process.pid << 8) ^ (Number(process.env.VITEST_POOL_ID ?? 0) << 16)) &
  0x7fffffff;
let _runIdCounter = _runIdSeed;

function makeRunId(): string {
  return (++_runIdCounter).toString(36);
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CreateTestCashBankTransactionOptions {
  /** Company ID (required — tenant scoping) */
  companyId: number;
  /** Outlet ID (optional) */
  outletId?: number | null;
  /** Transaction type */
  transactionType: CashBankType;
  /** Transaction date in YYYY-MM-DD format */
  transactionDate: string;
  /** Source account ID (must differ from destination) */
  sourceAccountId: number;
  /** Destination account ID (must differ from source) */
  destinationAccountId: number;
  /** Transaction amount (positive number, normalized via normalizeMoney) */
  amount: number;
  /** Description (defaults to auto-generated) */
  description?: string;
  /** Reference string (defaults to auto-generated) */
  reference?: string;
  /** Transaction status (default: POSTED) */
  status?: CashBankStatus;
  /** Posted-at datetime string (default: null for DRAFT/VOID) */
  postedAt?: string | null;
  /** ISO 4217 currency code (default: IDR) */
  currencyCode?: string;
}

// ---------------------------------------------------------------------------
// Fixture factory
// ---------------------------------------------------------------------------

/**
 * Create a test cash/bank transaction in the `cash_bank_transactions` table.
 *
 * Uses the production `normalizeMoney` helper for amount precision and inserts
 * with column set matching KyselyCashBankRepository.create(). All optional
 * fields have deterministic defaults.
 *
 * @param db  - KyselySchema database instance
 * @param opts - Transaction options (see CreateTestCashBankTransactionOptions)
 * @returns Promise resolving to `{ id: number }` — the inserted row ID
 */
export async function createTestCashBankTransaction(
  db: KyselySchema,
  opts: CreateTestCashBankTransactionOptions,
): Promise<{ id: number }> {
  const runId = makeRunId();

  // Deterministic defaults
  const reference = opts.reference ?? `TEST-CBT-${runId}`.slice(0, 50);
  const description = opts.description ?? `Test cash/bank transaction ${runId}`;
  const status: CashBankStatus = opts.status ?? "POSTED";
  const normalizedAmount = normalizeMoney(opts.amount);
  const currencyCode = (opts.currencyCode ?? "IDR").toUpperCase();

  const result = await sql`
    INSERT INTO cash_bank_transactions
      (company_id, outlet_id, transaction_type, transaction_date, reference,
       description, source_account_id, destination_account_id,
       amount, currency_code, status, posted_at, created_at, updated_at)
    VALUES
      (${opts.companyId}, ${opts.outletId ?? null}, ${opts.transactionType}, ${opts.transactionDate},
       ${reference}, ${description},
       ${opts.sourceAccountId}, ${opts.destinationAccountId},
       ${normalizedAmount}, ${currencyCode}, ${status},
       ${opts.postedAt != null ? new Date(opts.postedAt) : null},
       NOW(), NOW())
  `.execute(db);

  const insertId = Number((result as { insertId?: number }).insertId ?? 0);
  if (!Number.isSafeInteger(insertId) || insertId <= 0) {
    throw new Error(
      `Failed to create test cash/bank transaction for company ${opts.companyId}`,
    );
  }

  return { id: insertId };
}
