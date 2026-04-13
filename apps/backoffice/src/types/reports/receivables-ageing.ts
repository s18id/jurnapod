// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Types for Receivables Ageing Report
 */

// ============================================================================
// Bucket Types
// ============================================================================

export interface ReceivablesAgeingBucket {
  current: number;
  bucket_1_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
}

// Legacy key names from API response (snake_case)
export interface ReceivablesAgeingBucketLegacy {
  current: number;
  "1_30_days": number;
  "31_60_days": number;
  "61_90_days": number;
  over_90_days: number;
}

// ============================================================================
// Customer Row Types
// ============================================================================

export interface ReceivablesAgeingCustomer extends ReceivablesAgeingBucket {
  customer_id: number;
  customer_name: string;
  customer_code: string;
  total_outstanding: number;
}

// Legacy API invoice row type
export interface ReceivablesAgeingInvoice {
  invoice_id: number;
  invoice_no: string;
  customer_id: number;
  customer_name: string | null;
  customer_code: string | null;
  outlet_id: number;
  outlet_name: string | null;
  invoice_date: string;
  due_date: string | null;
  outstanding_amount: number;
  days_overdue: number;
  age_bucket: "current" | "1_30_days" | "31_60_days" | "61_90_days" | "over_90_days";
}

// ============================================================================
// Summary Types
// ============================================================================

export interface ReceivablesAgeingSummary extends ReceivablesAgeingBucket {
  total_outstanding: number;
  overdue_total: number;
  overdue_percentage: number;
}

// Legacy bucket structure from the report service
export interface ReceivablesAgeingBuckets {
  current: number;
  "1_30_days": number;
  "31_60_days": number;
  "61_90_days": number;
  over_90_days: number;
}

// ============================================================================
// Report Response Types
// ============================================================================

export interface ReceivablesAgeingReport {
  filters: {
    outlet_ids: number[];
    as_of_date: string;
  };
  buckets: ReceivablesAgeingBuckets;
  total_outstanding: number;
  overdue_total: number;
  overdue_percentage: number;
  invoices: ReceivablesAgeingInvoice[];
}

export interface ReceivablesAgeingResponse {
  success: true;
  data: ReceivablesAgeingReport;
}

// ============================================================================
// Customer Aggregation Types (derived from invoices)
// ============================================================================

export interface AggregatedCustomer {
  customer_id: number;
  customer_name: string;
  customer_code: string;
  current: number;
  bucket_1_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
  total_outstanding: number;
}

// ============================================================================
// Filter Types
// ============================================================================

export interface ReceivablesAgeingFilters {
  asOfDate: string;
  outletId: number | null;
  customerId: number | null;
}

export const DEFAULT_FILTERS: ReceivablesAgeingFilters = {
  asOfDate: new Date().toISOString().slice(0, 10),
  outletId: null,
  customerId: null,
};

// ============================================================================
// Sorting Types
// ============================================================================

export type ReceivablesAgeingSortColumn =
  | "customer_name"
  | "current"
  | "bucket_1_30"
  | "bucket_31_60"
  | "bucket_61_90"
  | "bucket_90_plus"
  | "total_outstanding";

export type SortDirection = "asc" | "desc";

export interface SortConfig {
  column: ReceivablesAgeingSortColumn;
  direction: SortDirection;
}