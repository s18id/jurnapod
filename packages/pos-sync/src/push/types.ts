// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

/**
 * POS Sync Push Types
 * 
 * Type definitions for the POS sync push layer.
 * These types are adapted from the API push types but use sync-core/data query types.
 */

import type { DbConn } from "@jurnapod/db";
import type {
  SyncIdempotencyMetricsCollector,
  SyncOperationResult
} from "@jurnapod/sync-core";

// ============================================================================
// Result Types
// ============================================================================

export type SyncPushResultCode = "OK" | "DUPLICATE" | "ERROR";

export type SyncPushResultItem = {
  client_tx_id: string;
  result: SyncPushResultCode;
  message?: string;
};

export type OrderUpdateResult = {
  update_id: string;
  result: SyncPushResultCode;
  message?: string;
};

export type ItemCancellationResult = {
  cancellation_id: string;
  result: SyncPushResultCode;
  message?: string;
};

export type VariantSaleResult = {
  client_tx_id: string;
  result: SyncPushResultCode;
  message?: string;
};

export type VariantStockAdjustmentResult = {
  client_tx_id: string;
  result: SyncPushResultCode;
  message?: string;
};

// ============================================================================
// Transaction Payload Types (from POS)
// ============================================================================

export type TransactionPushItem = {
  item_id: number;
  variant_id?: number;
  qty: number;
  price_snapshot: number;
  name_snapshot: string;
};

export type TransactionPushPayment = {
  method: string;
  amount: number;
};

export type TransactionPushTax = {
  tax_rate_id: number;
  amount: number;
};

export type TransactionPush = {
  client_tx_id: string;
  company_id: number;
  outlet_id: number;
  cashier_user_id: number;
  status: "COMPLETED" | "VOID" | "REFUND";
  service_type?: "TAKEAWAY" | "DINE_IN";
  table_id?: number | null;
  reservation_id?: number | null;
  guest_count?: number | null;
  order_status?: "OPEN" | "READY_TO_PAY" | "COMPLETED" | "CANCELLED";
  opened_at?: string;
  closed_at?: string | null;
  notes?: string | null;
  trx_at: string;
  items: TransactionPushItem[];
  payments: TransactionPushPayment[];
  taxes?: TransactionPushTax[];
  discount_percent?: number;
  discount_fixed?: number;
  discount_code?: string | null;
};

// ============================================================================
// Active Order Types (from POS)
// ============================================================================

export type ActiveOrderLine = {
  item_id: number;
  variant_id?: number;
  sku_snapshot?: string | null;
  name_snapshot: string;
  item_type_snapshot: string;
  unit_price_snapshot: number;
  qty: number;
  discount_amount: number;
  updated_at: string;
};

export type ActiveOrderPush = {
  order_id: string;
  company_id: number;
  outlet_id: number;
  service_type: string;
  source_flow?: string;
  settlement_flow?: string;
  table_id?: number | null;
  reservation_id?: number | null;
  guest_count?: number | null;
  is_finalized: boolean;
  order_status: string;
  order_state: string;
  paid_amount: number;
  opened_at: string;
  closed_at?: string | null;
  notes?: string | null;
  updated_at: string;
  lines: ActiveOrderLine[];
};

// ============================================================================
// Order Update Types (from POS)
// ============================================================================

export type OrderUpdatePush = {
  update_id: string;
  order_id: string;
  company_id: number;
  outlet_id: number;
  base_order_updated_at?: string | null;
  event_type: string;
  delta_json: string;
  actor_user_id?: number | null;
  device_id: string;
  event_at: string;
};

// ============================================================================
// Item Cancellation Types (from POS)
// ============================================================================

export type ItemCancellationPush = {
  cancellation_id: string;
  update_id?: string;
  order_id: string;
  item_id: number;
  variant_id?: number;
  company_id: number;
  outlet_id: number;
  cancelled_quantity: number;
  reason: string;
  cancelled_by_user_id?: number | null;
  cancelled_at: string;
};

// ============================================================================
// Variant Sale Types (from POS)
// ============================================================================

export type VariantSalePush = {
  client_tx_id: string;
  company_id: number;
  outlet_id: number;
  variant_id: number;
  item_id: number;
  qty: number;
  unit_price: number;
  total_amount: number;
  trx_at: string;
};

// ============================================================================
// Variant Stock Adjustment Types (from POS)
// ============================================================================

export type VariantStockAdjustmentPush = {
  client_tx_id: string;
  company_id: number;
  outlet_id: number;
  variant_id: number;
  adjustment_type: "INCREASE" | "DECREASE" | "SET";
  quantity: number;
  reason: string;
  reference?: string | null;
  adjusted_at: string;
};

// ============================================================================
// Main Push Sync Params and Result
// ============================================================================

export type PushSyncParams = {
  /** Database connection */
  db: DbConn;
  /** Company ID for tenant isolation */
  companyId: number;
  /** Outlet ID for tenant isolation */
  outletId: number;
  /** Transactions from POS */
  transactions: TransactionPush[];
  /** Active orders from POS */
  activeOrders: ActiveOrderPush[];
  /** Order updates from POS */
  orderUpdates: OrderUpdatePush[];
  /** Item cancellations from POS */
  itemCancellations: ItemCancellationPush[];
  /** Variant sales from POS */
  variantSales: VariantSalePush[];
  /** Variant stock adjustments from POS */
  variantStockAdjustments: VariantStockAdjustmentPush[];
  /** Correlation ID for logging/tracing */
  correlationId?: string;
  /** Optional metrics collector */
  metricsCollector?: SyncIdempotencyMetricsCollector;
};

export type PushSyncResult = {
  /** Transaction results */
  results: SyncPushResultItem[];
  /** Order update results */
  orderUpdateResults: OrderUpdateResult[];
  /** Item cancellation results */
  itemCancellationResults: ItemCancellationResult[];
  /** Variant sale results (if any) */
  variantSaleResults?: VariantSaleResult[];
  /** Variant stock adjustment results (if any) */
  variantStockAdjustmentResults?: VariantStockAdjustmentResult[];
};

// ============================================================================
// Internal Processing Types
// ============================================================================

/**
 * Context for processing a transaction
 */
export type TransactionProcessingContext = {
  db: DbConn;
  tx: TransactionPush;
  companyId: number;
  outletId: number;
  correlationId: string;
  metricsCollector?: SyncIdempotencyMetricsCollector;
};

/**
 * Context for processing orders
 */
export type OrderProcessingContext = {
  db: DbConn;
  companyId: number;
  outletId: number;
  correlationId: string;
};
