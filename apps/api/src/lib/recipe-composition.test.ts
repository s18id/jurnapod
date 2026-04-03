// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { createItem } from "./items/index.js";
import { closeDbPool, getDb } from "./db";

loadEnvIfPresent();

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const {
  addIngredientToRecipe,
  getRecipeIngredients,
  updateRecipeIngredient,
  removeIngredientFromRecipe,
  calculateRecipeCost,
  validateRecipeComposition,
  DatabaseConflictError,
  DatabaseReferenceError,
  DatabaseForbiddenError,
} = await import("./recipe-composition");

test(
  "addIngredientToRecipe - successfully adds ingredient to recipe",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let ingredientItemId = 0;
    let recipeIngredientId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      // Get company fixture
      const companyResult = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyResult.rows.length > 0, "Company fixture not found");
      companyId = Number((companyResult.rows[0] as { id: number }).id);

      // Create test recipe item (type = RECIPE)
      const recipeItem = await createItem(companyId, {
        name: `Test Recipe ${runId}`,
        type: "RECIPE"
      });
      recipeItemId = recipeItem.id;

      // Create test ingredient item (type = INGREDIENT)
      const ingredientItem = await createItem(companyId, {
        name: `Test Ingredient ${runId}`,
        type: "INGREDIENT"
      });
      ingredientItemId = ingredientItem.id;

      // Test: Add ingredient to recipe
      const result = await addIngredientToRecipe(
        companyId,
        recipeItemId,
        {
          ingredient_item_id: ingredientItemId,
          quantity: 2.5,
          unit_of_measure: "kg"
        },
        { userId: 1 }
      );

      recipeIngredientId = result.id;
      assert.strictEqual(result.recipe_item_id, recipeItemId);
      assert.strictEqual(result.ingredient_item_id, ingredientItemId);
      assert.strictEqual(result.quantity, 2.5);
      assert.strictEqual(result.unit_of_measure, "kg");
      assert.strictEqual(result.is_active, true);

    } finally {
      // Cleanup
      if (recipeIngredientId) {
        await removeIngredientFromRecipe(companyId, recipeIngredientId);
      }
      if (ingredientItemId) {
        await sql`DELETE FROM items WHERE id = ${ingredientItemId}`.execute(db);
      }
      if (recipeItemId) {
        await sql`DELETE FROM items WHERE id = ${recipeItemId}`.execute(db);
      }
    }
  }
);

test(
  "addIngredientToRecipe - prevents adding non-ingredient/non-product types",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let serviceItemId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number((companyResult.rows[0] as { id: number }).id);

      // Create test recipe item
      const recipeItem = await createItem(companyId, {
        name: `Test Recipe ${runId}`,
        type: "RECIPE"
      });
      recipeItemId = recipeItem.id;

      // Create test SERVICE item (should not be allowed as ingredient)
      const serviceItem = await createItem(companyId, {
        name: `Test Service ${runId}`,
        type: "SERVICE"
      });
      serviceItemId = serviceItem.id;

      // Test: Should throw DatabaseForbiddenError
      await assert.rejects(
        async () => {
          await addIngredientToRecipe(companyId, recipeItemId, {
            ingredient_item_id: serviceItemId,
            quantity: 1
          });
        },
        (err: Error) => err instanceof DatabaseForbiddenError && err.message.includes("Only ingredients and products")
      );

    } finally {
      if (serviceItemId) await sql`DELETE FROM items WHERE id = ${serviceItemId}`.execute(db);
      if (recipeItemId) await sql`DELETE FROM items WHERE id = ${recipeItemId}`.execute(db);
    }
  }
);

test(
  "addIngredientToRecipe - prevents self reference",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number((companyResult.rows[0] as { id: number }).id);

      const recipe = await createItem(companyId, {
        name: `Recipe ${runId}`,
        type: "RECIPE"
      });
      recipeId = recipe.id;

      // Try to add recipe itself as ingredient (circular)
      await assert.rejects(
        async () => {
          await addIngredientToRecipe(companyId, recipeId, {
            ingredient_item_id: recipeId,
            quantity: 1
          });
        },
        (err: Error) => err instanceof DatabaseConflictError && err.message.includes("Cannot add recipe as its own ingredient")
      );

    } finally {
      if (recipeId) await sql`DELETE FROM items WHERE id = ${recipeId}`.execute(db);
    }
  }
);

