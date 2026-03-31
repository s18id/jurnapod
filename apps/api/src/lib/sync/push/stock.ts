// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Stock Helpers
 * 
 * Stock deduction functions for sync push.
 * These functions have zero HTTP knowledge.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@/lib/db";
import type { SyncPushTransactionPayload } from "./types.js";
import { deductStockWithCost } from "../../stock.js";
import type { StockDeductResult, StockItem } from "../../stock.js";

interface StockRow {
  quantity: string;
  available_quantity: string;
}

interface VariantRow {
  stock_quantity: string;
}

interface ItemRow {
  id: number;
}

/**
 * Deduct stock for a single variant using inventory_stock if available
 */
export async function deductVariantStock(
  db: KyselySchema,
  companyId: number,
  variantId: number,
  quantity: number
): Promise<boolean> {
  // First check if there's variant-specific stock in inventory_stock
  const stockRows = await sql<StockRow>`
    SELECT quantity, available_quantity 
    FROM inventory_stock 
    WHERE company_id = ${companyId} AND variant_id = ${variantId} AND outlet_id IS NOT NULL
    LIMIT 1
    FOR UPDATE
  `.execute(db);

  if (stockRows.rows.length > 0) {
    // Use inventory_stock variant tracking
    const currentQty = Number(stockRows.rows[0].quantity);
    const currentAvailable = Number(stockRows.rows[0].available_quantity);
    const newQty = currentQty - quantity;
    const newAvailable = currentAvailable - quantity;

    if (newQty < 0) {
      throw new Error(`Insufficient stock for variant ${variantId}: ${currentQty} < ${quantity}`);
    }

    // Update inventory_stock
    await sql`
      UPDATE inventory_stock 
      SET quantity = ${newQty}, available_quantity = ${newAvailable}, updated_at = CURRENT_TIMESTAMP
      WHERE company_id = ${companyId} AND variant_id = ${variantId}
    `.execute(db);

    // Also update item_variants.stock_quantity as source of truth
    await sql`
      UPDATE item_variants SET stock_quantity = ${newQty} WHERE id = ${variantId} AND company_id = ${companyId}
    `.execute(db);

    return true;
  }

  // Fallback to item_variants.stock_quantity (legacy behavior)
  const variantRows = await sql<VariantRow>`
    SELECT stock_quantity FROM item_variants
    WHERE id = ${variantId} AND company_id = ${companyId} AND is_active = TRUE
    FOR UPDATE
  `.execute(db);

  if (variantRows.rows.length === 0) {
    throw new Error(`Variant ${variantId} not found or inactive`);
  }

  const currentStock = Number(variantRows.rows[0].stock_quantity);
  const newStock = currentStock - quantity;

  if (newStock < 0) {
    throw new Error(`Insufficient stock for variant ${variantId}: ${currentStock} < ${quantity}`);
  }

  await sql`
    UPDATE item_variants
    SET stock_quantity = ${newStock}
    WHERE id = ${variantId} AND company_id = ${companyId}
  `.execute(db);

  // Also create inventory_stock record for future tracking
  await sql`
    INSERT INTO inventory_stock (company_id, outlet_id, product_id, variant_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
    SELECT company_id, NULL, item_id, id, stock_quantity, 0, stock_quantity, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM item_variants WHERE id = ${variantId} AND company_id = ${companyId}
    ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), available_quantity = VALUES(available_quantity)
  `.execute(db);

  return true;
}

/**
 * Resolve and deduct stock for a transaction
 */
export async function resolveAndDeductStockForTransaction(
  db: KyselySchema,
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
      await deductVariantStock(db, tx.company_id, item.variant_id, item.qty);
    }
  }

  if (regularItems.length === 0) {
    return null;
  }

  const itemIds = regularItems.map((item) => item.item_id);
  if (itemIds.length === 0) {
    return null;
  }

  // Build dynamic IN clause using sql.join
  const inClause = sql.join(itemIds.map(id => sql`${id}`), sql`, `);
  
  const trackedRows = await sql<ItemRow>`
    SELECT id FROM items
    WHERE company_id = ${tx.company_id}
      AND id IN (${inClause})
      AND track_stock = 1
  `.execute(db);

  const trackedItemIds = new Set(trackedRows.rows.map((row) => row.id));

  if (trackedItemIds.size === 0) {
    return null;
  }

  const stockItems: StockItem[] = regularItems
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
    db
  );

  return stockResults;
}
