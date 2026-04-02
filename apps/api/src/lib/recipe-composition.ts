// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Recipe Composition Service - Thin Adapter
 * 
 * This module delegates to modules-inventory services.
 * Maintains backward compatibility for API consumers.
 */

import { getDb, type KyselySchema } from "@/lib/db";

// Re-export types from modules-inventory
export type {
  RecipeIngredient,
  RecipeIngredientWithDetails,
  RecipeCostBreakdown,
  CreateRecipeIngredientInput
} from "@jurnapod/modules-inventory";

// Re-export error classes from modules-inventory
export {
  InventoryConflictError as DatabaseConflictError,
  InventoryReferenceError as DatabaseReferenceError,
  InventoryForbiddenError as DatabaseForbiddenError
} from "@jurnapod/modules-inventory";

// Import service singleton from modules-inventory
import { recipeService } from "@jurnapod/modules-inventory";
import type { RecipeIngredientWithDetails, RecipeCostBreakdown, CreateRecipeIngredientInput } from "@jurnapod/modules-inventory";

/**
 * Add ingredient to recipe.
 */
export async function addIngredientToRecipe(
  companyId: number,
  recipeItemId: number,
  input: CreateRecipeIngredientInput,
  actor?: { userId: number }
): Promise<RecipeIngredientWithDetails> {
  return recipeService.addIngredientToRecipe(companyId, recipeItemId, input, actor);
}

/**
 * Get all ingredients for a recipe.
 */
export async function getRecipeIngredients(
  companyId: number,
  recipeItemId: number
): Promise<RecipeIngredientWithDetails[]> {
  return recipeService.getRecipeIngredients(companyId, recipeItemId);
}

/**
 * Update a recipe ingredient.
 */
export async function updateRecipeIngredient(
  companyId: number,
  ingredientId: number,
  updates: Partial<{ quantity: number; unit_of_measure: string; is_active: boolean }>,
  actor?: { userId: number }
): Promise<RecipeIngredientWithDetails> {
  return recipeService.updateRecipeIngredient(companyId, ingredientId, {
    quantity: updates.quantity,
    unit_of_measure: updates.unit_of_measure,
    is_active: updates.is_active
  }, actor);
}

/**
 * Remove ingredient from recipe.
 */
export async function removeIngredientFromRecipe(
  companyId: number,
  ingredientId: number,
  actor?: { userId: number }
): Promise<void> {
  return recipeService.removeIngredientFromRecipe(companyId, ingredientId, actor);
}

/**
 * Calculate recipe cost breakdown.
 */
export async function calculateRecipeCost(
  companyId: number,
  recipeItemId: number
): Promise<RecipeCostBreakdown> {
  return recipeService.calculateRecipeCost(companyId, recipeItemId);
}

/**
 * Validate recipe composition before adding ingredient.
 */
export async function validateRecipeComposition(
  companyId: number,
  recipeItemId: number,
  ingredientItemId: number
): Promise<{ valid: boolean; error?: string }> {
  return recipeService.validateRecipeComposition(companyId, recipeItemId, ingredientItemId);
}
