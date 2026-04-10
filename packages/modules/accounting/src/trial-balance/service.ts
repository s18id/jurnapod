// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Trial Balance Service
 *
 * Provides trial balance reporting with validation:
 * - Lists all GL accounts with debit/credit balances for a period
 * - Validates that SUM(debits) == SUM(credits)
 * - Calculates variance vs prior period
 * - Calculates variance vs subledger balances
 * - Pre-close checklist with all items that must pass
 *
 * Epic 32.3: Trial Balance Validation with Variance Reporting
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import { CashSubledgerProvider, type CashSubledgerDbClient } from "../reconciliation/subledger/cash-provider.js";
import { fromSignedAmount } from "../reconciliation/subledger/provider.js";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Query parameters for trial balance
 */
export interface TrialBalanceQuery {
  companyId: number;
  outletId?: number;
  fiscalYearId?: number;
  periodId?: number;
  /** As-of epoch ms (defaults to now) */
  asOfEpochMs?: number;
  /** Account types to include (default: all) */
  accountTypes?: string[];
  /** Include accounts with zero balances */
  includeZeroBalances?: boolean;
}

/**
 * Individual account row in trial balance
 */
export interface TrialBalanceAccountRow {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountTypeName: string;
  debitAmount: number;
  creditAmount: number;
  netBalance: number;
}

/**
 * Prior period balance for variance calculation
 */
export interface PriorPeriodBalance {
  periodCode: string;
  periodStart: Date;
  periodEnd: Date;
  netBalance: number;
}

/**
 * Variance vs prior period
 */
export interface PeriodVariance {
  priorBalance: number;
  currentBalance: number;
  absoluteChange: number;
  percentChange: number | null; // null if prior balance is 0
  status: "INCREASE" | "DECREASE" | "NO_CHANGE" | "NEW_ACCOUNT";
  severity: "OK" | "WARNING" | "CRITICAL";
}

/**
 * GL vs subledger variance
 */
export interface SubledgerVariance {
  glBalance: number;
  subledgerBalance: number;
  variance: number;
  varianceThreshold: number;
  status: "RECONCILED" | "VARIANCE" | "NO_SUBLEDGER";
  hasSubledgerData: boolean;
}

/**
 * Full trial balance account entry with all calculations
 */
export interface TrialBalanceEntry {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountTypeName: string;
  debitAmount: number;
  creditAmount: number;
  netBalance: number;
  priorPeriodBalance: PriorPeriodBalance | null;
  periodVariance: PeriodVariance | null;
  subledgerVariance: SubledgerVariance | null;
}

/**
 * GL imbalance check result for a batch (trial balance variant)
 */
export interface TrialBalanceGlImbalanceResult {
  batchId: number;
  batchDescription: string | null;
  totalDebits: number;
  totalCredits: number;
  imbalanceAmount: number;
}

/**
 * Pre-close checklist item
 */
export interface PreCloseCheckItem {
  id: string;
  label: string;
  description: string;
  status: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  severity: "BLOCKER" | "WARNING" | "INFO";
  detail?: string;
  /** For items with counts/numbers */
  value?: number | string;
}

/**
 * Pre-close validation result
 */
export interface PreCloseValidationResult {
  companyId: number;
  fiscalYearId: number | null;
  periodId: number | null;
  asOfEpochMs: number;
  canClose: boolean;
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
  checks: PreCloseCheckItem[];
  /** Aggregated metrics */
  trialBalanceTotals: {
    totalDebits: number;
    totalCredits: number;
    imbalance: number;
    isBalanced: boolean;
  };
      glImbalanceDetails: TrialBalanceGlImbalanceResult[];
  /** All accounts with variance issues */
  accountsWithVariance: TrialBalanceEntry[];
  /** All accounts with subledger variance */
  accountsWithSubledgerVariance: TrialBalanceEntry[];
}

/**
 * Full trial balance result
 */
export interface TrialBalanceResult {
  companyId: number;
  fiscalYearId: number | null;
  periodId: number | null;
  asOfEpochMs: number;
  periodStart: Date;
  periodEnd: Date;
  priorPeriodStart: Date | null;
  priorPeriodEnd: Date | null;
  /** Summary totals */
  totalDebits: number;
  totalCredits: number;
  netBalance: number;
  /** Validation */
  isBalanced: boolean;
  imbalanceAmount: number;
  /** Variance thresholds from config */
  varianceWarningThreshold: number;
  varianceCriticalThreshold: number;
  /** All account entries */
  accounts: TrialBalanceEntry[];
  /** Summary counts */
  summary: {
    totalAccounts: number;
    accountsWithVariance: number;
    accountsWithSubledgerVariance: number;
    newAccounts: number;
  };
}

