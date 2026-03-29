// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { DbConn } from "@jurnapod/db";
import type { RowDataPacket } from "mysql2";

// ============================================================================
// Query Result Types
// ============================================================================

export type VariantSaleQueryResult = {
  id: number;
  company_id: number;
  outlet_id: number;
  variant_id: number;
  quantity: number;
  unit_price: string;
  total_price: string;
  occurred_at: Date;
  created_at: Date;
};

// ============================================================================
// Input Types (for inserts)
// ============================================================================

export type VariantSaleInsertInput = {
  id?: number;
  company_id: number;
  outlet_id: number;
  variant_id: number;
  item_id?: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  occurred_at: string;
};

export type VariantSaleCheckItem = {
  variant_id: number;
  occurred_at: string;
};

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Insert a new variant sale into variant_sales.
 * The unique constraint on (company_id, outlet_id, variant_id, occurred_at)
 * ensures idempotency - duplicate inserts will be rejected.
 * 
 * Timestamp authority:
 * - occurred_at: CLIENT-authoritative transaction timestamp
 * - created_at: SERVER-authoritative (DB default)
 */
export async function insertVariantSale(
  db: DbConn,
  sale: VariantSaleInsertInput
): Promise<number> {
  const result = await db.execute(
    `INSERT INTO variant_sales (
       company_id,
       outlet_id,
       variant_id,
       item_id,
       quantity,
       unit_price,
       total_price,
       occurred_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sale.company_id,
      sale.outlet_id,
      sale.variant_id,
      sale.item_id ?? null,
      sale.quantity,
      sale.unit_price,
      sale.total_price,
      sale.occurred_at
    ]
  );

  return Number(result.insertId);
}

/**
 * Check if a variant sale exists by company_id + outlet_id + variant_id + occurred_at.
 * Used for idempotency checks in sync push.
 * Returns the existing record if found.
 */
export async function checkVariantSaleExists(
  db: DbConn,
  companyId: number,
  outletId: number,
  variantId: number,
  occurredAt: string
): Promise<VariantSaleQueryResult | null> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT id, company_id, outlet_id, variant_id, quantity, unit_price, total_price, occurred_at, created_at
     FROM variant_sales
     WHERE company_id = ? AND outlet_id = ? AND variant_id = ? AND occurred_at = ?
     LIMIT 1`,
    [companyId, outletId, variantId, occurredAt]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    variant_id: Number(row.variant_id),
    quantity: Number(row.quantity),
    unit_price: row.unit_price,
    total_price: row.total_price,
    occurred_at: row.occurred_at,
    created_at: row.created_at
  };
}

/**
 * Batch check which variant sales exist by company_id + outlet_id + variant_id + occurred_at.
 * Used for idempotency checks when processing multiple variant sales.
 * Returns an array of existing records.
 */
export async function batchCheckVariantSalesExist(
  db: DbConn,
  companyId: number,
  outletId: number,
  items: VariantSaleCheckItem[]
): Promise<VariantSaleQueryResult[]> {
  if (items.length === 0) {
    return [];
  }

  // Build batch query with multiple (variant_id, occurred_at) pairs
  const conditions: string[] = [];
  const params: (number | string)[] = [];

  for (const item of items) {
    conditions.push("(variant_id = ? AND occurred_at = ?)");
    params.push(item.variant_id, item.occurred_at);
  }

  const whereClause = conditions.join(" OR ");

  const rows = await db.queryAll<RowDataPacket>(
    `SELECT id, company_id, outlet_id, variant_id, quantity, unit_price, total_price, occurred_at, created_at
     FROM variant_sales
     WHERE company_id = ? AND outlet_id = ? AND (${whereClause})`,
    [companyId, outletId, ...params]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    variant_id: Number(row.variant_id),
    quantity: Number(row.quantity),
    unit_price: row.unit_price,
    total_price: row.total_price,
    occurred_at: row.occurred_at,
    created_at: row.created_at
  }));
}

/**
 * Deduct stock for a variant sale.
 * 
 * Stock deduction priority:
 * 1. If inventory_stock record exists for (company_id, outlet_id, variant_id),
 *    deduct from there (per-outlet stock tracking)
 * 2. Otherwise, deduct from item_variants.stock_quantity (fallback to variant-level stock)
 * 
 * Returns the new stock level after deduction.
 * 
 * NOTE: This function does NOT handle the case where inventory_stock exists but
 * item_variants.stock_quantity needs to be synced. The caller should handle that
 * if needed (as shown in the original API implementation).
 */
export async function deductVariantStock(
  db: DbConn,
  companyId: number,
  outletId: number,
  variantId: number,
  quantity: number
): Promise<{ success: boolean; newStock: number; message?: string }> {
  // First check if there's variant-specific stock in inventory_stock (per-outlet tracking)
  const [stockRows] = await db.queryAll<RowDataPacket>(
    `SELECT quantity, available_quantity 
     FROM inventory_stock 
     WHERE company_id = ? AND variant_id = ? AND outlet_id = ?
     LIMIT 1`,
    [companyId, variantId, outletId]
  );

  if (stockRows.length > 0) {
    const currentQty = Number(stockRows[0].quantity);
    const currentAvailable = Number(stockRows[0].available_quantity);
    const newQty = currentQty - quantity;
    const newAvailable = currentAvailable - quantity;

    if (newQty < 0) {
      return {
        success: false,
        newStock: currentQty,
        message: `Insufficient stock for variant ${variantId}: ${currentQty} < ${quantity}`
      };
    }

    // Update inventory_stock
    await db.execute(
      `UPDATE inventory_stock 
       SET quantity = ?, available_quantity = ?, updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ? AND variant_id = ? AND outlet_id = ?`,
      [newQty, newAvailable, companyId, variantId, outletId]
    );

    // Also update item_variants.stock_quantity as source of truth
    await db.execute(
      `UPDATE item_variants SET stock_quantity = ? WHERE id = ? AND company_id = ?`,
      [newQty, variantId, companyId]
    );

    return { success: true, newStock: newQty };
  }

  // Fallback to item_variants.stock_quantity (variant-level stock, no per-outlet tracking)
  const [variantRows] = await db.queryAll<RowDataPacket>(
    `SELECT stock_quantity FROM item_variants
     WHERE id = ? AND company_id = ? AND is_active = TRUE
     LIMIT 1`,
    [variantId, companyId]
  );

  if (variantRows.length === 0) {
    return {
      success: false,
      newStock: 0,
      message: `Variant ${variantId} not found or inactive`
    };
  }

  const currentStock = Number(variantRows[0].stock_quantity);
  const newStock = currentStock - quantity;

  if (newStock < 0) {
    return {
      success: false,
      newStock: currentStock,
      message: `Insufficient stock for variant ${variantId}: ${currentStock} < ${quantity}`
    };
  }

  await db.execute(
    `UPDATE item_variants
     SET stock_quantity = ?
     WHERE id = ? AND company_id = ?`,
    [newStock, variantId, companyId]
  );

  // Create inventory_stock record for future tracking (per-outlet)
  await db.execute(
    `INSERT INTO inventory_stock (company_id, outlet_id, product_id, variant_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
     SELECT company_id, ?, item_id, id, stock_quantity, 0, stock_quantity, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     FROM item_variants WHERE id = ? AND company_id = ?
     ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), available_quantity = VALUES(available_quantity)`,
    [outletId, variantId, companyId]
  );

  return { success: true, newStock };
}
