// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchase Order types for purchasing module.
 */

import type { KyselySchema } from "@jurnapod/db";
import { PURCHASE_ORDER_STATUS } from "@jurnapod/shared";

// Re-export the shared constants for convenience
export { PURCHASE_ORDER_STATUS } from "@jurnapod/shared";

// =============================================================================
// PO Line
// =============================================================================

export interface POLineRow {
  id: number;
  line_no: number;
  item_id: number | null;
  description: string | null;
  qty: string;
  unit_price: string;
  tax_rate: string;
  received_qty: string;
  line_total: string;
}

export interface POLine {
  id: number;
  line_no: number;
  item_id: number | null;
  description: string | null;
  qty: string;
  unit_price: string;
  tax_rate: string;
  received_qty: string;
  line_total: string;
}

// =============================================================================
// PO Status Transitions
// =============================================================================

/**
 * Valid PO status transitions.
 * DRAFT -> SENT, CLOSED
 * SENT -> PARTIAL_RECEIVED, RECEIVED, CLOSED
 * PARTIAL_RECEIVED -> RECEIVED, CLOSED
 * RECEIVED -> CLOSED
 * CLOSED -> (none)
 */
export const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SENT", "CLOSED"],
  SENT: ["PARTIAL_RECEIVED", "RECEIVED", "CLOSED"],
  PARTIAL_RECEIVED: ["RECEIVED", "CLOSED"],
  RECEIVED: ["CLOSED"],
  CLOSED: [],
};

// =============================================================================
// PO Row (database)
// =============================================================================

export interface PORow {
  id: number;
  company_id: number;
  supplier_id: number;
  order_no: string;
  order_date: Date;
  status: number;
  currency_code: string;
  total_amount: string;
  expected_date: Date | null;
  notes: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// PO Response (API)
// =============================================================================

export interface POResponse {
  id: number;
  company_id: number;
  supplier_id: number;
  order_no: string;
  order_date: string;
  status: number;
  currency_code: string;
  total_amount: string;
  expected_date: string | null | undefined;
  notes: string | null | undefined;
  created_by_user_id: number;
  updated_by_user_id: number | null | undefined;
  created_at: string;
  updated_at: string;
  lines: POLine[];
}

// =============================================================================
// PO List
// =============================================================================

export interface OrderListFilters {
  supplierId?: number;
  status?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface ListPurchaseOrdersParams {
  companyId: number;
  filters: OrderListFilters;
  limit: number;
  offset: number;
}

export interface ListPurchaseOrdersResult {
  orders: Array<{
    id: number;
    company_id: number;
    supplier_id: number;
    supplier_name: string | null;
    order_no: string;
    order_date: string;
    status: number;
    currency_code: string;
    total_amount: string;
    expected_date: string | null | undefined;
    notes: string | null | undefined;
    created_by_user_id: number;
    updated_by_user_id: number | null | undefined;
    created_at: string;
    updated_at: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// PO Create
// =============================================================================

export interface CreatePOLineInput {
  item_id?: number;
  description?: string;
  qty: string;
  unit_price: string;
  tax_rate?: string;
}

export interface CreatePurchaseOrderInput {
  companyId: number;
  userId: number;
  idempotencyKey?: string | null;
  supplierId: number;
  orderDate: Date;
  expectedDate?: Date;
  notes?: string;
  currencyCode?: string;
  lines: CreatePOLineInput[];
}

export interface CreatePurchaseOrderResult {
  receipt: POResponse;
}

// =============================================================================
// PO Update
// =============================================================================

export interface UpdatePOLineInput {
  item_id?: number;
  description?: string;
  qty: string;
  unit_price: string;
  tax_rate?: string;
}

export interface UpdatePurchaseOrderInput {
  companyId: number;
  userId: number;
  orderId: number;
  notes?: string;
  expectedDate?: Date;
  lines?: UpdatePOLineInput[];
}

export interface UpdatePurchaseOrderResult {
  receipt: POResponse;
}

// =============================================================================
// PO Status Transition
// =============================================================================

export interface TransitionPurchaseOrderStatusInput {
  companyId: number;
  userId: number;
  orderId: number;
  newStatus: number;
}

export interface TransitionPurchaseOrderStatusResult {
  receipt: POResponse;
}

// =============================================================================
// Decimal Helpers (scale 4)
// =============================================================================

// Internal helpers (exported for service use)
export function toScaled4(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  const [integer, fraction = ""] = trimmed.split(".");
  const frac4 = (fraction + "0000").slice(0, 4);
  return BigInt(integer) * 10000n + BigInt(frac4);
}

function fromScaled4(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const intPart = abs / 10000n;
  const fracPart = (abs % 10000n).toString().padStart(4, "0");
  return `${sign}${intPart.toString()}.${fracPart}`;
}

/**
 * Compute line total: qty * unit_price * (1 + tax_rate).
 * All inputs are decimal strings; result is a decimal string with scale 4.
 */
export function computeLineTotal(qty: string, unitPrice: string, taxRate: string): string {
  const q = toScaled4(qty);
  const u = toScaled4(unitPrice);
  const t = toScaled4(taxRate || "0");

  const denominator = 100000000n;
  const numerator = q * u * (10000n + t);
  const scaled = (numerator + denominator / 2n) / denominator;
  return fromScaled4(scaled);
}

/**
 * Compute total amount from line totals.
 */
export function computeTotalAmount(lines: Array<{ line_total: string }>): string {
  let total = 0n;
  for (const line of lines) {
    total += toScaled4(line.line_total);
  }
  return fromScaled4(total);
}

// =============================================================================
// ISO Date Helper
// =============================================================================

export function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

// =============================================================================
// Format helpers
// =============================================================================

function formatDecimal(value: unknown): string {
  if (value === null || value === undefined) return "0";
  return String(value);
}

function formatOrderRow(order: {
  id: number;
  company_id: number;
  supplier_id: number;
  order_no: string;
  order_date: Date | string;
  status: number;
  currency_code: string;
  total_amount: string;
  expected_date: Date | string | null | undefined;
  notes: string | null | undefined;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: Date | string;
  updated_at: Date | string;
  lines?: POLine[];
}): POResponse {
  return {
    id: order.id,
    company_id: order.company_id,
    supplier_id: order.supplier_id,
    order_no: order.order_no,
    order_date: toIso(order.order_date) ?? "",
    status: order.status,
    currency_code: order.currency_code,
    total_amount: String(order.total_amount),
    expected_date: order.expected_date ? toIso(order.expected_date) ?? undefined : undefined,
    notes: order.notes ?? undefined,
    created_by_user_id: order.created_by_user_id ?? 0,
    updated_by_user_id: order.updated_by_user_id ?? undefined,
    created_at: toIso(order.created_at) ?? "",
    updated_at: toIso(order.updated_at) ?? "",
    lines: (order.lines ?? []).map((l) => ({
      id: l.id,
      line_no: l.line_no,
      item_id: l.item_id,
      description: l.description,
      qty: String(l.qty),
      unit_price: String(l.unit_price),
      tax_rate: String(l.tax_rate),
      received_qty: String(l.received_qty),
      line_total: String(l.line_total),
    })),
  };
}

export { formatDecimal, formatOrderRow };
