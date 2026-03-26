// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Payment Types
 * 
 * All payment-related types extracted from sales.ts
 */

import type { RowDataPacket, PoolConnection } from "mysql2/promise";

// Re-export payment types from sales.ts for backward compatibility
export type { SalesPayment, SalesPaymentSplit } from "@/lib/sales";

// Row types for database queries
export type SalesPaymentSplitRow = RowDataPacket & {
  id: number;
  payment_id: number;
  company_id: number;
  outlet_id: number;
  split_index: number;
  account_id: number;
  account_name?: string;
  amount: string | number;
};

export type SalesPaymentRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  payment_no: string;
  client_ref?: string | null;
  payment_at: string;
  account_id: number;
  account_name?: string;
  method?: "CASH" | "QRIS" | "CARD";
  status: "DRAFT" | "POSTED" | "VOID";
  amount: string | number;
  invoice_amount_idr?: string | number | null;
  payment_amount_idr?: string | number | null;
  payment_delta_idr?: string | number;
  shortfall_settled_as_loss?: number;
  shortfall_reason?: string | null;
  shortfall_settled_by_user_id?: number | null;
  shortfall_settled_at?: Date | string | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

// Filter types
export type PaymentListFilters = {
  outletIds?: readonly number[];
  status?: "DRAFT" | "POSTED" | "VOID";
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  timezone?: string;
};

// Helper types for payment operations
export type QueryExecutor = {
  execute: PoolConnection["execute"];
};

export type MutationActor = {
  userId: number;
};

// Phase 8: Helper to build canonical payment comparison data
export type CanonicalPaymentInput = {
  outlet_id: number;
  invoice_id: number;
  payment_at: string;
  amount_minor: number;
  account_id: number;
  splits: Array<{ account_id: number; amount_minor: number }>;
};

// Re-export error classes from sales.ts for backward compatibility
export {
  PaymentStatusError,
  PaymentAllocationError
} from "@/lib/sales";
