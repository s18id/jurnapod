// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Recipe service interface for inventory module.
 * All methods require company_id scoping.
 */

import type { MutationAuditActor } from "./shared.js";

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

export interface UpdateRecipeIngredientInput {
  quantity?: number;
  unit_of_measure?: string;
  is_active?: boolean;
}

export interface RecipeService {
  /**
   * Add ingredient to recipe.
   */
  addIngredientToRecipe(
    companyId: number,
    recipeItemId: number,
    input: CreateRecipeIngredientInput,
    actor?: MutationAuditActor
  ): Promise<RecipeIngredientWithDetails>;

  /**
   * Get all ingredients for a recipe.
   */
  getRecipeIngredients(
    companyId: number,
    recipeItemId: number
  ): Promise<RecipeIngredientWithDetails[]>;

  /**
   * Update a recipe ingredient.
   */
  updateRecipeIngredient(
    companyId: number,
    ingredientId: number,
    updates: UpdateRecipeIngredientInput,
    actor?: MutationAuditActor
  ): Promise<RecipeIngredientWithDetails>;

  /**
   * Remove ingredient from recipe.
   */
  removeIngredientFromRecipe(
    companyId: number,
    ingredientId: number,
    actor?: MutationAuditActor
  ): Promise<void>;

  /**
   * Calculate recipe cost breakdown.
   */
  calculateRecipeCost(
    companyId: number,
    recipeItemId: number
  ): Promise<RecipeCostBreakdown>;

  /**
   * Validate recipe composition before adding ingredient.
   */
  validateRecipeComposition(
    companyId: number,
    recipeItemId: number,
    ingredientItemId: number
  ): Promise<{ valid: boolean; error?: string }>;
}
