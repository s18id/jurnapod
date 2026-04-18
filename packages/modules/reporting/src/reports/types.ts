// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Report Query Types
 * 
 * Type definitions for report queries and filters.
 * These types are used across all report services.
 * 
 * Base filter types (BaseReportFilter, ScopedReportFilter, etc.) are
 * re-exported from ../contracts/index.ts to maintain consistency.
 */

import type { ReportType } from "../classification/index.js";

// Re-export base filter types from contracts for use in services
export type {
  BaseReportFilter,
  ScopedReportFilter,
  AsOfReportFilter,
  UnassignedOutletFilter,
  PaginationParams,
} from "../contracts/index.js";

// ============================================================================
// Database Row Types
// ============================================================================

/**
 * POS Transaction row from database
 */
export type PosTransactionRow = {
  id: number;
  outlet_id: number;
  client_tx_id: string;
  status: "COMPLETED" | "VOID" | "REFUND";
  service_type: "TAKEAWAY" | "DINE_IN" | null;
  table_id: number | null;
  reservation_id: number | null;
  guest_count: number | null;
  order_status: "OPEN" | "READY_TO_PAY" | "COMPLETED" | "CANCELLED" | null;
  trx_at: string;
  gross_total: number | string | null;
  paid_total: number | string | null;
  item_count: number | null;
};

/**
 * POS Daily Summary row from database
 */
export type PosDailyRow = {
  trx_date: string;
  outlet_id: number;
  outlet_name: string | null;
  tx_count: number;
  gross_total: number | string | null;
  paid_total: number | string | null;
};

/**
 * POS Payment Summary row from database
 */
export type PosPaymentRow = {
  outlet_id: number;
  outlet_name: string | null;
  method: string;
  payment_count: number;
  total_amount: number | string | null;
};

/**
 * Journal Batch row from database
 */
export type JournalBatchRow = {
  id: number;
  outlet_id: number | null;
  outlet_name: string | null;
  doc_type: string;
  doc_id: number;
  posted_at: string;
  total_debit: number | string;
  total_credit: number | string;
  line_count: number;
};

/**
 * Trial Balance row from database
 */
export type TrialBalanceRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  total_debit: number | string;
  total_credit: number | string;
  balance: number | string;
};

/**
 * General Ledger row from database
 */
export type GeneralLedgerRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  report_group: string | null;
  normal_balance: string | null;
  opening_debit: number | string | null;
  opening_credit: number | string | null;
  period_debit: number | string | null;
  period_credit: number | string | null;
};

/**
 * General Ledger Line row from database
 */
export type GeneralLedgerLineRow = {
  line_id: number;
  account_id: number;
  account_code: string;
  account_name: string;
  line_date: string;
  debit: number | string;
  credit: number | string;
  description: string;
  outlet_id: number | null;
  outlet_name: string | null;
  journal_batch_id: number;
  doc_type: string;
  doc_id: number;
  posted_at: string;
};

/**
 * Profit & Loss row from database
 */
export type ProfitLossRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  total_debit: number | string | null;
  total_credit: number | string | null;
};

/**
 * Worksheet row from database
 */
export type WorksheetRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  type_name: string | null;
  report_group: string | null;
  normal_balance: string | null;
  opening_debit: number | string | null;
  opening_credit: number | string | null;
  period_debit: number | string | null;
  period_credit: number | string | null;
};

/**
 * Receivables Ageing row from database
 */
export type ReceivablesAgeingRow = {
  invoice_id: number;
  invoice_no: string;
  outlet_id: number;
  outlet_name: string | null;
  invoice_date: string;
  due_date: string | null;
  outstanding_amount: number | string;
  days_overdue: number | string;
  // Customer fields (LEFT JOIN customers)
  customer_id: number | null;
  customer_code: string | null;
  customer_type: number | null;
  customer_display_name: string | null;
};

// ============================================================================
// Filter Types (extending base types from contracts)
// ============================================================================

import type { BaseReportFilter, ScopedReportFilter } from "../contracts/index.js";

/**
 * POS Transaction filter - extends ScopedReportFilter for userId support
 */
export type PosTransactionFilter = ScopedReportFilter & {
  status?: "COMPLETED" | "VOID" | "REFUND";
  asOf?: string;
  asOfId?: number;
  limit: number;
  offset: number;
};

/**
 * Journal filter
 */
export type JournalFilter = BaseReportFilter & {
  asOf?: string;
  asOfId?: number;
  includeUnassignedOutlet?: boolean;
  limit: number;
  offset: number;
};

/**
 * Trial Balance filter
 */
export type TrialBalanceFilter = BaseReportFilter & {
  asOf?: string;
  includeUnassignedOutlet?: boolean;
};

/**
 * General Ledger filter
 */
export type GeneralLedgerFilter = BaseReportFilter & {
  includeUnassignedOutlet?: boolean;
  accountId?: number;
  lineLimit?: number;
  lineOffset?: number;
};

