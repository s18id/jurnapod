// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Extended types for Kysely that cannot be auto-generated.
 * 
 * These types extend the auto-generated schema types with business logic
 * types that require custom definitions.
 */

import type { DB } from './schema';

/**
 * Account with computed balance information.
 * Used for reporting and account tree building.
 */
export interface AccountWithBalance {
  id: number;
  company_id: number;
  code: string;
  name: string;
  type_name: string;
  normal_balance: 'DEBIT' | 'CREDIT';
  report_group: string | null;
  parent_account_id: number | null;
  is_group: boolean;
  is_active: boolean;
  debit_total: string;
  credit_total: string;
  balance: string;
}

/**
 * Journal entry with computed running balance.
 * Used for general ledger detail reports.
 */
export interface JournalEntryWithBalance {
  id: number;
  company_id: number;
  journal_batch_id: number;
  account_id: number;
  direction: 'DEBIT' | 'CREDIT';
  amount: string;
  description: string | null;
  reference: string | null;
  posted_at: string;
  created_at: string;
  // Computed fields
  running_balance: string;
  account_code: string;
  account_name: string;
}

/**
 * POS transaction with computed totals.
 * Used for sales reports and reconciliation.
 */
export interface PosTransactionWithTotals {
  id: number;
  company_id: number;
  outlet_id: number;
  client_tx_id: string;
  status: 'PENDING' | 'COMPLETED' | 'VOID' | 'REFUND';
  trx_at: string;
  gross_total: string;
  tax_total: string;
  discount_total: string;
  paid_total: string;
  created_at: string;
  updated_at: string;
}

/**
 * Trial balance row with debit/credit columns.
 * Used for trial balance reports.
 */
export interface TrialBalanceRow {
  account_id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  normal_balance: 'DEBIT' | 'CREDIT';
  debit_total: string;
  credit_total: string;
  balance: string;
}

/**
 * Invoice with line items and totals.
 * Used for sales invoice reports.
 */
export interface InvoiceWithLines {
  id: number;
  company_id: number;
  outlet_id: number | null;
  invoice_no: string;
  status: 'DRAFT' | 'APPROVED' | 'POSTED' | 'VOID';
  customer_id: number | null;
  issue_date: string;
  due_date: string | null;
  subtotal: string;
  tax_total: string;
  discount_total: string;
  total: string;
  paid_total: string;
  created_at: string;
  updated_at: string;
  // Line items (populated via JOIN)
  lines?: InvoiceLine[];
}

/**
 * Invoice line item.
 */
export interface InvoiceLine {
  id: number;
  invoice_id: number;
  item_id: number | null;
  description: string;
  qty: string;
  unit_price: string;
  discount_rate: string;
  discount_amount: string;
  tax_rate_id: number | null;
  tax_amount: string;
  amount: string;
  created_at: string;
}

// Re-export base types for convenience
export type { DB };