// =============================================================================
// CONFIG DEFAULTS (fallback when slos.yaml not loaded)
// =============================================================================

const DEFAULT_VARIANCE_WARNING_THRESHOLD = 0.10; // 10%
const DEFAULT_VARIANCE_CRITICAL_THRESHOLD = 0.25; // 25%
const VARIANCE_EPSILON = 0.001; // 0.1% - threshold for considering variance as zero

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Determine variance severity based on threshold
 */
function getVarianceSeverity(
  percentChange: number | null,
  warningThreshold: number,
  criticalThreshold: number
): "OK" | "WARNING" | "CRITICAL" {
  if (percentChange === null) return "CRITICAL"; // New account
  const absChange = Math.abs(percentChange);
  if (absChange >= criticalThreshold) return "CRITICAL";
  if (absChange >= warningThreshold) return "WARNING";
  return "OK";
}

/**
 * Calculate period variance
 */
function calculatePeriodVariance(
  currentBalance: number,
  priorBalance: number,
  warningThreshold: number,
  criticalThreshold: number
): PeriodVariance | null {
  if (priorBalance === 0 && currentBalance === 0) {
    return null; // Both zero - no variance to report
  }

  const absoluteChange = currentBalance - priorBalance;
  let percentChange: number | null = null;
  let status: PeriodVariance["status"];

  if (priorBalance === 0) {
    status = "NEW_ACCOUNT";
    percentChange = null;
  } else {
    percentChange = absoluteChange / Math.abs(priorBalance);
    if (Math.abs(percentChange) < VARIANCE_EPSILON) {
      status = "NO_CHANGE";
      percentChange = 0;
    } else if (absoluteChange > 0) {
      status = "INCREASE";
    } else {
      status = "DECREASE";
    }
  }

  return {
    priorBalance,
    currentBalance,
    absoluteChange,
    percentChange,
    status,
    severity: getVarianceSeverity(percentChange, warningThreshold, criticalThreshold),
  };
}

// =============================================================================
// TRIAL BALANCE SERVICE
// =============================================================================

export interface TrialBalanceServiceConfig {
  varianceWarningThreshold?: number;
  varianceCriticalThreshold?: number;
}

export class TrialBalanceService {
  private readonly db: KyselySchema;
  private readonly varianceWarningThreshold: number;
  private readonly varianceCriticalThreshold: number;
  private readonly cashSubledgerProvider: CashSubledgerProvider;

  constructor(db: KyselySchema, config?: TrialBalanceServiceConfig) {
    this.db = db;
    this.varianceWarningThreshold = config?.varianceWarningThreshold ?? DEFAULT_VARIANCE_WARNING_THRESHOLD;
    this.varianceCriticalThreshold = config?.varianceCriticalThreshold ?? DEFAULT_VARIANCE_CRITICAL_THRESHOLD;
    this.cashSubledgerProvider = new CashSubledgerProvider({ db: this.db as CashSubledgerDbClient });
  }

