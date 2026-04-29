// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * CASH Subledger Balance Provider.
 *
 * Provides balance for cash accounts by aggregating:
 * 1. Journal lines where account_type.name IN ('CASH', 'BANK') or type_name matches
 * 2. Bank transactions (cash_bank_transactions) that haven't been posted to GL
 *
 * Note: Epic 32 does not cover foreign currency (FX) handling.
 * All amounts are assumed to be in base currency.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import {
  resolveBusinessTimezone,
  epochMsToPeriodBoundaries,
} from "@jurnapod/shared";

import {
  type SubledgerBalanceProvider,
  type SubledgerBalanceQuery,
  type SubledgerBalanceResult,
  type SignedAmount,
  type SignedAmountBreakdown,
  type ReconciliationDrilldown,
  type ReconciliationDrilldownLine,
  SubledgerType,
  type SubledgerTypeCode,
  makeSignedAmount,
  toSignedAmountBreakdown,
  mapJournalLineToDrilldown,
  zeroBreakdown,
  zeroSignedAmount,
  fromSignedAmount,
  addSignedAmounts,
} from "./provider.js";

/**
 * CASH provider database client interface.
 */
export interface CashSubledgerDbClient extends KyselySchema {}

/**
 * Options for CashSubledgerProvider.
 */
export interface CashSubledgerProviderOptions {
  db: CashSubledgerDbClient;
  /** Optional: additional account type names to treat as cash (beyond CASH/BANK) */
  additionalCashAccountTypes?: readonly string[];
}

/**
 * Internal row type for journal line aggregation.
 */
interface CashBalanceRow {
  account_id: number;
  debit_total: string;
  credit_total: string;
}

/**
 * Internal row type for drilldown.
 */
interface DrilldownJournalLineRow {
  id: number;
  account_id: number;
  debit: string;
  credit: string;
  description: string;
  line_date: Date;
  outlet_id: number | null;
}

/**
 * Internal row type for cash bank transactions.
 */
interface CashBankTxRow {
  id: number;
  amount: string;
  transaction_date: Date;
  description: string;
  source_account_id: number;
  destination_account_id: number;
  transaction_type: string;
  outlet_id: number | null;
}

/**
 * CASH subledger balance provider.
 *
 * Handles CASH subledger type with:
 * - Source: journal_lines for accounts classified as CASH or BANK
 * - Bank transactions without GL counterparts shown as variance
 *
 * Edge cases:
 * - No transactions in period → zero balance with empty breakdown
 * - Multiple cash accounts → aggregate by accountId or total (based on query)
 * - Bank transactions without corresponding GL entries → show as SUBLEDGER_TX lines
 */
export class CashSubledgerProvider implements SubledgerBalanceProvider {
  readonly subledgerType: SubledgerTypeCode = SubledgerType.CASH;

  private readonly db: CashSubledgerDbClient;
  private readonly additionalCashAccountTypes: readonly string[];

  constructor(options: CashSubledgerProviderOptions) {
    this.db = options.db;
    this.additionalCashAccountTypes = options.additionalCashAccountTypes ?? [];
  }

  /**
   * Check if provider is ready (optional implementation).
   * Currently always ready since we don't have external dependencies.
   */
  async checkReadiness(): Promise<void> {
    // No external dependencies to check
  }

