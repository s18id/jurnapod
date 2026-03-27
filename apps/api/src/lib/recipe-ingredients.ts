// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";

// Row type for recipe_ingredients table
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

// Return type for recipe ingredient (low-level, no business logic)
export type RecipeIngredientResult = {
  id: number;
  companyId: number;
  recipeId: number;
  ingredientId: number;
  quantity: number;
  unit: string;
  costPerUnit: number | null;
};

// MySQL error codes
const mysqlDuplicateErrorCode = 1062;
const mysqlForeignKeyErrorCode = 1452;

// Type guard for MySQL errors
function isMysqlError(error: unknown): error is { errno?: number } {
  return typeof error === "object" && error !== null && "errno" in error;
}

// Normalize row to result type
function normalizeRow(row: RecipeIngredientRow): RecipeIngredientResult {
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    recipeId: Number(row.recipe_item_id),
    ingredientId: Number(row.ingredient_item_id),
    quantity: Number(row.quantity),
    unit: row.unit_of_measure,
    costPerUnit: null // Column does not exist in schema
  };
}

// Custom error classes
export class RecipeIngredientConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipeIngredientConflictError";
  }
}

export class RecipeIngredientNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipeIngredientNotFoundError";
  }
}

export class RecipeIngredientForeignKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipeIngredientForeignKeyError";
  }
}

/**
 * Create a new recipe ingredient.
 * Requires caller to manage transaction if needed.
 */
export async function createRecipeIngredient(
  pool: Pool,
  params: {
    companyId: number;
    recipeId: number;
    ingredientId: number;
    quantity: number;
    unit: string;
    costPerUnit?: number;
  }
): Promise<RecipeIngredientResult> {
  const { companyId, recipeId, ingredientId, quantity, unit } = params;

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO recipe_ingredients 
       (company_id, recipe_item_id, ingredient_item_id, quantity, unit_of_measure)
       VALUES (?, ?, ?, ?, ?)`,
      [companyId, recipeId, ingredientId, quantity, unit]
    );

    // Fetch and return the created record
    const [rows] = await pool.execute<RecipeIngredientRow[]>(
      `SELECT * FROM recipe_ingredients WHERE id = ? AND company_id = ? LIMIT 1`,
      [result.insertId, companyId]
    );

    if (rows.length === 0) {
      throw new Error("Failed to fetch created recipe ingredient");
    }

    return normalizeRow(rows[0]);
  } catch (error) {
    if (isMysqlError(error)) {
      if (error.errno === mysqlDuplicateErrorCode) {
        throw new RecipeIngredientConflictError(
          "Recipe ingredient already exists for this recipe-ingredient combination"
        );
      }
      if (error.errno === mysqlForeignKeyErrorCode) {
        throw new RecipeIngredientForeignKeyError(
          "Referenced recipe or ingredient item does not exist"
        );
      }
    }
    throw error;
  }
}

/**
 * Update an existing recipe ingredient.
 * Only updates fields that are provided.
 */
export async function updateRecipeIngredient(
  pool: Pool,
  id: number,
  companyId: number,
  params: {
    quantity?: number;
    unit?: string;
    costPerUnit?: number;
  }
): Promise<boolean> {
  const updateFields: string[] = [];
  const values: (string | number)[] = [];

  if (params.quantity !== undefined) {
    updateFields.push("quantity = ?");
    values.push(params.quantity);
  }

  if (params.unit !== undefined) {
    updateFields.push("unit_of_measure = ?");
    values.push(params.unit);
  }

  // costPerUnit is not a column in the schema - ignored

  if (updateFields.length === 0) {
    return true; // No updates needed
  }

  values.push(id, companyId);

  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE recipe_ingredients SET ${updateFields.join(", ")} WHERE id = ? AND company_id = ?`,
    values
  );

  return result.affectedRows > 0;
}

/**
 * Delete a recipe ingredient by ID.
 */
export async function deleteRecipeIngredient(
  pool: Pool,
  id: number,
  companyId: number
): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    `DELETE FROM recipe_ingredients WHERE id = ? AND company_id = ?`,
    [id, companyId]
  );

  return result.affectedRows > 0;
}

/**
 * List all recipe ingredients for a given recipe.
 */
export async function listRecipeIngredients(
  pool: Pool,
  recipeId: number,
  companyId: number
): Promise<RecipeIngredientResult[]> {
  const [rows] = await pool.execute<RecipeIngredientRow[]>(
    `SELECT * FROM recipe_ingredients 
     WHERE recipe_item_id = ? AND company_id = ? AND is_active = 1
     ORDER BY id ASC`,
    [recipeId, companyId]
  );

  return rows.map(normalizeRow);
}

/**
 * Get a single recipe ingredient by ID.
 */
export async function getRecipeIngredientById(
  pool: Pool,
  id: number,
  companyId: number
): Promise<RecipeIngredientResult | null> {
  const [rows] = await pool.execute<RecipeIngredientRow[]>(
    `SELECT * FROM recipe_ingredients WHERE id = ? AND company_id = ? LIMIT 1`,
    [id, companyId]
  );

  if (rows.length === 0) {
    return null;
  }

  return normalizeRow(rows[0]);
}
