// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Supplier Statement Service for purchasing module.
 *
 * Provides supplier statement management with tenant isolation.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import { AP_PAYMENT_STATUS, PURCHASE_CREDIT_STATUS, PURCHASE_INVOICE_STATUS } from "@jurnapod/shared";
import { toScaled } from "./ap-reconciliation-service.js";
import { fromScaled4 } from "./ap-reconciliation-service.js";
import type {
  SupplierStatement,
  SupplierStatementCreateInput,
  SupplierStatementListFilters,
  SupplierStatementReconcileResult,
  CreateSupplierStatementParams,
  ListSupplierStatementsParams,
  GetSupplierStatementParams,
  ReconcileSupplierStatementParams,
  MarkSupplierStatementReconciledParams,
} from "../types/supplier-statements.js";
import {
  SupplierStatementError,
  SupplierStatementNotFoundError,
  SupplierStatementSupplierNotOwnedError,
  SupplierStatementSupplierNotActiveError,
  SupplierStatementAlreadyReconciledError,
  SupplierStatementDuplicateError,
  SupplierStatementCurrencyMismatchError,
  SupplierStatementExchangeRateMissingError,
  SupplierStatementInvalidToleranceError,
  DEFAULT_VARIANCE_TOLERANCE,
  SUPPLIER_STATEMENT_STATUS,
} from "../types/supplier-statements.js";

// Re-export constants for convenience
export {
  SUPPLIER_STATEMENT_STATUS,
  DEFAULT_VARIANCE_TOLERANCE,
} from "../types/supplier-statements.js";

// =============================================================================
// Date Helpers
// =============================================================================

/**
 * Return the next calendar day after dateStr (YYYY-MM-DD) as a YYYY-MM-DD string.
 */
function nextDay(dateStr: string): string {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  const d = Number(dateStr.slice(8, 10));
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
 */
function computeBaseAmount(originalAmount: string, exchangeRate: string): bigint {
  const originalScaled = toScaled(originalAmount, 4);
  const rateScaled = toScaled(exchangeRate, 8);
  const scaleFactor = 10n ** 8n;
  const half = scaleFactor / 2n;
  const product = originalScaled * rateScaled;
  return originalScaled >= 0n
    ? (product + half) / scaleFactor
    : (product - half) / scaleFactor;
}

// =============================================================================
// Helper Functions
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

  if (
    originalCurrencyCode &&
    originalExchangeRate &&
    targetCurrencyCode === originalCurrencyCode
  ) {
    const txRateScaled8 = toScaled(originalExchangeRate, 8);
    if (txRateScaled8 === 0n) {
      throw new SupplierStatementExchangeRateMissingError(originalCurrencyCode, onDate);
    }
    const numerator = baseAmountScaled4 * (10n ** 8n);
    const half = txRateScaled8 / 2n;
    return baseAmountScaled4 >= 0n
      ? (numerator + half) / txRateScaled8
      : (numerator - half) / txRateScaled8;
  }

  const rateScaled8 = await getEffectiveRateToBase(db, companyId, targetCurrencyCode, onDate, rateCache);
  if (rateScaled8 === 0n) {
    throw new SupplierStatementExchangeRateMissingError(targetCurrencyCode, onDate);
  }
  const numerator = baseAmountScaled4 * (10n ** 8n);
  const half = rateScaled8 / 2n;
  return baseAmountScaled4 >= 0n
    ? (numerator + half) / rateScaled8
    : (numerator - half) / rateScaled8;
}

// =============================================================================
// Service
// =============================================================================

export class SupplierStatementService {
  constructor(private readonly db: KyselySchema) {}

