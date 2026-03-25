// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import {
  addIngredientToRecipe,
  getRecipeIngredients,
  updateRecipeIngredient,
  removeIngredientFromRecipe,
  calculateRecipeCost,
  validateRecipeComposition,
  DatabaseConflictError,
  DatabaseReferenceError,
  DatabaseForbiddenError
} from "./recipe-composition";
import { closeDbPool, getDbPool } from "./db";
import type { RowDataPacket } from "mysql2";

loadEnvIfPresent();

test(
  "addIngredientToRecipe - successfully adds ingredient to recipe",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let ingredientItemId = 0;
    let recipeIngredientId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      // Get company fixture
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number(companyRows[0].id);

      // Create test recipe item (type = RECIPE)
      const [recipeResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'RECIPE')`,
        [companyId, `Test Recipe ${runId}`]
      );
      recipeItemId = Number((recipeResult as { insertId: number }).insertId);

      // Create test ingredient item (type = INGREDIENT)
      const [ingResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'INGREDIENT')`,
        [companyId, `Test Ingredient ${runId}`]
      );
      ingredientItemId = Number((ingResult as { insertId: number }).insertId);

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
        await pool.execute(`DELETE FROM recipe_ingredients WHERE id = ?`, [recipeIngredientId]);
      }
      if (ingredientItemId) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [ingredientItemId]);
      }
      if (recipeItemId) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [recipeItemId]);
      }
    }
  }
);

test(
  "addIngredientToRecipe - prevents adding non-ingredient/non-product types",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let serviceItemId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      companyId = Number(companyRows[0].id);

      // Create test recipe item
      const [recipeResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'RECIPE')`,
        [companyId, `Test Recipe ${runId}`]
      );
      recipeItemId = Number((recipeResult as { insertId: number }).insertId);

      // Create test SERVICE item (should not be allowed as ingredient)
      const [serviceResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'SERVICE')`,
        [companyId, `Test Service ${runId}`]
      );
      serviceItemId = Number((serviceResult as { insertId: number }).insertId);

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
      if (serviceItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [serviceItemId]);
      if (recipeItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [recipeItemId]);
    }
  }
);

test(
  "addIngredientToRecipe - prevents self reference",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      companyId = Number(companyRows[0].id);

      const [unitCostColumnRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS column_exists
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'inventory_transactions'
           AND COLUMN_NAME = 'unit_cost'`
      );
      const supportsUnitCost = Number(unitCostColumnRows[0]?.column_exists ?? 0) > 0;

      const [recipeResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'RECIPE')`,
        [companyId, `Recipe ${runId}`]
      );
      recipeId = Number((recipeResult as { insertId: number }).insertId);

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
      if (recipeId) await pool.execute(`DELETE FROM items WHERE id = ?`, [recipeId]);
    }
  }
);

test(
  "addIngredientToRecipe - prevents using RECIPE as ingredient type",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let recipeIngredientId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      companyId = Number(companyRows[0].id);

      const [recipeResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'RECIPE')`,
        [companyId, `Recipe Main ${runId}`]
      );
      recipeItemId = Number((recipeResult as { insertId: number }).insertId);

      const [nestedRecipeResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'RECIPE')`,
        [companyId, `Recipe Child ${runId}`]
      );
      recipeIngredientId = Number((nestedRecipeResult as { insertId: number }).insertId);

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
      if (recipeIngredientId) await pool.execute(`DELETE FROM items WHERE id = ?`, [recipeIngredientId]);
      if (recipeItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [recipeItemId]);
    }
  }
);

test(
  "addIngredientToRecipe - prevents duplicate ingredients",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let ingredientItemId = 0;
    let recipeIngredientId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      companyId = Number(companyRows[0].id);

      // Create recipe and ingredient
      const [recipeResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'RECIPE')`,
        [companyId, `Test Recipe ${runId}`]
      );
      recipeItemId = Number((recipeResult as { insertId: number }).insertId);

      const [ingResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'INGREDIENT')`,
        [companyId, `Test Ingredient ${runId}`]
      );
      ingredientItemId = Number((ingResult as { insertId: number }).insertId);

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
      if (recipeIngredientId) await pool.execute(`DELETE FROM recipe_ingredients WHERE id = ?`, [recipeIngredientId]);
      if (ingredientItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [ingredientItemId]);
      if (recipeItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [recipeItemId]);
    }
  }
);

test(
  "addIngredientToRecipe - requires RECIPE type item",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let productItemId = 0;
    let ingredientItemId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      companyId = Number(companyRows[0].id);

      // Create PRODUCT item (not RECIPE)
      const [productResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'PRODUCT')`,
        [companyId, `Test Product ${runId}`]
      );
      productItemId = Number((productResult as { insertId: number }).insertId);

      // Create ingredient
      const [ingResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'INGREDIENT')`,
        [companyId, `Test Ingredient ${runId}`]
      );
      ingredientItemId = Number((ingResult as { insertId: number }).insertId);

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
      if (ingredientItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [ingredientItemId]);
      if (productItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [productItemId]);
    }
  }
);

