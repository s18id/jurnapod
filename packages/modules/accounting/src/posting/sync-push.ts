// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// =============================================================================
// DEBT RESOLUTION: SYNC_PUSH_POSTING_FORCE_UNBALANCED — REMOVED
// =============================================================================
//
// Context:
//   During Sprint 2 (Epic 23 extraction), a debugging override was introduced:
//   `JP_SYNC_PUSH_POSTING_FORCE_UNBALANCED=1` allowed injecting a +0.01 minor unit
//   imbalance into POS journal lines to force-test the balance guard path.
//
// Risk classification (Epic 50 / E49-A2 Tiered Audit Table):
//   - CRITICAL / P0: The override could enable unbalanced journals in production
//     if the env var were accidentally set. The guard `NODE_ENV !== "production"`
//     reduced but did not eliminate the risk (CI pipelines and staging may run
//     non-production without the flag set).
//
// Decision: REMOVE entirely (not harden) because:
//   1. The guard's non-production fallback is not an airtight production safety
//      mechanism (e.g. NODE_ENV=staging bypasses the guard but is not production).
//   2. No production use case requires intentionally unbalanced journals.
//   3. The flag was debugging instrumentation, not a designed feature.
//   4. The canonical balance assertion in PostingService is the correct place
//      to enforce balance; overrides belong in tests only.
//
// Resolution applied:
//   - Removed: SYNC_PUSH_POSTING_FORCE_UNBALANCED_ENV_KEY constant
//   - Removed: isTestUnbalancedPostingEnabled() function
//   - Removed: lines 355-361 that injected +0.01 imbalance into first line
//
// Audit trail:
//   - SYNC_PUSH_POSTING_FORCE_UNBALANCED: introduced in commit 0d23e250 (Sprint 2)
//     only in packages/modules/accounting/src/posting/sync-push.ts
//   - isTestUnbalancedPostingEnabled() call site: only in buildPosSaleJournalLines
//   - No other consumers found across the codebase (verified via grep)
//
// Verification:
//   rg 'SYNC_PUSH_POSTING_FORCE_UNBALANCED' --type ts -l  -> 0 results
//   rg 'isTestUnbalancedPostingEnabled' --type ts -l    -> 0 results
// =============================================================================

import { sql } from "kysely";
import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";
import { toUtcIso, fromUtcIso } from "@jurnapod/shared";
import { PostingService, type PostingMapper, type PostingRepository } from "../index.js";
import { ACCOUNT_MAPPING_TYPE_ID_BY_CODE, accountMappingIdToCode } from "@jurnapod/shared";
import { normalizeMoney, resolveMappingCode } from "./common.js";
import type { KyselySchema } from "@jurnapod/db";

// =============================================================================
// Types
// =============================================================================

export const OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE = "OUTLET_ACCOUNT_MAPPING_MISSING";
export const OUTLET_PAYMENT_MAPPING_MISSING_MESSAGE = "OUTLET_PAYMENT_MAPPING_MISSING";
export const TAX_ACCOUNT_MISSING_MESSAGE = "TAX_ACCOUNT_MISSING";
export const UNSUPPORTED_PAYMENT_METHOD_MESSAGE = "UNSUPPORTED_PAYMENT_METHOD";
export const POS_EMPTY_PAYMENT_SET_MESSAGE = "POS_EMPTY_PAYMENT_SET";
export const POS_OVERPAYMENT_NOT_SUPPORTED_MESSAGE = "POS_OVERPAYMENT_NOT_SUPPORTED";

export type SyncPushPostingMode = "disabled" | "shadow" | "active";

export type SyncPushPostingHookResult = {
  mode: SyncPushPostingMode;
  journalBatchId: number | null;
  balanceOk: boolean | null;
  reason: string | null;
};

export interface SyncPushPostingContext {
  correlationId: string;
  companyId: number;
  outletId: number;
  userId: number;
  clientTxId: string;
  trxAt: string;
  status: "COMPLETED" | "VOID" | "REFUND";
  posTransactionId: number;
}

export class SyncPushPostingHookError extends Error {
  code = "SYNC_PUSH_POSTING_HOOK_FAILED";
  readonly mode: SyncPushPostingMode;
  readonly hookCause: unknown;

  constructor(mode: SyncPushPostingMode, cause: unknown) {
    super(cause instanceof Error ? cause.message : "SYNC_PUSH_POSTING_HOOK_FAILED");
    this.name = "SyncPushPostingHookError";
    this.mode = mode;
    this.hookCause = cause;
  }
}

