// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { PostingService, type PostingMapper, type PostingRepository } from "@jurnapod/core";
import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";
import type { ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { ensureDateWithinOpenFiscalYearWithExecutor } from "./fiscal-years";
import { listCompanyDefaultTaxRates, resolveCombinedTaxConfig } from "./taxes";

const DEFAULT_SYNC_PUSH_POSTING_MODE = "disabled" as const;
const SYNC_PUSH_POSTING_MODE_ENV_KEY = "SYNC_PUSH_POSTING_MODE";
const SYNC_PUSH_POSTING_FORCE_UNBALANCED_ENV_KEY = "JP_SYNC_PUSH_POSTING_FORCE_UNBALANCED";
const POS_SALE_DOC_TYPE = "POS_SALE";
const MONEY_SCALE = 100;
const OUTLET_ACCOUNT_MAPPING_KEYS = ["SALES_REVENUE", "AR", "SALES_RETURNS", "SALES_DISCOUNTS"] as const;
type OutletAccountMappingKey = (typeof OUTLET_ACCOUNT_MAPPING_KEYS)[number];

export const OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE = "OUTLET_ACCOUNT_MAPPING_MISSING";
export const OUTLET_PAYMENT_MAPPING_MISSING_MESSAGE = "OUTLET_PAYMENT_MAPPING_MISSING";
export const TAX_ACCOUNT_MISSING_MESSAGE = "TAX_ACCOUNT_MISSING";
export const UNSUPPORTED_PAYMENT_METHOD_MESSAGE = "UNSUPPORTED_PAYMENT_METHOD";
const POS_EMPTY_PAYMENT_SET_MESSAGE = "POS_EMPTY_PAYMENT_SET";
const POS_OVERPAYMENT_NOT_SUPPORTED_MESSAGE = "POS_OVERPAYMENT_NOT_SUPPORTED";

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

type QueryExecutor = {
  execute: PoolConnection["execute"];
};

type MysqlLikeError = {
  code?: string;
  errno?: number;
};

function isNoSuchTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const mysqlError = error as MysqlLikeError;
  return mysqlError.code === "ER_NO_SUCH_TABLE" || mysqlError.errno === 1146;
}

export class SyncPushPostingHookError extends Error {
  readonly mode: SyncPushPostingMode;
  readonly hookCause: unknown;

  constructor(mode: SyncPushPostingMode, cause: unknown) {
    super(cause instanceof Error ? cause.message : "SYNC_PUSH_POSTING_HOOK_FAILED");
    this.name = "SyncPushPostingHookError";
    this.mode = mode;
    this.hookCause = cause;
  }
}

class PosSyncPushPostingMapper implements PostingMapper {
  constructor(
    private readonly dbExecutor: QueryExecutor,
    private readonly context: SyncPushPostingContext
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    return buildPosSaleJournalLines(this.dbExecutor, this.context);
  }
}

class PosSyncPushPostingRepository implements PostingRepository {
  private readonly lineDate: string;

  constructor(
    private readonly dbExecutor: QueryExecutor,
    private readonly postedAt: string
  ) {
    this.lineDate = postedAt.slice(0, 10);
  }

  async createJournalBatch(request: PostingRequest): Promise<{ journal_batch_id: number }> {
    const [insertResult] = await this.dbExecutor.execute<ResultSetHeader>(
      `INSERT INTO journal_batches (
         company_id,
         outlet_id,
         doc_type,
         doc_id,
         posted_at
       ) VALUES (?, ?, ?, ?, ?)`,
      [request.company_id, request.outlet_id ?? null, request.doc_type, request.doc_id, this.postedAt]
    );

    return {
      journal_batch_id: Number(insertResult.insertId)
    };
  }

  async insertJournalLines(journalBatchId: number, request: PostingRequest, lines: JournalLine[]): Promise<void> {
    const placeholders = lines.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const values = lines.flatMap((line) => [
      journalBatchId,
      request.company_id,
      request.outlet_id ?? null,
      line.account_id,
      this.lineDate,
      line.debit,
      line.credit,
      line.description
    ]);

    await this.dbExecutor.execute(
      `INSERT INTO journal_lines (
         journal_batch_id,
         company_id,
         outlet_id,
         account_id,
         line_date,
         debit,
         credit,
         description
       ) VALUES ${placeholders}`,
      values
    );
  }
}

function toMysqlDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid trx_at");
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

function toDateOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid trx_at");
  }

  return date.toISOString().slice(0, 10);
}

