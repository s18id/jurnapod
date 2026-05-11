// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Test Fixtures
 * 
 * Re-exports all canonical test fixtures for inventory module.
 */

export {
  createTestInventoryItem,
  createTestProduct,
  createTestIngredient,
  createTestService,
  createTestRecipe,
  getItemById,
  isStockTrackedType,
  type ItemFixture,
  type CreateTestInventoryItemOptions,
} from "./inventory-item-fixtures.js";

export {
  createTestRecipeIngredient,
  createTestRecipeComposition,
  createTestRecipeWithIngredients,
  getRecipeCostBreakdown,
  removeTestRecipeIngredient,
  type RecipeIngredientFixture,
  type CreateTestRecipeIngredientOptions,
  type CreateTestRecipeCompositionOptions,
} from "./recipe-fixtures.js";

export {
  createTestInventoryTransaction,
  type CreateTestInventoryTransactionOptions,
} from "./inventory-transaction-fixtures.js";

export {
  createTestItemPrice,
  type CreateTestItemPriceOptions,
} from "./item-price-fixtures.js";