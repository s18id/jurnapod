// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Domain Types
 * 
 * Core types for the sales module covering orders, invoices, payments, and credit notes.
 */

// =============================================================================
// Order Types
// =============================================================================

export type SalesOrderStatus = "DRAFT" | "CONFIRMED" | "COMPLETED" | "VOID";

export type SalesOrder = {
  id: number;
  company_id: number;
  outlet_id: number;
  order_no: string;
  client_ref?: string | null;
  order_date: string;
  expected_date: string | null;
  status: SalesOrderStatus;
  notes: string | null;
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  confirmed_by_user_id: number | null;
  confirmed_at?: string | null;
  completed_by_user_id: number | null;
  completed_at?: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export type SalesOrderLine = {
  id: number;
  order_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type SalesOrderDetail = SalesOrder & {
  lines: SalesOrderLine[];
};

// =============================================================================
// Order Input Types
// =============================================================================

export type OrderLineInput = {
  line_type?: "SERVICE" | "PRODUCT";
  item_id?: number;
  description: string;
  qty: number;
  unit_price: number;
};

export type OrderListFilters = {
  outletIds?: readonly number[];
  status?: SalesOrderStatus;
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

export class SalesConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesConflictError";
  }
}

export class SalesReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesReferenceError";
  }
}