/**
 * Profit & Loss filter
 */
export type ProfitLossFilter = BaseReportFilter & {
  includeUnassignedOutlet?: boolean;
};

/**
 * Worksheet filter
 */
export type WorksheetFilter = BaseReportFilter & {
  includeUnassignedOutlet?: boolean;
};

/**
 * Receivables Ageing filter
 */
export interface ReceivablesAgeingFilter {
  companyId: number;
  outletIds?: number[];
  asOfDate?: string;
  timezone?: string;
  /** Optional customer ID filter for drill-down endpoint */
  customerId?: number;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * POS Transaction response
 */
export interface PosTransactionResponse {
  id: number;
  outlet_id: number;
  client_tx_id: string;
  status: "COMPLETED" | "VOID" | "REFUND";
  service_type: "TAKEAWAY" | "DINE_IN" | null;
  table_id: number | null;
  reservation_id: number | null;
  guest_count: number | null;
  order_status: "OPEN" | "READY_TO_PAY" | "COMPLETED" | "CANCELLED" | null;
  trx_at: string;
  gross_total: number;
  paid_total: number;
  item_count: number;
}

/**
 * POS Transactions list result
 */
export interface PosTransactionsResult {
  as_of: string;
  as_of_id: number;
  total: number;
  transactions: PosTransactionResponse[];
}

/**
 * Daily sales summary result
 */
export interface DailySalesResult {
  trx_date: string;
  outlet_id: number;
  outlet_name: string | null;
  tx_count: number;
  gross_total: number;
  paid_total: number;
}

/**
 * POS payments summary result
 */
export interface PosPaymentsResult {
  outlet_id: number;
  outlet_name: string | null;
  method: string;
  payment_count: number;
  total_amount: number;
}

/**
 * Journal batch result
 */
export interface JournalBatchResult {
  id: number;
  outlet_id: number | null;
  outlet_name: string | null;
  doc_type: string;
  doc_id: number;
  posted_at: string;
  total_debit: number;
  total_credit: number;
  line_count: number;
}

/**
 * Journals list result
 */
export interface JournalsResult {
  as_of: string;
  as_of_id: number;
  total: number;
  journals: JournalBatchResult[];
}

/**
 * Trial balance result row
 */
export interface TrialBalanceResultRow {
  account_id: number;
  account_code: string;
  account_name: string;
  total_debit: number;
  total_credit: number;
  balance: number;
}

/**
 * General ledger account detail
 */
export interface GeneralLedgerAccountDetail {
  account_id: number;
  account_code: string;
  account_name: string;
  report_group: string | null;
  normal_balance: string | null;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  opening_balance: number;
  ending_balance: number;
  lines: GeneralLedgerLine[];
}

/**
 * General ledger line
 */
export interface GeneralLedgerLine {
  line_id: number;
  line_date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  outlet_id: number | null;
  outlet_name: string | null;
  journal_batch_id: number;
  doc_type: string;
  doc_id: number;
  posted_at: string;
}

/**
 * Profit & Loss result row
 */
export interface ProfitLossResultRow {
  account_id: number;
  account_code: string;
  account_name: string;
  total_debit: number;
  total_credit: number;
  net: number;
}

/**
 * Profit & Loss result
 */
export interface ProfitLossResult {
  rows: ProfitLossResultRow[];
  totals: {
    total_debit: number;
    total_credit: number;
    net: number;
  };
}

/**
 * Worksheet result row
 */
export interface WorksheetResultRow {
  account_id: number;
  account_code: string;
  account_name: string;
  type_name: string | null;
  report_group: string | null;
  normal_balance: string | null;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  ending_balance: number;
  ending_debit: number;
  ending_credit: number;
  total_debit: number;
  total_credit: number;
  balance: number;
  bs_debit: number;
  bs_credit: number;
  pl_debit: number;
  pl_credit: number;
};

/**
 * Receivables Ageing invoice
 */
export interface ReceivablesAgeingInvoice {
  invoice_id: number;
  invoice_no: string;
  outlet_id: number;
  outlet_name: string | null;
  invoice_date: string;
  due_date: string | null;
  days_overdue: number;
  outstanding_amount: number;
  age_bucket: string;
  // Customer fields (AC1)
  customer_id: number | null;
  customer_code: string | null;
  customer_type: number | null;
  customer_display_name: string | null;
  // Overdue flag (AC2)
  overdue: boolean;
}

/**
 * Receivables Ageing buckets
 */
export interface ReceivablesAgeingBuckets {
  current: number;
  "1_30_days": number;
  "31_60_days": number;
  "61_90_days": number;
  over_90_days: number;
}

/**
 * Receivables Ageing result
 */
export interface ReceivablesAgeingResult {
  buckets: ReceivablesAgeingBuckets;
  total_outstanding: number;
  invoices: ReceivablesAgeingInvoice[];
}