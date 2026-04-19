// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Supplier Statements Domain Service (Epic 47 Story 47.3)
 *
 * Manual supplier statement entry and reconciliation:
 * - Create supplier statement entry (supplier_id, statement_date, closing_balance, currency)
 * - List/filter statements by supplier/date/status
 * - Compute per-supplier AP subledger balance as-of statement date
 * - Compare statement balance vs subledger balance with variance and tolerance flag
 * - Mark reconciled with reconciled_at and reconciled_by_user_id
 *
 * Key behaviors:
 * - Strict company_id scoping on all reads/writes
 * - Supplier ownership validation (supplier must belong to company)
 * - Decimal-safe math (no float) using scaled bigint
 * - Variance tolerance configurable (default: 1.0000 base units)
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import { AP_PAYMENT_STATUS, PURCHASE_CREDIT_STATUS, PURCHASE_INVOICE_STATUS } from "@jurnapod/shared";
import { getDb } from "@/lib/db";
import { toScaled, fromScaled4 } from "./ap-reconciliation.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Supplier statement statuses
 */
export const SUPPLIER_STATEMENT_STATUS = {
  PENDING: 1,
  RECONCILED: 2,
} as const;

export const SUPPLIER_STATEMENT_STATUS_LABEL: Record<number, keyof typeof SUPPLIER_STATEMENT_STATUS> = {
  1: "PENDING",
  2: "RECONCILED",
};

export const SUPPLIER_STATEMENT_STATUS_VALUES = ["PENDING", "RECONCILED"] as const;

/**
 * Default variance tolerance in statement currency units (1.0000)
 */
export const DEFAULT_VARIANCE_TOLERANCE = "1.0000";

// =============================================================================
// Error Types
// =============================================================================

export class SupplierStatementError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string
  ) {
    super(message);
    this.name = "SupplierStatementError";
  }
}

export class SupplierStatementNotFoundError extends SupplierStatementError {
  constructor(statementId: number) {
    super("SUPPLIER_STATEMENT_NOT_FOUND", `Supplier statement ${statementId} not found`);
  }
}

export class SupplierStatementSupplierNotOwnedError extends SupplierStatementError {
  constructor(supplierId: number, companyId: number) {
    super(
      "SUPPLIER_STATEMENT_SUPPLIER_NOT_OWNED",
      `Supplier ${supplierId} does not belong to company ${companyId}`
    );
  }
}

export class SupplierStatementSupplierNotActiveError extends SupplierStatementError {
  constructor(supplierId: number) {
    super(
      "SUPPLIER_STATEMENT_SUPPLIER_NOT_ACTIVE",
      `Supplier ${supplierId} is not active`
    );
  }
}

export class SupplierStatementAlreadyReconciledError extends SupplierStatementError {
  constructor(statementId: number) {
    super(
      "SUPPLIER_STATEMENT_ALREADY_RECONCILED",
      `Supplier statement ${statementId} is already reconciled`
    );
  }
}

export class SupplierStatementDuplicateError extends SupplierStatementError {
  constructor(supplierId: number, statementDate: string) {
    super(
      "SUPPLIER_STATEMENT_DUPLICATE",
      `A statement for supplier ${supplierId} already exists on ${statementDate}`
    );
  }
}

export class SupplierStatementCurrencyMismatchError extends SupplierStatementError {
  constructor(statementCurrency: string, supplierCurrency: string) {
    super(
      "SUPPLIER_STATEMENT_CURRENCY_MISMATCH",
      `Statement currency ${statementCurrency} does not match supplier currency ${supplierCurrency}`
    );
  }
}

export class SupplierStatementExchangeRateMissingError extends SupplierStatementError {
  constructor(currencyCode: string, onDate: string) {
    super(
      "SUPPLIER_STATEMENT_EXCHANGE_RATE_MISSING",
      `Missing exchange rate for currency ${currencyCode} on or before ${onDate}`
    );
  }
}

export class SupplierStatementInvalidToleranceError extends SupplierStatementError {
  constructor(tolerance: string) {
    super(
      "SUPPLIER_STATEMENT_INVALID_TOLERANCE",
      `Tolerance must be a positive decimal value, got: ${tolerance}`
    );
  }
}

// =============================================================================
// Types
// =============================================================================

