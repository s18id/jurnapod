// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reconciliation Dashboard Service
 *
 * Multi-period reconciliation dashboard showing GL balances vs subledger balances.
 * Supports:
 * - Cash, Inventory, Receivables, Payables account types
 * - Period-over-period trend analysis
 * - Reconciliation status: RECONCILED, VARIANCE, UNRECONCILED
 * - Drill-down to journal entries causing variance
 * - Epic 30 gl_imbalance_detected_total metric integration
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Account type filter options for reconciliation dashboard
 */
export type AccountTypeFilter = "CASH" | "INVENTORY" | "RECEIVABLES" | "PAYABLES";

/**
 * Reconciliation status for an account
 */
export type ReconciliationStatus = "RECONCILED" | "VARIANCE" | "UNRECONCILED";

/**
 * Query parameters for reconciliation dashboard
 */
export interface ReconciliationDashboardQuery {
  companyId: number;
  outletId?: number;
  fiscalYearId?: number;
  periodId?: number;
  accountTypes?: AccountTypeFilter[];
  statuses?: ReconciliationStatus[];
  includeDrilldown?: boolean;
  trendPeriods?: number;
}

/**
 * GL balance for an account in a period
 */
export interface GlBalance {
  accountId: number;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  netBalance: number;
}

/**
 * Subledger balance for an account type
 */
export interface SubledgerBalance {
  subledgerType: AccountTypeFilter;
  signedBalance: number;
  debitAmount: number;
  creditAmount: number;
}

/**
 * Variance between GL and subledger
 */
export interface ReconciliationVariance {
  glBalance: number;
  subledgerBalance: number;
  variance: number;
  varianceThreshold: number;
  status: ReconciliationStatus;
}

/**
 * Period trend entry
 */
export interface PeriodTrend {
  periodId: number;
  periodCode: string;
  glBalance: number;
  subledgerBalance: number;
  variance: number;
  status: ReconciliationStatus;
  periodStartEpochMs: number;
  periodEndEpochMs: number;
}

/**
 * Drilldown journal entry line
 */
export interface DrilldownLine {
  sourceType: "JOURNAL_LINE" | "SUBLEDGER_TX" | "BANK_TX";
  sourceId: string;
  postedAtEpochMs: number;
  description: string;
  accountId: number;
  accountCode: string;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
}

/**
 * Variance drilldown result
 */
export interface VarianceDrilldownResult {
  accountId: number;
  accountCode: string;
  accountName: string;
  subledgerType: AccountTypeFilter;
  periodStartEpochMs: number;
  periodEndEpochMs: number;
  glBalance: number;
  subledgerBalance: number;
  variance: number;
  lines: DrilldownLine[];
}

/**
 * Account reconciliation row
 */
interface AccountReconciliationRow {
  account_id: number;
  account_code: string;
  account_name: string;
  account_type_name: string;
  debit_total: string;
  credit_total: string;
  has_subledger_data: number;
}

/**
 * Cash subledger row
 */
interface CashSubledgerRow {
  account_id: number;
  debit_total: string;
  credit_total: string;
}

/**
 * Bank transaction row
 */
interface BankTransactionRow {
  id: number;
  source_account_id: number;
  destination_account_id: number;
  amount: string;
  description: string;
  transaction_date: Date;
}

/**
 * Journal line row for drilldown
 */
interface JournalLineRow {
  id: number;
  account_id: number;
  account_code: string;
  debit: string;
  credit: string;
  description: string;
  line_date: Date;
}

/**
 * GL imbalance metric from Epic 30
 */
export interface GlImbalanceMetric {
  totalImbalances: number;
  byPeriod: Array<{
    periodId: number | null;
    count: number;
  }>;
}

/**
 * Full reconciliation dashboard result
 */
export interface ReconciliationDashboard {
  companyId: number;
  fiscalYearId?: number;
  periodId?: number;
  asOfEpochMs: number;
  accounts: Array<{
    accountId: number;
    accountCode: string;
    accountName: string;
    subledgerType: AccountTypeFilter;
    glBalance: GlBalance;
    subledgerBalance: SubledgerBalance;
    variance: ReconciliationVariance;
    trend: PeriodTrend[];
  }>;
  glImbalanceMetric: GlImbalanceMetric;
  summary: {
    totalAccounts: number;
    reconciled: number;
    withVariance: number;
    unreconciled: number;
  };
}

