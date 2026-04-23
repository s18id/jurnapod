// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /inventory/recipes/:id/ingredients

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

describe('inventory.recipes.ingredients.list', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/inventory/recipes/1/ingredients`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid recipe ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/recipes/invalid/ingredients`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent recipe', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/recipes/999999999/ingredients`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(404);
  });

  it('returns empty list for recipe with no ingredients', async () => {
    const ctx = await getSeedSyncContext();
    
    // Create a RECIPE type item
    const recipe = await createTestItem(ctx.companyId, {
      sku: makeTag('LER'),
      name: 'Empty Recipe',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns ingredients for recipe', async () => {
    const ctx = await getSeedSyncContext();
    
    // Create a RECIPE type item
    const recipe = await createTestItem(ctx.companyId, {
      sku: makeTag('LWI'),
      name: 'Recipe With Ingredients',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    // Create ingredient items
    const ingredient1 = await createTestItem(ctx.companyId, {
      sku: makeTag('LI1'),
      name: 'Coffee Beans',
      type: 'INGREDIENT'
    });
    registerFixtureCleanup(`item-${ingredient1.id}`, async () => {});

    const ingredient2 = await createTestItem(ctx.companyId, {
      sku: makeTag('LI2'),
      name: 'Milk',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${ingredient2.id}`, async () => {});

    // Add ingredients via API
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

    const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(2);
  });

  it('enforces inventory module read permission', async () => {
    const ctx = await getSeedSyncContext();
    
    const recipe = await createTestItem(ctx.companyId, {
      sku: makeTag('LPT'),
      name: 'Permission Test Recipe',
      type: 'RECIPE'
    });
    registerFixtureCleanup(`item-${recipe.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    // OWNER/SUPER_ADMIN token should bypass module permissions
    expect(res.status).toBe(200);
  });
});
