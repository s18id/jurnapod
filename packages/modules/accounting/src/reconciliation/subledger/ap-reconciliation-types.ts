// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Reconciliation Types
 *
 * Defines types for Payables (AP) subledger-to-GL reconciliation.
 * Mirrors the AR reconciliation pattern but for purchase invoices/payments/credits.
 */

/**
 * AP Reconciliation Settings
 */
export interface APReconciliationSettings {
  accountIds: number[];
  source: "settings" | "fallback_company_default" | "none";
}

/**
 * AP Reconciliation Summary Result
 */
export interface APReconciliationSummaryResult {
  asOfDate: string;
  apSubledgerBalance: string;  // scaled decimal string (scale 4)
  glControlBalance: string;    // scaled decimal string (scale 4)
  variance: string;            // scaled decimal string (scale 4)
  configuredAccountIds: number[];
  accountSource: string;
  currency: "BASE";
}

/**
 * AP document types for drilldown
 */
export type APDocumentType = "purchase_invoice" | "ap_payment" | "purchase_credit";

/**
 * Get AP Reconciliation Summary Parameters
 */
export interface GetAPReconciliationSummaryParams {
  companyId: number;
  asOfDate: string;
}

/**
 * Drilldown category for AP reconciliation variance breakdown
 */
export interface APDrilldownCategory {
  type: APDocumentType;
  label: string;
  openBalance: string;       // scaled decimal string (scale 4)
  glBalance: string;         // scaled decimal string (scale 4)
  variance: string;          // scaled decimal string (scale 4)
  transactionCount: number;
}

/**
 * Drilldown line item for AP reconciliation variance
 */
export interface APDrilldownLineItem {
  id: number;
  type: APDocumentType;
  reference: string;
  date: string;
  openAmount: string;        // scaled decimal string (scale 4)
  glAmount: string;          // scaled decimal string (scale 4)
  variance: string;          // scaled decimal string (scale 4)
  sourceId: number | null;
  sourceType: APDocumentType;
}

/**
 * AP Reconciliation Drilldown Result
 */
export interface APDrilldownResult {
  asOfDate: string;
  categories: APDrilldownCategory[];
  lines: APDrilldownLineItem[];
  totalVariance: string;     // scaled decimal string (scale 4)
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Get AP Reconciliation Drilldown Parameters
 */
export interface GetAPReconciliationDrilldownParams {
  companyId: number;
  asOfDate: string;
  documentType?: APDocumentType;
  cursor?: string;
  limit?: number;
}

/**
 * Get AP Reconciliation Settings Parameters
 */
export interface GetAPReconciliationSettingsParams {
  companyId: number;
}

/**
 * Validate AP Reconciliation Account IDs Parameters
 */
export interface ValidateAPReconciliationAccountIdsParams {
  companyId: number;
  accountIds: number[];
}

/**
 * Save AP Reconciliation Settings Parameters
 */
export interface SaveAPReconciliationSettingsParams {
  companyId: number;
  accountIds: number[];
}

/**
 * AP Reconciliation Error
 */
export class APReconciliationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "APReconciliationError";
    this.code = code;
  }
}

export class APReconciliationSettingsRequiredError extends APReconciliationError {
  constructor() {
    super(
      "AP_RECONCILIATION_SETTINGS_REQUIRED",
      "AP reconciliation settings are required. Configure account_ids via PUT /api/accounting/reports/ap-reconciliation/settings"
    );
  }
}

export class APReconciliationInvalidAccountError extends APReconciliationError {
  constructor(accountId: number, reason: string) {
    super("AP_RECONCILIATION_INVALID_ACCOUNT", `Account ${accountId} is not valid for AP reconciliation: ${reason}`);
  }
}

export class APReconciliationCrossTenantAccountError extends APReconciliationError {
  constructor(accountId: number) {
    super("AP_RECONCILIATION_CROSS_TENANT_ACCOUNT", `Account ${accountId} does not belong to the current company`);
  }
}

export class APReconciliationTimezoneRequiredError extends APReconciliationError {
  constructor(
    public readonly companyId: number,
    public readonly outletTimezone: string | null,
    public readonly companyTimezone: string | null
  ) {
    super(
      "AP_RECONCILIATION_TIMEZONE_REQUIRED",
      `Company ${companyId} requires a valid timezone for AP reconciliation. Outlet: ${outletTimezone ?? "null"}, Company: ${companyTimezone ?? "null"}`
    );
  }
}