/**
 * Variance threshold for considering a variance as "small enough"
 * In production, this could be configurable per company
 */
const VARIANCE_THRESHOLD = 0.01; // 1 cent

/**
 * Map account type name to subledger type
 */
function mapAccountTypeToSubledger(accountTypeName: string): AccountTypeFilter | null {
  const name = accountTypeName.toUpperCase();
  if (name === "CASH" || name === "BANK" || name === "KAS") {
    return "CASH";
  }
  if (name === "INVENTORY" || name === "STOCK" || name === "PERSEDIAAN") {
    return "INVENTORY";
  }
  if (name === "RECEIVABLE" || name === "AR" || name === "PIUTANG") {
    return "RECEIVABLES";
  }
  if (name === "PAYABLE" || name === "AP" || name === "HUTANG") {
    return "PAYABLES";
  }
  return null;
}

/**
 * Determine reconciliation status based on variance
 */
function determineStatus(variance: number, hasSubledgerData: boolean): ReconciliationStatus {
  if (!hasSubledgerData) {
    return "UNRECONCILED";
  }
  if (Math.abs(variance) <= VARIANCE_THRESHOLD) {
    return "RECONCILED";
  }
  return "VARIANCE";
}

// =============================================================================
// RECONCILIATION DASHBOARD SERVICE
// =============================================================================

export class ReconciliationDashboardService {
  private readonly db: KyselySchema;

  constructor(db: KyselySchema) {
    this.db = db;
  }

  /**
   * Get reconciliation dashboard for a company
   */
  async getDashboard(query: ReconciliationDashboardQuery): Promise<ReconciliationDashboard> {
    const {
      companyId,
      outletId,
      fiscalYearId,
      periodId,
      accountTypes,
      statuses,
      includeDrilldown = false,
      trendPeriods = 3,
    } = query;

    const asOfEpochMs = Date.now();

    // Resolve period range
    const { periodStart, periodEnd } = await this.resolvePeriodRange(
      companyId,
      fiscalYearId,
      periodId,
      asOfEpochMs
    );

    // Get key account types to reconcile
    const keyAccountTypes = this.getKeyAccountTypes();
    const filteredTypes = accountTypes?.length
      ? accountTypes
      : (Object.keys(keyAccountTypes) as AccountTypeFilter[]);

    // Get GL balances for key accounts
    const glBalances = await this.getGlBalances(
      companyId,
      outletId,
      filteredTypes,
      periodStart,
      periodEnd
    );

    // Get subledger balances
    const subledgerBalances = await this.getSubledgerBalances(
      companyId,
      outletId,
      filteredTypes,
      periodStart,
      periodEnd
    );

    // Build account reconciliation rows
    const accountRows: Array<{
      accountId: number;
      accountCode: string;
      accountName: string;
      subledgerType: AccountTypeFilter;
      glBalance: GlBalance;
      subledgerBalance: SubledgerBalance;
      variance: ReconciliationVariance;
      trend: PeriodTrend[];
    }> = [];

    for (const glAcct of glBalances) {
      const subledgerType = mapAccountTypeToSubledger(glAcct.accountTypeName) as AccountTypeFilter;
      if (!subledgerType) continue;

      const subledgerBal = subledgerBalances.get(glAcct.accountId);
      const subledgerBalance: SubledgerBalance = subledgerBal ?? {
        subledgerType,
        signedBalance: 0,
        debitAmount: 0,
        creditAmount: 0,
      };

      // Ensure GL balance is debit-positive (debit - credit)
      const glNetBalance = glAcct.debitTotal - glAcct.creditTotal;

      // Variance: GL minus subledger (both debit-positive)
      const variance = glNetBalance - Number(subledgerBalance.signedBalance);
      const hasSubledgerData = subledgerBalance.debitAmount > 0 || subledgerBalance.creditAmount > 0;
      const status = determineStatus(variance, hasSubledgerData);

      // Filter by status if requested
      if (statuses?.length && !statuses.includes(status)) continue;

      // Get period trends
      const trend = await this.getPeriodTrends(
        companyId,
        outletId,
        glAcct.accountId,
        subledgerType,
        periodStart,
        periodEnd,
        trendPeriods
      );

      accountRows.push({
        accountId: glAcct.accountId,
        accountCode: glAcct.accountCode,
        accountName: glAcct.accountName,
        subledgerType,
        glBalance: {
          accountId: glAcct.accountId,
          accountCode: glAcct.accountCode,
          accountName: glAcct.accountName,
          debitAmount: glAcct.debitTotal,
          creditAmount: glAcct.creditTotal,
          netBalance: glAcct.netBalance,
        },
        subledgerBalance,
        variance: {
          glBalance: glAcct.netBalance,
          subledgerBalance: subledgerBalance.signedBalance,
          variance,
          varianceThreshold: VARIANCE_THRESHOLD,
          status,
        },
        trend,
      });
    }

    // Get GL imbalance metric (Epic 30)
    const glImbalanceMetric = await this.getGlImbalanceMetric(companyId, periodStart, periodEnd);

    // Build summary
    const summary = {
      totalAccounts: accountRows.length,
      reconciled: accountRows.filter((r) => r.variance.status === "RECONCILED").length,
      withVariance: accountRows.filter((r) => r.variance.status === "VARIANCE").length,
      unreconciled: accountRows.filter((r) => r.variance.status === "UNRECONCILED").length,
    };

    return {
      companyId,
      fiscalYearId,
      periodId,
      asOfEpochMs,
      accounts: accountRows,
      glImbalanceMetric,
      summary,
    };
  }

