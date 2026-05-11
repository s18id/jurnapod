// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Item Test Fixtures
 * 
 * Canonical fixtures for inventory items with type taxonomy.
 * Location: packages/modules/inventory/src/test-fixtures/
 */

import { sql } from "kysely";
import { ItemServiceImpl, type ItemType } from "../services/item-service.js";
import { ItemVariantServiceImpl } from "../services/item-variant-service.js";
import { getInventoryDb } from "../db.js";

export type ItemFixture = {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  type: ItemType;
};

/**
 * Options for creating a test inventory item.
 */
export interface CreateTestInventoryItemOptions {
  sku?: string;
  name?: string;
  type: ItemType;
  is_active?: boolean;
  track_stock?: boolean;
  /** COGS account ID for accounting integration (default: not set) */
  cogs_account_id?: number | null;
  /** Inventory Asset account ID for accounting integration (default: not set) */
  inventory_asset_account_id?: number | null;
}

/**
 * Creates a test inventory item with the specified type.
 * 
 * This fixture uses the production ItemService to ensure
 * invariant alignment between production and test.
 * 
 * @param companyId - Company ID for scoping
 * @param opts - Item options including required type
 * @returns Created item fixture
 */
export async function createTestInventoryItem(
  companyId: number,
  opts: CreateTestInventoryItemOptions
): Promise<ItemFixture> {
  const service = new ItemServiceImpl();

  // Use makeTag-like pattern for unique SKU
  const runId = (Date.now() ^ (process.pid << 8)) & 0x7fffffff;
  const sku = opts.sku ?? `INV-${runId.toString(36).toUpperCase()}`;
  const name = opts.name ?? `Test ${opts.type} ${runId.toString(36)}`;

  const item = await service.createItem(
    companyId,
    {
      sku,
      name,
      type: opts.type,
      is_active: opts.is_active ?? true,
      track_stock: opts.track_stock ?? (opts.type === "PRODUCT" || opts.type === "INGREDIENT"),
      cogs_account_id: opts.cogs_account_id ?? undefined,
      inventory_asset_account_id: opts.inventory_asset_account_id ?? undefined,
    }
  );

  return {
    id: item.id,
    company_id: item.company_id,
    sku: item.sku,
    name: item.name,
    type: item.type,
  };
}

/**
 * Creates a PRODUCT type test item.
 */
export async function createTestProduct(
  companyId: number,
  opts?: Partial<CreateTestInventoryItemOptions>
): Promise<ItemFixture> {
  return createTestInventoryItem(companyId, {
    ...opts,
    type: "PRODUCT",
  });
}

/**
 * Creates an INGREDIENT type test item.
 */
export async function createTestIngredient(
  companyId: number,
  opts?: Partial<CreateTestInventoryItemOptions>
): Promise<ItemFixture> {
  return createTestInventoryItem(companyId, {
    ...opts,
    type: "INGREDIENT",
  });
}

/**
 * Creates a SERVICE type test item.
 */
export async function createTestService(
  companyId: number,
  opts?: Partial<CreateTestInventoryItemOptions>
): Promise<ItemFixture> {
  return createTestInventoryItem(companyId, {
    ...opts,
    type: "SERVICE",
    track_stock: false, // SERVICE never tracks stock
  });
}

/**
 * Creates a RECIPE type test item.
 */
export async function createTestRecipe(
  companyId: number,
  opts?: Partial<CreateTestInventoryItemOptions>
): Promise<ItemFixture> {
  return createTestInventoryItem(companyId, {
    ...opts,
    type: "RECIPE",
    track_stock: false, // RECIPE never tracks stock
  });
}

/**
 * Gets an item by ID.
 */
export async function getItemById(
  companyId: number,
  itemId: number
): Promise<ItemFixture | null> {
  const db = getInventoryDb();
  const rows = await sql<{
    id: number;
    company_id: number;
    sku: string | null;
    name: string;
    item_type: ItemType;
  }>`
    SELECT id, company_id, sku, name, item_type
    FROM items
    WHERE id = ${itemId} AND company_id = ${companyId}
    LIMIT 1
  `.execute(db);

  if (rows.rows.length === 0) return null;

  const row = rows.rows[0];
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    sku: row.sku,
    name: row.name,
    type: row.item_type,
  };
}

/**
 * Checks if an item type is stock-tracked.
 * 
 * Only PRODUCT and INGREDIENT types are stock-tracked.
 * SERVICE and RECIPE types are NEVER stock-tracked.
 */
export function isStockTrackedType(type: ItemType): boolean {
  return type === "PRODUCT" || type === "INGREDIENT";
}

// ============================================================================
// Variant Fixtures
// ============================================================================

export type VariantFixture = {
  id: number;
  item_id: number;
  company_id: number;
  sku: string;
  variant_name: string;
};

/**
 * Create a test variant by creating a variant attribute and returning the first variant.
 *
 * Uses the production ItemVariantService for attribute/variant creation,
 * ensuring invariants are identical between test and production paths.
 *
 * @param itemId - Parent item ID
 * @param opts - Partial variant options
 * @returns Variant fixture with id, item_id, company_id, sku, variant_name
 */
export async function createTestVariant(
  itemId: number,
  opts?: {
    attributeName?: string;
    attributeValues?: string[];
  }
): Promise<VariantFixture> {
  const db = getInventoryDb();
  const variantService = new ItemVariantServiceImpl();

  // Get company_id from item (necessary because caller doesn't provide it)
  const itemRow = await db
    .selectFrom("items")
    .where("id", "=", itemId)
    .select(["company_id"])
    .executeTakeFirst();

  if (!itemRow) {
    throw new Error(`Item ${itemId} not found`);
  }
  const companyId = Number(itemRow.company_id);

  // Create variant attribute via production service (generates variants)
  await variantService.createVariantAttribute(companyId, itemId, {
    attribute_name: opts?.attributeName ?? "Size",
    values: opts?.attributeValues ?? ["Default"],
  });

  // Get the created variant via production service
  const variants = await variantService.getItemVariants(companyId, itemId);
  if (variants.length === 0) {
    throw new Error(`Variant not found after creating attribute for item ${itemId}`);
  }

  const v = variants[0]; // First variant
  return {
    id: v.id,
    item_id: v.item_id,
    company_id: companyId,
    sku: v.sku,
    variant_name: v.variant_name,
  };
}