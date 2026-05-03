// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Reconciliation Service for accounting module.
 *
 * Provides Inventory vs GL reconciliation functionality with tenant isolation.
 * Mirrors the AR reconciliation pattern but for inventory transactions.
 *
 * Subledger balance source: inventory_item_costs.total_layers_cost
 * (SUM remaining_qty × unit_cost across all cost layers, per item)
 *
 * Schema notes:
 * - inventory_item_costs is keyed by (company_id, item_id), NOT transaction_id
 * - inventory_cost_layers has transaction_id FK → inventory_transactions.id
 * - inventory_transactions has quantity_delta (no separate quantity column)
 * - inventory_transactions has no status, transaction_date, unit_cost, or total_cost columns
 * - Cost data comes from inventory_cost_layers (unit_cost, original_qty, remaining_qty)
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import {
  toUtcIso,
  isValidTimeZone,
} from "@jurnapod/shared";
import type {
  InventoryReconciliationSettings,
  InventoryReconciliationSummaryResult,
  InventoryDrilldownResult,
  InventoryDrilldownCategory,
  InventoryDrilldownLineItem,
  GetInventoryReconciliationSettingsParams,
  ValidateInventoryReconciliationAccountIdsParams,
  SaveInventoryReconciliationSettingsParams,
  GetInventoryReconciliationSummaryParams,
  GetInventoryReconciliationDrilldownParams,
  InventoryMovementType,
} from "./inventory-reconciliation-types.js";
import {
  InventoryReconciliationError,
  InventoryReconciliationSettingsRequiredError,
  InventoryReconciliationInvalidAccountError,
  InventoryReconciliationCrossTenantAccountError,
  InventoryReconciliationTimezoneRequiredError,
} from "./inventory-reconciliation-types.js";

// =============================================================================
// BigInt Scaled Decimal Helpers (same as AR/AP reconciliation)
// =============================================================================

export function toScaled(value: string, scale: number): bigint {
  const trimmed = value.trim();
  const re = new RegExp(`^-?\\d+(\\.\\d{1,${scale}})?$`);
  if (!re.test(trimmed)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  const sign = trimmed.startsWith("-") ? -1n : 1n;
  const unsigned = sign < 0n ? trimmed.slice(1) : trimmed;
  const [integer, fraction = ""] = unsigned.split(".");
  const scaleFactor = 10n ** BigInt(scale);
  const fracScaled = (fraction + "0".repeat(scale)).slice(0, scale);
  const magnitude = BigInt(integer) * scaleFactor + BigInt(fracScaled);
  return sign * magnitude;
}

export function fromScaled(value: bigint, scale: number): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const intPart = abs / (10n ** BigInt(scale));
  const fracPart = (abs % (10n ** BigInt(scale))).toString().padStart(scale, "0");
  return `${sign}${intPart.toString()}.${fracPart}`;
}

export function fromScaled4(value: bigint): string {
  return fromScaled(value, 4);
}

// =============================================================================
// Service
// =============================================================================

const INVENTORY_CONTROL_ACCOUNT_TYPE_NAMES = ["INVENTORY", "INVENTORY_ASSET", "STOCK"] as const;
const INVENTORY_RECONCILIATION_ACCOUNT_IDS_KEY = "inventory_reconciliation_account_ids" as const;

export class InventoryReconciliationService {
  constructor(private readonly db: KyselySchema) {}

  /**
   * Resolve the canonical IANA timezone for inventory reconciliation.
   * Resolution order:
   * 1. outlet.timezone (if present and valid IANA identifier)
   * 2. company.timezone (if present and valid IANA identifier)
   * 3. NO UTC fallback - throw error if neither is available
   */
  async resolveCompanyTimezone(params: { companyId: number }): Promise<string> {
    const { companyId } = params;

    // Try outlet timezone first (default outlet for company)
    const outletRow = await this.db
      .selectFrom("outlets")
      .where("company_id", "=", companyId)
      .where("code", "=", "MAIN")
      .select(["timezone"])
      .executeTakeFirst();

    if (outletRow?.timezone && isValidTimeZone(outletRow.timezone)) {
      return outletRow.timezone;
    }

    // Fall back to company timezone
    const companyRow = await this.db
      .selectFrom("companies")
      .where("id", "=", companyId)
      .select(["timezone"])
      .executeTakeFirst();

    if (companyRow?.timezone && isValidTimeZone(companyRow.timezone)) {
      return companyRow.timezone;
    }

    // NO UTC fallback - fail closed per project invariants
    throw new InventoryReconciliationTimezoneRequiredError(
      companyId,
      outletRow?.timezone ?? null,
      companyRow?.timezone ?? null
    );
  }

