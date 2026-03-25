// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "./db";
import { toRfc3339Required } from "@jurnapod/shared";

const MONEY_SCALE = 100;

type SqlExecutor = {
  execute: PoolConnection["execute"];
};

let itemPriceCostColumnPromise: Promise<"base_cost" | "price"> | null = null;
let inventoryTxHasUnitCostPromise: Promise<boolean> | null = null;

// Row type definitions
type RecipeIngredientRow = RowDataPacket & {
  id: number;
  company_id: number;
  recipe_item_id: number;
  ingredient_item_id: number;
  quantity: string | number;
  unit_of_measure: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type ItemRow = RowDataPacket & {
  id: number;
  company_id: number;
  name: string;
  sku: string | null;
  item_type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
  is_active: number;
};

type IngredientInventoryCostRow = RowDataPacket & {
  product_id: number;
  inbound_quantity: number | string;
  inbound_total_cost: number | string;
};

type IngredientPriceRow = RowDataPacket & {
  item_id: number;
  unit_cost: number | string;
};

// Custom error classes
export class DatabaseConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConflictError";
  }
}

export class DatabaseReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseReferenceError";
  }
}

export class DatabaseForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseForbiddenError";
  }
}

// MySQL error codes
const mysqlDuplicateErrorCode = 1062;
const mysqlForeignKeyErrorCode = 1452;

// Type guard for MySQL errors
function isMysqlError(error: unknown): error is { errno?: number } {
  return typeof error === "object" && error !== null && "errno" in error;
}

// Transaction wrapper pattern
async function withTransaction<T>(
  operation: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Normalization function
function normalizeRecipeIngredient(row: RecipeIngredientRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    recipe_item_id: Number(row.recipe_item_id),
    ingredient_item_id: Number(row.ingredient_item_id),
    quantity: Number(row.quantity),
    unit_of_measure: row.unit_of_measure,
    is_active: row.is_active === 1,
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  };
}

function normalizeMoney(value: number): number {
  return Math.round(value * MONEY_SCALE) / MONEY_SCALE;
}

async function resolveIngredientUnitCost(
  executor: SqlExecutor,
  companyId: number,
  itemId: number
): Promise<number> {
  const costs = await resolveIngredientUnitCosts(executor, companyId, [itemId]);
  return costs.get(itemId) ?? 0;
}

async function resolveIngredientUnitCosts(
  executor: SqlExecutor,
  companyId: number,
  itemIds: readonly number[]
): Promise<Map<number, number>> {
  const uniqueItemIds = Array.from(new Set(itemIds.map(Number))).filter((id) => Number.isInteger(id) && id > 0);
  if (uniqueItemIds.length === 0) {
    return new Map();
  }

  const hasInventoryUnitCost = await hasInventoryTransactionUnitCostColumn(executor);
  const resolvedCosts = new Map<number, number>();

  if (hasInventoryUnitCost) {
    const placeholders = uniqueItemIds.map(() => "?").join(", ");
    const [inventoryRows] = await executor.execute<IngredientInventoryCostRow[]>(
      `SELECT
         product_id,
         COALESCE(SUM(quantity_delta), 0) AS inbound_quantity,
         COALESCE(SUM(quantity_delta * unit_cost), 0) AS inbound_total_cost
       FROM inventory_transactions
       WHERE company_id = ?
         AND product_id IN (${placeholders})
         AND quantity_delta > 0
       GROUP BY product_id`,
      [companyId, ...uniqueItemIds]
    );

    for (const row of inventoryRows) {
      const productId = Number(row.product_id);
      const inboundQuantity = Number(row.inbound_quantity ?? 0);
      const inboundTotalCost = Number(row.inbound_total_cost ?? 0);
      if (inboundQuantity > 0 && inboundTotalCost > 0) {
        resolvedCosts.set(productId, normalizeMoney(inboundTotalCost / inboundQuantity));
      }
    }
  }

  const itemPriceCostColumn = await resolveItemPriceCostColumn(executor);
  const fallbackIds = uniqueItemIds.filter((itemId) => !resolvedCosts.has(itemId));
  if (fallbackIds.length === 0) {
    return resolvedCosts;
  }

  const fallbackPlaceholders = fallbackIds.map(() => "?").join(", ");

  const [priceRows] = itemPriceCostColumn === "base_cost"
    ? await executor.execute<IngredientPriceRow[]>(
      `SELECT COALESCE(NULLIF(base_cost, 0), price, 0) AS unit_cost
       , item_id
       FROM item_prices
       WHERE company_id = ? AND item_id IN (${fallbackPlaceholders})
         AND is_active = 1
       ORDER BY item_id ASC, created_at DESC, id DESC`,
      [companyId, ...fallbackIds]
    )
    : await executor.execute<IngredientPriceRow[]>(
      `SELECT COALESCE(price, 0) AS unit_cost
       , item_id
       FROM item_prices
       WHERE company_id = ? AND item_id IN (${fallbackPlaceholders})
         AND is_active = 1
       ORDER BY item_id ASC, created_at DESC, id DESC`,
      [companyId, ...fallbackIds]
    );

  for (const row of priceRows) {
    const itemId = Number(row.item_id);
    if (resolvedCosts.has(itemId)) {
      continue;
    }

    const price = Number(row.unit_cost ?? 0);
    if (price > 0) {
      resolvedCosts.set(itemId, normalizeMoney(price));
    }
  }

  return resolvedCosts;
}

