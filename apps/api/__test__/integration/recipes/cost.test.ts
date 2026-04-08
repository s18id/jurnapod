// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /inventory/recipes/:id/cost

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

describe('inventory.recipes.cost', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/recipes/1/cost`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid recipe ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/recipes/invalid/cost`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent recipe', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/recipes/999999999/cost`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when recipe is not a RECIPE type', async () => {
    const ctx = await getSeedSyncContext();
    
    // Create a PRODUCT type item (not a recipe)
    const product = await createTestItem(ctx.companyId, {
      sku: `COST-NON-RECIPE-${Date.now()}`,
      name: 'Not A Recipe',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${product.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/recipes/${product.id}/cost`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(404);
  });

  it('returns zero cost for recipe with no ingredients', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: `COST-EMPTY-${Date.now()}`,
      name: 'Empty Recipe',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/cost`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total_ingredient_cost).toBe(0);
    expect(body.data.ingredients).toEqual([]);
  });

  it('returns cost calculation for recipe with ingredients', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: `COST-WITH-ING-${Date.now()}`,
      name: 'Recipe With Ingredients',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    // Create ingredient items
    const ingredient1 = await createTestItem(ctx.companyId, {
      sku: `COST-ING1-${Date.now()}`,
      name: 'Coffee Beans',
      type: 'INGREDIENT'
    });
    registerFixtureCleanup(`item-${ingredient1.id}`, async () => {});

    const ingredient2 = await createTestItem(ctx.companyId, {
      sku: `COST-ING2-${Date.now()}`,
      name: 'Milk',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${ingredient2.id}`, async () => {});

    // Add ingredients
    await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ingredient_item_id: ingredient1.id,
        quantity: 20,
        unit_of_measure: 'g'
      })
    });

    await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ingredient_item_id: ingredient2.id,
        quantity: 100,
        unit_of_measure: 'ml'
      })
    });

    const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/cost`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.recipe_item_id).toBe(recipe.id);
    expect(body.data.ingredients).toBeDefined();
    expect(Array.isArray(body.data.ingredients)).toBe(true);
    expect(body.data.total_ingredient_cost).toBeDefined();
  });

  it('enforces inventory module read permission', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: `COST-PERM-${Date.now()}`,
      name: 'Permission Test Recipe',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/cost`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    // OWNER/SUPER_ADMIN token should bypass module permissions
    expect(res.status).toBe(200);
  });
});
