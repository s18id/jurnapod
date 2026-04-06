// @ts-nocheck
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import {test, describe, beforeAll, afterAll} from 'vitest';
import {
  createIntegrationTestContext,
  loginOwner,
  readEnv,
  TEST_TIMEOUT_MS
} from "../../tests/integration/integration-harness.js";

const testContext = createIntegrationTestContext();
let baseUrl = "";
let db;

beforeAll(async () => {
  await testContext.start();
  baseUrl = testContext.baseUrl;
  db = testContext.db;
});

afterAll(async () => {
  await testContext.stop();
});

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const payload = await response.json();
  return { response, payload };
}

test(
  "@slow recipe composition API integration: CRUD and cost endpoint",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    const createdItemIds = [];
    const createdRecipeIngredientIds = [];
    const createdPriceItemIds = new Set();

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);

    let token = "";

    try {
      token = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

      const authHeaders = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      };

      const createRecipe = await requestJson("/api/inventory/items", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          name: `Recipe API ${runId}`,
          sku: `RECIPE-${runId}`.toUpperCase(),
          type: "RECIPE"
        })
      });
      assert.equal(createRecipe.response.status, 201);
      const recipeId = Number(createRecipe.payload.data.id);
      createdItemIds.push(recipeId);

      const createIngredientA = await requestJson("/api/inventory/items", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          name: `Ingredient A ${runId}`,
          sku: `INGA-${runId}`.toUpperCase(),
          type: "INGREDIENT"
        })
      });
      assert.equal(createIngredientA.response.status, 201);
      const ingredientAId = Number(createIngredientA.payload.data.id);
      createdItemIds.push(ingredientAId);

      const createIngredientB = await requestJson("/api/inventory/items", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          name: `Ingredient B ${runId}`,
          sku: `INGB-${runId}`.toUpperCase(),
          type: "INGREDIENT"
        })
      });
      assert.equal(createIngredientB.response.status, 201);
      const ingredientBId = Number(createIngredientB.payload.data.id);
      createdItemIds.push(ingredientBId);

      const createPriceA = await requestJson("/api/inventory/item-prices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          item_id: ingredientAId,
          outlet_id: null,
          price: 2.5
        })
      });
      assert.equal(createPriceA.response.status, 201);
      createdPriceItemIds.add(ingredientAId);

      const createPriceB = await requestJson("/api/inventory/item-prices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          item_id: ingredientBId,
          outlet_id: null,
          price: 1.2
        })
      });
      assert.equal(createPriceB.response.status, 201);
      createdPriceItemIds.add(ingredientBId);

      const addIngredientA = await requestJson(`/api/inventory/recipes/${recipeId}/ingredients`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          ingredient_item_id: ingredientAId,
          quantity: 2,
          unit_of_measure: "unit"
        })
      });
      assert.equal(addIngredientA.response.status, 201);
      const recipeIngredientAId = Number(addIngredientA.payload.data.id);
      createdRecipeIngredientIds.push(recipeIngredientAId);

      const addIngredientB = await requestJson(`/api/inventory/recipes/${recipeId}/ingredients`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          ingredient_item_id: ingredientBId,
          quantity: 1,
          unit_of_measure: "unit"
        })
      });
      assert.equal(addIngredientB.response.status, 201);
      const recipeIngredientBId = Number(addIngredientB.payload.data.id);
      createdRecipeIngredientIds.push(recipeIngredientBId);

      const listIngredients = await requestJson(`/api/inventory/recipes/${recipeId}/ingredients`, {
        headers: {
          authorization: `Bearer ${token}`
        }
      });
      assert.equal(listIngredients.response.status, 200);
      assert.equal(listIngredients.payload.success, true);
      assert.equal(listIngredients.payload.data.length, 2);

      const updateIngredientA = await requestJson(`/api/inventory/recipes/ingredients/${recipeIngredientAId}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          quantity: 3
        })
      });
      assert.equal(updateIngredientA.response.status, 200);
      assert.equal(updateIngredientA.payload.data.quantity, 3);

      const costResponse = await requestJson(`/api/inventory/recipes/${recipeId}/cost`, {
        headers: {
          authorization: `Bearer ${token}`
        }
      });
      assert.equal(costResponse.response.status, 200);
      assert.equal(costResponse.payload.success, true);
      assert.equal(costResponse.payload.data.ingredient_count, 2);
      assert.equal(costResponse.payload.data.total_ingredient_cost, 8.7);

      const deleteIngredientB = await requestJson(`/api/inventory/recipes/ingredients/${recipeIngredientBId}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${token}`
        }
      });
      assert.equal(deleteIngredientB.response.status, 200);

      const listAfterDelete = await requestJson(`/api/inventory/recipes/${recipeId}/ingredients`, {
        headers: {
          authorization: `Bearer ${token}`
        }
      });
      assert.equal(listAfterDelete.response.status, 200);
      assert.equal(listAfterDelete.payload.data.length, 1);

      const invalidRecipeParam = await requestJson("/api/inventory/recipes/not-a-number/ingredients", {
        headers: {
          authorization: `Bearer ${token}`
        }
      });
      assert.equal(invalidRecipeParam.response.status, 400);
      assert.equal(invalidRecipeParam.payload.success, false);
      assert.equal(invalidRecipeParam.payload.error.code, "INVALID_REQUEST");
    } finally {
      if (createdRecipeIngredientIds.length > 0) {
        await db.execute(
          `DELETE FROM recipe_ingredients WHERE id IN (${createdRecipeIngredientIds.map(() => "?").join(",")})`,
          createdRecipeIngredientIds
        );
      }

      for (const itemId of createdPriceItemIds) {
        await db.execute("DELETE FROM item_prices WHERE item_id = ?", [itemId]);
      }

      if (createdItemIds.length > 0) {
        await db.execute(
          `DELETE FROM items WHERE id IN (${createdItemIds.map(() => "?").join(",")})`,
          createdItemIds
        );
      }
    }
  }
);