  /**
   * Validate that an account is inventory-control compatible.
   */
  private async isInventoryControlAccount(companyId: number, accountId: number): Promise<boolean> {
    const result = await sql<{ matched: number }>`
      SELECT 1 AS matched
      FROM accounts a
      LEFT JOIN account_types at ON at.id = a.account_type_id
      WHERE a.id = ${accountId}
        AND a.company_id = ${companyId}
        AND a.is_active = 1
        AND (
          LOWER(COALESCE(at.name, a.type_name, '')) IN (${sql.join(INVENTORY_CONTROL_ACCOUNT_TYPE_NAMES.map(t => sql`${t.toLowerCase()}`), sql`, `)})
          OR LOWER(COALESCE(a.type_name, '')) IN (${sql.join(INVENTORY_CONTROL_ACCOUNT_TYPE_NAMES.map(t => sql`${t.toLowerCase()}`), sql`, `)})
        )
      LIMIT 1
    `.execute(this.db);

    return result.rows.length > 0;
  }

  /**
   * Get inventory reconciliation account IDs from settings.
   */
  async getInventoryReconciliationAccountIds(companyId: number): Promise<number[] | null> {
    const result = await sql`
      SELECT setting_value FROM settings_strings
      WHERE company_id = ${companyId}
        AND outlet_id IS NULL
        AND setting_key = ${INVENTORY_RECONCILIATION_ACCOUNT_IDS_KEY}
      LIMIT 1
    `.execute(this.db);

    if (result.rows.length === 0) {
      return null;
    }

    const settingValue = (result.rows[0] as { setting_value: string }).setting_value;
    try {
      const parsed = JSON.parse(settingValue);
      if (!Array.isArray(parsed)) {
        return null;
      }
      return parsed.map(Number).filter((n: number) => Number.isSafeInteger(n) && n > 0);
    } catch {
      return null;
    }
  }

  /**
   * Get inventory reconciliation account IDs with fallback to company_modules default.
   */
  async getInventoryReconciliationSettings(params: GetInventoryReconciliationSettingsParams): Promise<InventoryReconciliationSettings> {
    const { companyId } = params;

    // First try settings_strings
    const settingAccountIds = await this.getInventoryReconciliationAccountIds(companyId);

    if (settingAccountIds !== null && settingAccountIds.length > 0) {
      // Validate all accounts exist and are inventory-control compatible
      const validAccounts: number[] = [];

      for (const accountId of settingAccountIds) {
        const isValid = await this.isInventoryControlAccount(companyId, accountId);
        if (isValid) {
          validAccounts.push(accountId);
        }
      }

      if (validAccounts.length > 0) {
        return {
          accountIds: validAccounts,
          source: "settings",
        };
      }
    }

    // Fallback: find any inventory-type account used by items.inventory_asset_account_id
    const inventoryAccountResult = await sql`
      SELECT DISTINCT i.inventory_asset_account_id AS id
      FROM items i
      INNER JOIN accounts a ON a.id = i.inventory_asset_account_id
      WHERE i.company_id = ${companyId}
        AND a.is_active = 1
        AND i.inventory_asset_account_id IS NOT NULL
      LIMIT 1
    `.execute(this.db);

    if (inventoryAccountResult.rows.length > 0) {
      const inventoryAccountId = Number((inventoryAccountResult.rows[0] as { id: number }).id);
      return {
        accountIds: [inventoryAccountId],
        source: "fallback_company_default",
      };
    }

    // Second fallback: find any inventory-type account
    const fallbackResult = await sql`
      SELECT id FROM accounts
      WHERE company_id = ${companyId}
        AND is_active = 1
        AND type_name IN (${sql.join(INVENTORY_CONTROL_ACCOUNT_TYPE_NAMES.map(t => sql`${t}`), sql`, `)})
      LIMIT 1
    `.execute(this.db);

    if (fallbackResult.rows.length > 0) {
      const fallbackAccountId = Number((fallbackResult.rows[0] as { id: number }).id);
      return {
        accountIds: [fallbackAccountId],
        source: "fallback_company_default",
      };
    }

    return {
      accountIds: [],
      source: "none",
    };
  }