test(
  "getRecipeIngredients - returns all ingredients for a recipe",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let ingredientItemId1 = 0;
    let ingredientItemId2 = 0;
    let recipeIngredientId1 = 0;
    let recipeIngredientId2 = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      companyId = Number(companyRows[0].id);

      // Create recipe
      const [recipeResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'RECIPE')`,
        [companyId, `Test Recipe ${runId}`]
      );
      recipeItemId = Number((recipeResult as { insertId: number }).insertId);

      // Create two ingredients
      const [ing1Result] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'INGREDIENT')`,
        [companyId, `Test Ingredient 1 ${runId}`]
      );
      ingredientItemId1 = Number((ing1Result as { insertId: number }).insertId);

      const [ing2Result] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'INGREDIENT')`,
        [companyId, `Test Ingredient 2 ${runId}`]
      );
      ingredientItemId2 = Number((ing2Result as { insertId: number }).insertId);

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
      if (recipeIngredientId1) await pool.execute(`DELETE FROM recipe_ingredients WHERE id = ?`, [recipeIngredientId1]);
      if (recipeIngredientId2) await pool.execute(`DELETE FROM recipe_ingredients WHERE id = ?`, [recipeIngredientId2]);
      if (ingredientItemId1) await pool.execute(`DELETE FROM items WHERE id = ?`, [ingredientItemId1]);
      if (ingredientItemId2) await pool.execute(`DELETE FROM items WHERE id = ?`, [ingredientItemId2]);
      if (recipeItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [recipeItemId]);
    }
  }
);

test(
  "updateRecipeIngredient - updates quantity successfully",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let ingredientItemId = 0;
    let recipeIngredientId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      companyId = Number(companyRows[0].id);

      // Create recipe and ingredient
      const [recipeResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'RECIPE')`,
        [companyId, `Test Recipe ${runId}`]
      );
      recipeItemId = Number((recipeResult as { insertId: number }).insertId);

      const [ingResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'INGREDIENT')`,
        [companyId, `Test Ingredient ${runId}`]
      );
      ingredientItemId = Number((ingResult as { insertId: number }).insertId);

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
      if (recipeIngredientId) await pool.execute(`DELETE FROM recipe_ingredients WHERE id = ?`, [recipeIngredientId]);
      if (ingredientItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [ingredientItemId]);
      if (recipeItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [recipeItemId]);
    }
  }
);

test(
  "removeIngredientFromRecipe - removes ingredient successfully",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let ingredientItemId = 0;
    let recipeIngredientId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      companyId = Number(companyRows[0].id);

      // Create recipe and ingredient
      const [recipeResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'RECIPE')`,
        [companyId, `Test Recipe ${runId}`]
      );
      recipeItemId = Number((recipeResult as { insertId: number }).insertId);

      const [ingResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'INGREDIENT')`,
        [companyId, `Test Ingredient ${runId}`]
      );
      ingredientItemId = Number((ingResult as { insertId: number }).insertId);

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
      if (recipeIngredientId) await pool.execute(`DELETE FROM recipe_ingredients WHERE id = ?`, [recipeIngredientId]);
      if (ingredientItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [ingredientItemId]);
      if (recipeItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [recipeItemId]);
    }
  }
);

test(
  "calculateRecipeCost - calculates cost breakdown correctly",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
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
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      companyId = Number(companyRows[0].id);

      const [outletRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM outlets WHERE company_id = ? ORDER BY id ASC LIMIT 1`,
        [companyId]
      );
      assert.ok(outletRows.length > 0, "Outlet fixture not found");
      outletId = Number(outletRows[0].id);

      // Create recipe
      const [recipeResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'RECIPE')`,
        [companyId, `Test Recipe ${runId}`]
      );
      recipeItemId = Number((recipeResult as { insertId: number }).insertId);

      // Create ingredients
      const [ing1Result] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'INGREDIENT')`,
        [companyId, `Test Ingredient 1 ${runId}`]
      );
      ingredientItemId1 = Number((ing1Result as { insertId: number }).insertId);

      const [ing2Result] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'INGREDIENT')`,
        [companyId, `Test Ingredient 2 ${runId}`]
      );
      ingredientItemId2 = Number((ing2Result as { insertId: number }).insertId);

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

      await pool.execute(
        `INSERT INTO item_prices (company_id, item_id, outlet_id, price)
         VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
        [
          companyId,
          ingredientItemId1,
          outletId,
          2.25,
          companyId,
          ingredientItemId2,
          outletId,
          1.5
        ]
      );

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

      await pool.execute(
        `UPDATE item_prices SET price = ? WHERE company_id = ? AND item_id = ?`,
        [3.0, companyId, ingredientItemId1]
      );

      const recalculated = await calculateRecipeCost(companyId, recipeItemId);
      assert.strictEqual(recalculated.total_ingredient_cost, 10.5);

    } finally {
      if (ingredientItemId1) await pool.execute(`DELETE FROM item_prices WHERE company_id = ? AND item_id = ?`, [companyId, ingredientItemId1]);
      if (ingredientItemId2) await pool.execute(`DELETE FROM item_prices WHERE company_id = ? AND item_id = ?`, [companyId, ingredientItemId2]);
      if (recipeIngredientId1) await pool.execute(`DELETE FROM recipe_ingredients WHERE id = ?`, [recipeIngredientId1]);
      if (recipeIngredientId2) await pool.execute(`DELETE FROM recipe_ingredients WHERE id = ?`, [recipeIngredientId2]);
      if (ingredientItemId1) await pool.execute(`DELETE FROM items WHERE id = ?`, [ingredientItemId1]);
      if (ingredientItemId2) await pool.execute(`DELETE FROM items WHERE id = ?`, [ingredientItemId2]);
      if (recipeItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [recipeItemId]);
    }
  }
);

