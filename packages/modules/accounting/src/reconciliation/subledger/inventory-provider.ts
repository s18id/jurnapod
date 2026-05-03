// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * INVENTORY Subledger Balance Provider.
 *
 * Provides Inventory balance by aggregating:
 * 1. Inventory subledger balance from inventory_item_costs.total_layers_cost
 * 2. GL control balance from journal_lines for inventory control accounts
 *
 * This provider implements the SubledgerBalanceProvider interface for
 * the accounting module's reconciliation subsystem.
 *
 * Schema notes:
 * - inventory_item_costs is keyed by (company_id, item_id) — no transaction_id
 * - inventory_cost_layers has transaction_id FK → inventory_transactions.id
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

import {
  resolveBusinessTimezone,
  toUtcIso,
  fromUtcIso,
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
  mapJournalLineToDrilldown,
} from "./provider.js";
import { InventoryReconciliationService, toScaled, fromScaled4 } from "./inventory-reconciliation-service.js";

/**
 * INVENTORY provider database client interface.
 */
export interface InventorySubledgerDbClient extends KyselySchema {}

/**
 * Options for InventorySubledgerProvider.
 */
export interface InventorySubledgerProviderOptions {
  db: InventorySubledgerDbClient;
}

/**
 * Internal row type for journal line aggregation.
 */
interface InventoryBalanceRow {
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
 * INVENTORY subledger balance provider.
 *
 * Handles INVENTORY subledger type with:
 * - Subledger source: inventory_item_costs.total_layers_cost (SUM remaining_qty × unit_cost)
 * - GL source: journal_lines for inventory control accounts
 *
 * Edge cases:
 * - No inventory accounts defined → zero balance with empty breakdown
 * - Multiple inventory accounts → aggregate by accountId or total (based on query)
 * - Inventory subledger vs GL drift → shown in variance (reconciliation status)
 */
export class InventorySubledgerProvider implements SubledgerBalanceProvider {
  readonly subledgerType: SubledgerTypeCode = SubledgerType.INVENTORY;

  private readonly db: InventorySubledgerDbClient;
  private readonly inventoryReconciliationService: InventoryReconciliationService;

  constructor(options: InventorySubledgerProviderOptions) {
    this.db = options.db;
    this.inventoryReconciliationService = new InventoryReconciliationService(options.db);
  }

  /**
   * Check if provider is ready (optional implementation).
   * Currently always ready since we don't have external dependencies.
   */
  async checkReadiness(): Promise<void> {
    // No external dependencies to check
  }