  /**
   * Validate account IDs for inventory reconciliation settings.
   */
  async validateInventoryReconciliationAccountIds(params: ValidateInventoryReconciliationAccountIdsParams): Promise<void> {
    const { companyId, accountIds } = params;

    if (accountIds.length === 0) {
      throw new InventoryReconciliationInvalidAccountError(0, "No account IDs provided");
    }

    // Fetch all accounts with their optional account_type mapping
    const accountsResult = await sql<{ id: number; company_id: number; is_active: number; type_name: string | null; at_name: string | null }>`
      SELECT a.id, a.company_id, a.is_active, a.type_name, at.name AS at_name
      FROM accounts a
      LEFT JOIN account_types at ON at.id = a.account_type_id
      WHERE a.id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})
    `.execute(this.db);

    const accountMap = new Map<number, { company_id: number; is_active: number; type_name: string | null; at_name: string | null }>();
    // NOTE: accounts table has NO is_inventory column — classification is via type_name OR account_types.name
    for (const row of accountsResult.rows) {
      const r = row as { id: number; company_id: number; is_active: number; type_name: string | null; at_name: string | null };
      accountMap.set(r.id, r);
    }

    for (const accountId of accountIds) {
      const account = accountMap.get(accountId);

      if (!account) {
        throw new InventoryReconciliationInvalidAccountError(accountId, "Account not found or inactive");
      }

      if (account.company_id !== companyId) {
        throw new InventoryReconciliationCrossTenantAccountError(accountId);
      }

      if (account.is_active !== 1) {
        throw new InventoryReconciliationInvalidAccountError(accountId, "Account is inactive");
      }

      // Check both accounts.type_name AND account_types.name for compatibility
      const typeName = (account.type_name ?? "").toUpperCase();
      const atName = (account.at_name ?? "").toUpperCase();
      const typeMatch = INVENTORY_CONTROL_ACCOUNT_TYPE_NAMES.includes(
        typeName as typeof INVENTORY_CONTROL_ACCOUNT_TYPE_NAMES[number]
      );
      const atMatch = INVENTORY_CONTROL_ACCOUNT_TYPE_NAMES.includes(
        atName as typeof INVENTORY_CONTROL_ACCOUNT_TYPE_NAMES[number]
      );

      if (!typeMatch && !atMatch) {
        throw new InventoryReconciliationInvalidAccountError(
          accountId,
          `Account is not inventory-control compatible. type_name='${account.type_name ?? "NULL"}', account_type.name='${account.at_name ?? "NULL"}'. Must be INVENTORY, INVENTORY_ASSET, or STOCK.`
        );
      }
    }
  }

  /**
   * Save inventory reconciliation account IDs to settings.
   */
  async saveInventoryReconciliationSettings(params: SaveInventoryReconciliationSettingsParams): Promise<void> {
    const { companyId, accountIds } = params;

    // Validate first
    await this.validateInventoryReconciliationAccountIds({ companyId, accountIds });

    const settingValue = JSON.stringify(accountIds);

    await sql`
      INSERT INTO settings_strings (company_id, outlet_id, setting_key, setting_value, created_at, updated_at)
      VALUES (${companyId}, NULL, ${INVENTORY_RECONCILIATION_ACCOUNT_IDS_KEY}, ${settingValue}, NOW(), NOW())
      ON DUPLICATE KEY UPDATE setting_value = ${settingValue}, updated_at = NOW()
    `.execute(this.db);
  }

