// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Goods Receipt types for purchasing module.
 */

import type { KyselySchema } from "@jurnapod/db";
import type { GoodsReceiptCreate } from "@jurnapod/shared";

// =============================================================================
// GR Line
// =============================================================================

export interface GoodsReceiptLineResult {
  id: number;
  line_no: number;
  po_line_id: number | null;
  item_id: number | null;
  description: string | null;
  qty: string;
  unit: string | null;
  over_receipt_allowed: number;
}

// =============================================================================
// GR Response
// =============================================================================

export interface GoodsReceiptResult {
  id: number;
  company_id: number;
  supplier_id: number;
  supplier_name: string | null;
  reference_number: string;
  receipt_date: Date;
  status: number;
  notes: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
  po_reference: string | null;
  lines: GoodsReceiptLineResult[];
}

// =============================================================================
// GR List
// =============================================================================

export interface ListGoodsReceiptsParams {
  companyId: number;
  supplierId?: number;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
}

export interface ListGoodsReceiptsResult {
  receipts: Array<{
    id: number;
    company_id: number;
    supplier_id: number;
    supplier_name: string | null;
    reference_number: string;
    receipt_date: string;
    status: string;
    notes: string | null;
    created_by_user_id: number | null;
    updated_by_user_id: number | null;
    created_at: string;
    updated_at: string;
    po_reference: string | null;
  }>;
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// GR Create
// =============================================================================

export interface CreateGoodsReceiptInput {
  companyId: number;
  userId: number;
  input: GoodsReceiptCreate;
}

export interface CreateGoodsReceiptResult {
  receipt: GoodsReceiptResult;
  warnings: string[];
}

// =============================================================================
// Decimal Helpers (scale 4)
// =============================================================================

/**
 * Parse a decimal string to scaled integer (scale 4).
 * Accepts up to 4 decimal places.
 */
export function toScaled4(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  const [integer, fraction = ""] = trimmed.split(".");
  const frac4 = (fraction + "0000").slice(0, 4);
  return BigInt(integer) * 10000n + BigInt(frac4);
}

/**
 * Convert scaled integer back to decimal string.
 */
export function fromScaled4(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const intPart = abs / 10000n;
  const fracPart = (abs % 10000n).toString().padStart(4, "0");
  return `${sign}${intPart.toString()}.${fracPart}`;
}
