// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Batch Operations Library
 *
 * Batch database operations for import functionality.
 * All functions require a connection for transaction support.
 */

import type { PoolConnection, RowDataPacket } from "mysql2/promise";

// ============================================================================
// Types
// ============================================================================

/**
 * Data for batch item insert
 */
export interface BatchItemInsert {
  sku: string;
  name: string;
  item_type: string;
  barcode?: string | null;
  item_group_id?: number | null;
  cogs_account_id?: number | null;
  inventory_asset_account_id?: number | null;
  is_active: boolean;
}

/**
 * Data for batch item update
 */
export interface BatchItemUpdate {
  id: number;
  name: string;
  item_type: string;
  barcode?: string | null;
  item_group_id?: number | null;
  cogs_account_id?: number | null;
  inventory_asset_account_id?: number | null;
  is_active: boolean;
}

/**
 * Data for batch price insert
 */
export interface BatchPriceInsert {
  item_id: number;
  outlet_id?: number | null;
  price: number;
  is_active: boolean;
}

/**
 * Data for batch price update
 */
export interface BatchPriceUpdate {
  id: number;
  price: number;
  is_active: boolean;
}

/**
 * Result of batch lookup operations
 */
export interface BatchLookupResult {
  itemId: number;
  [key: string]: unknown;
}

// ============================================================================
// Item Batch Lookups
// ============================================================================

/**
 * Find items by SKUs in batch.
 * Returns a map of SKU to item ID for efficient lookup.
 *
 * @param companyId - Company ID to scope the query
 * @param skus - Array of SKUs to look up
 * @param connection - Database connection (required, for transaction)
 * @returns Map of SKU to item ID
 */
export async function batchFindItemsBySkus(
  companyId: number,
  skus: string[],
  connection: PoolConnection
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  if (skus.length === 0) {
    return result;
  }

  const placeholders = skus.map(() => "?").join(",");
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT sku, id FROM items WHERE company_id = ? AND sku IN (${placeholders})`,
    [companyId, ...skus]
  );

  for (const row of rows) {
    result.set(String(row.sku), Number(row.id));
  }

  return result;
}

// ============================================================================
// Item Batch Operations
// ============================================================================

/**
 * Update items in batch.
 * All updates happen within the provided transaction.
 *
 * @param updates - Array of item updates
 * @param connection - Database connection (required, for transaction)
 * @returns Number of rows updated
 */
export async function batchUpdateItems(
  updates: BatchItemUpdate[],
  connection: PoolConnection
): Promise<number> {
  let updated = 0;

  for (const item of updates) {
    const [result] = await connection.execute(
      `UPDATE items SET
        name = ?, item_type = ?, barcode = ?, item_group_id = ?,
        cogs_account_id = ?, inventory_asset_account_id = ?, is_active = ?,
        updated_at = NOW()
      WHERE id = ?`,
      [
        item.name,
        item.item_type,
        item.barcode ?? null,
        item.item_group_id ?? null,
        item.cogs_account_id ?? null,
        item.inventory_asset_account_id ?? null,
        item.is_active ? 1 : 0,
        item.id
      ]
    );
    updated += (result as { affectedRows: number }).affectedRows || 0;
  }

  return updated;
}

/**
 * Insert items in batch.
 * All inserts happen within the provided transaction.
 *
 * @param companyId - Company ID for the items
 * @param items - Array of items to insert
 * @param connection - Database connection (required, for transaction)
 * @returns Array of inserted item IDs
 */
export async function batchInsertItems(
  companyId: number,
  items: BatchItemInsert[],
  connection: PoolConnection
): Promise<number[]> {
  const ids: number[] = [];

  for (const item of items) {
    const [result] = await connection.execute(
      `INSERT INTO items (
        company_id, sku, name, item_type, barcode, item_group_id,
        cogs_account_id = ?, inventory_asset_account_id = ?, is_active = ?, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        companyId,
        item.sku,
        item.name,
        item.item_type,
        item.barcode ?? null,
        item.item_group_id ?? null,
        item.cogs_account_id ?? null,
        item.inventory_asset_account_id ?? null,
        item.is_active ? 1 : 0
      ]
    );
    ids.push((result as { insertId: number }).insertId);
  }

  return ids;
}

// ============================================================================
// Price Batch Lookups
// ============================================================================

/**
 * Find existing prices by item IDs in batch.
 * Returns a map of "itemId:outletId" to price ID for efficient lookup.
 *
 * @param companyId - Company ID to scope the query
 * @param itemIds - Array of item IDs to look up
 * @param connection - Database connection (required, for transaction)
 * @returns Map of "itemId:outletId" to price ID
 */
export async function batchFindPricesByItemIds(
  companyId: number,
  itemIds: number[],
  connection: PoolConnection
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  if (itemIds.length === 0) {
    return result;
  }

  const placeholders = itemIds.map(() => "?").join(",");
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT item_id, outlet_id, id FROM item_prices WHERE company_id = ? AND item_id IN (${placeholders})`,
    [companyId, ...itemIds]
  );

  for (const row of rows) {
    const key = `${row.item_id}:${row.outlet_id ?? "null"}`;
    result.set(key, Number(row.id));
  }

  return result;
}

// ============================================================================
// Price Batch Operations
// ============================================================================

/**
 * Update prices in batch.
 * All updates happen within the provided transaction.
 *
 * @param updates - Array of price updates
 * @param connection - Database connection (required, for transaction)
 * @returns Number of rows updated
 */
export async function batchUpdatePrices(
  updates: BatchPriceUpdate[],
  connection: PoolConnection
): Promise<number> {
  let updated = 0;

  for (const price of updates) {
    const [result] = await connection.execute(
      `UPDATE item_prices SET price = ?, is_active = ?, updated_at = NOW() WHERE id = ?`,
      [price.price, price.is_active ? 1 : 0, price.id]
    );
    updated += (result as { affectedRows: number }).affectedRows || 0;
  }

  return updated;
}

/**
 * Insert prices in batch.
 * All inserts happen within the provided transaction.
 *
 * @param companyId - Company ID for the prices
 * @param prices - Array of prices to insert
 * @param connection - Database connection (required, for transaction)
 * @returns Array of inserted price IDs
 */
export async function batchInsertPrices(
  companyId: number,
  prices: BatchPriceInsert[],
  connection: PoolConnection
): Promise<number[]> {
  const ids: number[] = [];

  for (const price of prices) {
    const [result] = await connection.execute(
      `INSERT INTO item_prices (item_id, company_id, outlet_id, price, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        price.item_id,
        companyId,
        price.outlet_id ?? null,
        price.price,
        price.is_active ? 1 : 0
      ]
    );
    ids.push((result as { insertId: number }).insertId);
  }

  return ids;
}
