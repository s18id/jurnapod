// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Batch Operations Library
 *
 * Batch database operations for import functionality.
 * All functions require a connection for transaction support.
 */

import type { PoolConnection } from "mysql2/promise";
import { newKyselyConnection } from "@jurnapod/db";

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

  const kysely = newKyselyConnection(connection);
  const rows = await kysely
    .selectFrom("items")
    .select(["sku", "id"])
    .where("company_id", "=", companyId)
    .where("sku", "in", skus)
    .execute();

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

  const kysely = newKyselyConnection(connection);

  for (const item of updates) {
    const result = await kysely
      .updateTable("items")
      .set({
        name: item.name,
        item_type: item.item_type,
        barcode: item.barcode ?? null,
        item_group_id: item.item_group_id ?? null,
        cogs_account_id: item.cogs_account_id ?? null,
        inventory_asset_account_id: item.inventory_asset_account_id ?? null,
        is_active: item.is_active ? 1 : 0,
        updated_at: new Date()
      })
      .where("id", "=", item.id)
      .executeTakeFirst();

    updated += Number(result?.numUpdatedRows ?? 0);
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

  const kysely = newKyselyConnection(connection);

  for (const item of items) {
    const result = await kysely
      .insertInto("items")
      .values({
        company_id: companyId,
        sku: item.sku,
        name: item.name,
        item_type: item.item_type,
        barcode: item.barcode ?? null,
        item_group_id: item.item_group_id ?? null,
        cogs_account_id: item.cogs_account_id ?? null,
        inventory_asset_account_id: item.inventory_asset_account_id ?? null,
        is_active: item.is_active ? 1 : 0
      })
      .executeTakeFirst();

    ids.push(Number(result.insertId));
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

  const kysely = newKyselyConnection(connection);
  const rows = await kysely
    .selectFrom("item_prices")
    .select(["item_id", "outlet_id", "id"])
    .where("company_id", "=", companyId)
    .where("item_id", "in", itemIds)
    .execute();

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

  const kysely = newKyselyConnection(connection);

  for (const price of updates) {
    const result = await kysely
      .updateTable("item_prices")
      .set({
        price: price.price,
        is_active: price.is_active ? 1 : 0,
        updated_at: new Date()
      })
      .where("id", "=", price.id)
      .executeTakeFirst();

    updated += Number(result?.numUpdatedRows ?? 0);
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

  const kysely = newKyselyConnection(connection);

  for (const price of prices) {
    const result = await kysely
      .insertInto("item_prices")
      .values({
        item_id: price.item_id,
        company_id: companyId,
        outlet_id: price.outlet_id ?? null,
        price: price.price,
        is_active: price.is_active ? 1 : 0,
        effective_from: 0, // 0 = always effective from beginning
        effective_to: 0 // 0 = no expiration
      })
      .executeTakeFirst();

    ids.push(Number(result.insertId));
  }

  return ids;
}
