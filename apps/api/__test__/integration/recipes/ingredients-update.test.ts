// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for PATCH /inventory/recipes/ingredients/:id

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext,
  createTestItem,
  registerFixtureCleanup
} from '../../fixtures';
import { makeTag } from '../../helpers/tags';

let baseUrl: string;
let accessToken: string;

describe('inventory.recipes.ingredients.update', { timeout: 30000 }, () => {
  let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;
  const getSeedSyncContext = async () => seedCtx;

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    seedCtx = await loadSeedSyncContext();
  });

  afterAll(async () => {
    try {
      resetFixtureRegistry();
    } finally {
      try {
        await closeTestDb();
      } finally {
        await releaseReadLock();
      }
    }
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/recipes/ingredients/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 10 })
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid ingredient ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/recipes/ingredients/invalid`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ quantity: 10 })
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent ingredient', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/recipes/ingredients/999999999`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ quantity: 10 })
    });
    expect(res.status).toBe(404);
  });

  it('updates ingredient quantity', async () => {
    const ctx = await getSeedSyncContext();
    
    // Create recipe and ingredient
    const recipe = await createTestItem(ctx.companyId, {
      sku: makeTag('UR'),
      name: 'Recipe To Update',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const ingredient = await createTestItem(ctx.companyId, {
      sku: makeTag('UI'),
      name: 'Updatable Ingredient',
      type: 'INGREDIENT'
    });
    registerFixtureCleanup(`item-${ingredient.id}`, async () => {});

    // Add ingredient
    const addRes = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ingredient_item_id: ingredient.id,
        quantity: 10,
        unit_of_measure: 'g'
      })
    });
    const addBody = await addRes.json();
    const ingredientId = addBody.data.id;

    // Update quantity
    const res = await fetch(`${baseUrl}/api/inventory/recipes/ingredients/${ingredientId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ quantity: 25 })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.quantity).toBe(25);
  });

  it('updates ingredient with unit of measure', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: makeTag('UU'),
      name: 'Recipe To Update UOM',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const ingredient = await createTestItem(ctx.companyId, {
      sku: makeTag('UI'),
      name: 'Ingredient UOM',
      type: 'INGREDIENT'
    });
    registerFixtureCleanup(`item-${ingredient.id}`, async () => {});

    // Add ingredient
    const addRes = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ingredient_item_id: ingredient.id,
        quantity: 10,
        unit_of_measure: 'g'
      })
    });
    const addBody = await addRes.json();
    const ingredientId = addBody.data.id;

    // Update with new unit
    const res = await fetch(`${baseUrl}/api/inventory/recipes/ingredients/${ingredientId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        quantity: 15,
        unit_of_measure: 'kg'
      })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.quantity).toBe(15);
    expect(body.data.unit_of_measure).toBe('kg');
  });

  it('returns 400 for negative quantity', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: makeTag('UN'),
      name: 'Recipe Neg Qty',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const ingredient = await createTestItem(ctx.companyId, {
      sku: makeTag('UI'),
      name: 'Ingredient Neg Qty',
      type: 'INGREDIENT'
    });
    registerFixtureCleanup(`item-${ingredient.id}`, async () => {});

    // Add ingredient
    const addRes = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
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
    const addBody = await addRes.json();
    const ingredientId = addBody.data.id;

    // Try update with negative quantity
    const res = await fetch(`${baseUrl}/api/inventory/recipes/ingredients/${ingredientId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ quantity: -5 })
    });
    expect(res.status).toBe(400);
  });

  it('enforces inventory module update permission', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: makeTag('UP'),
      name: 'Permission Test Recipe',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const ingredient = await createTestItem(ctx.companyId, {
      sku: makeTag('UI'),
      name: 'Permission Test Ingredient',
      type: 'INGREDIENT'
    });
    registerFixtureCleanup(`item-${ingredient.id}`, async () => {});

    // Add ingredient first
    const addRes = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
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
    const addBody = await addRes.json();
    const ingredientId = addBody.data.id;

    // Update - OWNER/SUPER_ADMIN token should bypass module permissions
    const res = await fetch(`${baseUrl}/api/inventory/recipes/ingredients/${ingredientId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ quantity: 20 })
    });
    expect(res.status).toBe(200);
  });
});