export interface SupplierStatement {
  id: number;
  companyId: number;
  supplierId: number;
  statementDate: string;
  closingBalance: string;
  currencyCode: string;
  status: number;
  reconciledAt: string | null;
  reconciledByUserId: number | null;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierStatementCreateInput {
  supplierId: number;
  statementDate: string;
  closingBalance: string;
  currencyCode: string;
}

export interface SupplierStatementListFilters {
  supplierId?: number;
  dateFrom?: string;
  dateTo?: string;
  status?: number;
  limit?: number;
  offset?: number;
}

export interface SupplierStatementReconcileResult {
  statementId: number;
  supplierId: number;
  statementDate: string;
  statementBalance: string;
  subledgerBalance: string;
  variance: string;
  varianceWithinTolerance: boolean;
  tolerance: string;
  currencyCode: string;
}

// =============================================================================
// Supplier Validation
// =============================================================================

/**
 * Validate supplier belongs to company and is active.
 */
async function validateSupplierOwnership(
  db: KyselySchema,
  companyId: number,
  supplierId: number
): Promise<{ currency: string }> {
  const result = await sql`
    SELECT id, company_id, is_active, currency FROM suppliers
    WHERE id = ${supplierId}
    LIMIT 1
  `.execute(db);

  if (result.rows.length === 0) {
    throw new SupplierStatementSupplierNotOwnedError(supplierId, companyId);
  }

  const supplier = result.rows[0] as { id: number; company_id: number; is_active: number; currency: string };
  if (supplier.company_id !== companyId) {
    throw new SupplierStatementSupplierNotOwnedError(supplierId, companyId);
  }

  if (supplier.is_active !== 1) {
    throw new SupplierStatementSupplierNotActiveError(supplierId);
  }

  return { currency: String(supplier.currency ?? "IDR") };
}

async function validateStatementCurrency(
  db: KyselySchema,
  companyId: number,
  currencyCode: string,
  statementDate: string
): Promise<void> {
  if (currencyCode === "IDR") {
    return;
  }

  const rateExists = await sql`
    SELECT id
    FROM exchange_rates
    WHERE company_id = ${companyId}
      AND currency_code = ${currencyCode}
      AND effective_date <= ${statementDate}
      AND is_active = 1
    ORDER BY effective_date DESC, created_at DESC
    LIMIT 1
  `.execute(db);

  if (rateExists.rows.length === 0) {
    throw new SupplierStatementExchangeRateMissingError(currencyCode, statementDate);
  }
}

// =============================================================================
// Create Statement
// =============================================================================

/**
 * Create a new supplier statement entry.
 * Fails if a statement already exists for supplier+date combination.
 * Uses DB unique key for race-safe duplicate detection.
 */
export async function createSupplierStatement(
  companyId: number,
  userId: number,
  input: SupplierStatementCreateInput
): Promise<SupplierStatement> {
  const db = getDb() as KyselySchema;
  await validateStatementCurrency(db, companyId, input.currencyCode, input.statementDate);

  // Validate supplier ownership
  const supplier = await validateSupplierOwnership(db, companyId, input.supplierId);

  if (input.currencyCode !== supplier.currency) {
    throw new SupplierStatementCurrencyMismatchError(input.currencyCode, supplier.currency);
  }

  // Insert the statement - DB unique key (company_id, supplier_id, statement_date)
  // ensures race-safe duplicate detection. We catch MySQL duplicate entry error.
  let insertedId: number;
  try {
    const insertResult = await sql`
      INSERT INTO supplier_statements (
        company_id, supplier_id, statement_date, closing_balance, currency_code,
        status, created_by_user_id, created_at, updated_at
      )
      VALUES (
        ${companyId}, ${input.supplierId}, ${input.statementDate}, ${input.closingBalance},
        ${input.currencyCode}, ${SUPPLIER_STATEMENT_STATUS.PENDING}, ${userId}, NOW(), NOW()
      )
    `.execute(db);

    insertedId = Number((insertResult as { insertId?: string }).insertId);
    if (!insertedId) {
      throw new SupplierStatementError("CREATE_FAILED", "Failed to create supplier statement");
    }
  } catch (error) {
    // MySQL duplicate entry error code is 1062
    if (
      error instanceof Error &&
      (error as { code?: string }).code === "ER_DUP_ENTRY"
    ) {
      throw new SupplierStatementDuplicateError(input.supplierId, input.statementDate);
    }
    throw error;
  }

  // Fetch and return the created statement
  const fetchResult = await sql`
    SELECT id, company_id, supplier_id, statement_date, closing_balance, currency_code,
           status, reconciled_at, reconciled_by_user_id, created_by_user_id, created_at, updated_at
    FROM supplier_statements
    WHERE id = ${insertedId}
  `.execute(db);

  if (fetchResult.rows.length === 0) {
    throw new SupplierStatementError("CREATE_FAILED", "Failed to fetch created supplier statement");
  }

  return mapRowToStatement(fetchResult.rows[0] as Record<string, unknown>);
}

// =============================================================================
// List Statements
// =============================================================================

/**
 * List supplier statements with filters.
 * Always scoped to company_id.
 */
export async function listSupplierStatements(
  companyId: number,
  filters: SupplierStatementListFilters
): Promise<{ statements: SupplierStatement[]; total: number }> {
  const db = getDb() as KyselySchema;

  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;

  // Build WHERE conditions
  const conditions = [sql`company_id = ${companyId}`];

  if (filters.supplierId !== undefined) {
    conditions.push(sql`supplier_id = ${filters.supplierId}`);
  }

  if (filters.dateFrom !== undefined) {
    conditions.push(sql`statement_date >= ${filters.dateFrom}`);
  }

  if (filters.dateTo !== undefined) {
    conditions.push(sql`statement_date <= ${filters.dateTo}`);
  }

  if (filters.status !== undefined) {
    conditions.push(sql`status = ${filters.status}`);
  }

  const whereClause = conditions.reduce((acc, cond, i) =>
    i === 0 ? cond : sql`${acc} AND ${cond}`,
    sql`1=1`
  );

  // Count query
  const countResult = await sql`
    SELECT COUNT(*) as count FROM supplier_statements WHERE ${whereClause}
  `.execute(db);
  const total = Number((countResult.rows[0] as { count: string }).count);

  // List query
  const listResult = await sql`
    SELECT id, company_id, supplier_id, statement_date, closing_balance, currency_code,
           status, reconciled_at, reconciled_by_user_id, created_by_user_id, created_at, updated_at
    FROM supplier_statements
    WHERE ${whereClause}
    ORDER BY statement_date DESC, id DESC
    LIMIT ${limit} OFFSET ${offset}
  `.execute(db);

  const statements = listResult.rows.map(row => mapRowToStatement(row as Record<string, unknown>));

  return { statements, total };
}

// =============================================================================
// Get Single Statement
// =============================================================================

/**
 * Get a supplier statement by ID.
 * Returns null if not found or not owned by company.
 */
export async function getSupplierStatement(
  companyId: number,
  statementId: number
): Promise<SupplierStatement | null> {
  const db = getDb() as KyselySchema;

  const result = await sql`
    SELECT id, company_id, supplier_id, statement_date, closing_balance, currency_code,
           status, reconciled_at, reconciled_by_user_id, created_by_user_id, created_at, updated_at
    FROM supplier_statements
    WHERE id = ${statementId} AND company_id = ${companyId}
    LIMIT 1
  `.execute(db);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToStatement(result.rows[0] as Record<string, unknown>);
}

// =============================================================================
// Reconcile Statement (Compute Variance)
// =============================================================================

/**
 * Compute subledger balance for a supplier as of a given date.
 * Uses the same formula as AP reconciliation:
 * - Sum of posted purchase invoices (base = grand_total * exchange_rate)
 * - Subtract posted AP payments
 * - Subtract applied purchase credit notes
 */
async function getSupplierSubledgerBalance(
  db: KyselySchema,
  companyId: number,
  supplierId: number,
  asOfDate: string,
  statementCurrencyCode: string
): Promise<bigint> {
  const rateCache = new Map<string, bigint>();

  // Sum open invoices for this supplier up to as_of_date
  // Payment and credit effects are also filtered by as_of_date to ensure
  // only transactions up to statement date are included (AC2 requirement).
  const invoiceRows = await sql`
    SELECT
      pi.grand_total,
      pi.exchange_rate,
      pi.currency_code,
      pi.invoice_date,
      COALESCE(pay.total_paid, 0) AS paid_base,
      COALESCE(cr.total_credited, 0) AS credited_base
    FROM purchase_invoices pi
    LEFT JOIN (
      SELECT apl.purchase_invoice_id, SUM(apl.allocation_amount) AS total_paid
      FROM ap_payment_lines apl
      INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id
      WHERE ap.company_id = ${companyId}
        AND ap.supplier_id = ${supplierId}
        AND ap.status = ${AP_PAYMENT_STATUS.POSTED}
        AND ap.payment_date <= ${asOfDate}
      GROUP BY apl.purchase_invoice_id
    ) pay ON pay.purchase_invoice_id = pi.id
    LEFT JOIN (
      SELECT pca.purchase_invoice_id, SUM(pca.applied_amount) AS total_credited
      FROM purchase_credit_applications pca
      INNER JOIN purchase_credits pc ON pc.id = pca.purchase_credit_id
      WHERE pca.company_id = ${companyId}
        AND pc.supplier_id = ${supplierId}
        AND pc.status IN (${PURCHASE_CREDIT_STATUS.PARTIAL}, ${PURCHASE_CREDIT_STATUS.APPLIED})
          AND pca.applied_at < ${nextDay(asOfDate)}
      GROUP BY pca.purchase_invoice_id
    ) cr ON cr.purchase_invoice_id = pi.id
    WHERE pi.company_id = ${companyId}
      AND pi.supplier_id = ${supplierId}
      AND pi.status = ${PURCHASE_INVOICE_STATUS.POSTED}
      AND pi.invoice_date <= ${asOfDate}
  `.execute(db);

  let totalInStatementCurrency = 0n;

  for (const row of invoiceRows.rows) {
    const r = row as {
      grand_total: string;
      exchange_rate: string;
      currency_code: string;
      invoice_date: string;
      paid_base: string;
      credited_base: string;
    };

    // Compute base amount: grand_total * exchange_rate
    const baseTotal = computeBaseAmount(r.grand_total, r.exchange_rate);
    const paidBase = toScaled(r.paid_base, 4);
    const creditedBase = toScaled(r.credited_base, 4);
    const openBase = baseTotal - paidBase - creditedBase;

    if (openBase !== 0n) {
      const openInStatementCurrency = await convertBaseToCurrency(
        db,
        companyId,
        openBase,
        statementCurrencyCode,
        r.invoice_date,
        rateCache,
        r.currency_code,
        r.exchange_rate
      );
      totalInStatementCurrency += openInStatementCurrency;
    }
  }

  return totalInStatementCurrency;
}

// =============================================================================
// Date Helpers
// =============================================================================

/**
 * Return the next calendar day after dateStr (YYYY-MM-DD) as a YYYY-MM-DD string.
 * Used to build end-exclusive date boundaries without wrapping indexed
 * DATETIME columns in SQL functions (keeps MySQL index usage safe).
 *
 * FIX (WP-1): previously used bare DATE comparison (applied_at <= asOfDate)
 * which excludes same-day applications at non-midnight times because MySQL
 * coerces DATE to DATETIME(0) = 00:00:00. E.g. applied_at='2026-03-31 14:00'
 * was excluded when asOfDate='2026-03-31'. Now uses < nextDay(asOfDate) for
 * full-day inclusive semantics (all applications on asOfDate are included).
 */
function nextDay(dateStr: string): string {
  // Parse ISO date without a date library (business logic uses Temporal; this
  // is only a string-boundary helper, not a business-time computation).
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  const d = Number(dateStr.slice(8, 10));
  // Build next date using plain JS Date — result is a local-time calendar date
  const next = new Date(y, m - 1, d + 1);
  const ny = next.getFullYear();
  const nm = next.getMonth() + 1;
  const nd = next.getDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

// =============================================================================
// Compute Base Amount
// =============================================================================

/**
 * Compute base amount from original amount and exchange rate.
 * Uses scaled bigint math to avoid float precision issues.
 *
 * FIX (WP-1): Sign-aware half-up rounding — previously added scaleFactor/2n
 * unconditionally, which introduced a positive bias for negative amounts
 * (e.g. -0.0001 * 1.0 would round to 0 instead of -1). Now subtracts half
 * for negatives so that rounding is symmetric around zero.
 */
function computeBaseAmount(originalAmount: string, exchangeRate: string): bigint {
  const originalScaled = toScaled(originalAmount, 4);
  const rateScaled = toScaled(exchangeRate, 8);
  // original * rate: (scale4 * scale8) = scale12
  // To get back to scale4, divide by 10^8
  const scaleFactor = 10n ** 8n;
  const half = scaleFactor / 2n; // 50_000_000n — always positive
  const product = originalScaled * rateScaled;
  // Sign-aware: subtract half for negatives (mirrors convertBaseToCurrency)
  return originalScaled >= 0n
    ? (product + half) / scaleFactor
    : (product - half) / scaleFactor;
}

async function getEffectiveRateToBase(
  db: KyselySchema,
  companyId: number,
  currencyCode: string,
  onDate: string,
  rateCache?: Map<string, bigint>
): Promise<bigint> {
  if (currencyCode === "IDR") {
    return toScaled("1.00000000", 8);
  }

  const cacheKey = `${companyId}|${currencyCode}|${onDate}`;
  const cached = rateCache?.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const rateResult = await sql`
    SELECT rate
    FROM exchange_rates
    WHERE company_id = ${companyId}
      AND currency_code = ${currencyCode}
      AND effective_date <= ${onDate}
      AND is_active = 1
    ORDER BY effective_date DESC, created_at DESC
    LIMIT 1
  `.execute(db);

  if (rateResult.rows.length === 0) {
    throw new SupplierStatementExchangeRateMissingError(currencyCode, onDate);
  }

  const rateRow = rateResult.rows[0] as { rate: string };
  const rate = toScaled(String(rateRow.rate), 8);
  rateCache?.set(cacheKey, rate);
  return rate;
}

async function convertBaseToCurrency(
  db: KyselySchema,
  companyId: number,
  baseAmountScaled4: bigint,
  targetCurrencyCode: string,
  onDate: string,
  rateCache?: Map<string, bigint>,
  originalCurrencyCode?: string,
  originalExchangeRate?: string
): Promise<bigint> {
  if (targetCurrencyCode === "IDR") {
    return baseAmountScaled4;
  }

  // Prefer transaction-stored rate for consistency with posting calculations
  // when target equals original transaction currency.
  if (
    originalCurrencyCode &&
    originalExchangeRate &&
    targetCurrencyCode === originalCurrencyCode
  ) {
    const txRateScaled8 = toScaled(originalExchangeRate, 8);
    // Guard against zero exchange rate to prevent division by zero
    if (txRateScaled8 === 0n) {
      throw new SupplierStatementExchangeRateMissingError(originalCurrencyCode, onDate);
    }
    const numerator = baseAmountScaled4 * (10n ** 8n);
    // Sign-aware half-up rounding: subtract half for negatives so that
    // -0.5 rounds to -1, not 0 (avoiding positive-only bias).
    const half = txRateScaled8 / 2n;
    return baseAmountScaled4 >= 0n
      ? (numerator + half) / txRateScaled8
      : (numerator - half) / txRateScaled8;
  }

  const rateScaled8 = await getEffectiveRateToBase(db, companyId, targetCurrencyCode, onDate, rateCache);
  // Guard against zero exchange rate to prevent division by zero
  if (rateScaled8 === 0n) {
    throw new SupplierStatementExchangeRateMissingError(targetCurrencyCode, onDate);
  }
  // TRANSACTION-DATE FX BASIS POLICY (intentional):
  // FX conversion uses the transaction-level rate and invoice date,
  // NOT the statement date. This matches how AP invoices are posted
  // and ensures the subledger balance reflects what was actually recorded
  // at the time of each transaction, not a revalued figure.
  const numerator = baseAmountScaled4 * (10n ** 8n);
  const half = rateScaled8 / 2n;
  return baseAmountScaled4 >= 0n
    ? (numerator + half) / rateScaled8
    : (numerator - half) / rateScaled8;
}

/**
 * Reconcile a supplier statement by computing variance.
 * Returns reconcile result without marking statement as reconciled.
 *
 * @param companyId - Company ID for scoping
 * @param statementId - Statement ID to reconcile
 * @param tolerance - Variance tolerance threshold (default: 100.0000)
 */
export async function reconcileSupplierStatement(
  companyId: number,
  statementId: number,
  tolerance: string = DEFAULT_VARIANCE_TOLERANCE
): Promise<SupplierStatementReconcileResult> {
  const db = getDb() as KyselySchema;

  // Fetch the statement
  const statement = await getSupplierStatement(companyId, statementId);
  if (!statement) {
    throw new SupplierStatementNotFoundError(statementId);
  }

  // Validate supplier ownership
  const supplier = await validateSupplierOwnership(db, companyId, statement.supplierId);

  if (statement.currencyCode !== supplier.currency) {
    throw new SupplierStatementCurrencyMismatchError(statement.currencyCode, supplier.currency);
  }

  await validateStatementCurrency(db, companyId, statement.currencyCode, statement.statementDate);

  // Compute subledger balance as of statement date
  const subledgerBalance = await getSupplierSubledgerBalance(
    db,
    companyId,
    statement.supplierId,
    statement.statementDate,
    statement.currencyCode
  );

  const statementBalance = toScaled(statement.closingBalance, 4);
  const variance = statementBalance - subledgerBalance;
  const toleranceScaled = toScaled(tolerance, 4);

  if (toleranceScaled <= 0n) {
    throw new SupplierStatementInvalidToleranceError(tolerance);
  }

  // Variance is within tolerance if absolute variance <= tolerance
  const varianceWithinTolerance = variance < 0n
    ? -variance <= toleranceScaled
    : variance <= toleranceScaled;

  return {
    statementId: statement.id,
    supplierId: statement.supplierId,
    statementDate: statement.statementDate,
    statementBalance: fromScaled4(statementBalance),
    subledgerBalance: fromScaled4(subledgerBalance),
    variance: fromScaled4(variance),
    varianceWithinTolerance,
    tolerance,
    currencyCode: statement.currencyCode,
  };
}

// =============================================================================
// Mark Statement Reconciled
// =============================================================================

/**
 * Mark a supplier statement as reconciled.
 * Sets reconciled_at and reconciled_by_user_id.
 * Fails if statement is already reconciled.
 */
export async function markSupplierStatementReconciled(
  companyId: number,
  statementId: number,
  userId: number
): Promise<SupplierStatement> {
  const db = getDb() as KyselySchema;

  // Fetch the statement
  const statement = await getSupplierStatement(companyId, statementId);
  if (!statement) {
    throw new SupplierStatementNotFoundError(statementId);
  }

  if (statement.status === SUPPLIER_STATEMENT_STATUS.RECONCILED) {
    throw new SupplierStatementAlreadyReconciledError(statementId);
  }

  // Validate supplier ownership
  await validateSupplierOwnership(db, companyId, statement.supplierId);

  // Concurrency-safe update: only reconcile when still pending.
  const updateResult = await sql`
    UPDATE supplier_statements
    SET status = ${SUPPLIER_STATEMENT_STATUS.RECONCILED},
        reconciled_at = NOW(),
        reconciled_by_user_id = ${userId},
        updated_at = NOW()
    WHERE id = ${statementId}
      AND company_id = ${companyId}
      AND status = ${SUPPLIER_STATEMENT_STATUS.PENDING}
  `.execute(db);

  const affected = Number((updateResult as { numAffectedRows?: bigint; affectedRows?: number }).numAffectedRows ??
    (updateResult as { affectedRows?: number }).affectedRows ?? 0);

  if (affected === 0) {
    throw new SupplierStatementAlreadyReconciledError(statementId);
  }

  // Fetch and return updated statement
  const updated = await getSupplierStatement(companyId, statementId);
  if (!updated) {
    throw new SupplierStatementError("UPDATE_FAILED", "Failed to fetch updated supplier statement");
  }

  return updated;
}

// =============================================================================
// Helpers
// =============================================================================

function mapRowToStatement(row: Record<string, unknown>): SupplierStatement {
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    supplierId: Number(row.supplier_id),
    statementDate: row.statement_date instanceof Date
      ? row.statement_date.toISOString().split("T")[0]
      : String(row.statement_date),
    closingBalance: String(row.closing_balance),
    currencyCode: String(row.currency_code),
    status: Number(row.status),
    reconciledAt: row.reconciled_at instanceof Date
      ? row.reconciled_at.toISOString()
      : row.reconciled_at ? String(row.reconciled_at) : null,
    reconciledByUserId: row.reconciled_by_user_id != null ? Number(row.reconciled_by_user_id) : null,
    createdByUserId: row.created_by_user_id != null ? Number(row.created_by_user_id) : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}
