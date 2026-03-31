// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Variant Stock Operations
 * 
 * Stock management functions for product variants.
 * Each variant can have independent stock levels tracked in inventory_stock table.
 */

import { sql } from "kysely";
import { getDb } from "../db";

/**
 * Check stock availability for variants
 */
export interface VariantStockCheckResult {
  variant_id: number;
  available: boolean;
  requested_quantity: number;
  available_quantity: number;
}

interface VariantRow {
  stock_quantity: number;
  item_id: number;
}

interface StockRow {
  available_quantity: number;
}

interface ColumnCheckRow {
  COLUMN_NAME: string;
}

/**
 * Get available stock for a variant at an outlet
 */
export async function checkVariantStockAvailability(
  companyId: number,
  outletId: number,
  variantId: number,
  requestedQuantity: number
): Promise<VariantStockCheckResult> {
  const db = getDb();

  // First check item_variants table (which has stock_quantity)
  const variantResult = await sql`SELECT stock_quantity 
     FROM item_variants 
     WHERE id = ${variantId} AND company_id = ${companyId} AND is_active = TRUE`.execute(db);

  if (variantResult.rows.length === 0) {
    return {
      variant_id: variantId,
      available: false,
      requested_quantity: requestedQuantity,
      available_quantity: 0
    };
  }

  const variantRow = variantResult.rows[0] as VariantRow;

  // Check if variant_id column exists in inventory_stock
  let hasVariantIdColumn = false;
  try {
    const colsResult = await sql`SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_stock' AND COLUMN_NAME = 'variant_id'`.execute(db);
    hasVariantIdColumn = colsResult.rows.length > 0;
  } catch {
    // Ignore - column doesn't exist
  }

  // Check inventory_stock for variant-specific stock (if exists)
  let availableQuantity: number;
  if (hasVariantIdColumn) {
    const stockResult = await sql`SELECT available_quantity 
     FROM inventory_stock 
     WHERE company_id = ${companyId} 
       AND outlet_id = ${outletId} 
       AND variant_id = ${variantId}
     LIMIT 1`.execute(db);
    // Use variant stock if exists, otherwise fallback to item_variants.stock_quantity
    availableQuantity = stockResult.rows.length > 0
      ? Number((stockResult.rows[0] as StockRow).available_quantity)
      : Number(variantRow.stock_quantity);
  } else {
    // No variant_id column - just use item_variants.stock_quantity
    availableQuantity = Number(variantRow.stock_quantity);
  }

  return {
    variant_id: variantId,
    available: availableQuantity >= requestedQuantity,
    requested_quantity: requestedQuantity,
    available_quantity: availableQuantity
  };
}

/**
 * Check stock for multiple variant items
 */
export async function checkVariantStockBatch(
  companyId: number,
  outletId: number,
  items: Array<{ variant_id: number; quantity: number }>
): Promise<VariantStockCheckResult[]> {
  const results: VariantStockCheckResult[] = [];

  for (const item of items) {
    const result = await checkVariantStockAvailability(
      companyId,
      outletId,
      item.variant_id,
      item.quantity
    );
    results.push(result);
  }

  return results;
}

/**
 * Reserve stock for variant items (called during cart/reservation)
 */
export interface VariantStockReservationResult {
  success: boolean;
  conflicts?: Array<{
    variant_id: number;
    requested: number;
    available: number;
  }>;
}