test(
  "addIngredientToRecipe - prevents using RECIPE as ingredient type",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let recipeIngredientId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number((companyResult.rows[0] as { id: number }).id);

      const recipeMain = await createItem(companyId, {
        name: `Recipe Main ${runId}`,
        type: "RECIPE"
      });
      recipeItemId = recipeMain.id;

      const recipeChild = await createItem(companyId, {
        name: `Recipe Child ${runId}`,
        type: "RECIPE"
      });
      recipeIngredientId = recipeChild.id;

      await assert.rejects(
        async () => {
          await addIngredientToRecipe(companyId, recipeItemId, {
            ingredient_item_id: recipeIngredientId,
            quantity: 1
          });
        },
        (err: Error) => err instanceof DatabaseForbiddenError && err.message.includes("Only ingredients and products")
      );
    } finally {
      if (recipeIngredientId) await sql`DELETE FROM items WHERE id = ${recipeIngredientId}`.execute(db);
      if (recipeItemId) await sql`DELETE FROM items WHERE id = ${recipeItemId}`.execute(db);
    }
  }
);

test(
  "addIngredientToRecipe - prevents duplicate ingredients",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let ingredientItemId = 0;
    let recipeIngredientId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number((companyResult.rows[0] as { id: number }).id);

      // Create recipe and ingredient
      const recipeItem = await createItem(companyId, {
        name: `Test Recipe ${runId}`,
        type: "RECIPE"
      });
      recipeItemId = recipeItem.id;

      const ingredientItem = await createItem(companyId, {
        name: `Test Ingredient ${runId}`,
        type: "INGREDIENT"
      });
      ingredientItemId = ingredientItem.id;

      // Add ingredient first time
      const firstAdd = await addIngredientToRecipe(companyId, recipeItemId, {
        ingredient_item_id: ingredientItemId,
        quantity: 1
      });
      recipeIngredientId = firstAdd.id;

      // Try to add same ingredient again
      await assert.rejects(
        async () => {
          await addIngredientToRecipe(companyId, recipeItemId, {
            ingredient_item_id: ingredientItemId,
            quantity: 2
          });
        },
        (err: Error) => err instanceof DatabaseConflictError && err.message.includes("already exists")
      );

    } finally {
      if (recipeIngredientId) {
        await removeIngredientFromRecipe(companyId, recipeIngredientId);
      }
      if (ingredientItemId) {
        await sql`DELETE FROM items WHERE id = ${ingredientItemId}`.execute(db);
      }
      if (recipeItemId) {
        await sql`DELETE FROM items WHERE id = ${recipeItemId}`.execute(db);
      }
    }
  }
);

test(
  "addIngredientToRecipe - requires RECIPE type item",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let productItemId = 0;
    let ingredientItemId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number((companyResult.rows[0] as { id: number }).id);

      // Create PRODUCT item (not RECIPE)
      const productItem = await createItem(companyId, {
        name: `Test Product ${runId}`,
        type: "PRODUCT"
      });
      productItemId = productItem.id;

      // Create ingredient
      const ingredientItem = await createItem(companyId, {
        name: `Test Ingredient ${runId}`,
        type: "INGREDIENT"
      });
      ingredientItemId = ingredientItem.id;

      // Try to add ingredient to non-recipe item
      await assert.rejects(
        async () => {
          await addIngredientToRecipe(companyId, productItemId, {
            ingredient_item_id: ingredientItemId,
            quantity: 1
          });
        },
        (err: Error) => err instanceof DatabaseForbiddenError && err.message.includes("not a RECIPE type")
      );

    } finally {
      if (ingredientItemId) await sql`DELETE FROM items WHERE id = ${ingredientItemId}`.execute(db);
      if (productItemId) await sql`DELETE FROM items WHERE id = ${productItemId}`.execute(db);
    }
  }
);