  /**
   * Get cash subledger balance.
   */
  async getBalance(query: SubledgerBalanceQuery): Promise<SubledgerBalanceResult> {
    const { companyId, outletId, asOfEpochMs, fiscalYearId, periodId, accountId, includeDrilldown, drilldownLimit } = query;

    if (outletId !== undefined) {
      await this.assertOutletBelongsToCompany(companyId, outletId);
    }

    // Get cash account IDs for this company
    const cashAccountIds = await this.getCashAccountIds(companyId);

    if (cashAccountIds.length === 0) {
      // No cash accounts defined - return zero
      const zeroBal = zeroBreakdown();
      return {
        companyId,
        outletId,
        subledgerType: this.subledgerType,
        asOfEpochMs,
        accountId,
        signedBalance: zeroBal.signedNetAmount,
        breakdown: zeroBal,
        drilldown: includeDrilldown ? {
          subledgerType: this.subledgerType,
          accountId,
          periodStartEpochMs: asOfEpochMs,
          periodEndEpochMs: asOfEpochMs,
          openingSignedBalance: zeroSignedAmount(),
          movementsSignedNet: zeroSignedAmount(),
          closingSignedBalance: zeroSignedAmount(),
          lines: [],
        } : undefined,
      };
    }

    // Build date range filters
    const { periodStart, periodEnd } = await this.resolvePeriodRange(companyId, fiscalYearId, periodId, asOfEpochMs);

    // Calculate balances from journal lines
    const jlBalance = await this.getJournalLinesBalance(
      companyId,
      cashAccountIds,
      accountId,
      outletId,
      periodStart,
      periodEnd
    );

    // Calculate bank transactions that might not be in GL
    const bankTxBalance = await this.getBankTransactionsBalance(
      companyId,
      cashAccountIds,
      accountId,
      outletId,
      periodStart,
      periodEnd
    );

    // Combine breakdowns
    const totalDebit = jlBalance.debitTotal + bankTxBalance.debitTotal;
    const totalCredit = jlBalance.creditTotal + bankTxBalance.creditTotal;
    const breakdown = toSignedAmountBreakdown(totalDebit, totalCredit);

    // Build drilldown if requested
    let drilldown: ReconciliationDrilldown | undefined;
    if (includeDrilldown) {
      drilldown = await this.buildDrilldown(
        companyId,
        cashAccountIds,
        accountId,
        outletId,
        periodStart,
        periodEnd,
        breakdown.signedNetAmount,
        drilldownLimit ?? 1000
      );
    }

    return {
      companyId,
      outletId,
      subledgerType: this.subledgerType,
      asOfEpochMs,
      accountId,
      signedBalance: breakdown.signedNetAmount,
      breakdown,
      drilldown,
    };
  }

  private async assertOutletBelongsToCompany(companyId: number, outletId: number): Promise<void> {
    const outlet = await this.db
      .selectFrom("outlets")
      .select("id")
      .where("id", "=", outletId)
      .where("company_id", "=", companyId)
      .executeTakeFirst();

    if (!outlet) {
      throw new Error(`OUTLET_SCOPE_INVALID:Outlet ${outletId} not found for company ${companyId}`);
    }
  }

  /**
   * Get IDs of accounts classified as cash/bank.
   */
  private async getCashAccountIds(companyId: number): Promise<number[]> {
    const standardTypes = ["CASH", "BANK"];
    const allTypes = [...standardTypes, ...this.additionalCashAccountTypes];

    const typePlaceholders = allTypes.map(() => "?").join(", ");
    const query = sql<{ id: number }>`
      SELECT DISTINCT a.id
      FROM accounts a
      LEFT JOIN account_types at ON at.id = a.account_type_id
      WHERE a.company_id = ${companyId}
        AND a.is_active = 1
        AND (
          LOWER(COALESCE(at.name, a.type_name, '')) IN (${sql.join(allTypes.map(t => sql`${sql.literal(t.toLowerCase())}`), sql`, `)})
          OR LOWER(COALESCE(a.type_name, '')) IN (${sql.join(allTypes.map(t => sql`${sql.literal(t.toLowerCase())}`), sql`, `)})
        )
    `;

    const result = await query.execute(this.db);
    return (result.rows as { id: number }[]).map((r) => Number(r.id));
  }

  /**
   * Resolve period range from fiscal year/period filters.
   * Returns start and end as Date objects using canonical timezone-aware helpers.
   */
  private async resolvePeriodRange(
    companyId: number,
    fiscalYearId: number | undefined,
    periodId: number | undefined,
    asOfEpochMs: number | undefined
  ): Promise<{ periodStart: Date; periodEnd: Date }> {
    // If periodId is provided, it takes precedence
    if (periodId !== undefined) {
      // TODO: Once periods table exists, query it here
      // For now, fall through to fiscal year or date-based filtering
    }

    // Resolve business timezone first (needed for period derivation)
    const timezone = await this.resolveBusinessTimezone(companyId);

    // If fiscalYearId is provided, use fiscal year boundaries
    if (fiscalYearId !== undefined) {
      const fyResult = await sql<{ start_date: Date; end_date: Date }>`
        SELECT start_date, end_date
        FROM fiscal_years
        WHERE id = ${fiscalYearId}
          AND company_id = ${companyId}
      `.execute(this.db);

      if (fyResult.rows.length > 0) {
        const fy = fyResult.rows[0] as { start_date: Date; end_date: Date };
        return { periodStart: fy.start_date, periodEnd: fy.end_date };
      }
    }

    // Fall back to asOfEpochMs or epoch 0, using canonical period boundaries
    if (asOfEpochMs !== undefined) {
      const { periodStartUTC, periodNextUTC } = epochMsToPeriodBoundaries(asOfEpochMs, timezone);
      return {
        periodStart: new Date(periodStartUTC),
        periodEnd: new Date(periodNextUTC),
      };
    }

    // Default: no filtering (return all periods - backward compatible)
    return {
      periodStart: new Date(0),
      periodEnd: new Date(8640000000000000), // Max date
    };
  }

