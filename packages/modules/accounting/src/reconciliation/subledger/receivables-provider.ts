// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * RECEIVABLES Subledger Balance Provider.
 *
 * Provides AR balance for receivables accounts by aggregating:
 * 1. Journal lines where account is AR type (debit-positive convention)
 * 2. AR subledger from sales invoices/payments/credit notes
 *
 * This provider implements the SubledgerBalanceProvider interface for
 * the accounting module's reconciliation subsystem.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

import {
  resolveBusinessTimezone,
  businessDateFromEpochMs,
  toUtcIso,
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
  zeroBreakdown,
  zeroSignedAmount,
  fromSignedAmount,
  addSignedAmounts,
} from "./provider.js";
import { ARReconciliationService, toScaled, fromScaled4 } from "./ar-reconciliation-service.js";
import type { ARReconciliationSettings } from "./ar-reconciliation-types.js";
import { Temporal } from "@js-temporal/polyfill";

/**
 * RECEIVABLES provider database client interface.
 */
export interface ReceivablesSubledgerDbClient extends KyselySchema {}

/**
 * Options for ReceivablesSubledgerProvider.
 */
export interface ReceivablesSubledgerProviderOptions {
  db: ReceivablesSubledgerDbClient;
}

/**
 * Internal row type for journal line aggregation.
 */
interface ReceivablesBalanceRow {
  account_id: number;
  debit_total: string;
  credit_total: string;
}

/**
 * RECEIVABLES subledger balance provider.
 *
 * Handles RECEIVABLES subledger type with:
 * - Source: journal_lines for accounts classified as AR/receivable
 * - AR subledger balance from sales invoices, payments, credit notes
 *
 * Edge cases:
 * - No transactions in period → zero balance with empty breakdown
 * - Multiple AR accounts → aggregate by accountId or total (based on query)
 * - AR subledger vs GL drift → shown in variance (reconciliation status)
 */
export class ReceivablesSubledgerProvider implements SubledgerBalanceProvider {
  readonly subledgerType: SubledgerTypeCode = SubledgerType.RECEIVABLES;

  private readonly db: ReceivablesSubledgerDbClient;
  private readonly arReconciliationService: ARReconciliationService;

  constructor(options: ReceivablesSubledgerProviderOptions) {
    this.db = options.db;
    this.arReconciliationService = new ARReconciliationService(options.db);
  }

  /**
   * Check if provider is ready (optional implementation).
   * Currently always ready since we don't have external dependencies.
   */
  async checkReadiness(): Promise<void> {
    // No external dependencies to check
  }