function toMinorUnits(value: number): number {
  return Math.round(value * MONEY_SCALE);
}

function fromMinorUnits(value: number): number {
  return value / MONEY_SCALE;
}

function normalizeMoney(value: number): number {
  return fromMinorUnits(toMinorUnits(value));
}

function isTestUnbalancedPostingEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env[SYNC_PUSH_POSTING_FORCE_UNBALANCED_ENV_KEY] === "1"
  );
}

function normalizePaymentMethodCode(method: string): string {
  const normalized = method.trim().toUpperCase();
  if (!normalized) {
    throw new Error(UNSUPPORTED_PAYMENT_METHOD_MESSAGE);
  }
  return normalized;
}

type PosTaxConfig = {
  rate: number;
  inclusive: boolean;
};

async function readCompanyPosTaxConfig(
  dbExecutor: QueryExecutor,
  context: SyncPushPostingContext
): Promise<PosTaxConfig> {
  const defaults = await listCompanyDefaultTaxRates(dbExecutor, context.companyId);
  return resolveCombinedTaxConfig(defaults);
}

async function readOutletAccountMappingByKey(
  dbExecutor: QueryExecutor,
  context: SyncPushPostingContext
): Promise<Record<OutletAccountMappingKey, number>> {
  const requiredKeys = ["SALES_REVENUE", "AR"] as const;
  const placeholders = requiredKeys.map(() => "?").join(", ");
  const [rows] = await dbExecutor.execute(
    `SELECT mapping_key, account_id
     FROM outlet_account_mappings
     WHERE company_id = ?
       AND outlet_id = ?
       AND mapping_key IN (${placeholders})`,
    [context.companyId, context.outletId, ...requiredKeys]
  );

  const accountByKey = new Map<string, number>();
  for (const row of rows as Array<{ mapping_key?: string; account_id?: number }>) {
    if (typeof row.mapping_key !== "string" || !Number.isFinite(row.account_id)) {
      continue;
    }

    if (!requiredKeys.includes(row.mapping_key as typeof requiredKeys[number])) {
      continue;
    }

    accountByKey.set(row.mapping_key, Number(row.account_id));
  }

  const [companyRows] = await dbExecutor.execute(
    `SELECT mapping_key, account_id
     FROM company_account_mappings
     WHERE company_id = ?
       AND mapping_key IN (${placeholders})`,
    [context.companyId, ...requiredKeys]
  );

  for (const row of companyRows as Array<{ mapping_key?: string; account_id?: number }>) {
    if (typeof row.mapping_key !== "string" || !Number.isFinite(row.account_id)) {
      continue;
    }

    if (!requiredKeys.includes(row.mapping_key as typeof requiredKeys[number])) {
      continue;
    }

    if (!accountByKey.has(row.mapping_key)) {
      accountByKey.set(row.mapping_key, Number(row.account_id));
    }
  }

  const missingKeys = requiredKeys.filter((key) => !accountByKey.has(key));
  if (missingKeys.length > 0) {
    throw new Error(OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE);
  }

  const salesReturnsAccountId = accountByKey.get("SALES_RETURNS") ?? accountByKey.get("SALES_REVENUE");
  const salesDiscountsAccountId = accountByKey.get("SALES_DISCOUNTS") ?? accountByKey.get("SALES_REVENUE");

  return {
    SALES_REVENUE: accountByKey.get("SALES_REVENUE") as number,
    AR: accountByKey.get("AR") as number,
    SALES_RETURNS: salesReturnsAccountId as number,
    SALES_DISCOUNTS: salesDiscountsAccountId as number
  };
}

