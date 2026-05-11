// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Item Price Test Fixtures
 *
 * FIXTURE MODE: Full Fixture Mode
 * SCOPE: Creates item prices through the production ItemPriceServiceImpl.
 * OWNER: modules-inventory (owner package for item_prices domain)
 *
 * Location: packages/modules/inventory/src/test-fixtures/
 */

import type { KyselySchema } from "@jurnapod/db";
import { ItemPriceServiceImpl } from "../services/item-price-service.js";

/**
 * Options for creating a test item price.
 */
export interface CreateTestItemPriceOptions {
  companyId: number;
  itemId: number;
  outletId: number | null;
  price: number;
  isActive?: boolean;
  variantId?: number | null;
}

/**
 * Creates an item price through the production ItemPriceServiceImpl.
 *
 * This fixture is Full Fixture Mode — it uses the production service
 * to create item prices with full validation (item exists, outlet exists,
 * variant belongs to item).
 *
 * @param db - Database connection (injected into the service)
 * @param opts - Price options
 * @returns The created item price ID
 */
export async function createTestItemPrice(
  db: KyselySchema,
  opts: CreateTestItemPriceOptions
): Promise<number> {
  const service = new ItemPriceServiceImpl(() => db);
  const result = await service.createItemPrice(opts.companyId, {
    item_id: opts.itemId,
    outlet_id: opts.outletId,
    variant_id: opts.variantId ?? null,
    price: opts.price,
    is_active: opts.isActive,
  });
  return result.id;
}
