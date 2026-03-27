// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Variant Stock Operations
 * 
 * Stock management functions for product variants.
 * Each variant can have independent stock levels tracked in inventory_stock table.
 */

import { getDbPool } from "../db";
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";

/**
 * Check stock availability for variants
 */
export interface VariantStockCheckResult {
  variant_id: number;
  available: boolean;
  requested_quantity: number;
  available_quantity: number;
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
  const dbPool = getDbPool();
  const conn = await dbPool.getConnection();

  try {
    // First check item_variants table (which has stock_quantity)
    const [variantRows] = await conn.execute<RowDataPacket[]>(
      `SELECT stock_quantity 
       FROM item_variants 
       WHERE id = ? AND company_id = ? AND is_active = TRUE`,
      [variantId, companyId]
    );

    if (variantRows.length === 0) {
      return {
        variant_id: variantId,
        available: false,
        requested_quantity: requestedQuantity,
        available_quantity: 0
      };
    }

    // Check if variant_id column exists in inventory_stock
    let hasVariantIdColumn = false;
    try {
      const [cols] = await conn.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_stock' AND COLUMN_NAME = 'variant_id'`
      );
      hasVariantIdColumn = cols.length > 0;
    } catch {
      // Ignore - column doesn't exist
    }

    // Check inventory_stock for variant-specific stock (if exists)
    let availableQuantity: number;
    if (hasVariantIdColumn) {
      const [stockRows] = await conn.execute<RowDataPacket[]>(
        `SELECT available_quantity 
         FROM inventory_stock 
         WHERE company_id = ? 
           AND outlet_id = ? 
           AND variant_id = ?
         LIMIT 1`,
        [companyId, outletId, variantId]
      );
      // Use variant stock if exists, otherwise fallback to item_variants.stock_quantity
      availableQuantity = stockRows.length > 0
        ? Number(stockRows[0].available_quantity)
        : Number(variantRows[0].stock_quantity);
    } else {
      // No variant_id column - just use item_variants.stock_quantity
      availableQuantity = Number(variantRows[0].stock_quantity);
    }

