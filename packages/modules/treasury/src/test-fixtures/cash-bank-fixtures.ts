// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Cash/Bank transaction test fixtures.
 *
 * Provides a canonical `createTestCashBankTransaction` fixture for creating
 * cash_bank_transactions rows through the production `CashBankService.create()`.
 *
 * Fixture Flow Mode: Full — uses the production `CashBankService.create()` with
 * a real Kysely-backed repository for account validation, outlet ownership
 * checks, direction validation, and insert. All business invariants are enforced
 * identically to production.
 *
 * After `CashBankService.create()` (which always creates DRAFT), non-DRAFT
 * statuses are applied via the repository's `updateStatus()` method — the same
 * production method used by `CashBankService.post()` and `void()`, but without
 * the fiscal-year guard or journal-posting pipeline (which test fixtures do not
 * need).
 */

import type { KyselySchema } from "@jurnapod/db";
import type { AccountInfo as PortAccountInfo, CashBankRepository } from "../ports.js";
import type { CashBankType, CashBankStatus, CashBankTransaction, CreateCashBankInput } from "../types.js";
import { normalizeMoney } from "../helpers.js";
import { CashBankService } from "../cash-bank-service.js";

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
  /** FOREX exchange rate (required for FOREX transactions) */
  exchangeRate?: number;
  /** FOREX base amount (optional, computed from amount * rate if omitted) */
  baseAmount?: number;
  /** FOREX gain/loss account ID (required when FOREX produces gain/loss) */
  fxAccountId?: number | null;
}

// ---------------------------------------------------------------------------
// Minimal repository (real Kysely DB — no mocks)
// ---------------------------------------------------------------------------

/**
 * Minimal Kysely-backed repository for CashBankService.
 *
 * Implements the methods needed by `CashBankService.create()` plus
 * `updateStatus` for status changes after creation. All database queries use
 * the real Kysely connection — no in-memory stubs for DB operations.
 *
 * Not intended for posting/voiding (fiscal year guard + journal posting are
 * not wired up). For full service operations, use the API adapter's
 * `KyselyCashBankRepository`.
 */