  /**
   * Get trial balance for a company/period
   */
  async getTrialBalance(query: TrialBalanceQuery): Promise<TrialBalanceResult> {
    const {
      companyId,
      outletId,
      fiscalYearId,
      periodId,
      asOfEpochMs = Date.now(),
      accountTypes,
      includeZeroBalances = false,
    } = query;

    // Resolve period range
    const { periodStart, periodEnd, priorPeriodStart, priorPeriodEnd } = await this.resolvePeriodRange(
      companyId,
      fiscalYearId,
      periodId,
      asOfEpochMs
    );

    // Get all account balances for the period
    const accountBalances = await this.getAccountBalances(
      companyId,
      outletId,
      periodStart,
      periodEnd,
      accountTypes,
      includeZeroBalances
    );

    // Calculate totals
    let totalDebits = 0;
    let totalCredits = 0;
    const entries: TrialBalanceEntry[] = [];

    for (const acct of accountBalances) {
      totalDebits += acct.debitAmount;
      totalCredits += acct.creditAmount;

      // Get prior period balance for variance calculation
      const priorBalance =
        priorPeriodStart && priorPeriodEnd
          ? await this.getAccountBalanceForPeriod(companyId, acct.accountId, priorPeriodStart, priorPeriodEnd)
          : 0;

      const periodVariance = calculatePeriodVariance(
        acct.netBalance,
        priorBalance,
        this.varianceWarningThreshold,
        this.varianceCriticalThreshold
      );

      // Get subledger variance for key account types
      const subledgerVariance = await this.getSubledgerVariance(
        companyId,
        acct.accountId,
        acct.accountTypeName,
        periodStart,
        periodEnd,
        acct.netBalance
      );

      entries.push({
        accountId: acct.accountId,
        accountCode: acct.accountCode,
        accountName: acct.accountName,
        accountTypeName: acct.accountTypeName,
        debitAmount: acct.debitAmount,
        creditAmount: acct.creditAmount,
        netBalance: acct.netBalance,
        priorPeriodBalance: priorPeriodStart
          ? {
              periodCode: this.getPeriodCode(priorPeriodStart),
              periodStart: priorPeriodStart,
              periodEnd: priorPeriodEnd!,
              netBalance: priorBalance,
            }
          : null,
        periodVariance,
        subledgerVariance,
      });
    }

    // Sort by account code
    entries.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    // Calculate summary
    const accountsWithVariance = entries.filter(
      (e) => e.periodVariance && e.periodVariance.severity !== "OK"
    ).length;
    const accountsWithSubledgerVariance = entries.filter(
      (e) => e.subledgerVariance && e.subledgerVariance.status !== "RECONCILED"
    ).length;
    const newAccounts = entries.filter(
      (e) => e.periodVariance && e.periodVariance.status === "NEW_ACCOUNT"
    ).length;

    return {
      companyId,
      fiscalYearId: fiscalYearId ?? null,
      periodId: periodId ?? null,
      asOfEpochMs,
      periodStart,
      periodEnd,
      priorPeriodStart,
      priorPeriodEnd,
      totalDebits,
      totalCredits,
      netBalance: totalDebits - totalCredits,
      isBalanced: Math.abs(totalDebits - totalCredits) < 0.001,
      imbalanceAmount: totalDebits - totalCredits,
      varianceWarningThreshold: this.varianceWarningThreshold,
      varianceCriticalThreshold: this.varianceCriticalThreshold,
      accounts: entries,
      summary: {
        totalAccounts: entries.length,
        accountsWithVariance,
        accountsWithSubledgerVariance,
        newAccounts,
      },
    };
  }