  /**
   * Normalize date to UTC end-of-day in the given timezone.
   */
  private normalizeDate(dateStr: string, timezone: string, endOfDay: boolean): string {
    return toUtcIso.businessDate(dateStr, timezone, endOfDay ? "end" : "start");
  }

  /**
   * Get Inventory subledger balance from inventory_cost_layers.
   *
   * Computes SUM(remaining_qty × unit_cost) for all cost layers acquired
   * up to the given cutoff date. This represents the current remaining value
   * of inventory that was acquired on or before the cutoff.
   *
   * Note: remaining_qty reflects CURRENT remaining quantities. For past-date
   * reconciliation, consumption after the cutoff date will cause the subledger
   * balance to under-report vs the actual value at the cutoff. This is an
   * accepted limitation — the primary use case is current-date reconciliation,
   * where both sides are in sync.
   *
   * Query uses inventory_cost_layers (not inventory_item_costs) because
   * inventory_item_costs is a running aggregate without date columns.
   * inventory_cost_layers.acquired_at provides the date scope needed for
   * asOfDate filtering.
   */
  private async getInventorySubledgerBalance(companyId: number, asOfDate: string): Promise<bigint> {
    const rows = await sql<{ inventory_value: string | null }>`
      SELECT COALESCE(ROUND(SUM(CAST(icl.remaining_qty AS DECIMAL(19,4)) * CAST(icl.unit_cost AS DECIMAL(19,4))), 4), 0) AS inventory_value
      FROM inventory_cost_layers icl
      WHERE icl.company_id = ${companyId}
        AND DATE(icl.acquired_at) <= ${asOfDate}
    `.execute(this.db);

    if (rows.rows.length === 0 || rows.rows[0].inventory_value === null) {
      return 0n;
    }

    return toScaled(rows.rows[0].inventory_value, 4);
  }

  /**
   * Get GL control balance (sum of debit - credit for configured inventory accounts).
   */
  private async getGLControlBalance(companyId: number, accountIds: number[], asOfDateUtcEnd: string): Promise<bigint> {
    if (accountIds.length === 0) {
      return 0n;
    }

    const rows = await sql<{ total_debit: string | null; total_credit: string | null }>`
      SELECT
        COALESCE(SUM(jl.debit), 0) AS total_debit,
        COALESCE(SUM(jl.credit), 0) AS total_credit
      FROM journal_lines jl
      INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
      WHERE jl.company_id = ${companyId}
        AND jl.account_id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})
        AND jb.posted_at <= ${asOfDateUtcEnd}
    `.execute(this.db);

    if (rows.rows.length === 0) {
      return 0n;
    }

    const r = rows.rows[0];
    const totalDebit = toScaled(r.total_debit ?? "0", 4);
    const totalCredit = toScaled(r.total_credit ?? "0", 4);

    // GL control balance for inventory should be debit - credit (debit-positive for asset)
    return totalDebit - totalCredit;
  }

  /**
   * Get Inventory Reconciliation Summary.
   */
  async getInventoryReconciliationSummary(params: GetInventoryReconciliationSummaryParams): Promise<InventoryReconciliationSummaryResult> {
    const { companyId, asOfDate } = params;

    const settings = await this.getInventoryReconciliationSettings({ companyId });

    if (settings.accountIds.length === 0) {
      throw new InventoryReconciliationSettingsRequiredError();
    }

    // Resolve tenant-local timezone (canonical: outlet -> company, no UTC fallback)
    const timezone = await this.resolveCompanyTimezone({ companyId });

    // Convert YYYY-MM-DD as_of_date to UTC boundaries in the tenant's timezone.
    const asOfDateUtcEnd = this.normalizeDate(asOfDate, timezone, true);

    const [inventoryBalance, glBalance] = await Promise.all([
      this.getInventorySubledgerBalance(companyId, asOfDate),
      this.getGLControlBalance(companyId, settings.accountIds, asOfDateUtcEnd),
    ]);

    const variance = inventoryBalance - glBalance;

    return {
      asOfDate,
      inventorySubledgerBalance: fromScaled4(inventoryBalance),
      glControlBalance: fromScaled4(glBalance),
      variance: fromScaled4(variance),
      configuredAccountIds: settings.accountIds,
      accountSource: settings.source,
      currency: "BASE",
    };
  }