async function readOutletPaymentMethodMappings(
  dbExecutor: QueryExecutor,
  context: SyncPushPostingContext
): Promise<Map<string, number>> {
  let rows: Array<{ method_code?: string; account_id?: number }> = [];
  try {
    const [paymentRows] = await dbExecutor.execute(
      `SELECT method_code, account_id
       FROM outlet_payment_method_mappings
       WHERE company_id = ?
         AND outlet_id = ?`,
      [context.companyId, context.outletId]
    );
    rows = paymentRows as Array<{ method_code?: string; account_id?: number }>;
  } catch (error) {
    if (!isNoSuchTableError(error)) {
      throw error;
    }
  }

  const accountByMethod = new Map<string, number>();
  for (const row of rows) {
    if (!row.method_code || !Number.isFinite(row.account_id)) {
      continue;
    }
    const methodCode = normalizePaymentMethodCode(String(row.method_code));
    accountByMethod.set(methodCode, Number(row.account_id));
  }

  const fallbackKeys = ["CASH", "QRIS", "CARD"];
  const placeholders = fallbackKeys.map(() => "?").join(", ");
  const [fallbackRows] = await dbExecutor.execute(
    `SELECT mapping_key, account_id
     FROM outlet_account_mappings
     WHERE company_id = ?
       AND outlet_id = ?
       AND mapping_key IN (${placeholders})`,
    [context.companyId, context.outletId, ...fallbackKeys]
  );

  for (const row of fallbackRows as Array<{ mapping_key?: string; account_id?: number }>) {
    if (!row.mapping_key || !Number.isFinite(row.account_id)) {
      continue;
    }
    const methodCode = normalizePaymentMethodCode(String(row.mapping_key));
    if (!accountByMethod.has(methodCode)) {
      accountByMethod.set(methodCode, Number(row.account_id));
    }
  }

  const [companyRows] = await dbExecutor.execute(
    `SELECT method_code, account_id
     FROM company_payment_method_mappings
     WHERE company_id = ?`,
    [context.companyId]
  );

  for (const row of companyRows as Array<{ method_code?: string; account_id?: number }>) {
    if (!row.method_code || !Number.isFinite(row.account_id)) {
      continue;
    }
    const methodCode = normalizePaymentMethodCode(String(row.method_code));
    if (!accountByMethod.has(methodCode)) {
      accountByMethod.set(methodCode, Number(row.account_id));
    }
  }

  return accountByMethod;
}

async function readPosPaymentsByMethod(
  dbExecutor: QueryExecutor,
  context: SyncPushPostingContext
): Promise<Array<{ method: string; amount: number }>> {
  const [rows] = await dbExecutor.execute(
    `SELECT method, SUM(amount) AS amount
     FROM pos_transaction_payments
     WHERE pos_transaction_id = ?
     GROUP BY method
     ORDER BY method ASC`,
    [context.posTransactionId]
  );

  const payments = (rows as Array<{ method?: string; amount?: number | string }>).map((row) => ({
    method: String(row.method ?? "").trim(),
    amount: normalizeMoney(Number(row.amount ?? 0))
  })).filter((row) => row.method.length > 0 && row.amount > 0);

  if (payments.length === 0) {
    throw new Error(POS_EMPTY_PAYMENT_SET_MESSAGE);
  }

  return payments;
}

async function readPosGrossSalesAmount(dbExecutor: QueryExecutor, context: SyncPushPostingContext): Promise<number> {
  const [rows] = await dbExecutor.execute(
    `SELECT SUM(qty * price_snapshot) AS gross_sales
     FROM pos_transaction_items
     WHERE pos_transaction_id = ?`,
    [context.posTransactionId]
  );

  const grossSales = normalizeMoney(Number((rows as Array<{ gross_sales?: number | string }>)[0]?.gross_sales ?? 0));
  if (grossSales <= 0) {
    throw new Error("UNBALANCED_JOURNAL");
  }

  return grossSales;
}

type PosDiscountData = {
  percent: number;
  fixed: number;
  code: string | null;
};

async function readPosDiscount(
  dbExecutor: QueryExecutor,
  context: SyncPushPostingContext
): Promise<PosDiscountData> {
  const [rows] = await dbExecutor.execute(
    `SELECT discount_percent, discount_fixed, discount_code
     FROM pos_transactions
     WHERE id = ?`,
    [context.posTransactionId]
  );

  const row = (rows as Array<{ discount_percent?: number | string; discount_fixed?: number | string; discount_code?: string | null }>)[0];
  if (!row) {
    return { percent: 0, fixed: 0, code: null };
  }

  return {
    percent: normalizeMoney(Number(row.discount_percent ?? 0)),
    fixed: normalizeMoney(Number(row.discount_fixed ?? 0)),
    code: row.discount_code ?? null
  };
}