  /**
   * Get inventory subledger balance.
   */
  async getBalance(query: SubledgerBalanceQuery): Promise<SubledgerBalanceResult> {
    const { companyId, outletId, asOfEpochMs, accountId, includeDrilldown, drilldownLimit } = query;

    if (outletId !== undefined) {
      await this.assertOutletBelongsToCompany(companyId, outletId);
    }

    // Get inventory control account IDs for this company
    const inventoryAccountIds = await this.getInventoryAccountIds(companyId);

    if (inventoryAccountIds.length === 0) {
      // No inventory accounts defined - return zero
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
    const asOfDate = fromUtcIso.businessDate(toUtcIso.epochMs(asOfEpochMs), timezone);

    // Get settings for account IDs
    const settings = await this.inventoryReconciliationService.getInventoryReconciliationSettings({ companyId });
    const effectiveAccountIds = accountId !== undefined ? [accountId] : (settings.accountIds.length > 0 ? settings.accountIds : inventoryAccountIds);

    // Compute UTC end-of-day for the as-of date
    const asOfDateUtcEnd = toUtcIso.businessDate(asOfDate, timezone, "end");

    // Get inventory subledger balance from inventory_cost_layers (date-scoped)
    const inventorySubledgerBalance = await this.getInventorySubledgerBalance(companyId, asOfDate);

    // Get GL control balance from journal lines
    const glBalance = await this.getGLBalance(companyId, effectiveAccountIds, asOfDateUtcEnd);

    // Build breakdown using the canonical toSignedAmountBreakdown helper
    // For inventory (asset), debit = increase, credit = decrease
    const signedNet = fromSignedAmount(inventorySubledgerBalance);
    const breakdown = toSignedAmountBreakdown(
      signedNet > 0 ? signedNet : 0,
      signedNet < 0 ? Math.abs(signedNet) : 0
    );

    // Build drilldown if requested
    let drilldown: ReconciliationDrilldown | undefined;
    if (includeDrilldown) {
      drilldown = await this.buildDrilldown(
        companyId,
        effectiveAccountIds,
        accountId,
        outletId,
        timezone,
        asOfDate,
        asOfDateUtcEnd,
        inventorySubledgerBalance,
        drilldownLimit ?? 1000
      );
    }

    return {
      companyId,
      outletId,
      subledgerType: this.subledgerType,
      asOfEpochMs,
      accountId,
      signedBalance: inventorySubledgerBalance,
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
   * Get IDs of accounts classified as inventory.
   */
  private async getInventoryAccountIds(companyId: number): Promise<number[]> {
    const result = await sql<{ id: number }>`
      SELECT DISTINCT a.id
      FROM accounts a
      LEFT JOIN account_types at ON at.id = a.account_type_id
      WHERE a.company_id = ${companyId}
        AND a.is_active = 1
        AND (
          LOWER(COALESCE(at.name, a.type_name, '')) IN ('inventory', 'inventory_asset', 'stock')
          OR LOWER(COALESCE(a.type_name, '')) IN ('inventory', 'inventory_asset', 'stock')
        )
    `.execute(this.db);

    return result.rows.map((r) => Number(r.id));
  }

  /**
   * Get inventory subledger balance from inventory_item_costs.
   * Uses the canonical aggregate (total_layers_cost) maintained by the costing system.
   *
   * Note: No join with inventory_transactions needed since inventory_item_costs
   * is a running aggregate keyed by (company_id, item_id).
   */
  private async getInventorySubledgerBalance(companyId: number, asOfDate: string): Promise<SignedAmount> {
    const rows = await sql<{ inventory_value: string | null }>`
      SELECT COALESCE(ROUND(SUM(CAST(icl.remaining_qty AS DECIMAL(19,4)) * CAST(icl.unit_cost AS DECIMAL(19,4))), 4), 0) AS inventory_value
      FROM inventory_cost_layers icl
      WHERE icl.company_id = ${companyId}
        AND DATE(icl.acquired_at) <= ${asOfDate}
    `.execute(this.db);

    if (rows.rows.length === 0 || rows.rows[0].inventory_value === null) {
      return zeroSignedAmount();
    }

    // DECIMAL value from DB — safe to parse as Number for SignedAmount
    // inventory_cost_layers values fit within Number.MAX_SAFE_INTEGER for typical inventory sizes
    const numeric = Number(rows.rows[0].inventory_value);
    return makeSignedAmount(numeric);
  }

  /**
   * Get GL balance from journal lines for inventory accounts.
   * Uses half-open interval: >= startUTC AND < nextDayUTC
   */
  private async getGLBalance(
    companyId: number,
    accountIds: number[],
    asOfDateUtcEnd: string
  ): Promise<SignedAmount> {
    if (accountIds.length === 0) {
      return zeroSignedAmount();
    }

    const rows = await sql<InventoryBalanceRow>`
      SELECT
        jl.account_id,
        COALESCE(SUM(jl.debit), 0) AS debit_total,
        COALESCE(SUM(jl.credit), 0) AS credit_total
      FROM journal_lines jl
      INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
      WHERE jl.company_id = ${companyId}
        AND jl.account_id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})
        AND jb.posted_at <= ${asOfDateUtcEnd}
      GROUP BY jl.account_id
    `.execute(this.db);

    let debitTotal = 0;
    let creditTotal = 0;
    for (const row of rows.rows as InventoryBalanceRow[]) {
      debitTotal += Number(row.debit_total) || 0;
      creditTotal += Number(row.credit_total) || 0;
    }

    // GL balance for inventory = debit - credit (debit-positive for assets)
    return makeSignedAmount(debitTotal - creditTotal);
  }

  /**
   * Build detailed drilldown.
   * Uses journal lines for inventory accounts.
   */
  private async buildDrilldown(
    companyId: number,
    accountIds: number[],
    accountId: number | undefined,
    outletId: number | undefined,
    timezone: string,
    asOfDate: string,
    asOfDateUtcEnd: string,
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
        AND jb.posted_at <= ${asOfDateUtcEnd}
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

    const asOfDateUtcStart = toUtcIso.businessDate(asOfDate, timezone, "start");

    return {
      subledgerType: this.subledgerType,
      accountId,
      periodStartEpochMs: new Date(asOfDateUtcStart).getTime(),
      periodEndEpochMs: new Date(asOfDateUtcEnd).getTime(),
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