async function resolveItemPriceCostColumn(executor: SqlExecutor): Promise<"base_cost" | "price"> {
  if (!itemPriceCostColumnPromise) {
    itemPriceCostColumnPromise = (async () => {
      const [rows] = await executor.execute<RowDataPacket[]>(
        `SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'item_prices'
           AND COLUMN_NAME = 'base_cost'
         LIMIT 1`
      );

      return rows.length > 0 ? "base_cost" : "price";
    })();
  }

  return itemPriceCostColumnPromise;
}

async function hasInventoryTransactionUnitCostColumn(executor: SqlExecutor): Promise<boolean> {
  if (!inventoryTxHasUnitCostPromise) {
    inventoryTxHasUnitCostPromise = (async () => {
      const [rows] = await executor.execute<RowDataPacket[]>(
        `SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'inventory_transactions'
           AND COLUMN_NAME = 'unit_cost'
         LIMIT 1`
      );

      return rows.length > 0;
    })();
  }

  return inventoryTxHasUnitCostPromise;
}

// Get item by ID helper
async function getItemById(
  connection: PoolConnection,
  companyId: number,
  itemId: number
): Promise<ItemRow | null> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id, company_id, name, sku, item_type, is_active 
     FROM items 
     WHERE id = ? AND company_id = ? 
     LIMIT 1`,
    [itemId, companyId]
  );

  if (rows.length === 0) {
    return null;
  }

  return rows[0] as ItemRow;
}

// Ensure company item exists helper
async function ensureCompanyItemExists(
  connection: PoolConnection,
  companyId: number,
  itemId: number
): Promise<ItemRow> {
  const item = await getItemById(connection, companyId, itemId);
  if (!item) {
    throw new DatabaseReferenceError(`Item with ID ${itemId} not found`);
  }
  return item;
}

// Audit log helper
async function recordAuditLog(
  connection: PoolConnection,
  input: {
    companyId: number;
    outletId: number | null;
    actor: { userId: number } | undefined;
    action: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await connection.execute(
    `INSERT INTO audit_logs (
       company_id, outlet_id, user_id, action, result, success, ip_address, payload_json
     ) VALUES (?, ?, ?, ?, 'SUCCESS', 1, NULL, ?)`,
    [
      input.companyId,
      input.outletId,
      input.actor?.userId ?? null,
      input.action,
      JSON.stringify(input.payload)
    ]
  );
}

// Circular reference detection
async function detectCircularReference(
  connection: PoolConnection,
  companyId: number,
  recipeId: number,
  ingredientId: number,
  visited: Set<number> = new Set()
): Promise<boolean> {
  if (visited.has(ingredientId)) return true;
  if (ingredientId === recipeId) return true;

  visited.add(ingredientId);

  // Check if ingredient is itself a recipe
  const item = await getItemById(connection, companyId, ingredientId);
  if (item && item.item_type === "RECIPE") {
    const [subIngredients] = await connection.execute<RecipeIngredientRow[]>(
      `SELECT ingredient_item_id FROM recipe_ingredients 
       WHERE company_id = ? AND recipe_item_id = ? AND is_active = 1`,
      [companyId, ingredientId]
    );

    for (const sub of subIngredients) {
      if (
        await detectCircularReference(
          connection,
          companyId,
          recipeId,
          Number(sub.ingredient_item_id),
          visited
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

// Interface definitions
export interface RecipeIngredient {
  id: number;
  company_id: number;
  recipe_item_id: number;
  ingredient_item_id: number;
  quantity: number;
  unit_of_measure: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredientWithDetails extends RecipeIngredient {
  ingredient_name: string;
  ingredient_sku: string | null;
  ingredient_type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
  unit_cost: number;
  total_cost: number;
}

export interface RecipeCostBreakdown {
  recipe_item_id: number;
  total_ingredient_cost: number;
  ingredient_count: number;
  ingredients: Array<{
    ingredient_item_id: number;
    name: string;
    sku: string | null;
    quantity: number;
    unit_of_measure: string;
    unit_cost: number;
    line_cost: number;
  }>;
}

export interface CreateRecipeIngredientInput {
  ingredient_item_id: number;
  quantity: number;
  unit_of_measure?: string;
}

// Add ingredient to recipe
export async function addIngredientToRecipe(
  companyId: number,
  recipeItemId: number,
  input: CreateRecipeIngredientInput,
  actor?: { userId: number }
): Promise<RecipeIngredientWithDetails> {
  return withTransaction(async (connection) => {
    // Validate recipe exists
    const recipeItem = await ensureCompanyItemExists(
      connection,
      companyId,
      recipeItemId
    );
    if (recipeItem.item_type !== "RECIPE") {
      throw new DatabaseForbiddenError(
        `Item ${recipeItemId} is not a RECIPE type`
      );
    }

    // Validate ingredient exists
    const ingredientItem = await ensureCompanyItemExists(
      connection,
      companyId,
      input.ingredient_item_id
    );

    if (input.ingredient_item_id === recipeItemId) {
      throw new DatabaseConflictError("Cannot add recipe as its own ingredient");
    }

    // Validate ingredient type (only INGREDIENT or PRODUCT can be recipe components)
    if (
      ingredientItem.item_type !== "INGREDIENT" &&
      ingredientItem.item_type !== "PRODUCT"
    ) {
      throw new DatabaseForbiddenError(
        "Only ingredients and products can be recipe components"
      );
    }

    // Check for circular reference
    const hasCircularRef = await detectCircularReference(
      connection,
      companyId,
      recipeItemId,
      input.ingredient_item_id
    );
    if (hasCircularRef) {
      throw new DatabaseConflictError(
        "Cannot add recipe as its own ingredient"
      );
    }

    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO recipe_ingredients 
         (company_id, recipe_item_id, ingredient_item_id, quantity, unit_of_measure)
         VALUES (?, ?, ?, ?, ?)`,
        [
          companyId,
          recipeItemId,
          input.ingredient_item_id,
          input.quantity,
          input.unit_of_measure ?? "unit"
        ]
      );

      // Audit logging
      await recordAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: "RECIPE_INGREDIENT_CREATE",
        payload: {
          recipe_item_id: recipeItemId,
          ingredient_item_id: input.ingredient_item_id,
          quantity: input.quantity,
          unit_of_measure: input.unit_of_measure ?? "unit"
        }
      });

      // Fetch the created ingredient with details
      const ingredient = await findRecipeIngredientById(
        connection,
        companyId,
        Number(result.insertId)
      );
      if (!ingredient) {
        throw new Error("Failed to fetch created ingredient");
      }

      return ingredient;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError(
          "Ingredient already exists in this recipe"
        );
      }
      throw error;
    }
  });
}

