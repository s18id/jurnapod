// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Reconciliation Types
 *
 * Defines types for Inventory subledger-to-GL reconciliation.
 * Mirrors the AR reconciliation pattern but for inventory transactions.
 */

import type { SignedAmount } from "./provider.js";

/**
 * Inventory Reconciliation Settings
 */
export interface InventoryReconciliationSettings {
  accountIds: number[];
  source: "settings" | "fallback_company_default" | "none";
}

/**
 * Inventory Reconciliation Summary Result
 */
export interface InventoryReconciliationSummaryResult {
  asOfDate: string;
  inventorySubledgerBalance: string;  // scaled decimal string (scale 4)
  glControlBalance: string;           // scaled decimal string (scale 4)
  variance: string;                   // scaled decimal string (scale 4)
  configuredAccountIds: number[];
  accountSource: string;
  currency: "BASE";
}

/**
 * Inventory movement types for drilldown
 */
export type InventoryMovementType = "receipt" | "adjustment" | "sale" | "transfer" | "refund";

/**
 * GL Detail Line
 */
export interface InventoryGLDetailLine {
  journalLineId: number;
  journalBatchId: number;
  journalNumber: string;
  effectiveDate: string;
  description: string;
  accountId: number;
  accountCode: string;
  accountName: string;
  debit: string | null;
  credit: string | null;
  sourceType: string | null;
  sourceId: number | null;
  postedAt: string;
}

/**
 * Inventory Detail Line
 */
export interface InventoryDetailLine {
  id: number;
  type: InventoryMovementType;
  reference: string;
  date: string;
  quantity: string;
  unitCost: string;
  totalCost: string;
  status: string;
  glJournalLineId: number | null;
}

/**
 * GL Detail Result
 */
export interface InventoryGLDetailResult {
  lines: InventoryGLDetailLine[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
}

/**
 * Inventory Detail Result
 */
export interface InventoryDetailResult {
  lines: InventoryDetailLine[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
  totalValue: string;
}

/**
 * Get GL Detail Parameters
 */
export interface GetInventoryGLDetailParams {
  companyId: number;
  accountIds: number[];
  asOfDate: string;
  timezone: string;
  cursor?: string;
  limit?: number;
}

/**
 * Get Inventory Detail Parameters
 */
export interface GetInventoryDetailParams {
  companyId: number;
  asOfDate: string;
  cursor?: string;
  limit?: number;
}

/**
 * Get Inventory Reconciliation Summary Parameters
 */
export interface GetInventoryReconciliationSummaryParams {
  companyId: number;
  asOfDate: string;
}

/**
 * Drilldown category for Inventory reconciliation variance breakdown
 */
export interface InventoryDrilldownCategory {
  type: InventoryMovementType;
  label: string;
  inventoryValue: string;       // scaled decimal string (scale 4)
  glBalance: string;            // scaled decimal string (scale 4)
  variance: string;            // scaled decimal string (scale 4)
  transactionCount: number;
}

/**
 * Drilldown line item for Inventory reconciliation variance
 */
export interface InventoryDrilldownLineItem {
  id: number;
  type: InventoryMovementType;
  reference: string;
  date: string;
  quantity: string;
  unitCost: string;
  totalCost: string;            // scaled decimal string (scale 4)
  glAmount: string;             // scaled decimal string (scale 4)
  variance: string;             // scaled decimal string (scale 4)
  sourceId: number | null;      // inventory transaction ID
  sourceType: InventoryMovementType;
}

/**
 * Inventory Reconciliation Drilldown Result
 */
export interface InventoryDrilldownResult {
  asOfDate: string;
  categories: InventoryDrilldownCategory[];
  lines: InventoryDrilldownLineItem[];
  totalVariance: string;       // scaled decimal string (scale 4)
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Get Inventory Reconciliation Drilldown Parameters
 */
export interface GetInventoryReconciliationDrilldownParams {
  companyId: number;
  asOfDate: string;
  movementType?: InventoryMovementType;
  cursor?: string;
  limit?: number;
}

/**
 * Get Inventory Reconciliation Settings Parameters
 */
export interface GetInventoryReconciliationSettingsParams {
  companyId: number;
}

/**
 * Validate Inventory Reconciliation Account IDs Parameters
 */
export interface ValidateInventoryReconciliationAccountIdsParams {
  companyId: number;
  accountIds: number[];
}

/**
 * Save Inventory Reconciliation Settings Parameters
 */
export interface SaveInventoryReconciliationSettingsParams {
  companyId: number;
  accountIds: number[];
}

/**
 * Inventory Reconciliation Error
 */
export class InventoryReconciliationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "InventoryReconciliationError";
    this.code = code;
  }
}

/**
 * Inventory Reconciliation Settings Required Error
 */
export class InventoryReconciliationSettingsRequiredError extends InventoryReconciliationError {
  constructor() {
    super(
      "INVENTORY_RECONCILIATION_SETTINGS_REQUIRED",
      "Inventory reconciliation settings are required. Configure account_ids via PUT /api/accounting/reports/inventory-reconciliation/settings"
    );
  }
}

/**
 * Inventory Reconciliation Invalid Account Error
 */
export class InventoryReconciliationInvalidAccountError extends InventoryReconciliationError {
  constructor(accountId: number, reason: string) {
    super("INVENTORY_RECONCILIATION_INVALID_ACCOUNT", `Account ${accountId} is not valid for inventory reconciliation: ${reason}`);
  }
}

/**
 * Inventory Reconciliation Cross-Tenant Account Error
 */
export class InventoryReconciliationCrossTenantAccountError extends InventoryReconciliationError {
  constructor(accountId: number) {
    super("INVENTORY_RECONCILIATION_CROSS_TENANT_ACCOUNT", `Account ${accountId} does not belong to the current company`);
  }
}

/**
 * Inventory Reconciliation Timezone Required Error
 */
export class InventoryReconciliationTimezoneRequiredError extends InventoryReconciliationError {
  constructor(
    public readonly companyId: number,
    public readonly outletTimezone: string | null,
    public readonly companyTimezone: string | null
  ) {
    super(
      "INVENTORY_RECONCILIATION_TIMEZONE_REQUIRED",
      `Company ${companyId} requires a valid timezone for inventory reconciliation. Outlet: ${outletTimezone ?? "null"}, Company: ${companyTimezone ?? "null"}`
    );
  }
}