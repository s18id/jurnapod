// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AR Reconciliation Types
 *
 * Defines types for Receivables (AR) subledger-to-GL reconciliation.
 * Mirrors the AP reconciliation pattern but for sales invoices/payments/credit notes.
 */

import type { SignedAmount } from "./provider.js";

/**
 * AR Reconciliation Settings
 */
export interface ARReconciliationSettings {
  accountIds: number[];
  source: "settings" | "fallback_company_default" | "none";
}

/**
 * AR Reconciliation Summary Result
 */
export interface ARReconciliationSummaryResult {
  asOfDate: string;
  arSubledgerBalance: string;  // scaled decimal string (scale 4)
  glControlBalance: string;    // scaled decimal string (scale 4)
  variance: string;            // scaled decimal string (scale 4)
  configuredAccountIds: number[];
  accountSource: string;
  currency: "BASE";
}

/**
 * AR document types for drilldown
 */
export type ARDocumentType = "sales_invoice" | "sales_payment" | "sales_credit_note";

/**
 * GL Detail Line
 */
export interface ARGLDetailLine {
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
 * AR Detail Line
 */
export interface ARDetailLine {
  id: number;
  type: ARDocumentType;
  reference: string;
  date: string;
  dueDate: string | null;
  customerId: number | null;
  customerName: string | null;
  currencyCode: string;
  originalAmount: string;
  baseAmount: string;
  openAmount: string;
  status: string;
  matched: boolean;
  glJournalLineId: number | null;
}

/**
 * GL Detail Result
 */
export interface ARGLDetailResult {
  lines: ARGLDetailLine[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
}

/**
 * AR Detail Result
 */
export interface ARDetailResult {
  lines: ARDetailLine[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
  totalOpenBase: string;
}

/**
 * Get GL Detail Parameters
 */
export interface GetARGLDetailParams {
  companyId: number;
  accountIds: number[];
  asOfDate: string;
  timezone: string;
  cursor?: string;
  limit?: number;
}

/**
 * Get AR Detail Parameters
 */
export interface GetARDetailParams {
  companyId: number;
  asOfDate: string;
  cursor?: string;
  limit?: number;
}

/**
 * Get AR Reconciliation Summary Parameters
 */
export interface GetARReconciliationSummaryParams {
  companyId: number;
  asOfDate: string;
}

/**
 * Drilldown category for AR reconciliation variance breakdown
 */
export interface ARDrilldownCategory {
  type: ARDocumentType;
  label: string;
  openBalance: string;       // scaled decimal string (scale 4)
  glBalance: string;         // scaled decimal string (scale 4)
  variance: string;          // scaled decimal string (scale 4)
  transactionCount: number;
}

/**
 * Drilldown line item for AR reconciliation variance
 */
export interface ARDrilldownLineItem {
  id: number;
  type: ARDocumentType;
  reference: string;
  date: string;
  openAmount: string;        // scaled decimal string (scale 4)
  glAmount: string;          // scaled decimal string (scale 4)
  variance: string;          // scaled decimal string (scale 4)
  sourceId: number | null;   // invoice_id, payment_id, or credit_note_id
  sourceType: ARDocumentType;
}

/**
 * AR Reconciliation Drilldown Result
 */
export interface ARDrilldownResult {
  asOfDate: string;
  categories: ARDrilldownCategory[];
  lines: ARDrilldownLineItem[];
  totalVariance: string;     // scaled decimal string (scale 4)
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Get AR Reconciliation Drilldown Parameters
 */
export interface GetARReconciliationDrilldownParams {
  companyId: number;
  asOfDate: string;
  documentType?: ARDocumentType;
  cursor?: string;
  limit?: number;
}

/**
 * Get AR Reconciliation Settings Parameters
 */
export interface GetARReconciliationSettingsParams {
  companyId: number;
}

/**
 * Validate AR Reconciliation Account IDs Parameters
 */
export interface ValidateARReconciliationAccountIdsParams {
  companyId: number;
  accountIds: number[];
}

/**
 * Save AR Reconciliation Settings Parameters
 */
export interface SaveARReconciliationSettingsParams {
  companyId: number;
  accountIds: number[];
}

/**
 * AR Reconciliation Error
 */
export class ARReconciliationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ARReconciliationError";
    this.code = code;
  }
}

/**
 * AR Reconciliation Settings Required Error
 */
export class ARReconciliationSettingsRequiredError extends ARReconciliationError {
  constructor() {
    super(
      "AR_RECONCILIATION_SETTINGS_REQUIRED",
      "AR reconciliation settings are required. Configure account_ids via PUT /api/accounting/reports/ar-reconciliation/settings"
    );
  }
}

/**
 * AR Reconciliation Invalid Account Error
 */
export class ARReconciliationInvalidAccountError extends ARReconciliationError {
  constructor(accountId: number, reason: string) {
    super("AR_RECONCILIATION_INVALID_ACCOUNT", `Account ${accountId} is not valid for AR reconciliation: ${reason}`);
  }
}

/**
 * AR Reconciliation Cross-Tenant Account Error
 */
export class ARReconciliationCrossTenantAccountError extends ARReconciliationError {
  constructor(accountId: number) {
    super("AR_RECONCILIATION_CROSS_TENANT_ACCOUNT", `Account ${accountId} does not belong to the current company`);
  }
}

/**
 * AR Reconciliation Timezone Required Error
 */
export class ARReconciliationTimezoneRequiredError extends ARReconciliationError {
  constructor(
    public readonly companyId: number,
    public readonly outletTimezone: string | null,
    public readonly companyTimezone: string | null
  ) {
    super(
      "AR_RECONCILIATION_TIMEZONE_REQUIRED",
      `Company ${companyId} requires a valid timezone for AR reconciliation. Outlet: ${outletTimezone ?? "null"}, Company: ${companyTimezone ?? "null"}`
    );
  }
}