// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { PostingService, type PostingMapper, type PostingRepository } from "@jurnapod/core";
import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";
import type { ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { listCompanyDefaultTaxRates, resolveCombinedTaxConfig } from "./taxes";

const DEFAULT_SYNC_PUSH_POSTING_MODE = "disabled" as const;
const SYNC_PUSH_POSTING_MODE_ENV_KEY = "SYNC_PUSH_POSTING_MODE";
const SYNC_PUSH_POSTING_FORCE_UNBALANCED_ENV_KEY = "JP_SYNC_PUSH_POSTING_FORCE_UNBALANCED";
const POS_SALE_DOC_TYPE = "POS_SALE";
const MONEY_SCALE = 100;
const OUTLET_ACCOUNT_MAPPING_KEYS = ["SALES_REVENUE", "SALES_TAX", "AR"] as const;
type OutletAccountMappingKey = (typeof OUTLET_ACCOUNT_MAPPING_KEYS)[number];

export const OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE = "OUTLET_ACCOUNT_MAPPING_MISSING";
export const OUTLET_PAYMENT_MAPPING_MISSING_MESSAGE = "OUTLET_PAYMENT_MAPPING_MISSING";
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
  const placeholders = OUTLET_ACCOUNT_MAPPING_KEYS.map(() => "?").join(", ");
  const [rows] = await dbExecutor.execute(
    `SELECT mapping_key, account_id
     FROM outlet_account_mappings
     WHERE company_id = ?
       AND outlet_id = ?
       AND mapping_key IN (${placeholders})`,
    [context.companyId, context.outletId, ...OUTLET_ACCOUNT_MAPPING_KEYS]
  );

  const accountByKey = new Map<OutletAccountMappingKey, number>();
  for (const row of rows as Array<{ mapping_key?: string; account_id?: number }>) {
    if (typeof row.mapping_key !== "string" || !Number.isFinite(row.account_id)) {
      continue;
    }

    if (!OUTLET_ACCOUNT_MAPPING_KEYS.includes(row.mapping_key as OutletAccountMappingKey)) {
      continue;
    }

    accountByKey.set(row.mapping_key as OutletAccountMappingKey, Number(row.account_id));
  }

  const missingKeys = OUTLET_ACCOUNT_MAPPING_KEYS.filter((key) => !accountByKey.has(key));
  if (missingKeys.length > 0) {
    throw new Error(OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE);
  }

  return {
    SALES_REVENUE: accountByKey.get("SALES_REVENUE") as number,
    SALES_TAX: accountByKey.get("SALES_TAX") as number,
    AR: accountByKey.get("AR") as number
  };
}

async function readOutletPaymentMethodMappings(
  dbExecutor: QueryExecutor,
  context: SyncPushPostingContext
): Promise<Map<string, number>> {
  const [rows] = await dbExecutor.execute(
    `SELECT method_code, account_id
     FROM outlet_payment_method_mappings
     WHERE company_id = ?
       AND outlet_id = ?`,
    [context.companyId, context.outletId]
  );

  const accountByMethod = new Map<string, number>();
  for (const row of rows as Array<{ method_code?: string; account_id?: number }>) {
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

async function readPosTaxSummary(
  dbExecutor: QueryExecutor,
  context: SyncPushPostingContext
): Promise<{ total: number; inclusive: boolean } | null> {
  const [rows] = await dbExecutor.execute(
    `SELECT ptt.amount, tr.is_inclusive
     FROM pos_transaction_taxes ptt
     INNER JOIN tax_rates tr ON tr.id = ptt.tax_rate_id
     WHERE ptt.pos_transaction_id = ?`,
    [context.posTransactionId]
  );

  const parsed = (rows as Array<{ amount?: number | string; is_inclusive?: number }>).map((row) => ({
    amount: normalizeMoney(Number(row.amount ?? 0)),
    is_inclusive: row.is_inclusive === 1
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
    inclusive: inclusiveFlag
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
  const taxSummary = await readPosTaxSummary(dbExecutor, context);
  const taxConfig = taxSummary ? null : await readCompanyPosTaxConfig(dbExecutor, context);

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
  const totalDue = normalizeMoney(grossSales + (isInclusive ? 0 : salesTaxAmount));

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

  if (salesTaxAmount > 0) {
    lines.push({
      account_id: mapping.SALES_TAX,
      debit: 0,
      credit: salesTaxAmount,
      description: "POS sales tax"
    });
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