  /**
   * Resolve business timezone for this company (outlet-level not available in cash context).
   */
  private async resolveBusinessTimezone(companyId: number): Promise<string> {
    const company = await this.db
      .selectFrom("companies")
      .select("timezone")
      .where("id", "=", companyId)
      .executeTakeFirst();

    return resolveBusinessTimezone(null, company?.timezone ?? null);
  }

  /**
   * Get balance from journal lines.
   */
  private async getJournalLinesBalance(
    companyId: number,
    cashAccountIds: number[],
    accountId: number | undefined,
    outletId: number | undefined,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{ debitTotal: number; creditTotal: number }> {
    const accountFilter = accountId !== undefined
      ? sql`jl.account_id = ${accountId}`
      : sql`jl.account_id IN (${sql.join(cashAccountIds.map(id => sql`${id}`), sql`, `)})`;

    const outletFilter = outletId !== undefined
      ? sql`jl.outlet_id = ${outletId}`
      : sql`1=1`;

    const result = await sql<CashBalanceRow>`
      SELECT
        jl.account_id,
        COALESCE(SUM(jl.debit), 0) AS debit_total,
        COALESCE(SUM(jl.credit), 0) AS credit_total
      FROM journal_lines jl
      INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
      WHERE jl.company_id = ${companyId}
        AND jl.line_date >= ${periodStart}
        AND jl.line_date <= ${periodEnd}
        AND ${accountFilter}
        AND ${outletFilter}
      GROUP BY jl.account_id
    `.execute(this.db);

    let debitTotal = 0;
    let creditTotal = 0;
    for (const row of result.rows as CashBalanceRow[]) {
      debitTotal += Number(row.debit_total) || 0;
      creditTotal += Number(row.credit_total) || 0;
    }

    return { debitTotal, creditTotal };
  }

  /**
   * Get bank transactions that haven't been posted to GL.
   * These show as variance in the reconciliation.
   *
   * Only includes cash_bank_transactions that do NOT have corresponding
   * journal batches (i.e., have not been posted to the general ledger).
   * This prevents double-counting of transactions already reflected in journal_lines.
   */
  private async getBankTransactionsBalance(
    companyId: number,
    cashAccountIds: number[],
    accountId: number | undefined,
    outletId: number | undefined,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{ debitTotal: number; creditTotal: number }> {
    // Only POSTED transactions affect the balance
    const accountFilter = accountId !== undefined
      ? sql`(cbt.source_account_id = ${accountId} OR cbt.destination_account_id = ${accountId})`
      : sql`(cbt.source_account_id IN (${sql.join(cashAccountIds.map(id => sql`${id}`), sql`, `)})
             OR cbt.destination_account_id IN (${sql.join(cashAccountIds.map(id => sql`${id}`), sql`, `)}))`;

    const outletFilter = outletId !== undefined
      ? sql`cbt.outlet_id = ${outletId}`
      : sql`1=1`;

    const result = await sql<{ amount: string }>`
      SELECT cbt.amount
      FROM cash_bank_transactions cbt
      LEFT JOIN journal_batches jb ON jb.doc_id = cbt.id
        AND jb.doc_type LIKE 'CASH_BANK_%'
      WHERE cbt.company_id = ${companyId}
        AND cbt.status = 'POSTED'
        AND cbt.transaction_date >= ${periodStart}
        AND cbt.transaction_date <= ${periodEnd}
        AND ${accountFilter}
        AND ${outletFilter}
        AND jb.id IS NULL
    `.execute(this.db);

    let debitTotal = 0;
    let creditTotal = 0;
    for (const row of result.rows as { amount: string }[]) {
      const amount = Number(row.amount) || 0;
      // Positive amount is typically a debit (increase to cash)
      // This is a simplification - actual impact depends on transaction type
      if (amount >= 0) {
        debitTotal += amount;
      } else {
        creditTotal += Math.abs(amount);
      }
    }

    return { debitTotal, creditTotal };
  }

  /**
   * Build detailed drilldown.
   */
  private async buildDrilldown(
    companyId: number,
    cashAccountIds: number[],
    accountId: number | undefined,
    outletId: number | undefined,
    periodStart: Date,
    periodEnd: Date,
    closingBalance: SignedAmount,
    limit: number
  ): Promise<ReconciliationDrilldown> {
    const lines: ReconciliationDrilldownLine[] = [];

    // Get journal line drilldown
    const accountFilter = accountId !== undefined
      ? sql`jl.account_id = ${accountId}`
      : sql`jl.account_id IN (${sql.join(cashAccountIds.map(id => sql`${id}`), sql`, `)})`;

    const outletFilter = outletId !== undefined
      ? sql`jl.outlet_id = ${outletId}`
      : sql`1=1`;

    const jlResult = await sql<DrilldownJournalLineRow>`
      SELECT
        jl.id,
        jl.account_id,
        jl.debit,
        jl.credit,
        jl.description,
        jl.line_date,
        jl.outlet_id
      FROM journal_lines jl
      INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
      WHERE jl.company_id = ${companyId}
        AND jl.line_date >= ${periodStart}
        AND jl.line_date <= ${periodEnd}
        AND ${accountFilter}
        AND ${outletFilter}
      ORDER BY jl.line_date ASC, jl.id ASC
      LIMIT ${limit}
    `.execute(this.db);

    for (const row of jlResult.rows as DrilldownJournalLineRow[]) {
      lines.push(mapJournalLineToDrilldown(
        {
          id: row.id,
          account_id: row.account_id,
          debit: Number(row.debit) || 0,
          credit: Number(row.credit) || 0,
          description: row.description,
          line_date: row.line_date,
          outlet_id: row.outlet_id,
        },
        accountId
      ));
    }

    // Get bank transaction drilldown (only those without GL journal lines)
    // Excludes bank transactions that have been posted to GL via journal_batches
    // to prevent double-counting with journal_lines.
    const bankTxResult = await sql<CashBankTxRow>`
      SELECT
        cbt.id,
        cbt.amount,
        cbt.transaction_date,
        cbt.description,
        cbt.source_account_id,
        cbt.destination_account_id,
        cbt.transaction_type,
        cbt.outlet_id
      FROM cash_bank_transactions cbt
      LEFT JOIN journal_batches jb ON jb.doc_id = cbt.id
        AND jb.doc_type LIKE 'CASH_BANK_%'
      WHERE cbt.company_id = ${companyId}
        AND cbt.status = 'POSTED'
        AND cbt.transaction_date >= ${periodStart}
        AND cbt.transaction_date <= ${periodEnd}
        AND (
          cbt.source_account_id IN (${sql.join(cashAccountIds.map(id => sql`${id}`), sql`, `)})
          OR cbt.destination_account_id IN (${sql.join(cashAccountIds.map(id => sql`${id}`), sql`, `)})
        )
        AND jb.id IS NULL
      ORDER BY cbt.transaction_date ASC, cbt.id ASC
      LIMIT ${limit}
    `.execute(this.db);

    for (const row of bankTxResult.rows as CashBankTxRow[]) {
      const amount = Number(row.amount) || 0;
      // Determine if this is a debit or credit based on cash flow direction
      // For simplicity: source_account being cash = credit (money out), destination = debit (money in)
      const isSource = cashAccountIds.includes(row.source_account_id);
      const debitAmount = isSource ? 0 : Math.abs(amount);
      const creditAmount = isSource ? Math.abs(amount) : 0;
      const signedImpact = (debitAmount - creditAmount) as SignedAmount;

      lines.push({
        sourceType: "SUBLEDGER_TX",
        sourceId: `CBT:${row.id}`,
        postedAtEpochMs: row.transaction_date.getTime(),
        description: `[${row.transaction_type}] ${row.description}`,
        debitAmount,
        creditAmount,
        signedImpact,
        dimensions: Object.freeze({
          source_account_id: row.source_account_id,
          destination_account_id: row.destination_account_id,
          ...(row.outlet_id != null && { outlet_id: row.outlet_id }),
        }),
      });
    }

    // Sort all lines by postedAtEpochMs
    lines.sort((a, b) => a.postedAtEpochMs - b.postedAtEpochMs);

    // Calculate running balance
    let runningBalance = zeroSignedAmount();
    for (const line of lines) {
      runningBalance = addSignedAmounts(runningBalance, line.signedImpact);
      line.runningSignedBalance = runningBalance;
    }

    // Calculate movements and opening balance
    const movementsSignedNet = lines.reduce(
      (sum, line) => addSignedAmounts(sum, line.signedImpact),
      zeroSignedAmount()
    );
    const openingSignedBalance = fromSignedAmount(closingBalance) - fromSignedAmount(movementsSignedNet);

    return {
      subledgerType: this.subledgerType,
      accountId,
      periodStartEpochMs: periodStart.getTime(),
      periodEndEpochMs: periodEnd.getTime(),
      openingSignedBalance: makeSignedAmount(openingSignedBalance),
      movementsSignedNet,
      closingSignedBalance: closingBalance,
      lines: Object.freeze(lines),
    };
  }
}
