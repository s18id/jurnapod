// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql, type Sql } from "kysely";
import { getDb, type KyselySchema } from "./db";
import { toRfc3339Required } from "@jurnapod/shared";
import { withTransaction } from "@jurnapod/db";
import {
  mysqlDuplicateErrorCode,
  isMysqlError
} from "./shared/master-data-utils";

const MONEY_SCALE = 100;

let itemPriceCostColumnPromise: Promise<"base_cost" | "price"> | null = null;
let inventoryTxHasUnitCostPromise: Promise<boolean> | null = null;

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

// Row type definitions using Kysely types
interface RecipeIngredientRow {
  id: number;
  company_id: number;
  recipe_item_id: number;
  ingredient_item_id: number;
  quantity: string | number;
  unit_of_measure: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: number;
  company_id: number;
  name: string;
  sku: string | null;
  item_type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
  is_active: number;
}

interface IngredientInventoryCostRow {
  product_id: number;
  inbound_quantity: number | string;
  inbound_total_cost: number | string;
}

interface IngredientPriceRow {
  item_id: number;
  unit_cost: number | string;
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

// Helper to build IN clause with sql template
function buildInClause(values: readonly number[]) {
  if (values.length === 0) return null;
  return sql.join(values.map(v => sql`${v}`));
}

async function resolveIngredientUnitCost(
  db: KyselySchema,
  companyId: number,
  itemId: number
): Promise<number> {
  const costs = await resolveIngredientUnitCosts(db, companyId, [itemId]);
  return costs.get(itemId) ?? 0;
}

async function resolveIngredientUnitCosts(
  db: KyselySchema,
  companyId: number,
  itemIds: readonly number[]
): Promise<Map<number, number>> {
  const uniqueItemIds = Array.from(new Set(itemIds.map(Number))).filter((id) => Number.isInteger(id) && id > 0);
  if (uniqueItemIds.length === 0) {
    return new Map();
  }

  const hasInventoryUnitCost = await hasInventoryTransactionUnitCostColumn(db);
  const resolvedCosts = new Map<number, number>();

  if (hasInventoryUnitCost) {
    const inClause = buildInClause(uniqueItemIds);
    if (inClause) {
      const inventoryRows = await sql<IngredientInventoryCostRow>`
        SELECT
          product_id,
          COALESCE(SUM(quantity_delta), 0) AS inbound_quantity,
          COALESCE(SUM(quantity_delta * unit_cost), 0) AS inbound_total_cost
        FROM inventory_transactions
        WHERE company_id = ${companyId}
          AND product_id IN (${inClause})
          AND quantity_delta > 0
        GROUP BY product_id
      `.execute(db);

      for (const row of inventoryRows.rows) {
        const productId = Number(row.product_id);
        const inboundQuantity = Number(row.inbound_quantity ?? 0);
        const inboundTotalCost = Number(row.inbound_total_cost ?? 0);
        if (inboundQuantity > 0 && inboundTotalCost > 0) {
          resolvedCosts.set(productId, normalizeMoney(inboundTotalCost / inboundQuantity));
        }
      }
    }
  }

  const itemPriceCostColumn = await resolveItemPriceCostColumn(db);
  const fallbackIds = uniqueItemIds.filter((itemId) => !resolvedCosts.has(itemId));
  if (fallbackIds.length === 0) {
    return resolvedCosts;
  }

  const fallbackInClause = buildInClause(fallbackIds);
  if (!fallbackInClause) {
    return resolvedCosts;
  }

  const priceResult = await (itemPriceCostColumn === "base_cost"
    ? sql<IngredientPriceRow[]>`
      SELECT COALESCE(NULLIF(base_cost, 0), price, 0) AS unit_cost, item_id
      FROM item_prices
      WHERE company_id = ${companyId}
        AND item_id IN (${fallbackInClause})
        AND is_active = 1
      ORDER BY item_id ASC, created_at DESC, id DESC
    `
    : sql<IngredientPriceRow[]>`
      SELECT COALESCE(price, 0) AS unit_cost, item_id
      FROM item_prices
      WHERE company_id = ${companyId}
        AND item_id IN (${fallbackInClause})
        AND is_active = 1
      ORDER BY item_id ASC, created_at DESC, id DESC
    `
  ).execute(db);

  const priceRows = priceResult.rows;

  for (const row of priceRows as unknown as IngredientPriceRow[]) {
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

async function resolveItemPriceCostColumn(db: KyselySchema): Promise<"base_cost" | "price"> {
  if (!itemPriceCostColumnPromise) {
    itemPriceCostColumnPromise = (async () => {
      const rows = await sql`
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'item_prices'
          AND COLUMN_NAME = 'base_cost'
        LIMIT 1
      `.execute(db);

      return rows.rows.length > 0 ? "base_cost" : "price";
    })();
  }

  return itemPriceCostColumnPromise;
}

async function hasInventoryTransactionUnitCostColumn(db: KyselySchema): Promise<boolean> {
  if (!inventoryTxHasUnitCostPromise) {
    inventoryTxHasUnitCostPromise = (async () => {
      const rows = await sql`
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'inventory_transactions'
          AND COLUMN_NAME = 'unit_cost'
        LIMIT 1
      `.execute(db);

      return rows.rows.length > 0;
    })();
  }

  return inventoryTxHasUnitCostPromise;
}

// Get item by ID helper
async function getItemById(
  db: KyselySchema,
  companyId: number,
  itemId: number
): Promise<ItemRow | null> {
  const rows = await sql<ItemRow>`
    SELECT id, company_id, name, sku, item_type, is_active 
    FROM items 
    WHERE id = ${itemId} AND company_id = ${companyId}
    LIMIT 1
  `.execute(db);

  if (rows.rows.length === 0) {
    return null;
  }

  return rows.rows[0];
}

// Ensure company item exists helper
async function ensureCompanyItemExists(
  db: KyselySchema,
  companyId: number,
  itemId: number
): Promise<ItemRow> {
  const item = await getItemById(db, companyId, itemId);
  if (!item) {
    throw new DatabaseReferenceError(`Item with ID ${itemId} not found`);
  }
  return item;
}

// Audit log helper
async function recordAuditLog(
  db: KyselySchema,
  input: {
    companyId: number;
    outletId: number | null;
    actor: { userId: number } | undefined;
    action: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await sql`
    INSERT INTO audit_logs (
      company_id, outlet_id, user_id, action, result, success, ip_address, payload_json
    ) VALUES (
      ${input.companyId},
      ${input.outletId},
      ${input.actor?.userId ?? null},
      ${input.action},
      'SUCCESS',
      1,
      NULL,
      ${JSON.stringify(input.payload)}
    )
  `.execute(db);
}

// Circular reference detection
async function detectCircularReference(
  db: KyselySchema,
  companyId: number,
  recipeId: number,
  ingredientId: number,
  visited: Set<number> = new Set()
): Promise<boolean> {
  if (visited.has(ingredientId)) return true;
  if (ingredientId === recipeId) return true;

  visited.add(ingredientId);

  // Check if ingredient is itself a recipe
  const item = await getItemById(db, companyId, ingredientId);
  if (item && item.item_type === "RECIPE") {
    const subIngredients = await sql<{ ingredient_item_id: number }>`
      SELECT ingredient_item_id FROM recipe_ingredients 
      WHERE company_id = ${companyId} AND recipe_item_id = ${ingredientId} AND is_active = 1
    `.execute(db);

    for (const sub of subIngredients.rows) {
      if (
        await detectCircularReference(
          db,
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

// Find recipe ingredient by ID with details
async function findRecipeIngredientById(
  db: KyselySchema,
  companyId: number,
  ingredientId: number
): Promise<RecipeIngredientWithDetails | null> {
  const rows = await sql`
    SELECT 
      ri.*,
      i.name as ingredient_name,
      i.sku as ingredient_sku,
      i.item_type as ingredient_type
    FROM recipe_ingredients ri
    JOIN items i ON ri.ingredient_item_id = i.id
    WHERE ri.id = ${ingredientId} AND ri.company_id = ${companyId}
    LIMIT 1
  `.execute(db);

  if (rows.rows.length === 0) {
    return null;
  }

  const row = rows.rows[0];
  const typedRow = row as RecipeIngredientRow & {
    ingredient_name: string;
    ingredient_sku: string | null;
    ingredient_type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
  };
  const normalized = normalizeRecipeIngredient(typedRow);
  const unitCost = await resolveIngredientUnitCost(
    db,
    companyId,
    Number(normalized.ingredient_item_id)
  );

  return {
    ...normalized,
    ingredient_name: typedRow.ingredient_name,
    ingredient_sku: typedRow.ingredient_sku ?? null,
    ingredient_type: typedRow.ingredient_type,
    unit_cost: unitCost,
    total_cost: normalizeMoney(normalized.quantity * unitCost)
  };
}

// Add ingredient to recipe
export async function addIngredientToRecipe(
  companyId: number,
  recipeItemId: number,
  input: CreateRecipeIngredientInput,
  actor?: { userId: number }
): Promise<RecipeIngredientWithDetails> {
  const db = getDb();
  
  return withTransaction(db, async (trx) => {
    // Validate recipe exists
    const recipeItem = await ensureCompanyItemExists(
      trx,
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
      trx,
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
      trx,
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
      const result = await sql`
        INSERT INTO recipe_ingredients 
        (company_id, recipe_item_id, ingredient_item_id, quantity, unit_of_measure)
        VALUES (
          ${companyId},
          ${recipeItemId},
          ${input.ingredient_item_id},
          ${input.quantity},
          ${input.unit_of_measure ?? "unit"}
        )
      `.execute(trx);

      const insertId = Number((result.insertId ?? 0));

      // Audit logging
      await recordAuditLog(trx, {
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
        trx,
        companyId,
        insertId
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

// Get recipe ingredients
export async function getRecipeIngredients(
  companyId: number,
  recipeItemId: number
): Promise<RecipeIngredientWithDetails[]> {
  const db = getDb();

  const recipeRows = await sql`
    SELECT id
    FROM items
    WHERE id = ${recipeItemId} AND company_id = ${companyId} AND item_type = 'RECIPE'
    LIMIT 1
  `.execute(db);

  if (recipeRows.rows.length === 0) {
    throw new DatabaseReferenceError(
      `Recipe item with ID ${recipeItemId} not found`
    );
  }

  const rows = await sql`
    SELECT 
      ri.*,
      i.name as ingredient_name,
      i.sku as ingredient_sku,
      i.item_type as ingredient_type
    FROM recipe_ingredients ri
    JOIN items i ON ri.ingredient_item_id = i.id
    WHERE ri.company_id = ${companyId}
      AND ri.recipe_item_id = ${recipeItemId}
      AND ri.is_active = 1
      AND i.is_active = 1
    ORDER BY i.name ASC
  `.execute(db);

  const unitCosts = await resolveIngredientUnitCosts(
    db,
    companyId,
    rows.rows.map((row) => Number((row as RecipeIngredientRow).ingredient_item_id))
  );

  return rows.rows.map((row) => {
    const typedRow = row as RecipeIngredientRow & {
      ingredient_name: string;
      ingredient_sku: string | null;
      ingredient_type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
    };
    const normalized = normalizeRecipeIngredient(typedRow);
    const unitCost = unitCosts.get(Number(normalized.ingredient_item_id)) ?? 0;
    return {
      ...normalized,
      ingredient_name: typedRow.ingredient_name,
      ingredient_sku: typedRow.ingredient_sku ?? null,
      ingredient_type: typedRow.ingredient_type,
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
  const db = getDb();
  
  return withTransaction(db, async (trx) => {
    // Check ingredient exists
    const existing = await findRecipeIngredientById(
      trx,
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
    const values: (string | number | null)[] = [];

    if (updates.quantity !== undefined) {
      if (updates.quantity <= 0) {
        throw new DatabaseForbiddenError("Quantity must be greater than 0");
      }
      updateFields.push("quantity");
      values.push(updates.quantity);
    }

    if (updates.unit_of_measure !== undefined) {
      updateFields.push("unit_of_measure");
      values.push(updates.unit_of_measure);
    }

    if (updates.is_active !== undefined) {
      updateFields.push("is_active");
      values.push(updates.is_active ? 1 : 0);
    }

    if (updateFields.length === 0) {
      return existing;
    }

    const setClauses = updateFields.map((f, i) => sql`${sql.raw(f)} = ${values[i]}`);
    
    await sql`
      UPDATE recipe_ingredients 
      SET ${sql.join(setClauses)}
      WHERE id = ${ingredientId} AND company_id = ${companyId}
    `.execute(trx);

    // Audit logging
    await recordAuditLog(trx, {
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
      trx,
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
  const db = getDb();
  
  return withTransaction(db, async (trx) => {
    // Check ingredient exists
    const existing = await findRecipeIngredientById(
      trx,
      companyId,
      ingredientId
    );
    if (!existing) {
      throw new DatabaseReferenceError(
        `Recipe ingredient with ID ${ingredientId} not found`
      );
    }

    await sql`
      DELETE FROM recipe_ingredients WHERE id = ${ingredientId} AND company_id = ${companyId}
    `.execute(trx);

    // Audit logging
    await recordAuditLog(trx, {
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
  const db = getDb();

  // Verify recipe exists
  const recipeRows = await sql`
    SELECT id, name, sku FROM items 
    WHERE id = ${recipeItemId} AND company_id = ${companyId} AND item_type = 'RECIPE'
    LIMIT 1
  `.execute(db);

  if (recipeRows.rows.length === 0) {
    throw new DatabaseReferenceError(
      `Recipe item with ID ${recipeItemId} not found`
    );
  }

  const ingredientRows = await sql`
    SELECT 
      ri.ingredient_item_id,
      ri.quantity,
      ri.unit_of_measure,
      i.name,
      i.sku
    FROM recipe_ingredients ri
    JOIN items i ON ri.ingredient_item_id = i.id
    WHERE ri.company_id = ${companyId}
      AND ri.recipe_item_id = ${recipeItemId}
      AND ri.is_active = 1
      AND i.is_active = 1
    ORDER BY i.name ASC
  `.execute(db);

  const unitCosts = await resolveIngredientUnitCosts(
    db,
    companyId,
    ingredientRows.rows.map((row) => Number((row as { ingredient_item_id: number }).ingredient_item_id))
  );

  const ingredients = ingredientRows.rows.map((row) => {
    const typedRow = row as { ingredient_item_id: number; quantity: string | number; unit_of_measure: string; name: string; sku: string | null };
    const quantity = Number(typedRow.quantity);
    const unitCost = unitCosts.get(typedRow.ingredient_item_id) ?? 0;
    const lineCost = normalizeMoney(quantity * unitCost);

    return {
      ingredient_item_id: typedRow.ingredient_item_id,
      name: typedRow.name,
      sku: typedRow.sku ?? null,
      quantity,
      unit_of_measure: typedRow.unit_of_measure,
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
  const db = getDb();

  try {
    // Check if recipe exists and is RECIPE type
    const recipeRows = await sql`
      SELECT item_type FROM items 
      WHERE id = ${recipeItemId} AND company_id = ${companyId}
      LIMIT 1
    `.execute(db);

    if (recipeRows.rows.length === 0) {
      return { valid: false, error: "Recipe item not found" };
    }

    const recipeRow = recipeRows.rows[0] as { item_type: string };
    if (recipeRow.item_type !== "RECIPE") {
      return { valid: false, error: "Item is not a RECIPE type" };
    }

    if (ingredientItemId === recipeItemId) {
      return {
        valid: false,
        error: "Cannot add recipe as its own ingredient"
      };
    }

    // Check if ingredient exists and is valid type
    const ingredientRows = await sql`
      SELECT item_type FROM items 
      WHERE id = ${ingredientItemId} AND company_id = ${companyId}
      LIMIT 1
    `.execute(db);

    if (ingredientRows.rows.length === 0) {
      return { valid: false, error: "Ingredient item not found" };
    }

    const ingredientRow = ingredientRows.rows[0] as { item_type: string };
    const ingredientType = ingredientRow.item_type;
    if (ingredientType !== "INGREDIENT" && ingredientType !== "PRODUCT") {
      return {
        valid: false,
        error: "Only ingredients and products can be recipe components"
      };
    }

    // Check for circular reference
    const hasCircularRef = await detectCircularReference(
      db,
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
    const existingRows = await sql`
      SELECT id FROM recipe_ingredients 
      WHERE company_id = ${companyId} AND recipe_item_id = ${recipeItemId} AND ingredient_item_id = ${ingredientItemId}
      LIMIT 1
    `.execute(db);

    if (existingRows.rows.length > 0) {
      return {
        valid: false,
        error: "Ingredient already exists in this recipe"
      };
    }

    return { valid: true };
  } catch (error) {
    console.error("validateRecipeComposition error:", error);
    return { valid: false, error: "Validation failed" };
  }
}