test(
  "getRecipeIngredients - returns all ingredients for a recipe",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let ingredientItemId1 = 0;
    let ingredientItemId2 = 0;
    let recipeIngredientId1 = 0;
    let recipeIngredientId2 = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number((companyResult.rows[0] as { id: number }).id);

      // Create recipe
      const recipeItem = await createItem(companyId, {
        name: `Test Recipe ${runId}`,
        type: "RECIPE"
      });
      recipeItemId = recipeItem.id;

      // Create two ingredients
      const ing1Item = await createItem(companyId, {
        name: `Test Ingredient 1 ${runId}`,
        type: "INGREDIENT"
      });
      ingredientItemId1 = ing1Item.id;

      const ing2Item = await createItem(companyId, {
        name: `Test Ingredient 2 ${runId}`,
        type: "INGREDIENT"
      });
      ingredientItemId2 = ing2Item.id;

      // Add both ingredients
      const ing1 = await addIngredientToRecipe(companyId, recipeItemId, {
        ingredient_item_id: ingredientItemId1,
        quantity: 2,
        unit_of_measure: "kg"
      });
      recipeIngredientId1 = ing1.id;

      const ing2 = await addIngredientToRecipe(companyId, recipeItemId, {
        ingredient_item_id: ingredientItemId2,
        quantity: 500,
        unit_of_measure: "grams"
      });
      recipeIngredientId2 = ing2.id;

      // Test: Get ingredients
      const ingredients = await getRecipeIngredients(companyId, recipeItemId);
      assert.strictEqual(ingredients.length, 2);

      // Verify ingredient details
      const firstIngredient = ingredients.find(i => i.ingredient_item_id === ingredientItemId1);
      assert.ok(firstIngredient);
      assert.strictEqual(firstIngredient.quantity, 2);
      assert.strictEqual(firstIngredient.unit_of_measure, "kg");

    } finally {
      if (recipeIngredientId1) await removeIngredientFromRecipe(companyId, recipeIngredientId1);
      if (recipeIngredientId2) await removeIngredientFromRecipe(companyId, recipeIngredientId2);
      if (ingredientItemId1) await sql`DELETE FROM items WHERE id = ${ingredientItemId1}`.execute(db);
      if (ingredientItemId2) await sql`DELETE FROM items WHERE id = ${ingredientItemId2}`.execute(db);
      if (recipeItemId) await sql`DELETE FROM items WHERE id = ${recipeItemId}`.execute(db);
    }
  }
);

test(
  "updateRecipeIngredient - updates quantity successfully",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let ingredientItemId = 0;
    let recipeIngredientId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number((companyResult.rows[0] as { id: number }).id);

      // Create recipe and ingredient
      const recipeItem = await createItem(companyId, {
        name: `Test Recipe ${runId}`,
        type: "RECIPE"
      });
      recipeItemId = recipeItem.id;

      const ingredientItem = await createItem(companyId, {
        name: `Test Ingredient ${runId}`,
        type: "INGREDIENT"
      });
      ingredientItemId = ingredientItem.id;

      // Add ingredient
      const ingredient = await addIngredientToRecipe(companyId, recipeItemId, {
        ingredient_item_id: ingredientItemId,
        quantity: 1,
        unit_of_measure: "unit"
      });
      recipeIngredientId = ingredient.id;

      // Update quantity
      const updated = await updateRecipeIngredient(
        companyId,
        recipeIngredientId,
        { quantity: 5.5 },
        { userId: 1 }
      );

      assert.strictEqual(updated.quantity, 5.5);
      assert.strictEqual(updated.unit_of_measure, "unit"); // Unchanged

    } finally {
      if (recipeIngredientId) await removeIngredientFromRecipe(companyId, recipeIngredientId);
      if (ingredientItemId) await sql`DELETE FROM items WHERE id = ${ingredientItemId}`.execute(db);
      if (recipeItemId) await sql`DELETE FROM items WHERE id = ${recipeItemId}`.execute(db);
    }
  }
);

