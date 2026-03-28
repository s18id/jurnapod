// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Stock Helpers
 * 
 * Stock deduction functions for sync push.
 * These functions have zero HTTP knowledge.
 */

import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { SyncPushTransactionPayload } from "./types.js";
import { deductStockWithCost } from "../../stock.js";
import type { StockDeductResult } from "../../stock.js";

/**
 * Deduct stock for a single variant using inventory_stock if available
 */
export async function deductVariantStock(
  dbConnection: PoolConnection,
  companyId: number,
  variantId: number,
  quantity: number
): Promise<boolean> {
  // First check if there's variant-specific stock in inventory_stock
  const [stockRows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT quantity, available_quantity 
     FROM inventory_stock 
     WHERE company_id = ? AND variant_id = ? AND outlet_id IS NOT NULL
     LIMIT 1
     FOR UPDATE`,
    [companyId, variantId]
  );

  if (stockRows.length > 0) {
    // Use inventory_stock variant tracking
    const currentQty = Number(stockRows[0].quantity);
    const currentAvailable = Number(stockRows[0].available_quantity);
    const newQty = currentQty - quantity;
    const newAvailable = currentAvailable - quantity;

    if (newQty < 0) {
      throw new Error(`Insufficient stock for variant ${variantId}: ${currentQty} < ${quantity}`);
    }

    // Update inventory_stock
    await dbConnection.execute(
      `UPDATE inventory_stock 
       SET quantity = ?, available_quantity = ?, updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ? AND variant_id = ?`,
      [newQty, newAvailable, companyId, variantId]
    );

    // Also update item_variants.stock_quantity as source of truth
    await dbConnection.execute(
      `UPDATE item_variants SET stock_quantity = ? WHERE id = ? AND company_id = ?`,
      [newQty, variantId, companyId]
    );

    return true;
  }

  // Fallback to item_variants.stock_quantity (legacy behavior)
  const [variantRows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT stock_quantity FROM item_variants
     WHERE id = ? AND company_id = ? AND is_active = TRUE
     FOR UPDATE`,
    [variantId, companyId]
  );

  if (variantRows.length === 0) {
    throw new Error(`Variant ${variantId} not found or inactive`);
  }

  const currentStock = Number(variantRows[0].stock_quantity);
  const newStock = currentStock - quantity;

  if (newStock < 0) {
    throw new Error(`Insufficient stock for variant ${variantId}: ${currentStock} < ${quantity}`);
  }

  await dbConnection.execute(
    `UPDATE item_variants
     SET stock_quantity = ?
     WHERE id = ? AND company_id = ?`,
    [newStock, variantId, companyId]
  );

  // Also create inventory_stock record for future tracking
  await dbConnection.execute(
    `INSERT INTO inventory_stock (company_id, outlet_id, product_id, variant_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
     SELECT company_id, NULL, item_id, id, stock_quantity, 0, stock_quantity, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     FROM item_variants WHERE id = ? AND company_id = ?
     ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), available_quantity = VALUES(available_quantity)`,
    [variantId, companyId]
  );

  return true;
}

/**
 * Resolve and deduct stock for a transaction
 */
export async function resolveAndDeductStockForTransaction(
  dbConnection: PoolConnection,
  tx: SyncPushTransactionPayload,
  posTransactionId: number
): Promise<StockDeductResult[] | null> {
  if (tx.status !== "COMPLETED") {
    return null;
  }

  if (tx.items.length === 0) {
    return null;
  }

  const variantItems = tx.items.filter((item) => item.variant_id);
  const regularItems = tx.items.filter((item) => !item.variant_id);

  for (const item of variantItems) {
    if (item.variant_id) {
      await deductVariantStock(dbConnection, tx.company_id, item.variant_id, item.qty);
    }
  }

  if (regularItems.length === 0) {
    return null;
  }

  const itemIds = regularItems.map((item) => item.item_id);
  if (itemIds.length === 0) {
    return null;
  }

  const placeholders = itemIds.map(() => "?").join(", ");
  const [trackedRows] = await dbConnection.execute<RowDataPacket[]>(
    `SELECT id FROM items
     WHERE company_id = ?
       AND id IN (${placeholders})
       AND track_stock = 1`,
    [tx.company_id, ...itemIds]
  );

  const trackedItemIds = new Set((trackedRows as Array<{ id: number }>).map((row) => row.id));

  if (trackedItemIds.size === 0) {
    return null;
  }

  const stockItems = regularItems
    .filter((item) => trackedItemIds.has(item.item_id))
    .map((item) => ({
      product_id: item.item_id,
      quantity: item.qty
    }));

  if (stockItems.length === 0) {
    return null;
  }

  const stockResults = await deductStockWithCost(
    tx.company_id,
    tx.outlet_id,
    stockItems,
    tx.client_tx_id,
    tx.cashier_user_id,
    dbConnection
  );

  return stockResults;
}
