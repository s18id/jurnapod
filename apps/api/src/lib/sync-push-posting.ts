// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import { PostingService, type PostingMapper, type PostingRepository } from "@jurnapod/modules-accounting";
import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";
import {
  ACCOUNT_MAPPING_TYPE_ID_BY_CODE,
  accountMappingIdToCode,
  type AccountMappingCode
} from "@jurnapod/shared";
import type { KyselySchema } from "@jurnapod/db";
import { toDateOnly, toMysqlDateTime } from "./date-helpers";
import { resolveCombinedTaxConfig } from "./taxes";

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
    private readonly db: KyselySchema,
    private readonly context: SyncPushPostingContext
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    return buildPosSaleJournalLines(this.db, this.context);
  }
}

class PosSyncPushPostingRepository implements PostingRepository {
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

function resolveMappingCode(row: { mapping_type_id?: number | null; mapping_key?: string | null }): AccountMappingCode | undefined {
  const fromId = accountMappingIdToCode(row.mapping_type_id);
  if (fromId) {
    return fromId;
  }

  if (typeof row.mapping_key === "string") {
    const normalized = row.mapping_key.trim().toUpperCase() as AccountMappingCode;
    if (ACCOUNT_MAPPING_TYPE_ID_BY_CODE[normalized]) {
      return normalized;
    }
  }

  return undefined;
}

type PosTaxConfig = {
  rate: number;
  inclusive: boolean;
};

async function readCompanyPosTaxConfig(
  db: KyselySchema,
  context: SyncPushPostingContext
): Promise<PosTaxConfig> {
  const defaults = await listCompanyDefaultTaxRatesKysely(db, context.companyId);
  return resolveCombinedTaxConfig(defaults);
}

// Inline version of listCompanyDefaultTaxRates using Kysely
type TaxRateRecord = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  rate_percent: number;
  account_id: number | null;
  is_inclusive: boolean;
  is_active: boolean;
};

async function listCompanyDefaultTaxRatesKysely(
  db: KyselySchema,
  companyId: number
): Promise<TaxRateRecord[]> {
  const result = await sql<{
    id: number;
    company_id: number;
    code: string;
    name: string;
    rate_percent: number;
    account_id: number | null;
    is_inclusive: number;
    is_active: number;
  }>`
    SELECT tr.id, tr.company_id, tr.code, tr.name, tr.rate_percent, tr.account_id, tr.is_inclusive, tr.is_active
    FROM company_tax_defaults ctd
    INNER JOIN tax_rates tr
      ON tr.id = ctd.tax_rate_id
      AND tr.company_id = ctd.company_id
    WHERE ctd.company_id = ${companyId}
      AND tr.company_id = ${companyId}
      AND tr.is_active = 1
    ORDER BY tr.name ASC, tr.id ASC
  `.execute(db);

  return result.rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: String(row.code),
    name: String(row.name),
    rate_percent: normalizeRate(row.rate_percent),
    account_id: row.account_id ? Number(row.account_id) : null,
    is_inclusive: row.is_inclusive === 1,
    is_active: row.is_active === 1
  }));
}

function normalizeRate(value: number | string): number {
  return normalizeMoney(Number(value));
}