test(
  "removeIngredientFromRecipe - removes ingredient successfully",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let ingredientItemId = 0;
    let recipeIngredientId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number((companyResult.rows[0] as { id: number }).id);

      // Create recipe and ingredient
      const recipeItem = await createItem(companyId, {
        name: `Test Recipe ${runId}`,
        type: "RECIPE"
      });
      recipeItemId = recipeItem.id;

      const ingredientItem = await createItem(companyId, {
        name: `Test Ingredient ${runId}`,
        type: "INGREDIENT"
      });
      ingredientItemId = ingredientItem.id;

      // Add ingredient
      const ingredient = await addIngredientToRecipe(companyId, recipeItemId, {
        ingredient_item_id: ingredientItemId,
        quantity: 1
      });
      recipeIngredientId = ingredient.id;

      // Verify ingredient exists
      let ingredients = await getRecipeIngredients(companyId, recipeItemId);
      assert.strictEqual(ingredients.length, 1);

      // Remove ingredient
      await removeIngredientFromRecipe(companyId, recipeIngredientId, { userId: 1 });
      recipeIngredientId = 0; // Already deleted

      // Verify ingredient is removed
      ingredients = await getRecipeIngredients(companyId, recipeItemId);
      assert.strictEqual(ingredients.length, 0);

    } finally {
      if (recipeIngredientId) await removeIngredientFromRecipe(companyId, recipeIngredientId);
      if (ingredientItemId) await sql`DELETE FROM items WHERE id = ${ingredientItemId}`.execute(db);
      if (recipeItemId) await sql`DELETE FROM items WHERE id = ${recipeItemId}`.execute(db);
    }
  }
);

test(
  "calculateRecipeCost - calculates cost breakdown correctly",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let ingredientItemId1 = 0;
    let ingredientItemId2 = 0;
    let recipeIngredientId1 = 0;
    let recipeIngredientId2 = 0;
    let outletId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number((companyResult.rows[0] as { id: number }).id);

      const outletResult = await sql`
        SELECT id FROM outlets WHERE company_id = ${companyId} ORDER BY id ASC LIMIT 1
      `.execute(db);
      assert.ok(outletResult.rows.length > 0, "Outlet fixture not found");
      outletId = Number((outletResult.rows[0] as { id: number }).id);

      // Create recipe
      const recipeItem = await createItem(companyId, {
        name: `Test Recipe ${runId}`,
        type: "RECIPE"
      });
      recipeItemId = recipeItem.id;

      // Create ingredients
      const ing1Item = await createItem(companyId, {
        name: `Test Ingredient 1 ${runId}`,
        type: "INGREDIENT"
      });
      ingredientItemId1 = ing1Item.id;

      const ing2Item = await createItem(companyId, {
        name: `Test Ingredient 2 ${runId}`,
        type: "INGREDIENT"
      });
      ingredientItemId2 = ing2Item.id;

      // Add ingredients with different quantities
      const ing1 = await addIngredientToRecipe(companyId, recipeItemId, {
        ingredient_item_id: ingredientItemId1,
        quantity: 2
      });
      recipeIngredientId1 = ing1.id;

      const ing2 = await addIngredientToRecipe(companyId, recipeItemId, {
        ingredient_item_id: ingredientItemId2,
        quantity: 3
      });
      recipeIngredientId2 = ing2.id;

      await sql`
        INSERT INTO item_prices (company_id, item_id, outlet_id, price)
        VALUES (${companyId}, ${ingredientItemId1}, ${outletId}, 2.25),
               (${companyId}, ${ingredientItemId2}, ${outletId}, 1.5)
      `.execute(db);

      const costBreakdown = await calculateRecipeCost(companyId, recipeItemId);

      assert.strictEqual(costBreakdown.recipe_item_id, recipeItemId);
      assert.strictEqual(costBreakdown.ingredient_count, 2);
      assert.strictEqual(costBreakdown.ingredients.length, 2);
      assert.strictEqual(costBreakdown.total_ingredient_cost, 9);

      const ingredientOne = costBreakdown.ingredients.find((line) => line.ingredient_item_id === ingredientItemId1);
      const ingredientTwo = costBreakdown.ingredients.find((line) => line.ingredient_item_id === ingredientItemId2);
      assert.ok(ingredientOne);
      assert.ok(ingredientTwo);
      assert.strictEqual(ingredientOne.unit_cost, 2.25);
      assert.strictEqual(ingredientOne.line_cost, 4.5);
      assert.strictEqual(ingredientTwo.unit_cost, 1.5);
      assert.strictEqual(ingredientTwo.line_cost, 4.5);

      await sql`
        UPDATE item_prices SET price = 3.0 WHERE company_id = ${companyId} AND item_id = ${ingredientItemId1}
      `.execute(db);

      const recalculated = await calculateRecipeCost(companyId, recipeItemId);
      assert.strictEqual(recalculated.total_ingredient_cost, 10.5);

    } finally {
      if (ingredientItemId1) await sql`DELETE FROM item_prices WHERE company_id = ${companyId} AND item_id = ${ingredientItemId1}`.execute(db);
      if (ingredientItemId2) await sql`DELETE FROM item_prices WHERE company_id = ${companyId} AND item_id = ${ingredientItemId2}`.execute(db);
      if (recipeIngredientId1) await removeIngredientFromRecipe(companyId, recipeIngredientId1);
      if (recipeIngredientId2) await removeIngredientFromRecipe(companyId, recipeIngredientId2);
      if (ingredientItemId1) await sql`DELETE FROM items WHERE id = ${ingredientItemId1}`.execute(db);
      if (ingredientItemId2) await sql`DELETE FROM items WHERE id = ${ingredientItemId2}`.execute(db);
      if (recipeItemId) await sql`DELETE FROM items WHERE id = ${recipeItemId}`.execute(db);
    }
  }
);

