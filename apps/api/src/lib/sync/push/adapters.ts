// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Adapters
 *
 * Pure mapping helpers that convert API payloads to pos-sync types.
 * These functions have zero HTTP knowledge - they are plain data transformers.
 */

import type { TransactionPush, ActiveOrderPush } from "@jurnapod/pos-sync";
import type { SyncPushTransactionPayload } from "./types.js";

/**
 * Input type for toActiveOrderPush - lines is optional to handle cases
 * where the field may be missing or undefined in incoming payloads.
 */
type ActiveOrderInput = {
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
  lines?: Array<{
    item_id: number;
    variant_id?: number;
    sku_snapshot?: string | null;
    name_snapshot: string;
    item_type_snapshot: string;
    unit_price_snapshot: number;
    qty: number;
    discount_amount: number;
    updated_at: string;
  }>;
};

/**
 * Convert API SyncPushTransactionPayload to pos-sync TransactionPush type.
 */
export function toTransactionPush(tx: SyncPushTransactionPayload): TransactionPush {
  return {
    client_tx_id: tx.client_tx_id,
    company_id: tx.company_id,
    outlet_id: tx.outlet_id,
    cashier_user_id: tx.cashier_user_id,
    status: tx.status,
    service_type: tx.service_type,
    table_id: tx.table_id,
    reservation_id: tx.reservation_id,
    guest_count: tx.guest_count,
    order_status: tx.order_status,
    opened_at: tx.opened_at,
    closed_at: tx.closed_at,
    notes: tx.notes,
    trx_at: tx.trx_at,
    items: tx.items.map((item) => ({
      item_id: item.item_id,
      variant_id: item.variant_id,
      qty: item.qty,
      price_snapshot: item.price_snapshot,
      name_snapshot: item.name_snapshot
    })),
    payments: tx.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount
    })),
    taxes: tx.taxes?.map((tax) => ({
      tax_rate_id: tax.tax_rate_id,
      amount: tax.amount
    })),
    discount_percent: tx.discount_percent,
    discount_fixed: tx.discount_fixed,
    discount_code: tx.discount_code
  };
}

/**
 * Convert API ActiveOrder to pos-sync ActiveOrderPush type.
 */
export function toActiveOrderPush(order: ActiveOrderInput): ActiveOrderPush {
  return {
    order_id: order.order_id,
    company_id: order.company_id,
    outlet_id: order.outlet_id,
    service_type: order.service_type,
    source_flow: order.source_flow,
    settlement_flow: order.settlement_flow,
    table_id: order.table_id,
    reservation_id: order.reservation_id,
    guest_count: order.guest_count,
    is_finalized: order.is_finalized,
    order_status: order.order_status,
    order_state: order.order_state,
    paid_amount: order.paid_amount,
    opened_at: order.opened_at,
    closed_at: order.closed_at,
    notes: order.notes,
    updated_at: order.updated_at,
    lines: order.lines?.map((line) => ({
      item_id: line.item_id,
      variant_id: line.variant_id,
      sku_snapshot: line.sku_snapshot,
      name_snapshot: line.name_snapshot,
      item_type_snapshot: line.item_type_snapshot,
      unit_price_snapshot: line.unit_price_snapshot,
      qty: line.qty,
      discount_amount: line.discount_amount,
      updated_at: line.updated_at
    })) ?? []
  };
}

/**
 * Build a map of client_tx_id to original transaction payload for Phase 2.
 */
export function buildTxByClientTxIdMap(
  transactions: SyncPushTransactionPayload[]
): Map<string, SyncPushTransactionPayload> {
  const map = new Map<string, SyncPushTransactionPayload>();
  for (const tx of transactions) {
    map.set(tx.client_tx_id, tx);
  }
  return map;
}