export async function reserveVariantStock(
  companyId: number,
  outletId: number,
  items: Array<{ variant_id: number; quantity: number }>,
  referenceId: string
): Promise<VariantStockReservationResult> {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    const conflicts: Array<{ variant_id: number; requested: number; available: number }> = [];

    // For each item, atomically check availability and reserve in a single locked operation
    for (const item of items) {
      // First, get the variant info (needed for product_id later and for fallback stock)
      const variantResult = await sql`SELECT item_id, stock_quantity FROM item_variants 
       WHERE id = ${item.variant_id} AND company_id = ${companyId} AND is_active = TRUE`.execute(trx);

      if (variantResult.rows.length === 0) {
        return {
          success: false,
          conflicts: [{ variant_id: item.variant_id, requested: item.quantity, available: 0 }]
        };
      }

      const variantRow = variantResult.rows[0] as VariantRow;
      const itemId = Number(variantRow.item_id);
      const baseStock = Number(variantRow.stock_quantity);

      // Try to update existing inventory_stock row with row lock
      const updateResult = await sql`UPDATE inventory_stock 
       SET reserved_quantity = reserved_quantity + ${item.quantity},
           available_quantity = available_quantity - ${item.quantity},
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ${companyId}
         AND outlet_id = ${outletId}
         AND variant_id = ${item.variant_id}
         AND available_quantity >= ${item.quantity}`.execute(trx);

      if (!updateResult.numAffectedRows || updateResult.numAffectedRows === BigInt(0)) {
        // No existing inventory_stock row or insufficient available
        // Need to handle the case where row doesn't exist yet
        // Lock the item_variants row to serialize concurrent first-time reservations
        const lockedVariantResult = await sql`SELECT item_id, stock_quantity FROM item_variants 
         WHERE id = ${item.variant_id} AND company_id = ${companyId} AND is_active = TRUE
         FOR UPDATE`.execute(trx);

        // Re-check inventory_stock after acquiring lock
        const stockResult = await sql`SELECT available_quantity 
         FROM inventory_stock 
         WHERE company_id = ${companyId}
           AND outlet_id = ${outletId}
           AND variant_id = ${item.variant_id}
         LIMIT 1
         FOR UPDATE`.execute(trx);

        if (stockResult.rows.length > 0) {
          // Another transaction created the row after we released our lock
          // Re-attempt the reservation
          const currentAvailable = Number((stockResult.rows[0] as StockRow).available_quantity);
          if (currentAvailable < item.quantity) {
            conflicts.push({
              variant_id: item.variant_id,
              requested: item.quantity,
              available: currentAvailable
            });
            continue;
          }

          const retryResult = await sql`UPDATE inventory_stock 
           SET reserved_quantity = reserved_quantity + ${item.quantity},
               available_quantity = available_quantity - ${item.quantity},
               updated_at = CURRENT_TIMESTAMP
           WHERE company_id = ${companyId}
             AND outlet_id = ${outletId}
             AND variant_id = ${item.variant_id}`.execute(trx);

          if (!retryResult.numAffectedRows || retryResult.numAffectedRows === BigInt(0)) {
            conflicts.push({
              variant_id: item.variant_id,
              requested: item.quantity,
              available: currentAvailable
            });
            continue;
          }
        } else {
          // Still no row - create it with the reservation
          // Use INSERT ... ON DUPLICATE KEY to handle race with another inserter
          const newAvailable = baseStock - item.quantity;
          if (newAvailable < 0) {
            conflicts.push({
              variant_id: item.variant_id,
              requested: item.quantity,
              available: baseStock
            });
            continue;
          }

          // This INSERT either creates a new row OR updates an existing one
          // The ON DUPLICATE KEY path should not happen since we just checked
          await sql`INSERT INTO inventory_stock (
            company_id, outlet_id, product_id, variant_id,
            quantity, reserved_quantity, available_quantity,
            created_at, updated_at
          ) VALUES (${companyId}, ${outletId}, ${itemId}, ${item.variant_id}, ${baseStock}, ${item.quantity}, ${newAvailable}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON DUPLICATE KEY UPDATE
            quantity = VALUES(quantity),
            reserved_quantity = VALUES(reserved_quantity),
            available_quantity = VALUES(available_quantity),
            updated_at = CURRENT_TIMESTAMP`.execute(trx);
        }
      }

      // Record reservation in transactions
      await sql`INSERT INTO inventory_transactions (
        company_id, outlet_id, product_id, transaction_type,
        reference_type, reference_id, variant_id,
        quantity_delta, created_at
      ) VALUES (${companyId}, ${outletId}, ${itemId}, 3, 'RESERVATION', ${referenceId}, ${item.variant_id}, ${item.quantity}, CURRENT_TIMESTAMP)`.execute(trx);
    }

    if (conflicts.length > 0) {
      return { success: false, conflicts };
    }

    return { success: true };
  });
}

/**
 * Release reserved variant stock (when cart is cleared/expired)
 */
export async function releaseVariantStock(
  companyId: number,
  outletId: number,
  items: Array<{ variant_id: number; quantity: number }>,
  referenceId: string
): Promise<boolean> {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    for (const item of items) {
      // Release reserved stock
      const updateResult = await sql`UPDATE inventory_stock 
       SET reserved_quantity = reserved_quantity - ${item.quantity},
           available_quantity = available_quantity + ${item.quantity},
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ${companyId}
         AND outlet_id = ${outletId}
         AND variant_id = ${item.variant_id}
         AND reserved_quantity >= ${item.quantity}`.execute(trx);

      if (updateResult.numAffectedRows && updateResult.numAffectedRows > BigInt(0)) {
        // Get product_id from variant for the transaction record
        const variantResult = await sql`SELECT item_id FROM item_variants WHERE id = ${item.variant_id} AND company_id = ${companyId}`.execute(trx);
        const productId = (variantResult.rows[0] as VariantRow | undefined)?.item_id ?? null;

        // Record release transaction
        await sql`INSERT INTO inventory_transactions (
          company_id, outlet_id, product_id, transaction_type,
          reference_type, reference_id, variant_id,
          quantity_delta, created_at
        ) VALUES (${companyId}, ${outletId}, ${productId}, 4, 'RELEASE', ${referenceId}, ${item.variant_id}, ${-item.quantity}, CURRENT_TIMESTAMP)`.execute(trx);
      }
    }

    return true;
  });
}