test(
  "calculateRecipeCost - batches mixed inventory and fallback ingredient cost resolution",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let ingredientItemId1 = 0;
    let ingredientItemId2 = 0;
    let recipeIngredientId1 = 0;
    let recipeIngredientId2 = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number((companyResult.rows[0] as { id: number }).id);

      const recipeItem = await createItem(companyId, {
        name: `Batch Recipe ${runId}`,
        type: "RECIPE"
      });
      recipeItemId = recipeItem.id;

      const ing1Item = await createItem(companyId, {
        name: `Batch Ingredient Inv ${runId}`,
        type: "INGREDIENT"
      });
      ingredientItemId1 = ing1Item.id;

      const ing2Item = await createItem(companyId, {
        name: `Batch Ingredient Price ${runId}`,
        type: "INGREDIENT"
      });
      ingredientItemId2 = ing2Item.id;

      const ing1 = await addIngredientToRecipe(companyId, recipeItemId, {
        ingredient_item_id: ingredientItemId1,
        quantity: 2
      });
      recipeIngredientId1 = ing1.id;

      const ing2 = await addIngredientToRecipe(companyId, recipeItemId, {
        ingredient_item_id: ingredientItemId2,
        quantity: 3
      });
      recipeIngredientId2 = ing2.id;

      // Check if unit_cost column exists
      const unitCostCheck = await sql`
        SELECT COUNT(*) AS column_exists
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'inventory_transactions'
          AND COLUMN_NAME = 'unit_cost'
      `.execute(db);
      const supportsUnitCost = Number((unitCostCheck.rows[0] as { column_exists: number }).column_exists ?? 0) > 0;

      if (supportsUnitCost) {
        await sql`
          INSERT INTO inventory_transactions (company_id, product_id, transaction_type, quantity_delta, unit_cost, created_at)
          VALUES (${companyId}, ${ingredientItemId1}, 6, 10, 2.5, NOW())
        `.execute(db);
      } else {
        await sql`
          INSERT INTO item_prices (company_id, item_id, outlet_id, price)
          VALUES (${companyId}, ${ingredientItemId1}, NULL, 2.5)
        `.execute(db);
      }

      await sql`
        INSERT INTO item_prices (company_id, item_id, outlet_id, price)
        VALUES (${companyId}, ${ingredientItemId2}, NULL, 4.25)
      `.execute(db);

      const costBreakdown = await calculateRecipeCost(companyId, recipeItemId);

      assert.strictEqual(costBreakdown.total_ingredient_cost, 17.75);

      const ingredientOne = costBreakdown.ingredients.find((line) => line.ingredient_item_id === ingredientItemId1);
      const ingredientTwo = costBreakdown.ingredients.find((line) => line.ingredient_item_id === ingredientItemId2);
      assert.ok(ingredientOne);
      assert.ok(ingredientTwo);
      assert.strictEqual(ingredientOne.unit_cost, 2.5);
      assert.strictEqual(ingredientOne.line_cost, 5);
      assert.strictEqual(ingredientTwo.unit_cost, 4.25);
      assert.strictEqual(ingredientTwo.line_cost, 12.75);
    } finally {
      if (ingredientItemId1) await sql`DELETE FROM inventory_transactions WHERE company_id = ${companyId} AND product_id = ${ingredientItemId1}`.execute(db);
      if (ingredientItemId1) await sql`DELETE FROM item_prices WHERE company_id = ${companyId} AND item_id = ${ingredientItemId1}`.execute(db);
      if (ingredientItemId2) await sql`DELETE FROM item_prices WHERE company_id = ${companyId} AND item_id = ${ingredientItemId2}`.execute(db);
      if (recipeIngredientId1) await removeIngredientFromRecipe(companyId, recipeIngredientId1);
      if (recipeIngredientId2) await removeIngredientFromRecipe(companyId, recipeIngredientId2);
      if (ingredientItemId1) await sql`DELETE FROM items WHERE id = ${ingredientItemId1}`.execute(db);
      if (ingredientItemId2) await sql`DELETE FROM items WHERE id = ${ingredientItemId2}`.execute(db);
      if (recipeItemId) await sql`DELETE FROM items WHERE id = ${recipeItemId}`.execute(db);
    }
  }
);

