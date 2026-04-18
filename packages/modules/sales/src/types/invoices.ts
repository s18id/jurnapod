// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Invoice Domain Types
 * 
 * Core types for invoice management in the sales module.
 */

// =============================================================================
// Due Term Constants
// =============================================================================

export const INVOICE_DUE_TERM_DAYS = {
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

export type InvoiceDueTerm = keyof typeof INVOICE_DUE_TERM_DAYS;

// =============================================================================
// Invoice Types
// =============================================================================

export type InvoiceStatus = "DRAFT" | "APPROVED" | "POSTED" | "VOID";
export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export type SalesInvoice = {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  client_ref?: string | null;
  invoice_date: string;
  due_date?: string | null;
  status: InvoiceStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  discount_percent?: number | null;
  discount_fixed?: number | null;
  tax_amount: number;
  grand_total: number;
  paid_total: number;
  customer_id?: number | null;
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
// Input Types
// =============================================================================

export type InvoiceLineInput = {
  line_type?: "SERVICE" | "PRODUCT";
  item_id?: number;
  description: string;
  qty: number;
  unit_price: number;
};

export type InvoiceTaxInput = {
  tax_rate_id: number;
  amount: number;
};

export type InvoiceCreateInput = {
  outlet_id: number;
  customer_id?: number | null;
  client_ref?: string;
  invoice_no?: string;
  invoice_date: string;
  due_date?: string;
  due_term?: InvoiceDueTerm;
  tax_amount: number;
  lines: InvoiceLineInput[];
  taxes?: InvoiceTaxInput[];
  discount_percent?: number | null;
  discount_fixed?: number | null;
};

export type PreparedInvoiceLine = {
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

export type InvoiceListFilters = {
  outletIds?: readonly number[];
  status?: InvoiceStatus;
  paymentStatus?: PaymentStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  timezone?: string;
};

// =============================================================================
// Actor Type
// =============================================================================

export type MutationActor = {
  userId: number;
};

// =============================================================================
// Item Lookup (for product line validation)
// =============================================================================

export type ItemLookup = {
  id: number;
  name: string;
  sku: string | null;
  type: string;
  default_price: number | null;
};

// =============================================================================
// Error Types
// =============================================================================

export class InvoiceStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceStatusError";
  }
}

/**
 * Error thrown when total header discounts exceed invoice subtotal.
 * Routes should map this to HTTP 400 INVALID_REQUEST.
 */
export class DiscountExceedsSubtotalError extends Error {
  constructor() {
    super("Total discount cannot exceed subtotal");
    this.name = "DiscountExceedsSubtotalError";
  }
}