function createMinimalRepository(db: KyselySchema): CashBankRepository {
  return {
    // --- Account lookup (real DB query) ---
    findAccount: async (accountId: number, companyId: number): Promise<PortAccountInfo | null> => {
      const account = await db
        .selectFrom("accounts")
        .where("company_id", "=", companyId)
        .where("id", "=", accountId)
        .limit(1)
        .select(["id", "company_id", "name", "type_name"])
        .executeTakeFirst();

      return account ?? null;
    },

    // --- Outlet ownership check (real DB query) ---
    outletBelongsToCompany: async (outletId: number, companyId: number): Promise<boolean> => {
      const row = await db
        .selectFrom("outlets")
        .where("company_id", "=", companyId)
        .where("id", "=", outletId)
        .limit(1)
        .select("id")
        .executeTakeFirst();

      return !!row;
    },

    // --- Create transaction (real DB insert) ---
    create: async (
      input: CreateCashBankInput,
      companyId: number,
      createdByUserId: number | null,
    ): Promise<CashBankTransaction> => {
      const currencyCode = (input.currency_code ?? "IDR").toUpperCase();
      const inputWithFx = input as CreateCashBankInput & { fx_gain_loss?: number };

      const result = await db
        .insertInto("cash_bank_transactions")
        .values({
          company_id: companyId,
          outlet_id: input.outlet_id ?? null,
          transaction_type: input.transaction_type,
          transaction_date: new Date(input.transaction_date),
          reference: input.reference ?? null,
          description: input.description,
          source_account_id: input.source_account_id,
          destination_account_id: input.destination_account_id,
          amount: normalizeMoney(input.amount),
          currency_code: currencyCode,
          exchange_rate: input.exchange_rate ?? null,
          base_amount: input.base_amount ?? null,
          fx_gain_loss: inputWithFx.fx_gain_loss ?? 0,
          fx_account_id: input.fx_account_id ?? null,
          status: "DRAFT",
          created_by_user_id: createdByUserId,
        })
        .executeTakeFirst();

      const insertId = Number(result.insertId);

      // Return a minimal CashBankTransaction — the fixture only needs `id`,
      // but `CashBankService.create()` returns the full object to its caller.
      return {
        id: insertId,
        company_id: companyId,
        outlet_id: input.outlet_id ?? null,
        transaction_type: input.transaction_type,
        transaction_date: input.transaction_date,
        reference: input.reference ?? null,
        description: input.description,
        source_account_id: input.source_account_id,
        destination_account_id: input.destination_account_id,
        amount: normalizeMoney(input.amount),
        currency_code: currencyCode,
        exchange_rate: input.exchange_rate ?? null,
        base_amount: input.base_amount ?? null,
        fx_gain_loss: inputWithFx.fx_gain_loss ?? 0,
        fx_account_id: input.fx_account_id ?? null,
        status: "DRAFT" as CashBankStatus,
        posted_at: null,
        created_by_user_id: createdByUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },

    // --- Status update (real DB update — same production path as in the
    //     full `KyselyCashBankRepository.updateStatus()`) ---
    updateStatus: async (
      id: number,
      companyId: number,
      status: CashBankStatus,
      postedAt?: Date,
    ): Promise<void> => {
      const update: Record<string, unknown> = {
        status,
        updated_at: new Date(),
      };
      if (postedAt) {
        update.posted_at = postedAt;
      }

      await db
        .updateTable("cash_bank_transactions")
        .set(update)
        .where("id", "=", id)
        .where("company_id", "=", companyId)
        .execute();
    },

    // --- Transaction wrapper (minimal — calls operation directly) ---
    withTransaction: async <T>(operation: () => Promise<T>): Promise<T> => {
      return operation();
    },

    // --- Stub methods not used by create() ---
    findById: async () => null,
    findByIdForUpdate: async () => null,
    list: async () => ({ total: 0, transactions: [] }),
  };
}

// ---------------------------------------------------------------------------
// Fixture factory
// ---------------------------------------------------------------------------

/**
 * Create a test cash/bank transaction in the `cash_bank_transactions` table.
 *
 * Uses the production `CashBankService.create()` for validation and insert.
 * The service validates:
 * - Source and destination accounts differ
 * - Amount is positive
 * - Outlet belongs to company (if outletId provided)
 * - Accounts exist and are cash/bank type
 * - Transaction type direction (TOP_UP: cash→bank, WITHDRAWAL: bank→cash)
 * - FOREX fields when transactionType is FOREX
 *
 * After creation (which always produces DRAFT), the target status is applied
 * via the repository's `updateStatus()` method.
 *
 * @param db   - KyselySchema database instance
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
  const targetStatus: CashBankStatus = opts.status ?? "POSTED";

  // Build CreateCashBankInput for the production service
  const input: CreateCashBankInput = {
    outlet_id: opts.outletId ?? null,
    transaction_type: opts.transactionType,
    transaction_date: opts.transactionDate,
    reference,
    description,
    source_account_id: opts.sourceAccountId,
    destination_account_id: opts.destinationAccountId,
    amount: opts.amount,
    currency_code: opts.currencyCode,
    exchange_rate: opts.exchangeRate,
    base_amount: opts.baseAmount,
    fx_account_id: opts.fxAccountId ?? null,
  };

  // Create minimal repository and service — production code path
  const repository = createMinimalRepository(db);
  const service = new CashBankService(
    {
      repository,
      accessChecker: {
        userHasOutletAccess: async () => true,
      },
      fiscalYearGuard: {
        ensureDateWithinOpenFiscalYear: async () => {},
      },
    },
  );

  // Create via production service (validates + inserts as DRAFT)
  const created = await service.create(input, opts.companyId);

  // Apply target status using the repository's updateStatus (same production
  // method used by CashBankService.post()/void(), minus fiscal-year guarding
  // and journal posting which fixtures do not require)
  if (targetStatus !== "DRAFT") {
    const postedAtDate =
      targetStatus === "POSTED" && opts.postedAt != null
        ? new Date(opts.postedAt)
        : undefined;

    await repository.updateStatus(created.id, opts.companyId, targetStatus, postedAtDate);
  }

  return { id: created.id };
}