test(
  "calculateRecipeCost - batches mixed inventory and fallback ingredient cost resolution",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let ingredientItemId1 = 0;
    let ingredientItemId2 = 0;
    let recipeIngredientId1 = 0;
    let recipeIngredientId2 = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      companyId = Number(companyRows[0].id);

      const [recipeResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'RECIPE')`,
        [companyId, `Batch Recipe ${runId}`]
      );
      recipeItemId = Number((recipeResult as { insertId: number }).insertId);

      const [ing1Result] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'INGREDIENT')`,
        [companyId, `Batch Ingredient Inv ${runId}`]
      );
      ingredientItemId1 = Number((ing1Result as { insertId: number }).insertId);

      const [ing2Result] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'INGREDIENT')`,
        [companyId, `Batch Ingredient Price ${runId}`]
      );
      ingredientItemId2 = Number((ing2Result as { insertId: number }).insertId);

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

      const [unitCostColumnRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS column_exists
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'inventory_transactions'
           AND COLUMN_NAME = 'unit_cost'`
      );
      const supportsUnitCost = Number(unitCostColumnRows[0]?.column_exists ?? 0) > 0;

      if (supportsUnitCost) {
        await pool.execute(
          `INSERT INTO inventory_transactions (company_id, product_id, transaction_type, quantity_delta, unit_cost, created_at)
           VALUES (?, ?, 6, ?, ?, NOW())`,
          [companyId, ingredientItemId1, 10, 2.5]
        );
      } else {
        await pool.execute(
          `INSERT INTO item_prices (company_id, item_id, outlet_id, price)
           VALUES (?, ?, NULL, ?)`,
          [companyId, ingredientItemId1, 2.5]
        );
      }

      await pool.execute(
        `INSERT INTO item_prices (company_id, item_id, outlet_id, price)
         VALUES (?, ?, NULL, ?)`,
        [companyId, ingredientItemId2, 4.25]
      );

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
      if (ingredientItemId1) await pool.execute(`DELETE FROM inventory_transactions WHERE company_id = ? AND product_id = ?`, [companyId, ingredientItemId1]);
      if (ingredientItemId1) await pool.execute(`DELETE FROM item_prices WHERE company_id = ? AND item_id = ?`, [companyId, ingredientItemId1]);
      if (ingredientItemId2) await pool.execute(`DELETE FROM item_prices WHERE company_id = ? AND item_id = ?`, [companyId, ingredientItemId2]);
      if (recipeIngredientId1) await pool.execute(`DELETE FROM recipe_ingredients WHERE id = ?`, [recipeIngredientId1]);
      if (recipeIngredientId2) await pool.execute(`DELETE FROM recipe_ingredients WHERE id = ?`, [recipeIngredientId2]);
      if (ingredientItemId1) await pool.execute(`DELETE FROM items WHERE id = ?`, [ingredientItemId1]);
      if (ingredientItemId2) await pool.execute(`DELETE FROM items WHERE id = ?`, [ingredientItemId2]);
      if (recipeItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [recipeItemId]);
    }
  }
);

test(
  "validateRecipeComposition - validates correctly",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let recipeItemId = 0;
    let ingredientItemId = 0;
    let serviceItemId = 0;
    let recipeIngredientId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      companyId = Number(companyRows[0].id);

      // Create recipe
      const [recipeResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'RECIPE')`,
        [companyId, `Test Recipe ${runId}`]
      );
      recipeItemId = Number((recipeResult as { insertId: number }).insertId);

      // Create ingredient
      const [ingResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'INGREDIENT')`,
        [companyId, `Test Ingredient ${runId}`]
      );
      ingredientItemId = Number((ingResult as { insertId: number }).insertId);

      // Create service (invalid type)
      const [svcResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'SERVICE')`,
        [companyId, `Test Service ${runId}`]
      );
      serviceItemId = Number((svcResult as { insertId: number }).insertId);

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
      if (recipeIngredientId) await pool.execute(`DELETE FROM recipe_ingredients WHERE id = ?`, [recipeIngredientId]);
      if (serviceItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [serviceItemId]);
      if (ingredientItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [ingredientItemId]);
      if (recipeItemId) await pool.execute(`DELETE FROM items WHERE id = ?`, [recipeItemId]);
    }
  }
);

// CRITICAL: Database pool cleanup hook
test.after(async () => {
  await closeDbPool();
});
