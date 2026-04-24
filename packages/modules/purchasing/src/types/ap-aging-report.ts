// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Aging Report types for purchasing module.
 */

export type AgingBucketKey = "current" | "due_1_30" | "due_31_60" | "due_61_90" | "due_over_90";

export interface APAgingBuckets {
  current: string;
  due_1_30: string;
  due_31_60: string;
  due_61_90: string;
  due_over_90: string;
}

export interface APAgingSupplierRow {
  supplier_id: number;
  supplier_name: string;
  currency: string;
  total_open_amount: string;
  base_open_amount: string;
  exchange_rate_note: string;
  buckets: APAgingBuckets;
}

export interface APAgingSummary {
  as_of_date: string;
  suppliers: APAgingSupplierRow[];
  grand_totals: {
    base_open_amount: string;
    buckets: APAgingBuckets;
    currency_totals: Array<{
      currency: string;
      total_open_amount: string;
    }>;
  };
}

export interface APAgingDetailRow {
  purchase_invoice_id: number;
  pi_number: string;
  pi_date: string;
  due_date: string;
  payment_terms_days: number;
  currency: string;
  exchange_rate: string;
  original_amount: string;
  balance: string;
  base_balance: string;
  bucket: AgingBucketKey;
}

export interface APAgingSupplierDetail {
  as_of_date: string;
  supplier_id: number;
  supplier_name: string;
  currency: string;
  invoices: APAgingDetailRow[];
  totals: {
    total_open_amount: string;
    base_open_amount: string;
    buckets: APAgingBuckets;
  };
}

export interface GetAPAgingSummaryParams {
  companyId: number;
  asOfDate: string;
}

export interface GetAPAgingSupplierDetailParams {
  companyId: number;
  supplierId: number;
  asOfDate: string;
}
