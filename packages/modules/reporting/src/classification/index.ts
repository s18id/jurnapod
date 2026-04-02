// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Report Classification Module
 * 
 * Provides classification taxonomy for reports including:
 * - Report categories (financial, operational, audit, etc.)
 * - Report type hierarchy
 * - Classification helper functions
 */

import { QueryTimeoutError, ValidationError, AuthError } from "../contracts/index.js";

/**
 * Top-level report classification categories
 */
export type ReportCategory =
  | "financial"     // GL, Trial Balance, P&L, Balance Sheet
  | "operational"   // POS transactions, daily sales, payments
  | "audit"          // Journal batches, audit trails
  | "inventory"      // Stock reports, item movement
  | "receivables";   // AR ageing, invoice status

/**
 * Specific report types within each category
 */
export type FinancialReportType =
  | "trial_balance"
  | "general_ledger"
  | "profit_loss"
  | "worksheet"
  | "balance_sheet";

export type OperationalReportType =
  | "pos_transactions"
  | "daily_sales"
  | "pos_payments"
  | "reservations";

export type AuditReportType =
  | "journals"
  | "audit_trail"
  | "user_activity";

export type InventoryReportType =
  | "stock_movement"
  | "item_summary"
  | "low_stock";

export type ReceivablesReportType =
  | "receivables_ageing"
  | "invoice_status";

/**
 * Union of all specific report types
 */
export type ReportType =
  | FinancialReportType
  | OperationalReportType
  | AuditReportType
  | InventoryReportType
  | ReceivablesReportType
  | "other"; // Catch-all for unmapped report types

/**
 * Report classification metadata
 */
export interface ReportClassification {
  category: ReportCategory;
  type: ReportType;
  label: string;
  description: string;
  /** Whether this report derives data from journals (financial reports) */
  journalSourced: boolean;
}

/**
 * Classification registry for all report types
 */
export const REPORT_CLASSIFICATIONS: Record<ReportType, ReportClassification> = {
  // Financial reports - all journal-sourced
  trial_balance: {
    category: "financial",
    type: "trial_balance",
    label: "Trial Balance",
    description: "List of all account balances with debit/credit columns",
    journalSourced: true,
  },
  general_ledger: {
    category: "financial",
    type: "general_ledger",
    label: "General Ledger",
    description: "Detailed transaction history per account",
    journalSourced: true,
  },
  profit_loss: {
    category: "financial",
    type: "profit_loss",
    label: "Profit & Loss",
    description: "Revenue and expense summary for a period",
    journalSourced: true,
  },
  worksheet: {
    category: "financial",
    type: "worksheet",
    label: "Worksheet",
    description: "8-column worksheet for adjusting entries",
    journalSourced: true,
  },
  balance_sheet: {
    category: "financial",
    type: "balance_sheet",
    label: "Balance Sheet",
    description: "Assets, liabilities, and equity at a point in time",
    journalSourced: true,
  },
  // Operational reports - POS/transactional data
  pos_transactions: {
    category: "operational",
    type: "pos_transactions",
    label: "POS Transactions",
    description: "Point-of-sale transaction details",
    journalSourced: false,
  },
  daily_sales: {
    category: "operational",
    type: "daily_sales",
    label: "Daily Sales Summary",
    description: "Aggregated daily sales by outlet",
    journalSourced: false,
  },
  pos_payments: {
    category: "operational",
    type: "pos_payments",
    label: "POS Payments",
    description: "Payment method breakdown for POS",
    journalSourced: false,
  },
  reservations: {
    category: "operational",
    type: "reservations",
    label: "Reservations",
    description: "Reservation bookings and availability",
    journalSourced: false,
  },
  // Audit reports
  journals: {
    category: "audit",
    type: "journals",
    label: "Journal Batches",
    description: "Journal entry batches and posting details",
    journalSourced: true,
  },
  audit_trail: {
    category: "audit",
    type: "audit_trail",
    label: "Audit Trail",
    description: "System activity and change history",
    journalSourced: false,
  },
  user_activity: {
    category: "audit",
    type: "user_activity",
    label: "User Activity",
    description: "User actions and login history",
    journalSourced: false,
  },
  // Inventory reports
  stock_movement: {
    category: "inventory",
    type: "stock_movement",
    label: "Stock Movement",
    description: "Inventory in/out transactions",
    journalSourced: false,
  },
  item_summary: {
    category: "inventory",
    type: "item_summary",
    label: "Item Summary",
    description: "Current stock levels and values",
    journalSourced: false,
  },
  low_stock: {
    category: "inventory",
    type: "low_stock",
    label: "Low Stock Alerts",
    description: "Items below reorder threshold",
    journalSourced: false,
  },
  // Receivables reports
  receivables_ageing: {
    category: "receivables",
    type: "receivables_ageing",
    label: "Receivables Ageing",
    description: "AR outstanding by age bucket",
    journalSourced: false,
  },
  invoice_status: {
    category: "receivables",
    type: "invoice_status",
    label: "Invoice Status",
    description: "Invoice payment status summary",
    journalSourced: false,
  },
  // Catch-all for unmapped report types
  other: {
    category: "operational",
    type: "other",
    label: "Other Report",
    description: "Report type not explicitly classified",
    journalSourced: false,
  },
};

/**
 * Error classification for report failures
 */
export type ReportErrorClass = "timeout" | "validation" | "system" | "auth";

/**
 * Dataset size buckets based on row count
 */
export type DatasetSizeBucket = "small" | "medium" | "large" | "xlarge";

/**
 * Dataset size thresholds (row count)
 */
export const DATASET_SIZE_THRESHOLDS = {
  small: 100,      // <= 100 rows
  medium: 500,     // 101-500 rows
  large: 2000,     // 501-2000 rows
  xlarge: Infinity // > 2000 rows
} as const;

/**
 * Determine dataset size bucket based on row count
 */
export function getDatasetSizeBucket(rowCount: number): DatasetSizeBucket {
  if (rowCount <= DATASET_SIZE_THRESHOLDS.small) return "small";
  if (rowCount <= DATASET_SIZE_THRESHOLDS.medium) return "medium";
  if (rowCount <= DATASET_SIZE_THRESHOLDS.large) return "large";
  return "xlarge";
}

/**
 * Get classification for a report type
 */
export function getReportClassification(type: ReportType): ReportClassification {
  return REPORT_CLASSIFICATIONS[type];
}

/**
 * Check if a report type is journal-sourced
 */
export function isJournalSourcedReport(type: ReportType): boolean {
  return REPORT_CLASSIFICATIONS[type].journalSourced;
}

/**
 * Get report types by category
 */
export function getReportTypesByCategory(category: ReportCategory): ReportType[] {
  return (Object.keys(REPORT_CLASSIFICATIONS) as ReportType[])
    .filter((key) => REPORT_CLASSIFICATIONS[key].category === category);
}

/**
 * Classify error for report failure
 */
export function classifyReportError(error: unknown): ReportErrorClass {
  if (error instanceof QueryTimeoutError) return "timeout";
  if (error instanceof ValidationError) return "validation";
  if (error instanceof AuthError) return "auth";
  return "system";
}