  /**
   * Get variance drilldown for a specific account
   */
  async getVarianceDrilldown(
    companyId: number,
    accountId: number,
    periodId?: number,
    fiscalYearId?: number
  ): Promise<VarianceDrilldownResult | null> {
    const asOfEpochMs = Date.now();

    // Resolve period range
    const { periodStart, periodEnd } = await this.resolvePeriodRange(
      companyId,
      fiscalYearId,
      periodId,
      asOfEpochMs
    );

    // Get account info
    const account = await this.db
      .selectFrom("accounts as a")
      .leftJoin("account_types as at", "at.id", "a.account_type_id")
      .where("a.id", "=", accountId)
      .where("a.company_id", "=", companyId)
      .select([
        "a.id",
        "a.code",
        "a.name",
        "at.name as account_type_name",
      ])
      .executeTakeFirst();

    if (!account) {
      return null;
    }

    const accountTypeName = (account as { account_type_name?: string }).account_type_name ?? "";
    const subledgerType = mapAccountTypeToSubledger(accountTypeName) as AccountTypeFilter;

    // Get GL balance
    const glResult = await this.db
      .selectFrom("journal_lines as jl")
      .innerJoin("journal_batches as jb", "jb.id", "jl.journal_batch_id")
      .where("jl.company_id", "=", companyId)
      .where("jl.account_id", "=", accountId)
      .where("jl.line_date", ">=", periodStart)
      .where("jl.line_date", "<=", periodEnd)
      .select([
        sql<number>`COALESCE(SUM(jl.debit), 0)`.as("debit_total"),
        sql<number>`COALESCE(SUM(jl.credit), 0)`.as("credit_total"),
      ])
      .executeTakeFirst();

    const glBalance = (Number(glResult?.debit_total) || 0) - (Number(glResult?.credit_total) || 0);

    // Get subledger balance
    let subledgerBalance = 0;
    if (subledgerType === "CASH") {
      const cashBal = await this.getCashSubledgerBalance(companyId, accountId, periodStart, periodEnd);
      subledgerBalance = cashBal;
    }

    // Variance: GL minus subledger (both debit-positive)
    const variance = glBalance - Number(subledgerBalance);

    // Get drilldown lines
    const lines: DrilldownLine[] = [];

    // Get journal lines
    const journalLines = await this.db
      .selectFrom("journal_lines as jl")
      .innerJoin("journal_batches as jb", "jb.id", "jl.journal_batch_id")
      .leftJoin("accounts as a", "a.id", "jl.account_id")
      .where("jl.company_id", "=", companyId)
      .where("jl.account_id", "=", accountId)
      .where("jl.line_date", ">=", periodStart)
      .where("jl.line_date", "<=", periodEnd)
      .select([
        "jl.id",
        "jl.account_id",
        "a.code as account_code",
        "jl.debit",
        "jl.credit",
        "jl.description",
        "jl.line_date",
      ])
      .orderBy("jl.line_date", "asc")
      .orderBy("jl.id", "asc")
      .execute();

    let runningBalance = 0;
    for (const jl of journalLines as JournalLineRow[]) {
      const debit = Number(jl.debit) || 0;
      const credit = Number(jl.credit) || 0;
      runningBalance += debit - credit;

      lines.push({
        sourceType: "JOURNAL_LINE",
        sourceId: String(jl.id),
        postedAtEpochMs: jl.line_date instanceof Date ? jl.line_date.getTime() : new Date(jl.line_date).getTime(),
        description: jl.description ?? "",
        accountId: Number(jl.account_id),
        accountCode: jl.account_code ?? "",
        debitAmount: debit,
        creditAmount: credit,
        runningBalance,
      });
    }

    // For CASH type, also get bank transactions not in GL
    if (subledgerType === "CASH") {
      const bankTxLines = await this.getBankTransactionDrilldown(
        companyId,
        accountId,
        periodStart,
        periodEnd
      );
      lines.push(...bankTxLines);
    }

    // Sort by posted time
    lines.sort((a, b) => a.postedAtEpochMs - b.postedAtEpochMs);

    return {
      accountId,
      accountCode: String(account.code),
      accountName: String(account.name),
      subledgerType,
      periodStartEpochMs: periodStart.getTime(),
      periodEndEpochMs: periodEnd.getTime(),
      glBalance,
      subledgerBalance,
      variance,
      lines,
    };
  }

