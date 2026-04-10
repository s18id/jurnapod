// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Batch Operations Library
 *
 * Batch database operations for import functionality.
 */

import { getDb } from "@/lib/db";
import { itemPricesAdapter } from "@/lib/item-prices/adapter.js";
import { withTransactionRetry } from "@jurnapod/db";

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
 * @returns Map of SKU to item ID
 */
export async function batchFindItemsBySkus(
  companyId: number,
  skus: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  if (skus.length === 0) {
    return result;
  }

  const db = getDb();
  const rows = await db
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
 *
 * Uses withTransactionRetry to handle deadlocks from parallel test fixtures.
 *
 * @param updates - Array of item updates
 * @returns Number of rows updated
 */
export async function batchUpdateItems(
  companyId: number,
  updates: BatchItemUpdate[]
): Promise<number> {
  if (updates.length === 0) {
    return 0;
  }

  const db = getDb();

  // Wrap in transaction with deadlock retry
  return withTransactionRetry(db, async (trx) => {
    let updated = 0;

    for (const item of updates) {
      const result = await trx
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
        .where("company_id", "=", companyId)
        .executeTakeFirst();

      updated += Number(result?.numUpdatedRows ?? 0);
    }

    return updated;
  });
}

/**
 * Insert items in batch.
 *
 * Uses withTransactionRetry to handle deadlocks from parallel test fixtures.
 *
 * @param companyId - Company ID for the items
 * @param items - Array of items to insert
 * @returns Array of inserted item IDs
 */
export async function batchInsertItems(
  companyId: number,
  items: BatchItemInsert[]
): Promise<number[]> {
  if (items.length === 0) {
    return [];
  }

  const db = getDb();

  // Wrap in transaction with deadlock retry
  return withTransactionRetry(db, async (trx) => {
    const ids: number[] = [];

    for (const item of items) {
      const result = await trx
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
  });
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
 * @returns Map of "itemId:outletId" to price ID
 */
export async function batchFindPricesByItemIds(
  companyId: number,
  itemIds: number[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  if (itemIds.length === 0) {
    return result;
  }

  const db = getDb();
  const rows = await db
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
 *
 * Uses withTransactionRetry to handle deadlocks and lock timeouts.
 *
 * @param updates - Array of price updates
 * @returns Number of rows updated
 */
export async function batchUpdatePrices(
  companyId: number,
  updates: BatchPriceUpdate[]
): Promise<number> {
  if (updates.length === 0) {
    return 0;
  }

  const db = getDb();

  // Wrap in transaction with deadlock/lock-timeout retry
  return withTransactionRetry(db, async (trx) => {
    let updated = 0;

    for (const price of updates) {
      const result = await trx
        .updateTable("item_prices")
        .set({
          price: price.price,
          is_active: price.is_active ? 1 : 0,
          updated_at: new Date()
        })
        .where("id", "=", price.id)
        .where("company_id", "=", companyId)
        .executeTakeFirst();

      updated += Number(result?.numUpdatedRows ?? 0);
    }

    return updated;
  });
}

/**
 * Insert prices in batch.
 *
 * Uses batchCreateItemPrices for efficient bulk insert with single transaction
 * and deadlock retry protection.
 *
 * @param companyId - Company ID for the prices
 * @param prices - Array of prices to insert
 * @param actor - Actor for audit logging. Must have a valid userId.
 * @returns Array of inserted price IDs
 */
export async function batchInsertPrices(
  companyId: number,
  prices: BatchPriceInsert[],
  actor: { userId: number; canManageCompanyDefaults?: boolean }
): Promise<number[]> {
  if (prices.length === 0) {
    return [];
  }

  // Use batchCreateItemPrices for single transaction + retry
  const createdPrices = await itemPricesAdapter.batchCreateItemPrices(
    companyId,
    prices.map(p => ({
      item_id: p.item_id,
      outlet_id: p.outlet_id ?? null,
      price: p.price,
      is_active: p.is_active,
    })),
    actor
  );

  return createdPrices.map(p => p.id);
}