async function readPosTaxSummary(
  dbExecutor: QueryExecutor,
  context: SyncPushPostingContext
): Promise<{ total: number; inclusive: boolean; lines: Array<{ tax_rate_id: number; amount: number; code: string; account_id: number | null }> } | null> {
  const [rows] = await dbExecutor.execute(
    `SELECT ptt.tax_rate_id, ptt.amount, tr.is_inclusive, tr.code, tr.account_id
     FROM pos_transaction_taxes ptt
     INNER JOIN tax_rates tr ON tr.id = ptt.tax_rate_id
     WHERE ptt.pos_transaction_id = ? AND tr.company_id = ?`,
    [context.posTransactionId, context.companyId]
  );

  const parsed = (rows as Array<{ tax_rate_id?: number; amount?: number | string; is_inclusive?: number; code?: string; account_id?: number | null }>).map((row) => ({
    tax_rate_id: Number(row.tax_rate_id),
    amount: normalizeMoney(Number(row.amount ?? 0)),
    is_inclusive: row.is_inclusive === 1,
    code: String(row.code ?? ""),
    account_id: row.account_id ? Number(row.account_id) : null
  })).filter((row) => row.amount > 0);

  if (parsed.length === 0) {
    return null;
  }

  const inclusiveFlag = parsed[0].is_inclusive;
  if (parsed.some((row) => row.is_inclusive !== inclusiveFlag)) {
    throw new Error("MIXED_TAX_INCLUSIVE");
  }

  const total = normalizeMoney(parsed.reduce((acc, row) => acc + row.amount, 0));
  return {
    total,
    inclusive: inclusiveFlag,
    lines: parsed
  };
}

async function buildPosSaleJournalLines(
  dbExecutor: QueryExecutor,
  context: SyncPushPostingContext
): Promise<JournalLine[]> {
  const mapping = await readOutletAccountMappingByKey(dbExecutor, context);
  const paymentMethodMappings = await readOutletPaymentMethodMappings(dbExecutor, context);
  const payments = await readPosPaymentsByMethod(dbExecutor, context);
  const grossSales = await readPosGrossSalesAmount(dbExecutor, context);
  const discountData = await readPosDiscount(dbExecutor, context);
  const taxSummary = await readPosTaxSummary(dbExecutor, context);
  const taxConfig = taxSummary ? null : await readCompanyPosTaxConfig(dbExecutor, context);

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
    const discountDescription = discountData.code
      ? `POS sales discount (${discountData.code})`
      : "POS sales discount";
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
      const defaultTaxRates = await listCompanyDefaultTaxRates(dbExecutor, context.companyId);
      const taxableRates = defaultTaxRates.filter(tr => tr.rate_percent > 0);
      
      if (taxableRates.length === 0) {
        throw new Error(`${TAX_ACCOUNT_MISSING_MESSAGE}:NO_DEFAULT_TAX`);
      }
      
      for (const taxRate of taxableRates) {
        if (!taxRate.account_id) {
          throw new Error(`${TAX_ACCOUNT_MISSING_MESSAGE}:${taxRate.code}`);
        }
      }
      
      const validTaxRates = taxableRates.filter(tr => tr.account_id !== null);
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

  if (isTestUnbalancedPostingEnabled() && lines.length > 0) {
    const firstLine = lines[0];
    lines[0] = {
      ...firstLine,
      debit: normalizeMoney(firstLine.debit + 0.01)
    };
  }

  return lines;
}

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
  _dbExecutor: QueryExecutor,
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
  dbExecutor: QueryExecutor,
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

  await ensureDateWithinOpenFiscalYearWithExecutor(
    dbExecutor,
    context.companyId,
    toDateOnly(context.trxAt)
  );

  const postingRequest: PostingRequest = {
    doc_type: POS_SALE_DOC_TYPE,
    doc_id: context.posTransactionId,
    company_id: context.companyId,
    outlet_id: context.outletId
  };

  const postingService = new PostingService(
    new PosSyncPushPostingRepository(dbExecutor, toMysqlDateTime(context.trxAt)),
    {
      [POS_SALE_DOC_TYPE]: new PosSyncPushPostingMapper(dbExecutor, context)
    }
  );

  const postingResult = await postingService.post(postingRequest, {
    transactionOwner: "external"
  });

  return {
    mode: "active",
    journalBatchId: Number((postingResult as PostingResult).journal_batch_id),
    balanceOk: true,
    reason: null
  };
}

/*
Error handling strategy:
- disabled (default): preserve current M4 behavior (audit-only, no posting side effects).
- shadow: run a non-mutating hook; on failure caller records diagnostics and keeps sync result unchanged.
*/
export async function runSyncPushPostingHook(
  dbExecutor: QueryExecutor,
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
      return await runShadowPostingHook(dbExecutor, context);
    } else {
      return await runActivePostingHook(dbExecutor, context);
    }
  } catch (error) {
    throw new SyncPushPostingHookError(mode, error);
  }
}