  /**
   * Resolve period range from fiscal year/period filters
   */
  private async resolvePeriodRange(
    companyId: number,
    fiscalYearId?: number,
    periodId?: number,
    asOfEpochMs?: number
  ): Promise<{ periodStart: Date; periodEnd: Date }> {
    // If fiscalYearId is provided, use fiscal year boundaries
    if (fiscalYearId !== undefined) {
      const fyResult = await this.db
        .selectFrom("fiscal_years")
        .where("id", "=", fiscalYearId)
        .where("company_id", "=", companyId)
        .select(["start_date", "end_date"])
        .executeTakeFirst();

      if (fyResult) {
        const startDate = fyResult.start_date instanceof Date
          ? fyResult.start_date
          : new Date(fyResult.start_date);
        const endDate = fyResult.end_date instanceof Date
          ? fyResult.end_date
          : new Date(fyResult.end_date);
        return { periodStart: startDate, periodEnd: endDate };
      }
    }

    // If periodId is provided, it takes precedence (periods table would be used)
    // For now, fall back to fiscal year or date-based filtering
    if (periodId !== undefined) {
      // TODO: Once periods table exists, query it here
    }

    // Fall back to asOfEpochMs or default to current month
    if (asOfEpochMs !== undefined) {
      const asOfDate = new Date(asOfEpochMs);
      const startOfMonth = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);
      const endOfMonth = new Date(asOfDate.getFullYear(), asOfDate.getMonth() + 1, 0, 23, 59, 59, 999);
      return { periodStart: startOfMonth, periodEnd: endOfMonth };
    }

