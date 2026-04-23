// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for DELETE /inventory/recipes/ingredients/:id

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

describe('inventory.recipes.ingredients.delete', { timeout: 30000 }, () => {
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
      method: 'DELETE'
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid ingredient ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/recipes/ingredients/invalid`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent ingredient', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/recipes/ingredients/999999999`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(404);
  });

  it('deletes ingredient from recipe', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: makeTag('DR'),
      name: 'Recipe To Delete From',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const ingredient = await createTestItem(ctx.companyId, {
      sku: makeTag('DI'),
      name: 'Ingredient To Delete',
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

    // Delete ingredient
    const res = await fetch(`${baseUrl}/api/inventory/recipes/ingredients/${ingredientId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.success).toBe(true);

    // Verify ingredient is gone
    const listRes = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const listBody = await listRes.json();
    expect(listBody.data.length).toBe(0);
  });

  it('enforces inventory module delete permission', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: makeTag('DP'),
      name: 'Permission Test Recipe',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const ingredient = await createTestItem(ctx.companyId, {
      sku: makeTag('DI'),
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

    // Delete - OWNER/SUPER_ADMIN token should bypass module permissions
    const res = await fetch(`${baseUrl}/api/inventory/recipes/ingredients/${ingredientId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
  });
});