    return {
      variant_id: variantId,
      available: availableQuantity >= requestedQuantity,
      requested_quantity: requestedQuantity,
      available_quantity: availableQuantity
    };
  } finally {
    conn.release();
  }
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
  referenceId: string,
  connection?: PoolConnection
): Promise<VariantStockReservationResult> {
  const conflicts: Array<{ variant_id: number; requested: number; available: number }> = [];

  // Reserve stock (decrement available_quantity in inventory_stock)
  const dbPool = getDbPool();
  const conn = connection ?? await dbPool.getConnection();
  const shouldRelease = !connection;

  try {
    if (!connection) {
      await conn.beginTransaction();
    }

    // For each item, atomically check availability and reserve in a single locked operation
    for (const item of items) {
      // First, get the variant info (needed for product_id later and for fallback stock)
      const [variantRows] = await conn.execute<RowDataPacket[]>(
        `SELECT item_id, stock_quantity FROM item_variants 
         WHERE id = ? AND company_id = ? AND is_active = TRUE`,
        [item.variant_id, companyId]
      );

      if (variantRows.length === 0) {
        if (!connection) await conn.rollback();
        return {
          success: false,
          conflicts: [{ variant_id: item.variant_id, requested: item.quantity, available: 0 }]
        };
      }

      const itemId = Number(variantRows[0].item_id);
      const baseStock = Number(variantRows[0].stock_quantity);

      // Try to update existing inventory_stock row with row lock
      const [updateResult] = await conn.execute<ResultSetHeader>(
        `UPDATE inventory_stock 
         SET reserved_quantity = reserved_quantity + ?,
             available_quantity = available_quantity - ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND outlet_id = ?
           AND variant_id = ?
           AND available_quantity >= ?`,
        [
          item.quantity,
          item.quantity,
          companyId,
          outletId,
          item.variant_id,
          item.quantity
        ]
      );

      if (updateResult.affectedRows === 0) {
        // No existing inventory_stock row or insufficient available
        // Need to handle the case where row doesn't exist yet
        // Lock the item_variants row to serialize concurrent first-time reservations
        const [lockedVariantRows] = await conn.execute<RowDataPacket[]>(
          `SELECT item_id, stock_quantity FROM item_variants 
           WHERE id = ? AND company_id = ? AND is_active = TRUE
           FOR UPDATE`,
          [item.variant_id, companyId]
        );

        // Re-check inventory_stock after acquiring lock
        const [stockRows] = await conn.execute<RowDataPacket[]>(
          `SELECT available_quantity 
           FROM inventory_stock 
           WHERE company_id = ?
             AND outlet_id = ?
             AND variant_id = ?
           LIMIT 1
           FOR UPDATE`,
          [companyId, outletId, item.variant_id]
        );

        if (stockRows.length > 0) {
          // Another transaction created the row after we released our lock
          // Re-attempt the reservation
          const currentAvailable = Number(stockRows[0].available_quantity);
          if (currentAvailable < item.quantity) {
            conflicts.push({
              variant_id: item.variant_id,
              requested: item.quantity,
              available: currentAvailable
            });
            continue;
          }

          const [retryResult] = await conn.execute<ResultSetHeader>(
            `UPDATE inventory_stock 
             SET reserved_quantity = reserved_quantity + ?,
                 available_quantity = available_quantity - ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE company_id = ?
               AND outlet_id = ?
               AND variant_id = ?`,
            [item.quantity, item.quantity, companyId, outletId, item.variant_id]
          );

          if (retryResult.affectedRows === 0) {
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
          await conn.execute(
            `INSERT INTO inventory_stock (
              company_id, outlet_id, product_id, variant_id,
              quantity, reserved_quantity, available_quantity,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE
              quantity = VALUES(quantity),
              reserved_quantity = VALUES(reserved_quantity),
              available_quantity = VALUES(available_quantity),
              updated_at = CURRENT_TIMESTAMP`,
            [companyId, outletId, itemId, item.variant_id, baseStock, item.quantity, newAvailable]
          );
        }
      }

      // Record reservation in transactions
      await conn.execute(
        `INSERT INTO inventory_transactions (
          company_id, outlet_id, product_id, transaction_type,
          reference_type, reference_id, variant_id,
          quantity_delta, created_at
        ) VALUES (?, ?, ?, ?, 'RESERVATION', ?, ?, ?, CURRENT_TIMESTAMP)`,
        [companyId, outletId, itemId, 3, referenceId, item.variant_id, item.quantity]
      );
    }

    if (conflicts.length > 0) {
      if (!connection) await conn.rollback();
      return { success: false, conflicts };
    }

    if (!connection) {
      await conn.commit();
    }

    return { success: true };
  } catch (error) {
    if (!connection) await conn.rollback();
    throw error;
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

/**
 * Release reserved variant stock (when cart is cleared/expired)
 */
export async function releaseVariantStock(
  companyId: number,
  outletId: number,
  items: Array<{ variant_id: number; quantity: number }>,
  referenceId: string,
  connection?: PoolConnection
): Promise<boolean> {
  const dbPool = getDbPool();
  const conn = connection ?? await dbPool.getConnection();
  const shouldRelease = !connection;

  try {
    if (!connection) {
      await conn.beginTransaction();
    }

    for (const item of items) {
      // Release reserved stock
      const [updateResult] = await conn.execute<ResultSetHeader>(
        `UPDATE inventory_stock 
         SET reserved_quantity = reserved_quantity - ?,
             available_quantity = available_quantity + ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND outlet_id = ?
           AND variant_id = ?
           AND reserved_quantity >= ?`,
        [
          item.quantity,
          item.quantity,
          companyId,
          outletId,
          item.variant_id,
          item.quantity
        ]
      );

      if (updateResult.affectedRows > 0) {
        // Get product_id from variant for the transaction record
        const [variantRows] = await conn.execute<RowDataPacket[]>(
          `SELECT item_id FROM item_variants WHERE id = ? AND company_id = ?`,
          [item.variant_id, companyId]
        );
        const productId = variantRows[0]?.item_id ?? null;

        // Record release transaction
        await conn.execute(
          `INSERT INTO inventory_transactions (
            company_id, outlet_id, product_id, transaction_type,
            reference_type, reference_id, variant_id,
            quantity_delta, created_at
          ) VALUES (?, ?, ?, ?, 'RELEASE', ?, ?, ?, CURRENT_TIMESTAMP)`,
          [companyId, outletId, productId, 4, referenceId, item.variant_id, -item.quantity]
        );
      }
    }

    if (!connection) {
      await conn.commit();
    }

    return true;
  } catch (error) {
    if (!connection) await conn.rollback();
    throw error;
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

/**
 * Deduct variant stock (when sale is completed)
 */
export async function deductVariantStock(
  companyId: number,
  outletId: number,
  items: Array<{ variant_id: number; quantity: number }>,
  referenceId: string,
  connection?: PoolConnection
): Promise<boolean> {
  const dbPool = getDbPool();
  const conn = connection ?? await dbPool.getConnection();
  const shouldRelease = !connection;

  try {
    if (!connection) {
      await conn.beginTransaction();
    }

    for (const item of items) {
      // First get current stock from inventory_stock
      const [stockRows] = await conn.execute<RowDataPacket[]>(
        `SELECT quantity, available_quantity 
         FROM inventory_stock 
         WHERE company_id = ?
           AND outlet_id = ?
           AND variant_id = ?
         LIMIT 1
         FOR UPDATE`,
        [companyId, outletId, item.variant_id]
      );

      let currentQty = 0;
      let currentAvailable = 0;
      let useInventoryStock = false;

      if (stockRows.length > 0) {
        // Use inventory_stock record
        currentQty = Number(stockRows[0].quantity);
        currentAvailable = Number(stockRows[0].available_quantity);
        useInventoryStock = true;
      } else {
        // Fall back to item_variants.stock_quantity
        const [variantRows] = await conn.execute<RowDataPacket[]>(
          `SELECT stock_quantity, item_id 
           FROM item_variants 
           WHERE id = ? AND company_id = ?
           FOR UPDATE`,
          [item.variant_id, companyId]
        );

        if (variantRows.length === 0) {
          throw new Error(`Variant ${item.variant_id} not found`);
        }

        currentQty = Number(variantRows[0].stock_quantity);
        currentAvailable = currentQty;
      }

      const newQty = currentQty - item.quantity;
      const newAvailable = currentAvailable - item.quantity;

      if (newQty < 0) {
        throw new Error(`Insufficient stock for variant ${item.variant_id}: ${currentQty} < ${item.quantity}`);
      }

      if (useInventoryStock) {
        // Update existing inventory_stock record
        await conn.execute(
          `UPDATE inventory_stock 
           SET quantity = ?,
               available_quantity = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE company_id = ?
             AND outlet_id = ?
             AND variant_id = ?`,
          [newQty, newAvailable, companyId, outletId, item.variant_id]
        );

        // Also update item_variants.stock_quantity to keep sources in sync
        await conn.execute(
          `UPDATE item_variants SET stock_quantity = ? WHERE id = ? AND company_id = ?`,
          [newQty, item.variant_id, companyId]
        );
      } else {
        // Get item_id for the insert
        const [variantRows] = await conn.execute<RowDataPacket[]>(
          `SELECT item_id FROM item_variants WHERE id = ? AND company_id = ?`,
          [item.variant_id, companyId]
        );
        const itemId = Number(variantRows[0].item_id);

        // Create new record with deducted stock (with item_id as product_id)
        await conn.execute(
          `INSERT INTO inventory_stock (
            company_id, outlet_id, product_id, variant_id,
            quantity, reserved_quantity, available_quantity,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [companyId, outletId, itemId, item.variant_id, newQty, newAvailable]
        );

        // Also update item_variants.stock_quantity
        await conn.execute(
          `UPDATE item_variants SET stock_quantity = ? WHERE id = ? AND company_id = ?`,
          [newQty, item.variant_id, companyId]
        );
      }

      // Get product_id from variant for the transaction record
      const [variantRows2] = await conn.execute<RowDataPacket[]>(
        `SELECT item_id FROM item_variants WHERE id = ? AND company_id = ?`,
        [item.variant_id, companyId]
      );
      const productId2 = variantRows2[0]?.item_id ?? null;

      // Record sale transaction
      await conn.execute(
        `INSERT INTO inventory_transactions (
          company_id, outlet_id, product_id, transaction_type,
          reference_type, reference_id, variant_id,
          quantity_delta, created_at
        ) VALUES (?, ?, ?, ?, 'SALE', ?, ?, ?, CURRENT_TIMESTAMP)`,
        [companyId, outletId, productId2, 1, referenceId, item.variant_id, -item.quantity]
      );
    }

    if (!connection) {
      await conn.commit();
    }

    return true;
  } catch (error) {
    if (!connection) await conn.rollback();
    throw error;
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
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

export async function getVariantStockLevel(
  companyId: number,
  outletId: number,
  variantId: number
): Promise<VariantStockLevel | null> {
  const dbPool = getDbPool();
  const conn = await dbPool.getConnection();

  try {
    // First check inventory_stock
    const [stockRows] = await conn.execute<RowDataPacket[]>(
      `SELECT quantity, reserved_quantity, available_quantity 
       FROM inventory_stock 
       WHERE company_id = ? AND outlet_id = ? AND variant_id = ?
       LIMIT 1`,
      [companyId, outletId, variantId]
    );

    if (stockRows.length > 0) {
      return {
        variant_id: variantId,
        quantity: Number(stockRows[0].quantity),
        reserved_quantity: Number(stockRows[0].reserved_quantity),
        available_quantity: Number(stockRows[0].available_quantity)
      };
    }

    // Fall back to item_variants.stock_quantity
    const [variantRows] = await conn.execute<RowDataPacket[]>(
      `SELECT stock_quantity FROM item_variants WHERE id = ? AND company_id = ?`,
      [variantId, companyId]
    );

    if (variantRows.length === 0) {
      return null;
    }

    return {
      variant_id: variantId,
      quantity: Number(variantRows[0].stock_quantity),
      reserved_quantity: 0,
      available_quantity: Number(variantRows[0].stock_quantity)
    };
  } finally {
    conn.release();
  }
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

export async function getAggregatedItemStock(
  companyId: number,
  outletId: number,
  itemId: number
): Promise<AggregatedStockLevel> {
  const dbPool = getDbPool();
  const conn = await dbPool.getConnection();

  try {
    // Get item's base stock from inventory_stock (no variant_id)
    const [baseStockRows] = await conn.execute<RowDataPacket[]>(
      `SELECT quantity, available_quantity 
       FROM inventory_stock 
       WHERE company_id = ? AND outlet_id = ? AND product_id = ? AND variant_id IS NULL
       LIMIT 1`,
      [companyId, outletId, itemId]
    );

    let baseQty = 0;
    let baseAvailable = 0;
    if (baseStockRows.length > 0) {
      baseQty = Number(baseStockRows[0].quantity);
      baseAvailable = Number(baseStockRows[0].available_quantity);
    }

    // Get all variant stocks for this item
    const [variantStockRows] = await conn.execute<RowDataPacket[]>(
      `SELECT s.variant_id, s.quantity, s.available_quantity, v.stock_quantity as variant_base_stock
       FROM inventory_stock s
       INNER JOIN item_variants v ON v.id = s.variant_id AND v.company_id = s.company_id
       WHERE s.company_id = ? AND s.outlet_id = ? AND v.item_id = ? AND s.variant_id IS NOT NULL`,
      [companyId, outletId, itemId]
    );

    // Get variants that don't have inventory_stock records but have stock in item_variants
    const [variantsWithoutStock] = await conn.execute<RowDataPacket[]>(
      `SELECT v.id as variant_id, v.stock_quantity
       FROM item_variants v
       WHERE v.company_id = ? AND v.item_id = ? AND v.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM inventory_stock s 
           WHERE s.company_id = v.company_id AND s.variant_id = v.id AND s.outlet_id = ?
         )`,
      [companyId, itemId, outletId]
    );

    const variants: Array<{ variant_id: number; quantity: number; available: number }> = [];

    // Process variants with inventory_stock records
    for (const row of variantStockRows) {
      variants.push({
        variant_id: Number(row.variant_id),
        quantity: Number(row.quantity),
        available: Number(row.available_quantity)
      });
    }

    // Process variants without inventory_stock but with stock in item_variants
    for (const row of variantsWithoutStock) {
      const qty = Number(row.stock_quantity);
      variants.push({
        variant_id: Number(row.variant_id),
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
  } finally {
    conn.release();
  }
}