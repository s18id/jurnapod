// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Invoice Types
 * 
 * Extracted from sales.ts (originally lines 20-170, 248-272)
 */

import type { RowDataPacket } from "mysql2";
import type { DocumentType } from "@/lib/numbering";
import type { QueryExecutor as SharedQueryExecutor } from "@/lib/shared/common-utils";

// =============================================================================
// Row Types (Database)
// =============================================================================

type SalesInvoiceRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  client_ref?: string | null;
  invoice_date: string;
  due_date?: Date | string | null;
  status: "DRAFT" | "APPROVED" | "POSTED" | "VOID";
  payment_status: "UNPAID" | "PARTIAL" | "PAID";
  subtotal: string | number;
  tax_amount: string | number;
  grand_total: string | number;
  paid_total: string | number;
  approved_by_user_id?: number | null;
  approved_at?: Date | string | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

type SalesInvoiceLineRow = RowDataPacket & {
  id: number;
  invoice_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
};

type SalesInvoiceTaxRow = RowDataPacket & {
  id: number;
  invoice_id: number;
  tax_rate_id: number;
  amount: string | number;
};

type AccessCheckRow = RowDataPacket & {
  id: number;
};

type IdRow = RowDataPacket & {
  id: number;
};

// =============================================================================
// Input Types
// =============================================================================

type InvoiceLineInput = {
  line_type?: "SERVICE" | "PRODUCT";
  item_id?: number;
  description: string;
  qty: number;
  unit_price: number;
};

type InvoiceTaxInput = {
  tax_rate_id: number;
  amount: number;
};

type PreparedInvoiceLine = {
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

// =============================================================================
// Filter Types
// =============================================================================

type InvoiceListFilters = {
  outletIds?: readonly number[];
  status?: "DRAFT" | "APPROVED" | "POSTED" | "VOID";
  paymentStatus?: "UNPAID" | "PARTIAL" | "PAID";
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  timezone?: string;
};

// =============================================================================
// Exported Types
// =============================================================================

export type SalesInvoice = {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  client_ref?: string | null;
  invoice_date: string;
  due_date?: string | null;
  status: "DRAFT" | "APPROVED" | "POSTED" | "VOID";
  payment_status: "UNPAID" | "PARTIAL" | "PAID";
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  paid_total: number;
  approved_by_user_id?: number | null;
  approved_at?: string | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

export type SalesInvoiceLine = {
  id: number;
  invoice_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type SalesInvoiceTax = {
  id: number;
  invoice_id: number;
  tax_rate_id: number;
  amount: number;
};

export type SalesInvoiceDetail = SalesInvoice & {
  lines: SalesInvoiceLine[];
  taxes: SalesInvoiceTax[];
};

// =============================================================================
// Error Types
// =============================================================================

export class InvoiceStatusError extends Error {}

// =============================================================================
// Internal Types for Service Layer
// =============================================================================

// Re-export QueryExecutor from shared module for consistency
export type QueryExecutor = SharedQueryExecutor;

type MutationActor = {
  userId: number;
};

type ItemLookup = {
  id: number;
  name: string;
  sku: string | null;
  type: string;
  default_price: number | null;
};

// =============================================================================
// Due Term Constants
// =============================================================================

const INVOICE_DUE_TERM_DAYS = {
  NET_0: 0,
  NET_7: 7,
  NET_14: 14,
  NET_15: 15,
  NET_20: 20,
  NET_30: 30,
  NET_45: 45,
  NET_60: 60,
  NET_90: 90
} as const;

type InvoiceDueTerm = keyof typeof INVOICE_DUE_TERM_DAYS;

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type {
  SalesInvoiceRow,
  SalesInvoiceLineRow,
  SalesInvoiceTaxRow,
  AccessCheckRow,
  IdRow,
  InvoiceLineInput,
  InvoiceTaxInput,
  PreparedInvoiceLine,
  InvoiceListFilters,
  MutationActor,
  ItemLookup,
  DocumentType
};

export {
  INVOICE_DUE_TERM_DAYS
};

export type { InvoiceDueTerm };