// Find recipe ingredient by ID with details
async function findRecipeIngredientById(
  executor: { execute: PoolConnection["execute"] },
  companyId: number,
  ingredientId: number
): Promise<RecipeIngredientWithDetails | null> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT 
       ri.*,
       i.name as ingredient_name,
       i.sku as ingredient_sku,
       i.item_type as ingredient_type
     FROM recipe_ingredients ri
     JOIN items i ON ri.ingredient_item_id = i.id
     WHERE ri.id = ? AND ri.company_id = ?
     LIMIT 1`,
    [ingredientId, companyId]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const normalized = normalizeRecipeIngredient(row as RecipeIngredientRow);
  const unitCost = await resolveIngredientUnitCost(
    executor,
    companyId,
    Number(normalized.ingredient_item_id)
  );

  return {
    ...normalized,
    ingredient_name: row.ingredient_name as string,
    ingredient_sku: (row.ingredient_sku as string | null) ?? null,
    ingredient_type: row.ingredient_type as
      | "SERVICE"
      | "PRODUCT"
      | "INGREDIENT"
      | "RECIPE",
    unit_cost: unitCost,
    total_cost: normalizeMoney(normalized.quantity * unitCost)
  };
}

// Get recipe ingredients
export async function getRecipeIngredients(
  companyId: number,
  recipeItemId: number
): Promise<RecipeIngredientWithDetails[]> {
  const pool = getDbPool();

  const [recipeRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id
     FROM items
     WHERE id = ? AND company_id = ? AND item_type = 'RECIPE'
     LIMIT 1`,
    [recipeItemId, companyId]
  );

  if (recipeRows.length === 0) {
    throw new DatabaseReferenceError(
      `Recipe item with ID ${recipeItemId} not found`
    );
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 
       ri.*,
       i.name as ingredient_name,
       i.sku as ingredient_sku,
       i.item_type as ingredient_type
      FROM recipe_ingredients ri
      JOIN items i ON ri.ingredient_item_id = i.id
      WHERE ri.company_id = ?
        AND ri.recipe_item_id = ?
        AND ri.is_active = 1
        AND i.is_active = 1
      ORDER BY i.name ASC`,
    [companyId, recipeItemId]
  );

  const unitCosts = await resolveIngredientUnitCosts(
    pool,
    companyId,
    rows.map((row) => Number(row.ingredient_item_id))
  );

  return rows.map((row) => {
    const normalized = normalizeRecipeIngredient(row as RecipeIngredientRow);
    const unitCost = unitCosts.get(Number(normalized.ingredient_item_id)) ?? 0;
    return {
      ...normalized,
      ingredient_name: row.ingredient_name as string,
      ingredient_sku: (row.ingredient_sku as string | null) ?? null,
      ingredient_type: row.ingredient_type as
        | "SERVICE"
        | "PRODUCT"
        | "INGREDIENT"
        | "RECIPE",
      unit_cost: unitCost,
      total_cost: normalizeMoney(normalized.quantity * unitCost)
    };
  });
}

// Update recipe ingredient
export async function updateRecipeIngredient(
  companyId: number,
  ingredientId: number,
  updates: Partial<Pick<RecipeIngredient, "quantity" | "unit_of_measure" | "is_active">>,
  actor?: { userId: number }
): Promise<RecipeIngredientWithDetails> {
  return withTransaction(async (connection) => {
    // Check ingredient exists
    const existing = await findRecipeIngredientById(
      connection,
      companyId,
      ingredientId
    );
    if (!existing) {
      throw new DatabaseReferenceError(
        `Recipe ingredient with ID ${ingredientId} not found`
      );
    }

    // Build update query
    const updateFields: string[] = [];
    const values: unknown[] = [];

    if (updates.quantity !== undefined) {
      if (updates.quantity <= 0) {
        throw new DatabaseForbiddenError("Quantity must be greater than 0");
      }
      updateFields.push("quantity = ?");
      values.push(updates.quantity);
    }

    if (updates.unit_of_measure !== undefined) {
      updateFields.push("unit_of_measure = ?");
      values.push(updates.unit_of_measure);
    }

    if (updates.is_active !== undefined) {
      updateFields.push("is_active = ?");
      values.push(updates.is_active ? 1 : 0);
    }

    if (updateFields.length === 0) {
      return existing;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (connection.execute as any)(
      `UPDATE recipe_ingredients SET ${updateFields.join(", ")} WHERE id = ? AND company_id = ?`,
      [...values, ingredientId, companyId]
    );

    // Audit logging
    await recordAuditLog(connection, {
      companyId,
      outletId: null,
      actor,
      action: "RECIPE_INGREDIENT_UPDATE",
      payload: {
        ingredient_id: ingredientId,
        recipe_item_id: existing.recipe_item_id,
        updates
      }
    });

    // Fetch updated ingredient
    const updated = await findRecipeIngredientById(
      connection,
      companyId,
      ingredientId
    );
    if (!updated) {
      throw new Error("Failed to fetch updated ingredient");
    }

    return updated;
  });
}

// Remove ingredient from recipe
export async function removeIngredientFromRecipe(
  companyId: number,
  ingredientId: number,
  actor?: { userId: number }
): Promise<void> {
  return withTransaction(async (connection) => {
    // Check ingredient exists
    const existing = await findRecipeIngredientById(
      connection,
      companyId,
      ingredientId
    );
    if (!existing) {
      throw new DatabaseReferenceError(
        `Recipe ingredient with ID ${ingredientId} not found`
      );
    }

    await connection.execute(
      `DELETE FROM recipe_ingredients WHERE id = ? AND company_id = ?`,
      [ingredientId, companyId]
    );

    // Audit logging
    await recordAuditLog(connection, {
      companyId,
      outletId: null,
      actor,
      action: "RECIPE_INGREDIENT_DELETE",
      payload: {
        ingredient_id: ingredientId,
        recipe_item_id: existing.recipe_item_id,
        ingredient_item_id: existing.ingredient_item_id
      }
    });
  });
}

// Calculate recipe cost
export async function calculateRecipeCost(
  companyId: number,
  recipeItemId: number
): Promise<RecipeCostBreakdown> {
  const pool = getDbPool();

  // Verify recipe exists
  const [recipeRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, name, sku FROM items 
     WHERE id = ? AND company_id = ? AND item_type = 'RECIPE'
     LIMIT 1`,
    [recipeItemId, companyId]
  );

  if (recipeRows.length === 0) {
    throw new DatabaseReferenceError(
      `Recipe item with ID ${recipeItemId} not found`
    );
  }

  const [ingredientRows] = await pool.execute<RowDataPacket[]>(
    `SELECT 
       ri.ingredient_item_id,
       ri.quantity,
       ri.unit_of_measure,
       i.name,
       i.sku
     FROM recipe_ingredients ri
     JOIN items i ON ri.ingredient_item_id = i.id
     WHERE ri.company_id = ?
       AND ri.recipe_item_id = ?
       AND ri.is_active = 1
       AND i.is_active = 1
     ORDER BY i.name ASC`,
    [companyId, recipeItemId]
  );

  const unitCosts = await resolveIngredientUnitCosts(
    pool,
    companyId,
    ingredientRows.map((row) => Number(row.ingredient_item_id))
  );

  const ingredients = ingredientRows.map((row) => {
    const quantity = Number(row.quantity);
    const unitCost = unitCosts.get(Number(row.ingredient_item_id)) ?? 0;
    const lineCost = normalizeMoney(quantity * unitCost);

    return {
      ingredient_item_id: Number(row.ingredient_item_id),
      name: row.name as string,
      sku: (row.sku as string | null) ?? null,
      quantity,
      unit_of_measure: row.unit_of_measure as string,
      unit_cost: unitCost,
      line_cost: lineCost
    };
  });

  const totalCost = normalizeMoney(ingredients.reduce((sum, ing) => sum + ing.line_cost, 0));

  return {
    recipe_item_id: recipeItemId,
    total_ingredient_cost: totalCost,
    ingredient_count: ingredients.length,
    ingredients
  };
}