// =============================================================================
// Executor Interface
// =============================================================================

export interface SyncPushPostingExecutor {
  readOutletAccountMapping(
    companyId: number,
    outletId: number
  ): Promise<Record<"SALES_REVENUE" | "AR" | "SALES_RETURNS" | "SALES_DISCOUNTS", number>>;

  readOutletPaymentMethodMappings(companyId: number, outletId: number): Promise<Map<string, number>>;

  readPosPaymentsByMethod(posTransactionId: number): Promise<Array<{ method: string; amount: number }>>;

  readPosGrossSalesAmount(posTransactionId: number): Promise<number>;

  readPosDiscount(posTransactionId: number): Promise<{ percent: number; fixed: number; code: string | null }>;

  readPosTaxSummary(posTransactionId: number, companyId: number): Promise<{
    total: number;
    inclusive: boolean;
    lines: Array<{ tax_rate_id: number; amount: number; code: string; account_id: number | null }>;
  } | null>;

  readCompanyPosTaxConfig(companyId: number): Promise<{ rate: number; inclusive: boolean } | null>;

  listCompanyDefaultTaxRates(companyId: number): Promise<
    Array<{
      id: number;
      code: string;
      rate_percent: number;
      account_id: number | null;
      is_inclusive: boolean;
    }>
  >;

  ensureDateWithinOpenFiscalYear(db: KyselySchema, companyId: number, date: string): Promise<void>;
}

// =============================================================================
// Repository
// =============================================================================

const POS_SALE_DOC_TYPE = "POS_SALE";

export class PosSyncPushPostingRepository implements PostingRepository {
  private readonly lineDate: string;

  constructor(
    private readonly db: KyselySchema,
    private readonly postedAt: string
  ) {
    this.lineDate = postedAt.slice(0, 10);
  }

  async createJournalBatch(request: PostingRequest): Promise<{ journal_batch_id: number }> {
    const insertResult = await sql`
      INSERT INTO journal_batches (
        company_id,
        outlet_id,
        doc_type,
        doc_id,
        posted_at
      ) VALUES (${request.company_id}, ${request.outlet_id ?? null}, ${request.doc_type}, ${request.doc_id}, ${this.postedAt})
    `.execute(this.db);

    return {
      journal_batch_id: Number(insertResult.insertId)
    };
  }

  async insertJournalLines(journalBatchId: number, request: PostingRequest, lines: JournalLine[]): Promise<void> {
    if (lines.length === 0) return;

    const values = lines.map((line) => sql`
      (${journalBatchId}, ${request.company_id}, ${request.outlet_id ?? null}, ${line.account_id}, ${this.lineDate}, ${line.debit}, ${line.credit}, ${line.description})
    `);

    await sql`
      INSERT INTO journal_lines (
        journal_batch_id,
        company_id,
        outlet_id,
        account_id,
        line_date,
        debit,
        credit,
        description
      ) VALUES ${sql.join(values, sql`, `)}
    `.execute(this.db);
  }
}

// =============================================================================
// Mapper
// =============================================================================

const MONEY_SCALE = 100;

function toMinorUnits(value: number): number {
  return Math.round(value * MONEY_SCALE);
}

function normalizePaymentMethodCode(method: string): string {
  const normalized = method.trim().toUpperCase();
  if (!normalized) {
    throw new Error(UNSUPPORTED_PAYMENT_METHOD_MESSAGE);
  }
  return normalized;
}

export class PosSyncPushPostingMapper implements PostingMapper {
  constructor(
    private readonly executor: SyncPushPostingExecutor,
    private readonly context: SyncPushPostingContext
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    return buildPosSaleJournalLines(this.executor, this.context);
  }
}

// =============================================================================
// Journal Line Builder
// =============================================================================

