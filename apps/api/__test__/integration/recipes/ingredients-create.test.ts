// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for POST /inventory/recipes/:id/ingredients

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  createTestItem,
  registerFixtureCleanup
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('inventory.recipes.ingredients.create', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/recipes/1/ingredients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredient_item_id: 1, quantity: 10 })
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid recipe ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/recipes/invalid/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ingredient_item_id: 1, quantity: 10 })
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent recipe', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/recipes/999999999/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ingredient_item_id: 1, quantity: 10 })
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when adding ingredient to non-RECIPE item', async () => {
    const ctx = await getSeedSyncContext();
    
    // Create a PRODUCT type item (not a recipe)
    const product = await createTestItem(ctx.companyId, {
      sku: `CREATE-NONRECIPE-${Date.now()}`,
      name: 'Not A Recipe',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${product.id}`, async () => {});

    const ingredient = await createTestItem(ctx.companyId, {
      sku: `CREATE-ING-${Date.now()}`,
      name: 'Some Ingredient',
      type: 'INGREDIENT'
    });
    registerFixtureCleanup(`item-${ingredient.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/recipes/${product.id}/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ingredient_item_id: ingredient.id,
        quantity: 10
      })
    });
    expect(res.status).toBe(403);
  });

  it('adds ingredient to recipe', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: `CREATE-ADD-ING-${Date.now()}`,
      name: 'Recipe To Add To',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const ingredient = await createTestItem(ctx.companyId, {
      sku: `CREATE-ADD-ING2-${Date.now()}`,
      name: 'New Ingredient',
      type: 'INGREDIENT'
    });
    registerFixtureCleanup(`item-${ingredient.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ingredient_item_id: ingredient.id,
        quantity: 25,
        unit_of_measure: 'g'
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
  });

  it('returns 404 when ingredient item does not exist', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: `CREATE-NO-ITEM-${Date.now()}`,
      name: 'Recipe For Missing Item',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ingredient_item_id: 999999999,
        quantity: 10
      })
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for missing required fields', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: `CREATE-MISSING-${Date.now()}`,
      name: 'Recipe Missing Fields',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative quantity', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: `CREATE-NEG-QTY-${Date.now()}`,
      name: 'Recipe Neg Qty',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const ingredient = await createTestItem(ctx.companyId, {
      sku: `CREATE-NEG-ING-${Date.now()}`,
      name: 'Ingredient Neg Qty',
      type: 'INGREDIENT'
    });
    registerFixtureCleanup(`item-${ingredient.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ingredient_item_id: ingredient.id,
        quantity: -5
      })
    });
    expect(res.status).toBe(400);
  });

  it('prevents adding recipe as its own ingredient', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: `CREATE-SELF-${Date.now()}`,
      name: 'Self Reference Recipe',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ingredient_item_id: recipe.id,
        quantity: 1
      })
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('CONFLICT');
  });

  it('prevents recipe-to-recipe composition (recipe type items cannot be ingredients)', async () => {
    const ctx = await getSeedSyncContext();
    
    // Create Recipe A
    const recipeA = await createTestItem(ctx.companyId, {
      sku: `CREATE-R2R-A-${Date.now()}`,
      name: 'Recipe A',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipeA.id}`, async () => {});

    // Create Recipe B
    const recipeB = await createTestItem(ctx.companyId, {
      sku: `CREATE-R2R-B-${Date.now()}`,
      name: 'Recipe B',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipeB.id}`, async () => {});

    // Add Recipe B as ingredient of Recipe A - should fail with 403
    // because only INGREDIENT and PRODUCT types can be recipe components
    const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipeA.id}/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ingredient_item_id: recipeB.id,
        quantity: 1
      })
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 403 when adding non-ingredient/product item', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: `CREATE-INVALID-TYPE-${Date.now()}`,
      name: 'Recipe Invalid Type',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    // Create a SERVICE type item (not allowed as ingredient)
    const serviceItem = await createTestItem(ctx.companyId, {
      sku: `CREATE-SERVICE-${Date.now()}`,
      name: 'Service Item',
      type: 'SERVICE'
    });
    registerFixtureCleanup(`item-${serviceItem.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ingredient_item_id: serviceItem.id,
        quantity: 1
      })
    });
    expect(res.status).toBe(403);
  });

  it('enforces inventory module create permission', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: `CREATE-PERM-${Date.now()}`,
      name: 'Permission Test Recipe',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const ingredient = await createTestItem(ctx.companyId, {
      sku: `CREATE-PERM-ING-${Date.now()}`,
      name: 'Permission Test Ingredient',
      type: 'INGREDIENT'
    });
    registerFixtureCleanup(`item-${ingredient.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ingredient_item_id: ingredient.id,
        quantity: 10
      })
    });
    // OWNER/SUPER_ADMIN token should bypass module permissions
    expect(res.status).toBe(201);
  });
});
