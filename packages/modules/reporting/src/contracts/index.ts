// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Report Contracts Module
 * 
 * Provides type definitions for report requests and responses.
 * 
 * JOURNAL SOURCE-OF-TRUTH ASSUMPTION:
 * ====================================
 * Financial reports (trial_balance, general_ledger, profit_loss, worksheet, balance_sheet, journals)
 * derive their data from journal_batches and journal_lines tables.
 * 
 * These reports MUST:
 * - Query journal_lines for all financial transactions
 * - Use COALESCE(a.report_group, at.report_group) for account classification
 * - Apply outlet_id scoping consistently (include NULL for cross-outlet entries)
 * - Filter by fiscal year boundaries when applicable
 * 
 * Non-journal-sourced reports (operational, inventory, receivables) query their respective
 * source tables (pos_transactions, inventory_movements, sales_invoices) directly.
 * 
 * IMPORTANT: No report should introduce parallel financial truth outside the journal model.
 * If a new report requires financial data, it must derive from journals or provide
 * a clear reconciliation strategy documented in an ADR.
 */

import type { ReportType } from "../classification/index.js";

/**
 * Base filter parameters for date-range reports
 */
export interface BaseReportFilter {
  companyId: number;
  outletIds: readonly number[];
  dateFrom: string;
  dateTo: string;
  timezone?: string;
}

/**
 * Extended filter with user scoping
 */
export interface ScopedReportFilter extends BaseReportFilter {
  userId?: number;
}

/**
 * Filter for reports that support as-of point-in-time queries
 */
export interface AsOfReportFilter extends BaseReportFilter {
  asOf?: string;
  asOfId?: number;
}

/**
 * Filter for reports that support outlet unassigned inclusion
 */
export interface UnassignedOutletFilter extends BaseReportFilter {
  includeUnassignedOutlet?: boolean;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  limit: number;
  offset: number;
}

/**
 * Report telemetry data
 */
export interface ReportTelemetryData {
  reportType: ReportType;
  companyId: number;
  datasetSizeBucket: "small" | "medium" | "large" | "xlarge";
  errorClass?: "timeout" | "validation" | "system" | "auth";
  latencyMs: number;
  rowCount?: number;
  retryCount?: number;
}

/**
 * Report SLO latency target (5 seconds in ms)
 */
export const REPORT_SLO_LATENCY_MS = 5000;

/**
 * Query timeout default (30 seconds in ms)
 */
export const QUERY_TIMEOUT_MS = 30000;

/**
 * Report execution result with telemetry
 */
export interface ReportResult<T> {
  data: T;
  telemetry: {
    latencyMs: number;
    rowCount?: number;
    sloOk: boolean;
  };
}

/**
 * Error types for report operations
 */

/**
 * Custom error for query timeout
 */
export class QueryTimeoutError extends Error {
  readonly name = "QueryTimeoutError";
  constructor(message = "Query execution exceeded timeout threshold") {
    super(message);
  }
}

/**
 * Custom error for validation failures
 */
export class ValidationError extends Error {
  readonly name = "ValidationError";
  constructor(message: string) {
    super(message);
  }
}

/**
 * Custom error for auth failures
 */
export class AuthError extends Error {
  readonly name = "AuthError";
  constructor(message = "Authentication required") {
    super(message);
  }
}

/**
 * Custom error for report generation failures
 */
export class ReportGenerationError extends Error {
  readonly name = "ReportGenerationError";
  constructor(message: string, public readonly reportType: ReportType) {
    super(message);
  }
}