async function buildPosSaleJournalLines(
  executor: SyncPushPostingExecutor,
  context: SyncPushPostingContext
): Promise<JournalLine[]> {
  const mapping = await executor.readOutletAccountMapping(context.companyId, context.outletId);
  const paymentMethodMappings = await executor.readOutletPaymentMethodMappings(context.companyId, context.outletId);
  const payments = await executor.readPosPaymentsByMethod(context.posTransactionId);
  const grossSales = await executor.readPosGrossSalesAmount(context.posTransactionId);
  const discountData = await executor.readPosDiscount(context.posTransactionId);
  const taxSummary = await executor.readPosTaxSummary(context.posTransactionId, context.companyId);
  const taxConfig = taxSummary ? null : await executor.readCompanyPosTaxConfig(context.companyId);

  let discountAmount = 0;
  if (discountData.percent > 0) {
    discountAmount = normalizeMoney(grossSales * (discountData.percent / 100));
  }
  discountAmount = normalizeMoney(discountAmount + discountData.fixed);
  discountAmount = normalizeMoney(Math.min(discountAmount, grossSales));

  let salesTaxAmount = 0;
  let salesRevenueAmount = grossSales;
  if (taxSummary) {
    salesTaxAmount = normalizeMoney(taxSummary.total);
    if (taxSummary.inclusive) {
      salesRevenueAmount = normalizeMoney(grossSales - salesTaxAmount);
    }
  } else if (taxConfig && taxConfig.rate > 0) {
    const taxMultiplier = taxConfig.rate / 100;
    if (taxConfig.inclusive) {
      salesRevenueAmount = normalizeMoney(grossSales / (1 + taxMultiplier));
      salesTaxAmount = normalizeMoney(grossSales - salesRevenueAmount);
    } else {
      salesTaxAmount = normalizeMoney(grossSales * taxMultiplier);
    }
  }

  const isInclusive = taxSummary ? taxSummary.inclusive : taxConfig?.inclusive ?? false;
  const totalDue = normalizeMoney(grossSales + (isInclusive ? 0 : salesTaxAmount) - discountAmount);

  const lines: JournalLine[] = [];
  let paymentTotal = 0;

  for (const payment of payments) {
    const methodCode = normalizePaymentMethodCode(payment.method);
    const accountId = paymentMethodMappings.get(methodCode);
    if (!accountId) {
      throw new Error(OUTLET_PAYMENT_MAPPING_MISSING_MESSAGE);
    }
    const amount = normalizeMoney(payment.amount);
    paymentTotal = normalizeMoney(paymentTotal + amount);
    lines.push({
      account_id: accountId,
      debit: amount,
      credit: 0,
      description: `POS ${methodCode} receipt`
    });
  }

  const receivableAmount = normalizeMoney(totalDue - paymentTotal);
  if (receivableAmount < 0) {
    throw new Error(POS_OVERPAYMENT_NOT_SUPPORTED_MESSAGE);
  }

  if (receivableAmount > 0) {
    lines.push({
      account_id: mapping.AR,
      debit: receivableAmount,
      credit: 0,
      description: "POS outstanding receivable"
    });
  }

  lines.push({
    account_id: mapping.SALES_REVENUE,
    debit: 0,
    credit: salesRevenueAmount,
    description: "POS sales revenue"
  });

  if (discountAmount > 0) {
    const discountDescription = discountData.code ? `POS sales discount (${discountData.code})` : "POS sales discount";
    lines.push({
      account_id: mapping.SALES_DISCOUNTS,
      debit: 0,
      credit: discountAmount,
      description: discountDescription
    });
  }

  if (salesTaxAmount > 0) {
    if (taxSummary && taxSummary.lines.length > 0) {
      for (const taxLine of taxSummary.lines) {
        if (taxLine.amount <= 0) continue;
        if (!taxLine.account_id) {
          throw new Error(`${TAX_ACCOUNT_MISSING_MESSAGE}:${taxLine.code}`);
        }
        lines.push({
          account_id: taxLine.account_id,
          debit: 0,
          credit: normalizeMoney(taxLine.amount),
          description: `POS sales tax (${taxLine.code})`
        });
      }
    } else {
      const defaultTaxRates = await executor.listCompanyDefaultTaxRates(context.companyId);
      const taxableRates = defaultTaxRates.filter((tr) => tr.rate_percent > 0);

      if (taxableRates.length === 0) {
        throw new Error(`${TAX_ACCOUNT_MISSING_MESSAGE}:NO_DEFAULT_TAX`);
      }

      for (const taxRate of taxableRates) {
        if (!taxRate.account_id) {
          throw new Error(`${TAX_ACCOUNT_MISSING_MESSAGE}:${taxRate.code}`);
        }
      }

      const validTaxRates = taxableRates.filter((tr) => tr.account_id !== null);
      const totalRatePercent = validTaxRates.reduce((sum, tr) => sum + tr.rate_percent, 0);
      if (totalRatePercent <= 0) {
        throw new Error(`${TAX_ACCOUNT_MISSING_MESSAGE}:INVALID_RATE`);
      }

      const taxLines: Array<{ account_id: number; amount: number; code: string }> = [];
      let runningTotal = 0;

      for (let i = 0; i < validTaxRates.length; i++) {
        const taxRate = validTaxRates[i];
        let taxLineAmount: number;

        if (i === validTaxRates.length - 1) {
          taxLineAmount = normalizeMoney(salesTaxAmount - runningTotal);
        } else {
          taxLineAmount = normalizeMoney(salesTaxAmount * (taxRate.rate_percent / totalRatePercent));
        }

        if (taxLineAmount > 0) {
          taxLines.push({
            account_id: taxRate.account_id!,
            amount: taxLineAmount,
            code: taxRate.code
          });
          runningTotal += taxLineAmount;
        }
      }

      // Guard: verify tax lines sum to expected total (catches rounding drift)
      const taxTotal = taxLines.reduce((sum, tl) => sum + Math.round(tl.amount * 100), 0);
      const expectedTotalMinor = Math.round(salesTaxAmount * 100);
      if (taxTotal !== expectedTotalMinor) {
        throw new Error(
          `TAX_ALLOCATION_IMBALANCE: tax lines sum to ${taxTotal} minor units but expected ${expectedTotalMinor} minor units`
        );
      }

      for (const taxLine of taxLines) {
        lines.push({
          account_id: taxLine.account_id,
          debit: 0,
          credit: taxLine.amount,
          description: `POS sales tax (${taxLine.code})`
        });
      }
    }
  }

  return lines;
}