/**
 * Deduct variant stock (when sale is completed)
 */
export async function deductVariantStock(
  companyId: number,
  outletId: number,
  items: Array<{ variant_id: number; quantity: number }>,
  referenceId: string
): Promise<boolean> {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    for (const item of items) {
      // First get current stock from inventory_stock
      const stockResult = await sql`SELECT quantity, available_quantity 
       FROM inventory_stock 
       WHERE company_id = ${companyId}
         AND outlet_id = ${outletId}
         AND variant_id = ${item.variant_id}
       LIMIT 1
       FOR UPDATE`.execute(trx);

      let currentQty = 0;
      let currentAvailable = 0;
      let useInventoryStock = false;

      if (stockResult.rows.length > 0) {
        // Use inventory_stock record
        const stockRow = stockResult.rows[0] as { quantity: number; available_quantity: number };
        currentQty = Number(stockRow.quantity);
        currentAvailable = Number(stockRow.available_quantity);
        useInventoryStock = true;
      } else {
        // Fall back to item_variants.stock_quantity
        const variantResult = await sql`SELECT stock_quantity, item_id 
         FROM item_variants 
         WHERE id = ${item.variant_id} AND company_id = ${companyId}
         FOR UPDATE`.execute(trx);

        if (variantResult.rows.length === 0) {
          throw new Error(`Variant ${item.variant_id} not found`);
        }

        const variantRow = variantResult.rows[0] as VariantRow;
        currentQty = Number(variantRow.stock_quantity);
        currentAvailable = currentQty;
      }

      const newQty = currentQty - item.quantity;
      const newAvailable = currentAvailable - item.quantity;

      if (newQty < 0) {
        throw new Error(`Insufficient stock for variant ${item.variant_id}: ${currentQty} < ${item.quantity}`);
      }

      if (useInventoryStock) {
        // Update existing inventory_stock record
        await sql`UPDATE inventory_stock 
         SET quantity = ${newQty},
             available_quantity = ${newAvailable},
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ${companyId}
           AND outlet_id = ${outletId}
           AND variant_id = ${item.variant_id}`.execute(trx);

        // Also update item_variants.stock_quantity to keep sources in sync
        await sql`UPDATE item_variants SET stock_quantity = ${newQty} WHERE id = ${item.variant_id} AND company_id = ${companyId}`.execute(trx);
      } else {
        // Get item_id for the insert
        const variantResult = await sql`SELECT item_id FROM item_variants WHERE id = ${item.variant_id} AND company_id = ${companyId}`.execute(trx);
        const itemId = Number((variantResult.rows[0] as VariantRow).item_id);

        // Create new record with deducted stock (with item_id as product_id)
        await sql`INSERT INTO inventory_stock (
          company_id, outlet_id, product_id, variant_id,
          quantity, reserved_quantity, available_quantity,
          created_at, updated_at
        ) VALUES (${companyId}, ${outletId}, ${itemId}, ${item.variant_id}, ${newQty}, 0, ${newAvailable}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`.execute(trx);

        // Also update item_variants.stock_quantity
        await sql`UPDATE item_variants SET stock_quantity = ${newQty} WHERE id = ${item.variant_id} AND company_id = ${companyId}`.execute(trx);
      }

      // Get product_id from variant for the transaction record
      const variantResult2 = await sql`SELECT item_id FROM item_variants WHERE id = ${item.variant_id} AND company_id = ${companyId}`.execute(trx);
      const productId2 = (variantResult2.rows[0] as VariantRow | undefined)?.item_id ?? null;

      // Record sale transaction
      await sql`INSERT INTO inventory_transactions (
        company_id, outlet_id, product_id, transaction_type,
        reference_type, reference_id, variant_id,
        quantity_delta, created_at
      ) VALUES (${companyId}, ${outletId}, ${productId2}, 1, 'SALE', ${referenceId}, ${item.variant_id}, ${-item.quantity}, CURRENT_TIMESTAMP)`.execute(trx);
    }

    return true;
  });
}

/**
 * Get stock level for a variant
 */
export interface VariantStockLevel {
  variant_id: number;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
}

