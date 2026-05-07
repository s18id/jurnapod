// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Recipe/BOM Test Fixtures
 * 
 * Canonical fixtures for recipe compositions and ingredients.
 * Location: packages/modules/inventory/src/test-fixtures/
 */

import { RecipeServiceImpl } from "../services/recipe-service.js";
import { createTestInventoryItem, type ItemFixture } from "./inventory-item-fixtures.js";
import { getInventoryDb } from "../db.js";

export type RecipeIngredientFixture = {
  id: number;
  company_id: number;
  recipe_item_id: number;
  ingredient_item_id: number;
  quantity: number;
  unit_of_measure: string;
  is_active: boolean;
};

/**
 * Options for creating a recipe ingredient.
 */
export interface CreateTestRecipeIngredientOptions {
  ingredient_item_id: number;
  quantity: number;
  unit_of_measure?: string;
}

/**
 * Adds an ingredient to a recipe using the production RecipeService.
 */
export async function createTestRecipeIngredient(
  companyId: number,
  recipeItemId: number,
  opts: CreateTestRecipeIngredientOptions
): Promise<RecipeIngredientFixture> {
  const service = new RecipeServiceImpl(getInventoryDb());

  const ingredient = await service.addIngredientToRecipe(
    companyId,
    recipeItemId,
    {
      ingredient_item_id: opts.ingredient_item_id,
      quantity: opts.quantity,
      unit_of_measure: opts.unit_of_measure ?? "unit",
    }
  );

  return {
    id: ingredient.id,
    company_id: ingredient.company_id,
    recipe_item_id: ingredient.recipe_item_id,
    ingredient_item_id: ingredient.ingredient_item_id,
    quantity: ingredient.quantity,
    unit_of_measure: ingredient.unit_of_measure,
    is_active: ingredient.is_active,
  };
}

/**
 * Options for creating a recipe composition (BOM).
 */
export interface CreateTestRecipeCompositionOptions {
  recipeItem: ItemFixture;
  ingredients: Array<{
    item: ItemFixture;
    quantity: number;
    unit?: string;
  }>;
}

/**
 * Creates a complete recipe composition with multiple ingredients.
 * 
 * @param companyId - Company ID for scoping
 * @param opts - Recipe composition options including recipe item and ingredients
 * @returns Array of created recipe ingredient fixtures
 */
export async function createTestRecipeComposition(
  companyId: number,
  opts: CreateTestRecipeCompositionOptions
): Promise<RecipeIngredientFixture[]> {
  const results: RecipeIngredientFixture[] = [];

  for (const ing of opts.ingredients) {
    const fixture = await createTestRecipeIngredient(companyId, opts.recipeItem.id, {
      ingredient_item_id: ing.item.id,
      quantity: ing.quantity,
      unit_of_measure: ing.unit ?? "unit",
    });
    results.push(fixture);
  }

  return results;
}

/**
 * Creates a recipe with ingredients in one call.
 * Convenience wrapper combining createTestRecipe + createTestRecipeComposition.
 */
export async function createTestRecipeWithIngredients(
  companyId: number,
  recipeName: string,
  ingredients: Array<{
    item: ItemFixture;
    quantity: number;
    unit?: string;
  }>
): Promise<{ recipe: ItemFixture; ingredients: RecipeIngredientFixture[] }> {
  // Create the recipe item
  const recipe = await createTestInventoryItem(companyId, {
    name: recipeName,
    type: "RECIPE",
  });

  // Create the composition
  const ingredientFixtures = await createTestRecipeComposition(companyId, {
    recipeItem: recipe,
    ingredients,
  });

  return { recipe, ingredients: ingredientFixtures };
}

/**
 * Gets recipe cost breakdown for a recipe item.
 */
export async function getRecipeCostBreakdown(
  companyId: number,
  recipeItemId: number
): Promise<{
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
} | null> {
  const db = getInventoryDb();
  const service = new RecipeServiceImpl(db);

  try {
    return await service.calculateRecipeCost(companyId, recipeItemId);
  } catch {
    return null;
  }
}

/**
 * Cleans up a recipe ingredient by marking it inactive.
 */
export async function removeTestRecipeIngredient(
  companyId: number,
  ingredientId: number
): Promise<void> {
  const db = getInventoryDb();
  const service = new RecipeServiceImpl(db);

  await service.removeIngredientFromRecipe(companyId, ingredientId);
}