// =============================================================================
// Public API Functions
// =============================================================================

const DEFAULT_SYNC_PUSH_POSTING_MODE = "disabled" as const;
const SYNC_PUSH_POSTING_MODE_ENV_KEY = "SYNC_PUSH_POSTING_MODE";

function resolveSyncPushPostingMode(): SyncPushPostingMode {
  const rawMode = process.env[SYNC_PUSH_POSTING_MODE_ENV_KEY];
  if (!rawMode) {
    return DEFAULT_SYNC_PUSH_POSTING_MODE;
  }

  const normalized = rawMode.trim().toLowerCase();
  if (normalized === "disabled" || normalized === "shadow" || normalized === "active") {
    return normalized;
  }

  console.warn("Invalid sync push posting mode, falling back to disabled", {
    env_key: SYNC_PUSH_POSTING_MODE_ENV_KEY,
    env_value: rawMode,
    fallback_mode: DEFAULT_SYNC_PUSH_POSTING_MODE
  });
  return DEFAULT_SYNC_PUSH_POSTING_MODE;
}

async function runShadowPostingHook(
  _executor: SyncPushPostingExecutor,
  _context: SyncPushPostingContext
): Promise<SyncPushPostingHookResult> {
  return {
    mode: "shadow",
    journalBatchId: null,
    balanceOk: null,
    reason: "SHADOW_NOOP"
  };
}

async function runActivePostingHook(
  db: KyselySchema,
  executor: SyncPushPostingExecutor,
  context: SyncPushPostingContext
): Promise<SyncPushPostingHookResult> {
  if (context.status !== "COMPLETED") {
    return {
      mode: "active",
      journalBatchId: null,
      balanceOk: null,
      reason: "STATUS_NOT_COMPLETED"
    };
  }

  await executor.ensureDateWithinOpenFiscalYear(db, context.companyId, fromUtcIso.dateOnly(context.trxAt));

  const postingRequest: PostingRequest = {
    doc_type: POS_SALE_DOC_TYPE,
    doc_id: context.posTransactionId,
    company_id: context.companyId,
    outlet_id: context.outletId
  };

  const postingService = new PostingService(
    new PosSyncPushPostingRepository(db, fromUtcIso.mysql(toUtcIso.dateLike(context.trxAt) as string)),
    {
      [POS_SALE_DOC_TYPE]: new PosSyncPushPostingMapper(executor, context)
    }
  );

  const postingResult = await postingService.post(postingRequest, {
    transactionOwner: "external"
  });

  return {
    mode: "active",
    journalBatchId: Number(postingResult.journal_batch_id),
    balanceOk: true,
    reason: null
  };
}

export async function runSyncPushPostingHook(
  db: KyselySchema,
  executor: SyncPushPostingExecutor,
  context: SyncPushPostingContext
): Promise<SyncPushPostingHookResult> {
  const mode = resolveSyncPushPostingMode();
  if (mode === "disabled") {
    return {
      mode,
      journalBatchId: null,
      balanceOk: null,
      reason: "POSTING_DISABLED"
    };
  }

  try {
    if (mode === "shadow") {
      return await runShadowPostingHook(executor, context);
    } else {
      return await runActivePostingHook(db, executor, context);
    }
  } catch (error) {
    throw new SyncPushPostingHookError(mode, error);
  }
}