async function readOutletAccountMappingByKey(
  db: KyselySchema,
  context: SyncPushPostingContext
): Promise<Record<OutletAccountMappingKey, number>> {
  const requiredKeys = ["SALES_REVENUE", "AR"] as const;
  const requiredTypeIds = requiredKeys.map((key) => ACCOUNT_MAPPING_TYPE_ID_BY_CODE[key]);

  // Query outlet-specific account_mappings first (prioritized)
  const outletRows = await db
    .selectFrom("account_mappings")
    .select(["mapping_type_id", "mapping_key", "account_id", "outlet_id"])
    .where("company_id", "=", context.companyId)
    .where("outlet_id", "=", context.outletId)
    .where((eb) => eb.or([
      eb("mapping_type_id", "in", requiredTypeIds),
      eb("mapping_key", "in", requiredKeys)
    ]))
    .execute();

  // Query company-wide account_mappings as fallback
  const companyRows = await db
    .selectFrom("account_mappings")
    .select(["mapping_type_id", "mapping_key", "account_id", "outlet_id"])
    .where("company_id", "=", context.companyId)
    .where("outlet_id", "is", null)
    .where((eb) => eb.or([
      eb("mapping_type_id", "in", requiredTypeIds),
      eb("mapping_key", "in", requiredKeys)
    ]))
    .execute();

  const accountByKey = new Map<string, number>();

  // Process company-wide first, then outlet-specific (outlet overrides company)
  for (const row of companyRows) {
    const mappingCode = resolveMappingCode(row);
    if (!mappingCode || !Number.isFinite(row.account_id)) continue;
    if (!requiredKeys.includes(mappingCode as typeof requiredKeys[number])) continue;
    accountByKey.set(mappingCode, Number(row.account_id));
  }

  for (const row of outletRows) {
    const mappingCode = resolveMappingCode(row);
    if (!mappingCode || !Number.isFinite(row.account_id)) continue;
    if (!requiredKeys.includes(mappingCode as typeof requiredKeys[number])) continue;
    accountByKey.set(mappingCode, Number(row.account_id));
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
  db: KyselySchema,
  context: SyncPushPostingContext
): Promise<Map<string, number>> {
  const accountByMethod = new Map<string, number>();

  // Query payment_method_mappings: outlet-specific first
  const outletPaymentRows = await db
    .selectFrom("payment_method_mappings")
    .select(["method_code", "account_id", "outlet_id"])
    .where("company_id", "=", context.companyId)
    .where("outlet_id", "=", context.outletId)
    .execute();

  for (const row of outletPaymentRows) {
    if (!row.method_code || !Number.isFinite(row.account_id)) continue;
    const methodCode = normalizePaymentMethodCode(String(row.method_code));
    accountByMethod.set(methodCode, Number(row.account_id));
  }

  // Query payment_method_mappings: company-wide fallback
  const companyPaymentRows = await db
    .selectFrom("payment_method_mappings")
    .select(["method_code", "account_id", "outlet_id"])
    .where("company_id", "=", context.companyId)
    .where("outlet_id", "is", null)
    .execute();

  for (const row of companyPaymentRows) {
    if (!row.method_code || !Number.isFinite(row.account_id)) continue;
    const methodCode = normalizePaymentMethodCode(String(row.method_code));
    if (!accountByMethod.has(methodCode)) {
      accountByMethod.set(methodCode, Number(row.account_id));
    }
  }

  // Fallback to account_mappings for standard payment methods
  const fallbackKeys = ["CASH", "QRIS", "CARD"] as const;
  const fallbackTypeIds = fallbackKeys.map((key) => ACCOUNT_MAPPING_TYPE_ID_BY_CODE[key]);

  // Query account_mappings: outlet-specific first
  const outletMappingRows = await db
    .selectFrom("account_mappings")
    .select(["mapping_type_id", "mapping_key", "account_id"])
    .where("company_id", "=", context.companyId)
    .where("outlet_id", "=", context.outletId)
    .where((eb) => eb.or([
      eb("mapping_type_id", "in", fallbackTypeIds),
      eb("mapping_key", "in", fallbackKeys)
    ]))
    .execute();

  for (const row of outletMappingRows) {
    const mappingCode = resolveMappingCode(row);
    if (!mappingCode || !Number.isFinite(row.account_id)) continue;
    const methodCode = normalizePaymentMethodCode(mappingCode);
    if (!accountByMethod.has(methodCode)) {
      accountByMethod.set(methodCode, Number(row.account_id));
    }
  }

  // Query account_mappings: company-wide fallback
  const companyMappingRows = await db
    .selectFrom("account_mappings")
    .select(["mapping_type_id", "mapping_key", "account_id"])
    .where("company_id", "=", context.companyId)
    .where("outlet_id", "is", null)
    .where((eb) => eb.or([
      eb("mapping_type_id", "in", fallbackTypeIds),
      eb("mapping_key", "in", fallbackKeys)
    ]))
    .execute();

  for (const row of companyMappingRows) {
    const mappingCode = resolveMappingCode(row);
    if (!mappingCode || !Number.isFinite(row.account_id)) continue;
    const methodCode = normalizePaymentMethodCode(mappingCode);
    if (!accountByMethod.has(methodCode)) {
      accountByMethod.set(methodCode, Number(row.account_id));
    }
  }

  return accountByMethod;
}

async function readPosPaymentsByMethod(
  db: KyselySchema,
  context: SyncPushPostingContext
): Promise<Array<{ method: string; amount: number }>> {
  const result = await sql<{ method: string | null; amount: number | string }>`
    SELECT method, SUM(amount) AS amount
    FROM pos_transaction_payments
    WHERE pos_transaction_id = ${context.posTransactionId}
    GROUP BY method
    ORDER BY method ASC
  `.execute(db);

  const payments = result.rows.map((row) => ({
    method: String(row.method ?? "").trim(),
    amount: normalizeMoney(Number(row.amount ?? 0))
  })).filter((row) => row.method.length > 0 && row.amount > 0);

  if (payments.length === 0) {
    throw new Error(POS_EMPTY_PAYMENT_SET_MESSAGE);
  }

  return payments;
}

async function readPosGrossSalesAmount(db: KyselySchema, context: SyncPushPostingContext): Promise<number> {
  const result = await sql<{ gross_sales: number | string | null }>`
    SELECT SUM(qty * price_snapshot) AS gross_sales
    FROM pos_transaction_items
    WHERE pos_transaction_id = ${context.posTransactionId}
  `.execute(db);

  const grossSales = normalizeMoney(Number(result.rows[0]?.gross_sales ?? 0));
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
  db: KyselySchema,
  context: SyncPushPostingContext
): Promise<PosDiscountData> {
  const result = await sql<{ discount_percent: number | string | null; discount_fixed: number | string | null; discount_code: string | null }>`
    SELECT discount_percent, discount_fixed, discount_code
    FROM pos_transactions
    WHERE id = ${context.posTransactionId}
  `.execute(db);

  const row = result.rows[0];
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
  db: KyselySchema,
  context: SyncPushPostingContext
): Promise<{ total: number; inclusive: boolean; lines: Array<{ tax_rate_id: number; amount: number; code: string; account_id: number | null }> } | null> {
  const result = await sql<{ tax_rate_id: number | null; amount: number | string | null; is_inclusive: number | null; code: string | null; account_id: number | null }>`
    SELECT ptt.tax_rate_id, ptt.amount, tr.is_inclusive, tr.code, tr.account_id
    FROM pos_transaction_taxes ptt
    INNER JOIN tax_rates tr ON tr.id = ptt.tax_rate_id
    WHERE ptt.pos_transaction_id = ${context.posTransactionId} AND tr.company_id = ${context.companyId}
  `.execute(db);

  const parsed = result.rows.map((row) => ({
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
  db: KyselySchema,
  context: SyncPushPostingContext
): Promise<JournalLine[]> {
  const mapping = await readOutletAccountMappingByKey(db, context);
  const paymentMethodMappings = await readOutletPaymentMethodMappings(db, context);
  const payments = await readPosPaymentsByMethod(db, context);
  const grossSales = await readPosGrossSalesAmount(db, context);
  const discountData = await readPosDiscount(db, context);
  const taxSummary = await readPosTaxSummary(db, context);
  const taxConfig = taxSummary ? null : await readCompanyPosTaxConfig(db, context);

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
      const defaultTaxRates = await listCompanyDefaultTaxRatesKysely(db, context.companyId);
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
  _db: KyselySchema,
  _context: SyncPushPostingContext
): Promise<SyncPushPostingHookResult> {
  return {
    mode: "shadow",
    journalBatchId: null,
    balanceOk: null,
    reason: "SHADOW_NOOP"
  };
}

// Inline fiscal year check using Kysely
async function ensureDateWithinOpenFiscalYearKysely(
  db: KyselySchema,
  companyId: number,
  date: string
): Promise<void> {
  const result = await sql<{ id: number }>`
    SELECT id FROM fiscal_years
    WHERE company_id = ${companyId}
      AND status = 'OPEN'
      AND start_date <= ${date}
      AND end_date >= ${date}
    LIMIT 1
  `.execute(db);

  if (result.rows.length === 0) {
    throw new Error("Date is outside any open fiscal year");
  }
}

async function runActivePostingHook(
  db: KyselySchema,
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

  await ensureDateWithinOpenFiscalYearKysely(
    db,
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
    new PosSyncPushPostingRepository(db, toMysqlDateTime(context.trxAt)),
    {
      [POS_SALE_DOC_TYPE]: new PosSyncPushPostingMapper(db, context)
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
  db: KyselySchema,
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
      return await runShadowPostingHook(db, context);
    } else {
      return await runActivePostingHook(db, context);
    }
  } catch (error) {
    throw new SyncPushPostingHookError(mode, error);
  }
}