test(
  "validateRecipeComposition - validates correctly",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let ingredientItemId = 0;
    let serviceItemId = 0;
    let recipeIngredientId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number((companyResult.rows[0] as { id: number }).id);

      // Create recipe
      const recipeItem = await createItem(companyId, {
        name: `Test Recipe ${runId}`,
        type: "RECIPE"
      });
      recipeItemId = recipeItem.id;

      // Create ingredient
      const ingredientItem = await createItem(companyId, {
        name: `Test Ingredient ${runId}`,
        type: "INGREDIENT"
      });
      ingredientItemId = ingredientItem.id;

      // Create service (invalid type)
      const serviceItem = await createItem(companyId, {
        name: `Test Service ${runId}`,
        type: "SERVICE"
      });
      serviceItemId = serviceItem.id;

      // Test: Valid composition
      let validation = await validateRecipeComposition(companyId, recipeItemId, ingredientItemId);
      assert.strictEqual(validation.valid, true);

      // Add ingredient first
      const ing = await addIngredientToRecipe(companyId, recipeItemId, {
        ingredient_item_id: ingredientItemId,
        quantity: 1
      });
      recipeIngredientId = ing.id;

      // Test: Duplicate ingredient
      validation = await validateRecipeComposition(companyId, recipeItemId, ingredientItemId);
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.error?.includes("already exists"));

      // Test: Invalid ingredient type
      validation = await validateRecipeComposition(companyId, recipeItemId, serviceItemId);
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.error?.includes("Only ingredients and products"));

      // Test: Non-existent recipe
      validation = await validateRecipeComposition(companyId, 99999, ingredientItemId);
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.error?.includes("not found"));

    } finally {
      if (recipeIngredientId) await removeIngredientFromRecipe(companyId, recipeIngredientId);
      if (serviceItemId) await sql`DELETE FROM items WHERE id = ${serviceItemId}`.execute(db);
      if (ingredientItemId) await sql`DELETE FROM items WHERE id = ${ingredientItemId}`.execute(db);
      if (recipeItemId) await sql`DELETE FROM items WHERE id = ${recipeItemId}`.execute(db);
    }
  }
);

// CRITICAL: Database pool cleanup hook
test.after(async () => {
  await withTimeout(closeDbPool(), 10000, "closeDbPool");

  // Final safety net: release lingering active handles that can keep node:test alive.
  // @ts-expect-error Node internal API used for diagnostics/cleanup in tests.
  const activeHandles: unknown[] = typeof process._getActiveHandles === "function"
    // @ts-expect-error Node internal API used for diagnostics/cleanup in tests.
    ? process._getActiveHandles()
    : [];

  for (const handle of activeHandles) {
    if (handle === process.stdin || handle === process.stdout || handle === process.stderr) {
      continue;
    }

    const maybeHandle = handle as {
      destroy?: () => void;
      close?: () => void;
      unref?: () => void;
      end?: () => void;
    };

    try {
      maybeHandle.unref?.();
      maybeHandle.end?.();
      maybeHandle.destroy?.();
      maybeHandle.close?.();
    } catch {
      // ignore cleanup best-effort errors
    }
  }
});
