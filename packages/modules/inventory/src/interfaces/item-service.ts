// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Item service interface for inventory module.
 * All methods require company_id scoping; outlet_id where applicable.
 */

import type { MutationAuditActor } from "./shared.js";

export type ItemType = "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";

export type Item = {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  type: ItemType;
  item_group_id: number | null;
  barcode: string | null;
  cogs_account_id: number | null;
  inventory_asset_account_id: number | null;
  is_active: boolean;
  updated_at: string;
};

export type ItemVariantStats = {
  item_id: number;
  variant_count: number;
  total_stock: number;
  has_variants: boolean;
};

export interface ItemService {
  /**
   * List all items for a company, optionally filtered by active status.
   * @param companyId - The company ID (required)
   * @param filters - Optional filters
   */
  listItems(companyId: number, filters?: { isActive?: boolean }): Promise<Item[]>;

  /**
   * Find a single item by ID.
   * @param companyId - The company ID (required)
   * @param itemId - The item ID
   */
  findItemById(companyId: number, itemId: number): Promise<Item | null>;

  /**
   * Create a new item.
   * @param companyId - The company ID (required)
   * @param input - Item creation input
   * @param actor - Optional audit actor
   */
  createItem(
    companyId: number,
    input: {
      sku?: string | null;
      name: string;
      type: ItemType;
      item_group_id?: number | null;
      cogs_account_id?: number | null;
      inventory_asset_account_id?: number | null;
      is_active?: boolean;
      track_stock?: boolean;
    },
    actor?: MutationAuditActor
  ): Promise<Item>;

  /**
   * Update an existing item.
   * @param companyId - The company ID (required)
   * @param itemId - The item ID
   * @param input - Item update input
   * @param actor - Optional audit actor
   */
  updateItem(
    companyId: number,
    itemId: number,
    input: {
      sku?: string | null;
      name?: string;
      type?: ItemType;
      item_group_id?: number | null;
      cogs_account_id?: number | null;
      inventory_asset_account_id?: number | null;
      is_active?: boolean;
    },
    actor?: MutationAuditActor
  ): Promise<Item>;

  /**
   * Delete an item.
   * @param companyId - The company ID (required)
   * @param itemId - The item ID
   * @param actor - Optional audit actor
   * @returns true if deleted, false if not found
   */
  deleteItem(companyId: number, itemId: number, actor?: MutationAuditActor): Promise<boolean>;

  /**
   * Get variant statistics for multiple items.
   * @param companyId - The company ID (required)
   * @param itemIds - Array of item IDs
   */
  getItemVariantStats(companyId: number, itemIds: number[]): Promise<ItemVariantStats[]>;
}