interface StockLevelRow {
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
}

export async function getVariantStockLevel(
  companyId: number,
  outletId: number,
  variantId: number
): Promise<VariantStockLevel | null> {
  const db = getDb();

  // First check inventory_stock
  const stockResult = await sql`SELECT quantity, reserved_quantity, available_quantity 
     FROM inventory_stock 
     WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND variant_id = ${variantId}
     LIMIT 1`.execute(db);

  if (stockResult.rows.length > 0) {
    const row = stockResult.rows[0] as StockLevelRow;
    return {
      variant_id: variantId,
      quantity: Number(row.quantity),
      reserved_quantity: Number(row.reserved_quantity),
      available_quantity: Number(row.available_quantity)
    };
  }

  // Fall back to item_variants.stock_quantity
  const variantResult = await sql`SELECT stock_quantity FROM item_variants WHERE id = ${variantId} AND company_id = ${companyId}`.execute(db);

  if (variantResult.rows.length === 0) {
    return null;
  }

  const variantRow = variantResult.rows[0] as VariantRow;
  return {
    variant_id: variantId,
    quantity: Number(variantRow.stock_quantity),
    reserved_quantity: 0,
    available_quantity: Number(variantRow.stock_quantity)
  };
}

/**
 * Get aggregated stock for item (sum of variant stocks + base stock)
 */
export interface AggregatedStockLevel {
  item_id: number;
  total_quantity: number;
  total_available: number;
  variants: Array<{
    variant_id: number;
    quantity: number;
    available: number;
  }>;
}

interface AggregatedBaseRow {
  quantity: number | null;
  available_quantity: number | null;
}

interface AggregatedVariantRow {
  variant_id: number;
  quantity: number;
  available_quantity: number;
  variant_base_stock: number;
}

interface VariantWithoutStockRow {
  variant_id: number;
  stock_quantity: number;
}

export async function getAggregatedItemStock(
  companyId: number,
  outletId: number,
  itemId: number
): Promise<AggregatedStockLevel> {
  const db = getDb();

  // Get item's base stock from inventory_stock (no variant_id)
  const baseStockResult = await sql`SELECT quantity, available_quantity 
     FROM inventory_stock 
     WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND product_id = ${itemId} AND variant_id IS NULL
     LIMIT 1`.execute(db);

  let baseQty = 0;
  let baseAvailable = 0;
  if (baseStockResult.rows.length > 0) {
    const row = baseStockResult.rows[0] as AggregatedBaseRow;
    baseQty = Number(row.quantity);
    baseAvailable = Number(row.available_quantity);
  }

  // Get all variant stocks for this item
  const variantStockResult = await sql`SELECT s.variant_id, s.quantity, s.available_quantity, v.stock_quantity as variant_base_stock
     FROM inventory_stock s
     INNER JOIN item_variants v ON v.id = s.variant_id AND v.company_id = s.company_id
     WHERE s.company_id = ${companyId} AND s.outlet_id = ${outletId} AND v.item_id = ${itemId} AND s.variant_id IS NOT NULL`.execute(db);

  // Get variants that don't have inventory_stock records but have stock in item_variants
  const variantsWithoutStockResult = await sql`SELECT v.id as variant_id, v.stock_quantity
     FROM item_variants v
     WHERE v.company_id = ${companyId} AND v.item_id = ${itemId} AND v.is_active = TRUE
       AND NOT EXISTS (
         SELECT 1 FROM inventory_stock s 
         WHERE s.company_id = v.company_id AND s.variant_id = v.id AND s.outlet_id = ${outletId}
       )`.execute(db);

  const variants: Array<{ variant_id: number; quantity: number; available: number }> = [];

  // Process variants with inventory_stock records
  for (const row of variantStockResult.rows) {
    const r = row as AggregatedVariantRow;
    variants.push({
      variant_id: Number(r.variant_id),
      quantity: Number(r.quantity),
      available: Number(r.available_quantity)
    });
  }

  // Process variants without inventory_stock but with stock in item_variants
  for (const row of variantsWithoutStockResult.rows) {
    const r = row as VariantWithoutStockRow;
    const qty = Number(r.stock_quantity);
    variants.push({
      variant_id: Number(r.variant_id),
      quantity: qty,
      available: qty
    });
  }

  // Calculate totals
  const variantTotalQty = variants.reduce((sum, v) => sum + v.quantity, 0);
  const variantTotalAvailable = variants.reduce((sum, v) => sum + v.available, 0);

  return {
    item_id: itemId,
    total_quantity: baseQty + variantTotalQty,
    total_available: baseAvailable + variantTotalAvailable,
    variants
  };
}