  /**
   * Get Inventory Reconciliation Drilldown.
   *
   * Provides variance breakdown by transaction type (transaction_type column).
   * Uses inventory_cost_layers joined with inventory_transactions to get cost data.
   */
  async getInventoryReconciliationDrilldown(
    params: GetInventoryReconciliationDrilldownParams
  ): Promise<InventoryDrilldownResult> {
    const { companyId, asOfDate, movementType, cursor, limit = 100 } = params;

    const settings = await this.getInventoryReconciliationSettings({ companyId });
    if (settings.accountIds.length === 0) {
      throw new InventoryReconciliationSettingsRequiredError();
    }

    const accountIds = settings.accountIds;
    const timezone = await this.resolveCompanyTimezone({ companyId });
    const asOfDateUtcEnd = this.normalizeDate(asOfDate, timezone, true);

    const limitPlusOne = limit + 1;

    // Map transaction_type number values to movement type strings
    // From stock-service.ts TRANSACTION_TYPE constants:
    // SALE=1, REFUND=2, RESERVATION=3, RELEASE=4, ADJUSTMENT=5, RECEIPT=6, TRANSFER=7
    const movementTypeMap: Record<string, number> = {
      receipt: 6,
      adjustment: 5,
      sale: 1,
      transfer: 7,
      refund: 2,
    };

    // Reverse map: number -> string label
    const typeReverseMap: Record<number, InventoryMovementType> = {
      1: "sale",
      2: "refund",
      3: "sale",      // RESERVATION treated as sale for drilldown
      4: "refund",     // RELEASE treated as refund for drilldown
      5: "adjustment",
      6: "receipt",
      7: "transfer",
    };

    // Build type filter
    const typeFilter = movementType
      ? sql`it.transaction_type = ${movementTypeMap[movementType]}`
      : sql`1=1`;

    // Parse cursor (format: "receipt|42" — type name + transaction id)
    let cursorType: string | null = null;
    let cursorId: number | null = null;
    if (cursor) {
      const parts = cursor.split("|");
      if (parts.length === 2 && Number.isSafeInteger(Number(parts[1]))) {
        [cursorType] = parts;
        cursorId = Number(parts[1]);
      }
    }

    // cursorType is the movement type string; map to numeric transaction_type for filtering
    const cursorTypeNum = cursorType ? (movementTypeMap[cursorType] ?? null) : null;

    // For cursor filtering, order by transaction_type then id
    const cursorSql = (cursorTypeNum !== null && cursorId !== null)
      ? sql`(it.transaction_type = ${cursorTypeNum} AND it.id > ${cursorId}) OR it.transaction_type > ${cursorTypeNum}`
      : sql`1=1`;

    // Fetch inventory transaction lines with cost data from cost layers.
    // inventory_cost_layers has transaction_id FK → inventory_transactions.id.
    // Multiple cost layers can exist per transaction (for composite items).
    const txRows = await sql<{
      id: number;
      transaction_type: number;
      quantity_delta: string;
      created_at: Date;
      product_id: number | null;
      variant_id: number | null;
      notes: string | null;
      layer_cost: string | null;
    }>`
      SELECT
        it.id,
        it.transaction_type,
        it.quantity_delta,
        it.created_at,
        it.product_id,
        it.variant_id,
        it.notes,
        COALESCE(SUM(icl.original_qty * icl.unit_cost), 0) AS layer_cost
      FROM inventory_transactions it
      LEFT JOIN inventory_cost_layers icl ON icl.transaction_id = it.id
      WHERE it.company_id = ${companyId}
        AND ${typeFilter}
        AND ${cursorSql}
      GROUP BY it.id
      ORDER BY it.transaction_type ASC, it.id ASC
      LIMIT ${limitPlusOne}
    `.execute(this.db);

    const allLines: InventoryDrilldownLineItem[] = [];

    for (const row of txRows.rows) {
      const typeLabel = typeReverseMap[row.transaction_type] ?? "adjustment";
      const layerCost = toScaled(row.layer_cost ?? "0", 4);

      allLines.push({
        id: row.id,
        type: typeLabel,
        reference: `TXN:${row.id}`,
        date: toUtcIso.dateLike(row.created_at) ?? asOfDate,
        quantity: row.quantity_delta,
        unitCost: fromScaled4(layerCost), // simplified: total cost per line item
        totalCost: fromScaled4(layerCost),
        glAmount: "0.0000", // GL amount computed below via batch lookup
        variance: fromScaled4(layerCost),
        sourceId: row.id,
        sourceType: typeLabel,
      });
    }

    // Fetch GL amounts for these transactions
    const txIds = allLines.map(l => l.sourceId).filter((id): id is number => id !== null);

    if (accountIds.length > 0 && txIds.length > 0) {
      const glLookupRows = await sql<{
        doc_id: number;
        total_debit: string | null;
        total_credit: string | null;
      }>`
        SELECT
          jb.doc_id,
          SUM(jl.debit) AS total_debit,
          SUM(jl.credit) AS total_credit
        FROM journal_lines jl
        INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
        WHERE jl.company_id = ${companyId}
          AND jl.account_id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})
          AND jb.posted_at <= ${asOfDateUtcEnd}
          AND jb.doc_type IN ('PURCHASE_RECEIPT', 'STOCK_ADJUSTMENT', 'POS_SALE')
          AND jb.doc_id IN (${sql.join(txIds.map(id => sql`${id}`), sql`, `)})
        GROUP BY jb.doc_id
      `.execute(this.db);

      // Map doc_id -> GL amount
      const glByTx = new Map<number, bigint>();
      for (const row of glLookupRows.rows) {
        const glAmt = toScaled(row.total_debit ?? "0", 4) - toScaled(row.total_credit ?? "0", 4);
        glByTx.set(row.doc_id, glAmt);
      }

      // Update lines with GL amounts and recalculate variance
      for (const line of allLines) {
        if (line.sourceId !== null) {
          const glAmt = glByTx.get(line.sourceId) ?? 0n;
          const txCost = toScaled(line.totalCost, 4);
          line.glAmount = fromScaled4(glAmt);
          line.variance = fromScaled4(txCost - glAmt);
        }
      }
    }

    // Sort by type then id
    allLines.sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.id - b.id;
    });

    const hasMore = allLines.length > limit;
    const pagedLines = hasMore ? allLines.slice(0, limit) : allLines;
    const nextCursor = hasMore && pagedLines.length > 0
      ? `${pagedLines[pagedLines.length - 1].type}|${pagedLines[pagedLines.length - 1].id}`
      : null;

    // Build category summaries
    const categoryMap = new Map<InventoryMovementType, { value: bigint; gl: bigint; variance: bigint; count: number }>();

    for (const line of pagedLines) {
      const cat = categoryMap.get(line.type) ?? { value: 0n, gl: 0n, variance: 0n, count: 0 };
      cat.value += toScaled(line.totalCost, 4);
      cat.gl += toScaled(line.glAmount, 4);
      cat.variance += toScaled(line.variance, 4);
      cat.count++;
      categoryMap.set(line.type, cat);
    }

    const categories: InventoryDrilldownCategory[] = [];
    for (const [type, data] of categoryMap.entries()) {
      categories.push({
        type,
        label: type.charAt(0).toUpperCase() + type.slice(1),
        inventoryValue: fromScaled4(data.value),
        glBalance: fromScaled4(data.gl),
        variance: fromScaled4(data.variance),
        transactionCount: data.count,
      });
    }

    categories.sort((a, b) => a.type.localeCompare(b.type));

    const totalVar = Array.from(categoryMap.values()).reduce((sum, c) => sum + c.variance, 0n);

    return {
      asOfDate,
      categories,
      lines: pagedLines,
      totalVariance: fromScaled4(totalVar),
      hasMore,
      nextCursor,
    };
  }
}

// Export error classes for use in other services
export {
  InventoryReconciliationSettingsRequiredError,
  InventoryReconciliationInvalidAccountError,
  InventoryReconciliationCrossTenantAccountError,
  InventoryReconciliationTimezoneRequiredError,
};