    // Default: current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { periodStart: startOfMonth, periodEnd: endOfMonth };
  }

  /**
   * Get key account types to reconcile
   */
  private getKeyAccountTypes(): Record<AccountTypeFilter, string[]> {
    return {
      CASH: ["CASH", "BANK", "KAS"],
      INVENTORY: ["INVENTORY", "STOCK", "PERSEDIAAN"],
      RECEIVABLES: ["RECEIVABLE", "AR", "PIUTANG"],
      PAYABLES: ["PAYABLE", "AP", "HUTANG"],
    };
  }

  /**
   * Get GL balances for key accounts
   */
  private async getGlBalances(
    companyId: number,
    outletId: number | undefined,
    accountTypes: AccountTypeFilter[],
    periodStart: Date,
    periodEnd: Date
  ): Promise<Array<{
    accountId: number;
    accountCode: string;
    accountName: string;
    accountTypeName: string;
    debitTotal: number;
    creditTotal: number;
    netBalance: number;
  }>> {
    const keyTypes = this.getKeyAccountTypes();
    const allTypeNames = accountTypes.flatMap((t) => keyTypes[t] ?? []);

    if (allTypeNames.length === 0) {
      return [];
    }

    const typePlaceholders = allTypeNames.map(() => "?").join(", ");

    let query = sql<AccountReconciliationRow>`
      SELECT
        a.id as account_id,
        a.code as account_code,
        a.name as account_name,
        COALESCE(at.name, a.type_name, '') as account_type_name,
        COALESCE(SUM(jl.debit), 0) AS debit_total,
        COALESCE(SUM(jl.credit), 0) AS credit_total,
        CASE WHEN EXISTS (
          SELECT 1 FROM journal_lines jl2
          INNER JOIN journal_batches jb2 ON jb2.id = jl2.journal_batch_id
          WHERE jl2.company_id = ${companyId}
            AND jl2.account_id = a.id
            AND jl2.line_date >= ${periodStart}
            AND jl2.line_date <= ${periodEnd}
        ) THEN 1 ELSE 0 END as has_subledger_data
      FROM accounts a
      LEFT JOIN account_types at ON at.id = a.account_type_id
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
        AND jl.line_date >= ${periodStart}
        AND jl.line_date <= ${periodEnd}
      LEFT JOIN journal_batches jb ON jb.id = jl.journal_batch_id
      WHERE a.company_id = ${companyId}
        AND a.is_active = 1
        AND LOWER(COALESCE(at.name, a.type_name, '')) IN (${sql.join(allTypeNames.map(t => sql`${sql.literal(t.toLowerCase())}`), sql`, `)})
    `;

    if (outletId !== undefined) {
      query = sql`${query} AND jl.outlet_id = ${outletId}`;
    }

    query = sql`${query}
      GROUP BY a.id, a.code, a.name, at.name, a.type_name
      ORDER BY a.code ASC
    `;

    const result = await query.execute(this.db);

    return (result.rows as AccountReconciliationRow[]).map((row) => ({
      accountId: Number(row.account_id),
      accountCode: String(row.account_code),
      accountName: String(row.account_name),
      accountTypeName: String(row.account_type_name),
      debitTotal: Number(row.debit_total) || 0,
      creditTotal: Number(row.credit_total) || 0,
      netBalance: (Number(row.debit_total) || 0) - (Number(row.credit_total) || 0),
    }));
  }

  /**
   * Get subledger balances for key account types
   */
  private async getSubledgerBalances(
    companyId: number,
    outletId: number | undefined,
    accountTypes: AccountTypeFilter[],
    periodStart: Date,
    periodEnd: Date
  ): Promise<Map<number, SubledgerBalance>> {
    const balances = new Map<number, SubledgerBalance>();

    for (const accountType of accountTypes) {
      if (accountType === "CASH") {
        const cashBalances = await this.getCashSubledgerBalances(
          companyId,
          outletId,
          periodStart,
          periodEnd
        );
        for (const [accountId, balance] of cashBalances) {
          balances.set(accountId, balance);
        }
      }
      // TODO: Add support for INVENTORY, RECEIVABLES, PAYABLES subledgers
      // For now, we focus on CASH which has the CashSubledgerProvider in modules-accounting
    }

    return balances;
  }

  /**
   * Get cash subledger balances
   */
  private async getCashSubledgerBalances(
    companyId: number,
    outletId: number | undefined,
    periodStart: Date,
    periodEnd: Date
  ): Promise<Map<number, SubledgerBalance>> {
    const balances = new Map<number, SubledgerBalance>();

    // Get cash account IDs
    const cashAccounts = await this.db
      .selectFrom("accounts as a")
      .leftJoin("account_types as at", "at.id", "a.account_type_id")
      .where("a.company_id", "=", companyId)
      .where("a.is_active", "=", 1)
      .where((eb) => eb.or([
        eb(sql`LOWER(COALESCE(at.name, a.type_name, ''))`, "in", ["cash", "bank", "kas"]),
      ]))
      .select(["a.id", "a.code"])
      .execute();

    for (const acct of cashAccounts) {
      const accountId = Number(acct.id);
      const balance = await this.getCashSubledgerBalance(
        companyId,
        accountId,
        periodStart,
        periodEnd
      );

      balances.set(accountId, {
        subledgerType: "CASH",
        signedBalance: balance,
        debitAmount: balance > 0 ? balance : 0,
        creditAmount: balance < 0 ? Math.abs(balance) : 0,
      });
    }

    return balances;
  }

  /**
   * Get cash subledger balance for a specific account
   */
  private async getCashSubledgerBalance(
    companyId: number,
    accountId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<number> {
    // Get journal lines balance
    const jlResult = await this.db
      .selectFrom("journal_lines as jl")
      .innerJoin("journal_batches as jb", "jb.id", "jl.journal_batch_id")
      .where("jl.company_id", "=", companyId)
      .where("jl.account_id", "=", accountId)
      .where("jl.line_date", ">=", periodStart)
      .where("jl.line_date", "<=", periodEnd)
      .select([
        sql<number>`COALESCE(SUM(jl.debit), 0)`.as("debit_total"),
        sql<number>`COALESCE(SUM(jl.credit), 0)`.as("credit_total"),
      ])
      .executeTakeFirst();

    const jlBalance = (Number(jlResult?.debit_total) || 0) - (Number(jlResult?.credit_total) || 0);

    // Get bank transactions balance (POSTED only)
    const bankResult = await this.db
      .selectFrom("cash_bank_transactions")
      .where("company_id", "=", companyId)
      .where("status", "=", "POSTED")
      .where("transaction_date", ">=", periodStart)
      .where("transaction_date", "<=", periodEnd)
      .where((eb) => eb.or([
        eb("source_account_id", "=", accountId),
        eb("destination_account_id", "=", accountId),
      ]))
      .select([
        sql<number>`COALESCE(SUM(amount), 0)`.as("total"),
      ])
      .executeTakeFirst();

    // Bank transactions with positive amount = debit to cash, negative = credit
    const bankTotal = Number(bankResult?.total) || 0;

    return jlBalance + bankTotal;
  }

  /**
   * Get bank transaction drilldown for variance explanation
   */
  private async getBankTransactionDrilldown(
    companyId: number,
    accountId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<DrilldownLine[]> {
    const lines: DrilldownLine[] = [];

    const bankTxResult = await this.db
      .selectFrom("cash_bank_transactions")
      .leftJoin("accounts as src_acct", "src_acct.id", "cash_bank_transactions.source_account_id")
      .leftJoin("accounts as dst_acct", "dst_acct.id", "cash_bank_transactions.destination_account_id")
      .where("cash_bank_transactions.company_id", "=", companyId)
      .where("cash_bank_transactions.status", "=", "POSTED")
      .where("cash_bank_transactions.transaction_date", ">=", periodStart)
      .where("cash_bank_transactions.transaction_date", "<=", periodEnd)
      .where((eb) => eb.or([
        eb("cash_bank_transactions.source_account_id", "=", accountId),
        eb("cash_bank_transactions.destination_account_id", "=", accountId),
      ]))
      .select([
        "cash_bank_transactions.id",
        "cash_bank_transactions.source_account_id",
        "cash_bank_transactions.destination_account_id",
        "cash_bank_transactions.amount",
        "cash_bank_transactions.description",
        "cash_bank_transactions.transaction_date",
        "src_acct.code as source_account_code",
        "dst_acct.code as destination_account_code",
      ])
      .orderBy("cash_bank_transactions.transaction_date", "asc")
      .execute();

    for (const tx of bankTxResult as (BankTransactionRow & { source_account_code?: string; destination_account_code?: string })[]) {
      const amount = Number(tx.amount) || 0;
      const isSource = Number(tx.source_account_id) === accountId;

      // Determine if this is a debit or credit to the account
      // If account is the source (money out), it's a credit
      // If account is the destination (money in), it's a debit
      const debitAmount = isSource ? 0 : Math.abs(amount);
      const creditAmount = isSource ? Math.abs(amount) : 0;

      lines.push({
        sourceType: "BANK_TX",
        sourceId: `CBT:${tx.id}`,
        postedAtEpochMs: tx.transaction_date instanceof Date ? tx.transaction_date.getTime() : new Date(tx.transaction_date).getTime(),
        description: `[BANK] ${tx.description ?? ""}`,
        accountId,
        accountCode: isSource ? (tx.source_account_code ?? "") : (tx.destination_account_code ?? ""),
        debitAmount,
        creditAmount,
        runningBalance: 0, // Will be calculated after sorting
      });
    }

    return lines;
  }

  /**
   * Get period trends for an account
   */
  private async getPeriodTrends(
    companyId: number,
    outletId: number | undefined,
    accountId: number,
    subledgerType: AccountTypeFilter,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    trendPeriods: number
  ): Promise<PeriodTrend[]> {
    const trends: PeriodTrend[] = [];

    // Calculate previous periods (monthly)
    const currentYear = currentPeriodStart.getFullYear();
    const currentMonth = currentPeriodStart.getMonth();

    for (let i = 0; i < trendPeriods; i++) {
      const periodDate = new Date(currentYear, currentMonth - i, 1);
      const periodStart = new Date(periodDate.getFullYear(), periodDate.getMonth(), 1);
      const periodEnd = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0, 23, 59, 59, 999);

      // Get GL balance for this period
      const glResult = await this.db
        .selectFrom("journal_lines as jl")
        .innerJoin("journal_batches as jb", "jb.id", "jl.journal_batch_id")
        .where("jl.company_id", "=", companyId)
        .where("jl.account_id", "=", accountId)
        .where("jl.line_date", ">=", periodStart)
        .where("jl.line_date", "<=", periodEnd)
        .select([
          sql<number>`COALESCE(SUM(jl.debit), 0)`.as("debit_total"),
          sql<number>`COALESCE(SUM(jl.credit), 0)`.as("credit_total"),
        ])
        .executeTakeFirst();

      const glBalance = (Number(glResult?.debit_total) || 0) - (Number(glResult?.credit_total) || 0);

      // Get subledger balance
      let subledgerBalance = 0;
      if (subledgerType === "CASH") {
        subledgerBalance = await this.getCashSubledgerBalance(
          companyId,
          accountId,
          periodStart,
          periodEnd
        );
      }

    // Variance: GL minus subledger (both debit-positive)
    const variance = glBalance - Number(subledgerBalance);
      const hasSubledgerData = subledgerBalance !== 0;
      const status = determineStatus(variance, hasSubledgerData);

      trends.push({
        periodId: i + 1,
        periodCode: `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, "0")}`,
        glBalance,
        subledgerBalance,
        variance,
        status,
        periodStartEpochMs: periodStart.getTime(),
        periodEndEpochMs: periodEnd.getTime(),
      });
    }

    return trends;
  }

  /**
   * Get GL imbalance metric (Epic 30)
   */
  private async getGlImbalanceMetric(
    companyId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<GlImbalanceMetric> {
    // Look for unbalanced journal batches in the period using raw SQL
    // Unbalanced = SUM(debit) <> SUM(credit) for a batch
    const result = await sql<{ imbalance_count: number }>`
      SELECT COUNT(*) as imbalance_count
      FROM (
        SELECT jb.id
        FROM journal_batches jb
        LEFT JOIN journal_lines jl ON jl.journal_batch_id = jb.id
        WHERE jb.company_id = ${companyId}
          AND jl.line_date >= ${periodStart}
          AND jl.line_date <= ${periodEnd}
        GROUP BY jb.id
        HAVING COALESCE(SUM(jl.debit), 0) <> COALESCE(SUM(jl.credit), 0)
      ) t
    `.execute(this.db);

    const totalImbalances = Number(result.rows[0]?.imbalance_count) || 0;

    return {
      totalImbalances,
      byPeriod: [
        {
          periodId: null,
          count: totalImbalances,
        },
      ],
    };
  }
}