  /**
   * Run pre-close validation checklist
   */
  async runPreCloseValidation(query: TrialBalanceQuery): Promise<PreCloseValidationResult> {
    const { companyId, fiscalYearId, periodId, asOfEpochMs = Date.now() } = query;

    const checks: PreCloseCheckItem[] = [];
    let passed = 0;
    let failed = 0;
    let warnings = 0;
    let skipped = 0;

    // 1. Get trial balance for GL balance check
    const trialBalance = await this.getTrialBalance(query);
    const glTotals = {
      totalDebits: trialBalance.totalDebits,
      totalCredits: trialBalance.totalCredits,
      imbalance: trialBalance.imbalanceAmount,
      isBalanced: trialBalance.isBalanced,
    };

    // Check 1: Trial balance must be balanced
    const tbBalanced: PreCloseCheckItem = {
      id: "trial_balance_balanced",
      label: "Trial Balance Balanced",
      description: "Total debits must equal total credits",
      status: trialBalance.isBalanced ? "PASS" : "FAIL",
      severity: "BLOCKER",
      detail: trialBalance.isBalanced
        ? `Debits: ${trialBalance.totalDebits.toFixed(2)}, Credits: ${trialBalance.totalCredits.toFixed(2)}`
        : `Imbalance: ${trialBalance.imbalanceAmount.toFixed(2)} (Debits: ${trialBalance.totalDebits.toFixed(2)}, Credits: ${trialBalance.totalCredits.toFixed(2)})`,
      value: trialBalance.isBalanced ? "BALANCED" : "UNBALANCED",
    };
    checks.push(tbBalanced);
    if (tbBalanced.status === "PASS") passed++;
    else failed++;

    // Check 2: No GL imbalances in any batches
    const glImbalanceDetails = await this.checkGlImbalanceByBatchId(
      companyId,
      trialBalance.periodStart,
      trialBalance.periodEnd
    );
    const hasGlImbalances = glImbalanceDetails.length > 0;
    const glImbalanceCheck: PreCloseCheckItem = {
      id: "no_gl_imbalances",
      label: "No GL Imbalances",
      description: "All journal batches must have equal debits and credits",
      status: hasGlImbalances ? "FAIL" : "PASS",
      severity: "BLOCKER",
      detail: hasGlImbalances
        ? `${glImbalanceDetails.length} batch(es) with imbalance detected`
        : "All batches are balanced",
      value: hasGlImbalances ? glImbalanceDetails.length : 0,
    };
    checks.push(glImbalanceCheck);
    if (glImbalanceCheck.status === "PASS") passed++;
    else failed++;

    // Check 3: Variance threshold check
    const accountsWithVariance = trialBalance.accounts.filter(
      (e) => e.periodVariance && e.periodVariance.severity !== "OK"
    );
    const criticalVarianceAccounts = accountsWithVariance.filter(
      (e) => e.periodVariance!.severity === "CRITICAL"
    );
    const warningVarianceAccounts = accountsWithVariance.filter(
      (e) => e.periodVariance!.severity === "WARNING"
    );

    const varianceCheck: PreCloseCheckItem = {
      id: "variance_threshold",
      label: "Period Variance Within Threshold",
      description: `Accounts with >${(this.varianceCriticalThreshold * 100).toFixed(0)}% change vs prior period`,
      status: criticalVarianceAccounts.length > 0 ? "FAIL" : warningVarianceAccounts.length > 0 ? "WARNING" : "PASS",
      severity: criticalVarianceAccounts.length > 0 ? "BLOCKER" : "WARNING",
      detail:
        criticalVarianceAccounts.length > 0
          ? `${criticalVarianceAccounts.length} account(s) exceed critical threshold`
          : warningVarianceAccounts.length > 0
          ? `${warningVarianceAccounts.length} account(s) exceed warning threshold`
          : "All account variances within threshold",
      value: criticalVarianceAccounts.length + warningVarianceAccounts.length,
    };
    checks.push(varianceCheck);
    if (varianceCheck.status === "PASS") passed++;
    else if (varianceCheck.status === "WARNING") warnings++;
    else failed++;

    // Check 4: GL vs Subledger reconciliation
    const accountsWithSubledgerVariance = trialBalance.accounts.filter(
      (e) => e.subledgerVariance && e.subledgerVariance.status !== "RECONCILED"
    );
    const subledgerCheck: PreCloseCheckItem = {
      id: "gl_subledger_reconciled",
      label: "GL Subledger Reconciliation",
      description: "GL balances must match subledger balances for key account types",
      status: accountsWithSubledgerVariance.length > 0 ? "FAIL" : "PASS",
      severity: accountsWithSubledgerVariance.length > 0 ? "BLOCKER" : "INFO",
      detail:
        accountsWithSubledgerVariance.length > 0
          ? `${accountsWithSubledgerVariance.length} account(s) with subledger variance`
          : "All subledgers reconciled",
      value: accountsWithSubledgerVariance.length,
    };
    checks.push(subledgerCheck);
    if (subledgerCheck.status === "PASS") passed++;
    else if (subledgerCheck.status === "WARNING") warnings++;
    else failed++;

    // Check 5: New accounts with significant balances
    const newAccountsWithBalance = trialBalance.accounts.filter(
      (e) => e.periodVariance?.status === "NEW_ACCOUNT" && Math.abs(e.netBalance) > 0
    );
    const newAccountCheck: PreCloseCheckItem = {
      id: "new_accounts_reviewed",
      label: "New Accounts Reviewed",
      description: "New accounts with significant balances should be reviewed",
      status: newAccountsWithBalance.length > 0 ? "WARNING" : "PASS",
      severity: "WARNING",
      detail:
        newAccountsWithBalance.length > 0
          ? `${newAccountsWithBalance.length} new account(s) with balance`
          : "No new accounts or balances",
      value: newAccountsWithBalance.length,
    };
    checks.push(newAccountCheck);
    if (newAccountCheck.status === "PASS") passed++;
    else if (newAccountCheck.status === "WARNING") warnings++;

    // Check 6: Accounts with zero balances in prior period but activity now
    const reactivations = trialBalance.accounts.filter(
      (e) =>
        e.periodVariance &&
        e.periodVariance.priorBalance === 0 &&
        e.periodVariance.currentBalance !== 0 &&
        e.periodVariance.status !== "NEW_ACCOUNT"
    );
    const reactivationCheck: PreCloseCheckItem = {
      id: "account_reactivations",
      label: "Reactivated Accounts",
      description: "Accounts that had zero balance in prior period but are active now",
      status: reactivations.length > 0 ? "WARNING" : "PASS",
      severity: "INFO",
      detail:
        reactivations.length > 0
          ? `${reactivations.length} account(s) reactivated`
          : "No reactivated accounts",
      value: reactivations.length,
    };
    checks.push(reactivationCheck);
    if (reactivationCheck.status === "PASS") passed++;
    else if (reactivationCheck.status === "WARNING") warnings++;

    // Check 7: Fiscal year status (if applicable)
    if (fiscalYearId !== undefined) {
      const fyStatus = await this.getFiscalYearStatus(companyId, fiscalYearId);
      const fyCheck: PreCloseCheckItem = {
        id: "fiscal_year_status",
        label: "Fiscal Year Status",
        description: "Fiscal year must not already be closed",
        status: fyStatus.isClosed ? "FAIL" : "PASS",
        severity: "BLOCKER",
        detail: fyStatus.isClosed
          ? `Fiscal year ${fyStatus.code} is already closed`
          : `Fiscal year ${fyStatus.code} is ${fyStatus.status}`,
        value: fyStatus.status,
      };
      checks.push(fyCheck);
      if (fyCheck.status === "PASS") passed++;
      else failed++;
    } else {
      skipped++;
    }

    // Determine if can close
    const canClose =
      failed === 0 &&
      checks.filter((c) => c.severity === "BLOCKER" && c.status !== "PASS").length === 0;

    return {
      companyId,
      fiscalYearId: fiscalYearId ?? null,
      periodId: periodId ?? null,
      asOfEpochMs,
      canClose,
      summary: {
        totalChecks: checks.length,
        passed,
        failed,
        warnings,
        skipped,
      },
      checks,
      trialBalanceTotals: glTotals,
      glImbalanceDetails,
      accountsWithVariance: trialBalance.accounts.filter(
        (e) => e.periodVariance && e.periodVariance.severity !== "OK"
      ),
      accountsWithSubledgerVariance: trialBalance.accounts.filter(
        (e) => e.subledgerVariance && e.subledgerVariance.status !== "RECONCILED"
      ),
    };
  }

