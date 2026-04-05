// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Item price service interface for inventory module.
 * All methods require company_id scoping; outlet_id where applicable.
 */

import type { MutationAuditActor } from "./shared.js";

export type ItemPrice = {
  id: number;
  company_id: number;
  outlet_id: number | null;
  item_id: number;
  variant_id: number | null;
  price: number;
  is_active: boolean;
  updated_at: string;
  item_group_id?: number | null;
  item_group_name?: string | null;
};

export interface ItemPriceService {
  /**
   * List item prices for a company with optional filters.
   * @param companyId - The company ID (required)
   * @param filters - Optional filters including outletId, outletIds, isActive, variantId
   */
  listItemPrices(
    companyId: number,
    filters?: {
      outletId?: number;
      outletIds?: readonly number[];
      isActive?: boolean;
      includeDefaults?: boolean;
      variantId?: number | null;
      itemId?: number;
    }
  ): Promise<ItemPrice[]>;

  /**
   * List effective item prices for an outlet (considering outlet-specific overrides and company defaults).
   * @param companyId - The company ID (required)
   * @param outletId - The outlet ID (required)
   * @param filters - Optional filters
   */
  listEffectiveItemPricesForOutlet(
    companyId: number,
    outletId: number,
    filters?: { isActive?: boolean }
  ): Promise<(ItemPrice & { is_override: boolean })[]>;

  /**
   * Find a single item price by ID.
   * @param companyId - The company ID (required)
   * @param itemPriceId - The item price ID
   */
  findItemPriceById(companyId: number, itemPriceId: number): Promise<ItemPrice | null>;

  /**
   * Create a new item price.
   * @param companyId - The company ID (required)
   * @param input - Item price creation input
   * @param actor - Optional audit actor
   */
  createItemPrice(
    companyId: number,
    input: {
      item_id: number;
      outlet_id: number | null;
      variant_id?: number | null;
      price: number;
      is_active?: boolean;
    },
    actor?: MutationAuditActor
  ): Promise<ItemPrice>;

  /**
   * Update an existing item price.
   * @param companyId - The company ID (required)
   * @param itemPriceId - The item price ID
   * @param input - Item price update input
   * @param actor - Optional audit actor
   */
  updateItemPrice(
    companyId: number,
    itemPriceId: number,
    input: {
      item_id?: number;
      outlet_id?: number | null;
      variant_id?: number | null;
      price?: number;
      is_active?: boolean;
    },
    actor?: MutationAuditActor
  ): Promise<ItemPrice | null>;

  /**
   * Delete an item price.
   * @param companyId - The company ID (required)
   * @param itemPriceId - The item price ID
   * @param actor - Optional audit actor
   * @returns true if deleted, false if not found
   */
  deleteItemPrice(companyId: number, itemPriceId: number, actor?: MutationAuditActor): Promise<boolean>;
}