  /**
   * Get receivables subledger balance.
   */
  async getBalance(query: SubledgerBalanceQuery): Promise<SubledgerBalanceResult> {
    const { companyId, outletId, asOfEpochMs, accountId, includeDrilldown, drilldownLimit } = query;

    if (outletId !== undefined) {
      await this.assertOutletBelongsToCompany(companyId, outletId);
    }

    // Get AR account IDs for this company
    const arAccountIds = await this.getARAccountIds(companyId);

    if (arAccountIds.length === 0) {
      // No AR accounts defined - return zero
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

    // Resolve business timezone from outlet/company
    const timezone = await this.resolveBusinessTimezone(companyId, outletId);

    // Convert asOfEpochMs to business date string (YYYY-MM-DD) using canonical helper
    const asOfDate = businessDateFromEpochMs(asOfEpochMs, timezone);

    // Get settings for account IDs
    const settings = await this.arReconciliationService.getARReconciliationSettings({ companyId });
    const effectiveAccountIds = accountId !== undefined ? [accountId] : (settings.accountIds.length > 0 ? settings.accountIds : arAccountIds);

    // Compute half-open UTC range for the as-of date
    const { startUTC, nextDayUTC } = toUtcIso.asOfDateRange(asOfDate, timezone);

    // Get AR subledger balance from sales module data
    const arSubledgerBalance = await this.getARSubledgerBalance(companyId, asOfDate);

    // Get GL control balance from journal lines
    const glBalance = await this.getGLBalance(companyId, effectiveAccountIds, startUTC, nextDayUTC);

    // Build breakdown
    const breakdown = toSignedAmountBreakdown(
      fromSignedAmount(arSubledgerBalance) > 0 ? Math.abs(fromSignedAmount(arSubledgerBalance)) : 0,
      fromSignedAmount(arSubledgerBalance) < 0 ? Math.abs(fromSignedAmount(arSubledgerBalance)) : 0
    );

    // For subledger, we use the subledger balance directly (debit-positive)
    const signedBalance = arSubledgerBalance;

    // Build drilldown if requested
    let drilldown: ReconciliationDrilldown | undefined;
    if (includeDrilldown) {
      drilldown = await this.buildDrilldown(
        companyId,
        effectiveAccountIds,
        accountId,
        outletId,
        startUTC,
        nextDayUTC,
        signedBalance,
        drilldownLimit ?? 1000
      );
    }

    return {
      companyId,
      outletId,
      subledgerType: this.subledgerType,
      asOfEpochMs,
      accountId,
      signedBalance,
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
   * Get IDs of accounts classified as receivables.
   */
  private async getARAccountIds(companyId: number): Promise<number[]> {
    const result = await sql`
      SELECT DISTINCT a.id
      FROM accounts a
      LEFT JOIN account_types at ON at.id = a.account_type_id
      WHERE a.company_id = ${companyId}
        AND a.is_active = 1
        AND (
          a.is_receivable = 1
          OR LOWER(COALESCE(at.name, a.type_name, '')) IN ('ar', 'receivable', 'accounts_receivable')
          OR LOWER(COALESCE(a.type_name, '')) IN ('ar', 'receivable', 'accounts_receivable')
        )
    `.execute(this.db);

    return (result.rows as { id: number }[]).map((r) => Number(r.id));
  }

  /**
   * Get AR subledger balance from sales module.
   * Uses SEPARATE aggregate queries (no JOINs) to prevent row multiplication.
   * All money arithmetic uses bigint via toScaled/fromScaled4.
   */
  private async getARSubledgerBalance(companyId: number, asOfDate: string): Promise<SignedAmount> {
    // Use raw invoice grand_totals, NOT grand_total - paid_total.
    // paid_total is denormalized and reflects both payments and credit notes,
    // so using it would double-count when we also subtract payment/credit note totals separately.

    // 1. Aggregate grand_total for posted sales invoices (no joins = no multiplication)
    const invoiceRows = await sql`
      SELECT COALESCE(SUM(
        CASE WHEN si.status = 'POSTED' AND si.invoice_date <= ${asOfDate}
        THEN si.grand_total
        ELSE 0 END
      ), 0) AS invoice_total
      FROM sales_invoices si
      WHERE si.company_id = ${companyId}
        AND si.status = 'POSTED'
        AND si.invoice_date <= ${asOfDate}
    `.execute(this.db);

    // 2. Aggregate posted credit note amounts (no joins = no multiplication)
    const creditNoteRows = await sql`
      SELECT COALESCE(SUM(
        CASE WHEN scn.status = 'POSTED' AND scn.credit_note_date <= ${asOfDate}
        THEN scn.amount
        ELSE 0 END
      ), 0) AS credit_note_total
      FROM sales_credit_notes scn
      WHERE scn.company_id = ${companyId}
        AND scn.status = 'POSTED'
        AND scn.credit_note_date <= ${asOfDate}
    `.execute(this.db);

    // 3. Aggregate posted payment amounts (no joins = no multiplication)
    const paymentRows = await sql`
      SELECT COALESCE(SUM(
        CASE WHEN sp.status = 'POSTED' AND sp.payment_at <= ${asOfDate}
        THEN sp.amount
        ELSE 0 END
      ), 0) AS payment_total
      FROM sales_payments sp
      WHERE sp.company_id = ${companyId}
        AND sp.status = 'POSTED'
        AND sp.payment_at <= ${asOfDate}
    `.execute(this.db);

    if (invoiceRows.rows.length === 0) {
      return zeroSignedAmount();
    }

    const invoiceTotal = toScaled((invoiceRows.rows[0] as { invoice_total: string }).invoice_total || "0", 4);
    const creditNoteTotal = toScaled((creditNoteRows.rows[0] as { credit_note_total: string }).credit_note_total || "0", 4);
    const paymentTotal = toScaled((paymentRows.rows[0] as { payment_total: string }).payment_total || "0", 4);

    // AR subledger = invoices - payments - credit notes (debit-positive)
    const netBalance = invoiceTotal - creditNoteTotal - paymentTotal;
    // fromScaled4 converts scale-4 bigint back to decimal string before Number() conversion
    // to avoid passing a 10000x-scaled integer to makeSignedAmount (which expects base units)
    return makeSignedAmount(parseFloat(fromScaled4(netBalance)));
  }

  /**
   * Get GL balance from journal lines for AR accounts.
   * Uses half-open interval: >= startUTC AND < nextDayUTC
   */
  private async getGLBalance(
    companyId: number,
    accountIds: number[],
    startUTC: string,
    nextDayUTC: string
  ): Promise<SignedAmount> {
    if (accountIds.length === 0) {
      return zeroSignedAmount();
    }

    const rows = await sql`
      SELECT
        COALESCE(SUM(jl.debit), 0) AS total_debit,
        COALESCE(SUM(jl.credit), 0) AS total_credit
      FROM journal_lines jl
      INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
      WHERE jl.company_id = ${companyId}
        AND jl.account_id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})
        AND jb.posted_at >= ${startUTC}
        AND jb.posted_at < ${nextDayUTC}
    `.execute(this.db);

    if (rows.rows.length === 0) {
      return zeroSignedAmount();
    }

    const r = rows.rows[0] as { total_debit: string | null; total_credit: string | null };
    const totalDebit = Number(r.total_debit || "0");
    const totalCredit = Number(r.total_credit || "0");

    // GL balance for AR = debit - credit (debit-positive)
    return makeSignedAmount(totalDebit - totalCredit);
  }

  /**
   * Build detailed drilldown.
   * Uses half-open interval: >= startUTC AND < nextDayUTC
   */
  private async buildDrilldown(
    companyId: number,
    accountIds: number[],
    accountId: number | undefined,
    outletId: number | undefined,
    startUTC: string,
    nextDayUTC: string,
    closingBalance: SignedAmount,
    limit: number
  ): Promise<ReconciliationDrilldown> {
    const lines: ReconciliationDrilldownLine[] = [];

    // Get journal line drilldown
    const accountFilter = accountId !== undefined
      ? sql`jl.account_id = ${accountId}`
      : sql`jl.account_id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})`;

    const outletFilter = outletId !== undefined
      ? sql`jl.outlet_id = ${outletId}`
      : sql`1=1`;

    const jlResult = await sql`
      SELECT
        jl.id,
        jl.account_id,
        jl.debit,
        jl.credit,
        jl.description,
        jl.line_date,
        jl.outlet_id,
        jb.id as batch_id,
        jb.doc_type,
        jb.doc_id,
        jb.posted_at
      FROM journal_lines jl
      INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
      WHERE jl.company_id = ${companyId}
        AND jb.posted_at >= ${startUTC}
        AND jb.posted_at < ${nextDayUTC}
        AND ${accountFilter}
        AND ${outletFilter}
      ORDER BY jb.posted_at ASC, jl.id ASC
      LIMIT ${limit}
    `.execute(this.db);

    for (const row of jlResult.rows as any[]) {
      const debitAmount = Number(row.debit) || 0;
      const creditAmount = Number(row.credit) || 0;
      const signedImpact = (debitAmount - creditAmount) as SignedAmount;

      lines.push({
        sourceType: "JOURNAL_LINE",
        sourceId: String(row.id),
        postedAtEpochMs: new Date(row.posted_at).getTime(),
        description: row.description,
        debitAmount,
        creditAmount,
        signedImpact,
        dimensions: Object.freeze({
          account_id: row.account_id,
          batch_id: row.batch_id,
          doc_type: row.doc_type,
          doc_id: row.doc_id,
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
      periodStartEpochMs: new Date(startUTC).getTime(),
      periodEndEpochMs: new Date(nextDayUTC).getTime(),
      openingSignedBalance: makeSignedAmount(openingSignedBalance),
      movementsSignedNet,
      closingSignedBalance: closingBalance,
      lines: Object.freeze(lines),
    };
  }

  /**
   * Resolve business timezone for this company/outlet.
   * Uses outlet timezone if available, falls back to company timezone.
   */
  private async resolveBusinessTimezone(companyId: number, outletId?: number): Promise<string> {
    let outletTz: string | null = null;
    let companyTz: string | null = null;

    if (outletId !== undefined) {
      const outlet = await this.db
        .selectFrom("outlets")
        .select("timezone")
        .where("id", "=", outletId)
        .where("company_id", "=", companyId)
        .executeTakeFirst();
      outletTz = outlet?.timezone ?? null;
    }

    const company = await this.db
      .selectFrom("companies")
      .select("timezone")
      .where("id", "=", companyId)
      .executeTakeFirst();
    companyTz = company?.timezone ?? null;

    return resolveBusinessTimezone(outletTz, companyTz);
  }
}