  /**
   * Validate supplier belongs to company and is active.
   */
  async validateSupplierOwnership(
    companyId: number,
    supplierId: number
  ): Promise<{ currency: string }> {
    const result = await sql`
      SELECT id, company_id, is_active, currency FROM suppliers
      WHERE id = ${supplierId}
      LIMIT 1
    `.execute(this.db);

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

  async validateStatementCurrency(
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
    `.execute(this.db);

    if (rateExists.rows.length === 0) {
      throw new SupplierStatementExchangeRateMissingError(currencyCode, statementDate);
    }
  }

  /**
   * Create a new supplier statement entry.
   */
  async createSupplierStatement(params: CreateSupplierStatementParams): Promise<SupplierStatement> {
    const { companyId, userId, input } = params;
    const { supplierId, statementDate, closingBalance, currencyCode } = input;

    await this.validateStatementCurrency(companyId, currencyCode, statementDate);
    const supplier = await this.validateSupplierOwnership(companyId, supplierId);

    if (currencyCode !== supplier.currency) {
      throw new SupplierStatementCurrencyMismatchError(currencyCode, supplier.currency);
    }

    // Insert the statement
    let insertedId: number;
    try {
      const insertResult = await sql`
        INSERT INTO supplier_statements (
          company_id, supplier_id, statement_date, closing_balance, currency_code,
          status, created_by_user_id, created_at, updated_at
        )
        VALUES (
          ${companyId}, ${supplierId}, ${statementDate}, ${closingBalance},
          ${currencyCode}, ${SUPPLIER_STATEMENT_STATUS.PENDING}, ${userId}, NOW(), NOW()
        )
      `.execute(this.db);

      insertedId = Number((insertResult as { insertId?: string }).insertId);
      if (!insertedId) {
        throw new SupplierStatementError("CREATE_FAILED", "Failed to create supplier statement");
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error as { code?: string }).code === "ER_DUP_ENTRY"
      ) {
        throw new SupplierStatementDuplicateError(supplierId, statementDate);
      }
      throw error;
    }

    // Fetch and return the created statement
    const fetchResult = await sql`
      SELECT id, company_id, supplier_id, statement_date, closing_balance, currency_code,
             status, reconciled_at, reconciled_by_user_id, created_by_user_id, created_at, updated_at
      FROM supplier_statements
      WHERE id = ${insertedId}
    `.execute(this.db);

    if (fetchResult.rows.length === 0) {
      throw new SupplierStatementError("CREATE_FAILED", "Failed to fetch created supplier statement");
    }

    return mapRowToStatement(fetchResult.rows[0] as Record<string, unknown>);
  }

  /**
   * List supplier statements with filters.
   */
  async listSupplierStatements(params: ListSupplierStatementsParams): Promise<{ statements: SupplierStatement[]; total: number }> {
    const { companyId, filters } = params;

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
    `.execute(this.db);
    const total = Number((countResult.rows[0] as { count: string }).count);

    // List query
    const listResult = await sql`
      SELECT id, company_id, supplier_id, statement_date, closing_balance, currency_code,
             status, reconciled_at, reconciled_by_user_id, created_by_user_id, created_at, updated_at
      FROM supplier_statements
      WHERE ${whereClause}
      ORDER BY statement_date DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}
    `.execute(this.db);

    const statements = listResult.rows.map(row => mapRowToStatement(row as Record<string, unknown>));

    return { statements, total };
  }

  /**
   * Get a supplier statement by ID.
   */
  async getSupplierStatement(params: GetSupplierStatementParams): Promise<SupplierStatement | null> {
    const { companyId, statementId } = params;

    const result = await sql`
      SELECT id, company_id, supplier_id, statement_date, closing_balance, currency_code,
             status, reconciled_at, reconciled_by_user_id, created_by_user_id, created_at, updated_at
      FROM supplier_statements
      WHERE id = ${statementId} AND company_id = ${companyId}
      LIMIT 1
    `.execute(this.db);

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToStatement(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Compute subledger balance for a supplier as of a given date.
   */
  private async getSupplierSubledgerBalance(
    companyId: number,
    supplierId: number,
    asOfDate: string,
    statementCurrencyCode: string
  ): Promise<bigint> {
    const rateCache = new Map<string, bigint>();

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
    `.execute(this.db);

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

      const baseTotal = computeBaseAmount(r.grand_total, r.exchange_rate);
      const paidBase = toScaled(r.paid_base, 4);
      const creditedBase = toScaled(r.credited_base, 4);
      const openBase = baseTotal - paidBase - creditedBase;

      if (openBase !== 0n) {
        const openInStatementCurrency = await convertBaseToCurrency(
          this.db,
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

  /**
   * Reconcile a supplier statement by computing variance.
   */
  async reconcileSupplierStatement(params: ReconcileSupplierStatementParams): Promise<SupplierStatementReconcileResult> {
    const { companyId, statementId, tolerance = DEFAULT_VARIANCE_TOLERANCE } = params;

    // Fetch the statement
    const statement = await this.getSupplierStatement({ companyId, statementId });
    if (!statement) {
      throw new SupplierStatementNotFoundError(statementId);
    }

    // Validate supplier ownership
    const supplier = await this.validateSupplierOwnership(companyId, statement.supplierId);

    if (statement.currencyCode !== supplier.currency) {
      throw new SupplierStatementCurrencyMismatchError(statement.currencyCode, supplier.currency);
    }

    await this.validateStatementCurrency(companyId, statement.currencyCode, statement.statementDate);

    // Compute subledger balance as of statement date
    const subledgerBalance = await this.getSupplierSubledgerBalance(
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

  /**
   * Mark a supplier statement as reconciled.
   */
  async markSupplierStatementReconciled(params: MarkSupplierStatementReconciledParams): Promise<SupplierStatement> {
    const { companyId, statementId, userId } = params;

    // Fetch the statement
    const statement = await this.getSupplierStatement({ companyId, statementId });
    if (!statement) {
      throw new SupplierStatementNotFoundError(statementId);
    }

    if (statement.status === SUPPLIER_STATEMENT_STATUS.RECONCILED) {
      throw new SupplierStatementAlreadyReconciledError(statementId);
    }

    // Validate supplier ownership
    await this.validateSupplierOwnership(companyId, statement.supplierId);

    // Concurrency-safe update
    const updateResult = await sql`
      UPDATE supplier_statements
      SET status = ${SUPPLIER_STATEMENT_STATUS.RECONCILED},
          reconciled_at = NOW(),
          reconciled_by_user_id = ${userId},
          updated_at = NOW()
      WHERE id = ${statementId}
        AND company_id = ${companyId}
        AND status = ${SUPPLIER_STATEMENT_STATUS.PENDING}
    `.execute(this.db);

    const affected = Number((updateResult as { numAffectedRows?: bigint; affectedRows?: number }).numAffectedRows ??
      (updateResult as { affectedRows?: number }).affectedRows ?? 0);

    if (affected === 0) {
      throw new SupplierStatementAlreadyReconciledError(statementId);
    }

    // Fetch and return updated statement
    const updated = await this.getSupplierStatement({ companyId, statementId });
    if (!updated) {
      throw new SupplierStatementError("UPDATE_FAILED", "Failed to fetch updated supplier statement");
    }

    return updated;
  }
}

// Export error classes
export {
  SupplierStatementError,
  SupplierStatementNotFoundError,
  SupplierStatementSupplierNotOwnedError,
  SupplierStatementSupplierNotActiveError,
  SupplierStatementAlreadyReconciledError,
  SupplierStatementDuplicateError,
  SupplierStatementCurrencyMismatchError,
  SupplierStatementExchangeRateMissingError,
  SupplierStatementInvalidToleranceError,
};
