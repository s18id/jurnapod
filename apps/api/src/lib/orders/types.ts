// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Order Types
 * 
 * Extracted from sales.ts (originally lines 2317-2530)
 */

import type { RowDataPacket } from "mysql2";
import type { DocumentType } from "@/lib/numbering";
import type { QueryExecutor as SharedQueryExecutor } from "@/lib/shared/common-utils";

// =============================================================================
// Order Status
// =============================================================================

export type SalesOrderStatus = "DRAFT" | "CONFIRMED" | "COMPLETED" | "VOID";

// =============================================================================
// Row Types (Database)
// =============================================================================

export type SalesOrderRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  order_no: string;
  client_ref?: string | null;
  order_date: string;
  expected_date: string | null;
  status: SalesOrderStatus;
  notes: string | null;
  subtotal: string | number;
  tax_amount: string | number;
  grand_total: string | number;
  confirmed_by_user_id: number | null;
  confirmed_at: string | null;
  completed_by_user_id: number | null;
  completed_at: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export type SalesOrderLineRow = RowDataPacket & {
  id: number;
  order_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
};

// =============================================================================
// Exported Types
// =============================================================================

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
  confirmed_by_user_id?: number | null;
  confirmed_at?: string | null;
  completed_by_user_id?: number | null;
  completed_at?: string | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
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
// Input Types
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
// Internal Types for Service Layer
// =============================================================================

// Re-export QueryExecutor from shared module for consistency
export type QueryExecutor = SharedQueryExecutor;

export type MutationActor = {
  userId: number;
};

export type ItemLookup = {
  id: number;
  name: string;
  sku: string | null;
  type: string;
  default_price: number | null;
};

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type { DocumentType };
// Re-export QueryExecutor is done via the direct export above
