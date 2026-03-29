// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { DbConn } from "@jurnapod/db";
import type { RowDataPacket } from "mysql2";

// ============================================================================
// Query Result Types
// ============================================================================

export type StockAdjustmentQueryResult = {
  id: number;
  company_id: number;
  outlet_id: number;
  client_tx_id: string;
  variant_id: number;
  adjustment_type: "INCREASE" | "DECREASE" | "SET";
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: string;
  reference: string | null;
  adjusted_at: Date;
  created_at: Date;
};

export type VariantCurrentStock = {
  variant_id: number;
  quantity: number;
  source: "inventory_stock" | "item_variants";
};

// ============================================================================
// Input Types (for inserts)
// ============================================================================

export type StockAdjustmentInsertInput = {
  id?: number;
  company_id: number;
  outlet_id: number;
  client_tx_id: string;
  variant_id: number;
  adjustment_type: "INCREASE" | "DECREASE" | "SET";
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: string;
  reference?: string | null;
  adjusted_at: string;
};

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Insert a new stock adjustment into variant_stock_adjustments.
 * The unique constraint on (company_id, outlet_id, client_tx_id) ensures idempotency.
 * 
 * Timestamp authority:
 * - adjusted_at: CLIENT-authoritative adjustment timestamp
 * - created_at: SERVER-authoritative (DB default)
 */
export async function insertStockAdjustment(
  db: DbConn,
  adjustment: StockAdjustmentInsertInput
): Promise<number> {
  const result = await db.execute(
    `INSERT INTO variant_stock_adjustments (
       company_id,
       outlet_id,
       client_tx_id,
       variant_id,
       adjustment_type,
       quantity,
       previous_stock,
       new_stock,
       reason,
       reference,
       adjusted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      adjustment.company_id,
      adjustment.outlet_id,
      adjustment.client_tx_id,
      adjustment.variant_id,
      adjustment.adjustment_type,
      adjustment.quantity,
      adjustment.previous_stock,
      adjustment.new_stock,
      adjustment.reason,
      adjustment.reference ?? null,
      adjustment.adjusted_at
    ]
  );

  return Number(result.insertId);
}

/**
 * Check if a stock adjustment exists by company_id + outlet_id + client_tx_id.
 * Used for idempotency checks in sync push.
 * Returns the existing record if found.
 */
export async function checkAdjustmentExists(
  db: DbConn,
  companyId: number,
  outletId: number,
  clientTxId: string
): Promise<StockAdjustmentQueryResult | null> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT id, company_id, outlet_id, client_tx_id, variant_id, adjustment_type,
            quantity, previous_stock, new_stock, reason, reference, adjusted_at, created_at
     FROM variant_stock_adjustments
     WHERE company_id = ? AND outlet_id = ? AND client_tx_id = ?
     LIMIT 1`,
    [companyId, outletId, clientTxId]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    client_tx_id: row.client_tx_id as string,
    variant_id: Number(row.variant_id),
    adjustment_type: row.adjustment_type as "INCREASE" | "DECREASE" | "SET",
    quantity: Number(row.quantity),
    previous_stock: Number(row.previous_stock),
    new_stock: Number(row.new_stock),
    reason: row.reason as string,
    reference: row.reference as string | null,
    adjusted_at: row.adjusted_at as Date,
    created_at: row.created_at as Date
  };
}

/**
 * Get current stock for a variant at a specific outlet.
 * 
 * Stock lookup priority:
 * 1. If inventory_stock record exists for (company_id, outlet_id, variant_id),
 *    use that (per-outlet stock tracking)
 * 2. Otherwise, use item_variants.stock_quantity (variant-level fallback)
 * 
 * Returns the current quantity and the source.
 */
export async function getVariantCurrentStock(
  db: DbConn,
  companyId: number,
  outletId: number,
  variantId: number
): Promise<VariantCurrentStock | null> {
  // First check if there's variant-specific stock in inventory_stock (per-outlet tracking)
  const [stockRows] = await db.queryAll<RowDataPacket>(
    `SELECT quantity 
     FROM inventory_stock 
     WHERE company_id = ? AND outlet_id = ? AND variant_id = ?
     LIMIT 1`,
    [companyId, outletId, variantId]
  );

  if (stockRows.length > 0) {
    return {
      variant_id: variantId,
      quantity: Number(stockRows[0].quantity),
      source: "inventory_stock"
    };
  }

  // Fallback to item_variants.stock_quantity (variant-level stock, no per-outlet tracking)
  const [variantRows] = await db.queryAll<RowDataPacket>(
    `SELECT stock_quantity 
     FROM item_variants
     WHERE id = ? AND company_id = ? AND is_active = 1
     LIMIT 1`,
    [variantId, companyId]
  );

  if (variantRows.length === 0) {
    return null;
  }

  return {
    variant_id: variantId,
    quantity: Number(variantRows[0].stock_quantity),
    source: "item_variants"
  };
}