  /**
   * Check for GL imbalances across all batches in a period
   * (renamed from checkGlImbalanceByBatchId for consistency)
   */
  async checkGlImbalanceByBatchId(
    companyId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<TrialBalanceGlImbalanceResult[]> {
    const result = await sql<{
      batch_id: number;
      batch_description: string | null;
      total_debits: string;
      total_credits: string;
    }>`
      SELECT
        jb.id as batch_id,
        jb.doc_type as batch_description,
        COALESCE(SUM(jl.debit), 0) AS total_debits,
        COALESCE(SUM(jl.credit), 0) AS total_credits
      FROM journal_batches jb
      INNER JOIN journal_lines jl ON jl.journal_batch_id = jb.id
      WHERE jb.company_id = ${companyId}
        AND jl.line_date >= ${periodStart}
        AND jl.line_date <= ${periodEnd}
      GROUP BY jb.id, jb.doc_type
      HAVING COALESCE(SUM(jl.debit), 0) <> COALESCE(SUM(jl.credit), 0)
      ORDER BY jb.id DESC
    `.execute(this.db);

    return (result.rows as Array<{ batch_id: number; batch_description: string | null; total_debits: string; total_credits: string }>).map((row) => {
      const totalDebits = Number(row.total_debits) || 0;
      const totalCredits = Number(row.total_credits) || 0;
      return {
        batchId: Number(row.batch_id),
        batchDescription: row.batch_description,
        totalDebits,
        totalCredits,
        imbalanceAmount: totalDebits - totalCredits,
      };
    });
  }

  // =============================================================================
  // PRIVATE HELPERS
  // =============================================================================

  /**
   * Resolve period range from fiscal year/period filters
   */
  private async resolvePeriodRange(
    companyId: number,
    fiscalYearId?: number,
    periodId?: number,
    asOfEpochMs?: number
  ): Promise<{
    periodStart: Date;
    periodEnd: Date;
    priorPeriodStart: Date | null;
    priorPeriodEnd: Date | null;
  }> {
    let periodStart: Date;
    let periodEnd: Date;

    // If fiscalYearId is provided, use fiscal year boundaries
    if (fiscalYearId !== undefined) {
      const fyResult = await this.db
        .selectFrom("fiscal_years")
        .where("id", "=", fiscalYearId)
        .where("company_id", "=", companyId)
        .select(["start_date", "end_date"])
        .executeTakeFirst();

      if (fyResult) {
        periodStart = fyResult.start_date instanceof Date ? fyResult.start_date : new Date(fyResult.start_date);
        periodEnd = fyResult.end_date instanceof Date ? fyResult.end_date : new Date(fyResult.end_date);
      } else {
        // Fallback to asOfEpochMs
        const asOfDate = asOfEpochMs !== undefined ? new Date(asOfEpochMs) : new Date();
        periodStart = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);
        periodEnd = new Date(asOfDate.getFullYear(), asOfDate.getMonth() + 1, 0, 23, 59, 59, 999);
      }
    } else if (periodId !== undefined) {
      // TODO: Once periods table exists, query it here
      // For now, fall back to asOfEpochMs or default to current month
      const asOfDate = asOfEpochMs !== undefined ? new Date(asOfEpochMs) : new Date();
      periodStart = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);
      periodEnd = new Date(asOfDate.getFullYear(), asOfDate.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
      // Default to current month
      const asOfDate = asOfEpochMs !== undefined ? new Date(asOfEpochMs) : new Date();
      periodStart = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);
      periodEnd = new Date(asOfDate.getFullYear(), asOfDate.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    // Calculate prior period (previous month)
    const priorPeriodEnd = new Date(periodStart);
    priorPeriodEnd.setDate(priorPeriodEnd.getDate() - 1);
    const priorPeriodStart = new Date(priorPeriodEnd.getFullYear(), priorPeriodEnd.getMonth(), 1);

    return { periodStart, periodEnd, priorPeriodStart, priorPeriodEnd };
  }

  /**
   * Get account balances for the period
   */
  private async getAccountBalances(
    companyId: number,
    outletId: number | undefined,
    periodStart: Date,
    periodEnd: Date,
    accountTypes?: string[],
    includeZeroBalances?: boolean
  ): Promise<Array<{
    accountId: number;
    accountCode: string;
    accountName: string;
    accountTypeName: string;
    debitAmount: number;
    creditAmount: number;
    netBalance: number;
  }>> {
    // Build base query using Kysely's query builder
    let query = this.db
      .selectFrom("accounts as a")
      .leftJoin("account_types as at", "at.id", "a.account_type_id")
      .leftJoin("journal_lines as jl", "jl.account_id", "a.id")
      .leftJoin("journal_batches as jb", "jb.id", "jl.journal_batch_id")
      .where("a.company_id", "=", companyId)
      .where("a.is_active", "=", 1)
      .where("jl.line_date", ">=", periodStart)
      .where("jl.line_date", "<=", periodEnd)
      .where("jl.company_id", "=", companyId)
      .groupBy("a.id")
      .groupBy("a.code")
      .groupBy("a.name")
      .groupBy("at.name")
      .groupBy("a.type_name")
      .orderBy("a.code");

    // Add outlet filter if provided
    if (outletId !== undefined) {
      query = query.where("jl.outlet_id", "=", outletId);
    }

    // Add account type filter using OR conditions
    if (accountTypes && accountTypes.length > 0) {
      query = query.where((eb) => eb.or(
        accountTypes.map((t) =>
          eb("at.name", "=", t)
        )
      ));
    }

    // Add having clause for non-zero balances if needed
    // Note: We use raw SQL for HAVING since Kysely doesn't support aggregate filters easily
    // The filter is applied post-query to avoid SQL injection (values are numeric comparisons only)
    const result = await query
      .select([
        "a.id as account_id",
        "a.code as account_code",
        "a.name as account_name",
        sql`COALESCE(at.name, a.type_name, '')`.as("account_type_name"),
        sql`COALESCE(SUM(jl.debit), 0)`.as("debit_total"),
        sql`COALESCE(SUM(jl.credit), 0)`.as("credit_total"),
      ])
      .execute();

    let rows = result as Array<{
      account_id: number;
      account_code: string;
      account_name: string;
      account_type_name: string;
      debit_total: number;
      credit_total: number;
    }>;

    // Filter out zero-balance rows if needed (post-query filter is safe)
    if (!includeZeroBalances) {
      rows = rows.filter((row) => row.debit_total !== 0 || row.credit_total !== 0);
    }

    return rows.map((row) => {
      const debitAmount = Number(row.debit_total) || 0;
      const creditAmount = Number(row.credit_total) || 0;
      return {
        accountId: Number(row.account_id),
        accountCode: String(row.account_code),
        accountName: String(row.account_name),
        accountTypeName: String(row.account_type_name),
        debitAmount,
        creditAmount,
        netBalance: debitAmount - creditAmount,
      };
    });
  }

  /**
   * Get account balance for a specific period
   */
  private async getAccountBalanceForPeriod(
    companyId: number,
    accountId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<number> {
    const result = await this.db
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

    const debitTotal = Number(result?.debit_total) || 0;
    const creditTotal = Number(result?.credit_total) || 0;
    return debitTotal - creditTotal;
  }

  /**
   * Get subledger variance for an account
   */
  private async getSubledgerVariance(
    companyId: number,
    accountId: number,
    accountTypeName: string,
    periodStart: Date,
    periodEnd: Date,
    glBalance: number
  ): Promise<SubledgerVariance | null> {
    // Map account type to subledger type
    const subledgerType = this.mapAccountTypeToSubledger(accountTypeName);
    if (!subledgerType) {
      return null; // No subledger for this account type
    }

    // Get subledger balance based on type
    let subledgerBalance = 0;
    let hasSubledgerData = false;

    if (subledgerType === "CASH") {
      // Use the CashSubledgerProvider pattern
      const cashBalances = await this.getCashSubledgerBalance(companyId, accountId, periodEnd);
      subledgerBalance = cashBalances;
      hasSubledgerData = Math.abs(cashBalances) > 0 || glBalance !== 0;
    }
    // TODO: Add support for INVENTORY, RECEIVABLES, PAYABLES

    const variance = glBalance - subledgerBalance;
    const threshold = 0.01; // 1 cent threshold

    let status: SubledgerVariance["status"];
    if (!hasSubledgerData) {
      status = "NO_SUBLEDGER";
    } else if (Math.abs(variance) <= threshold) {
      status = "RECONCILED";
    } else {
      status = "VARIANCE";
    }

    return {
      glBalance,
      subledgerBalance,
      variance,
      varianceThreshold: threshold,
      status,
      hasSubledgerData,
    };
  }

  /**
   * Map account type name to subledger type
   */
  private mapAccountTypeToSubledger(accountTypeName: string): string | null {
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
   * Get cash subledger balance for a specific account.
   * Uses CashSubledgerProvider for canonical subledger calculation.
   * The provider calculates balance as of the period end date.
   */
  private async getCashSubledgerBalance(
    companyId: number,
    accountId: number,
    periodEnd: Date
  ): Promise<number> {
    // Use CashSubledgerProvider for canonical cash subledger balance
    // asOfEpochMs represents the point-in-time balance (period end)
    const balanceResult = await this.cashSubledgerProvider.getBalance({
      companyId,
      accountId,
      asOfEpochMs: periodEnd.getTime(),
    });

    // CashSubledgerProvider returns signed balance (debit-positive)
    // Convert to numeric for compatibility with GL balance comparison
    return fromSignedAmount(balanceResult.signedBalance);
  }

  /**
   * Get fiscal year status
   */
  private async getFiscalYearStatus(
    companyId: number,
    fiscalYearId: number
  ): Promise<{ isClosed: boolean; status: string; code: string }> {
    const fy = await this.db
      .selectFrom("fiscal_years")
      .where("id", "=", fiscalYearId)
      .where("company_id", "=", companyId)
      .select(["code", "status"])
      .executeTakeFirst();

    if (!fy) {
      return { isClosed: false, status: "UNKNOWN", code: String(fiscalYearId) };
    }

    const status = String(fy.status).toUpperCase();
    return {
      isClosed: status === "CLOSED",
      status,
      code: String(fy.code),
    };
  }

  /**
   * Get period code string
   */
  private getPeriodCode(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
}