// Validate recipe composition (for pre-validation before adding)
export async function validateRecipeComposition(
  companyId: number,
  recipeItemId: number,
  ingredientItemId: number
): Promise<{ valid: boolean; error?: string }> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    // Check if recipe exists and is RECIPE type
    const [recipeRows] = await connection.execute<RowDataPacket[]>(
      `SELECT item_type FROM items 
       WHERE id = ? AND company_id = ?
       LIMIT 1`,
      [recipeItemId, companyId]
    );

    if (recipeRows.length === 0) {
      return { valid: false, error: "Recipe item not found" };
    }

    if (recipeRows[0].item_type !== "RECIPE") {
      return { valid: false, error: "Item is not a RECIPE type" };
    }

    if (ingredientItemId === recipeItemId) {
      return {
        valid: false,
        error: "Cannot add recipe as its own ingredient"
      };
    }

    // Check if ingredient exists and is valid type
    const [ingredientRows] = await connection.execute<RowDataPacket[]>(
      `SELECT item_type FROM items 
       WHERE id = ? AND company_id = ?
       LIMIT 1`,
      [ingredientItemId, companyId]
    );

    if (ingredientRows.length === 0) {
      return { valid: false, error: "Ingredient item not found" };
    }

    const ingredientType = ingredientRows[0].item_type;
    if (ingredientType !== "INGREDIENT" && ingredientType !== "PRODUCT") {
      return {
        valid: false,
        error: "Only ingredients and products can be recipe components"
      };
    }

    // Check for circular reference
    const hasCircularRef = await detectCircularReference(
      connection,
      companyId,
      recipeItemId,
      ingredientItemId
    );
    if (hasCircularRef) {
      return {
        valid: false,
        error: "Cannot add recipe as its own ingredient"
      };
    }

    // Check for duplicate
    const [existingRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM recipe_ingredients 
       WHERE company_id = ? AND recipe_item_id = ? AND ingredient_item_id = ?
       LIMIT 1`,
      [companyId, recipeItemId, ingredientItemId]
    );

    if (existingRows.length > 0) {
      return {
        valid: false,
        error: "Ingredient already exists in this recipe"
      };
    }

    return { valid: true };
  } catch (error) {
    console.error("validateRecipeComposition error:", error);
    return { valid: false, error: "Validation failed" };
  } finally {
    connection.release();
  }
}
