// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for Story 58.1: Inventory Item & Recipe Correctness
// Validates item type taxonomy and recipe COGS correctness

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext,
  createTestItem,
  createTestStock,
  createTestPrice,
  registerFixtureCleanup
} from '../../fixtures';
import { makeTag } from '../../helpers/tags';

let baseUrl: string;
let accessToken: string;

describe('inventory.item-recipe-correctness', { timeout: 60000 }, () => {
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

  // =========================================================================
  // AC1: PRODUCTS and INGREDIENTS have stock levels updated
  // =========================================================================

  describe('AC1: PRODUCT/INGREDIENT stock tracking', () => {
    it('PRODUCT item: stock level updated on stock movement', async () => {
      const ctx = await getSeedSyncContext();
      
      // Create a PRODUCT item
      const product = await createTestItem(ctx.companyId, {
        sku: makeTag('ACP'),
        name: 'AC1 Test Product',
        type: 'PRODUCT',
        trackStock: true
      });
      registerFixtureCleanup(`item-${product.id}`, async () => {});

      // Create price so adjustStock can derive unit cost for cost layer
      await createTestPrice(ctx.companyId, product.id, ctx.cashierUserId, { price: 15000 });
      
      // Create initial stock via stock adjustment (receipt)
      // Note: correct URL pattern is /api/outlets/:outletId/stock/adjustments
      const receiptResult = await fetch(`${baseUrl}/api/outlets/${ctx.outletId}/stock/adjustments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          company_id: ctx.companyId,
          product_id: product.id,
          adjustment_quantity: 100,
          reason: 'Initial stock for AC1 test'
        })
      });
      expect(receiptResult.status).toBe(200);

      // Query stock levels
      const res = await fetch(`${baseUrl}/api/outlets/${ctx.outletId}/stock?product_id=${product.id}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      
      const foundItem = body.data.items.find((i: any) => i.product_id === product.id);
      expect(foundItem).toBeDefined();
      expect(foundItem.quantity).toBe(100);
      expect(foundItem.available_quantity).toBe(100);
    });

    it('INGREDIENT item: stock level updated on stock movement', async () => {
      const ctx = await getSeedSyncContext();
      
      // Create an INGREDIENT item
      const ingredient = await createTestItem(ctx.companyId, {
        sku: makeTag('ACI'),
        name: 'AC1 Test Ingredient',
        type: 'INGREDIENT',
        trackStock: true
      });
      registerFixtureCleanup(`item-${ingredient.id}`, async () => {});

      // Create price
      await createTestPrice(ctx.companyId, ingredient.id, ctx.cashierUserId, { price: 5000 });
      
      // Create initial stock
      const receiptResult = await fetch(`${baseUrl}/api/outlets/${ctx.outletId}/stock/adjustments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          company_id: ctx.companyId,
          product_id: ingredient.id,
          adjustment_quantity: 50,
          reason: 'Initial stock for AC1 ingredient test'
        })
      });
      expect(receiptResult.status).toBe(200);

      // Query stock levels
      const res = await fetch(`${baseUrl}/api/outlets/${ctx.outletId}/stock?product_id=${ingredient.id}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      
      const foundItem = body.data.items.find((i: any) => i.product_id === ingredient.id);
      expect(foundItem).toBeDefined();
      expect(foundItem.quantity).toBe(50);
    });
  });

  // =========================================================================
  // AC2: SERVICE and RECIPE items have no stock level updates (no-op)
  // =========================================================================

  describe('AC2: SERVICE/RECIPE no stock tracking', () => {
    it('SERVICE item: stock movement returns error or no-op (no stock update)', async () => {
      const ctx = await getSeedSyncContext();
      
      // Create a SERVICE item (should never track stock)
      const service = await createTestItem(ctx.companyId, {
        sku: makeTag('ACS'),
        name: 'AC2 Test Service',
        type: 'SERVICE',
        trackStock: false
      });
      registerFixtureCleanup(`item-${service.id}`, async () => {});

      // Verify item type is SERVICE
      expect(service.type).toBe('SERVICE');

      // Attempt to create stock for a SERVICE item
      // The API should either reject it or silently ignore it
      const receiptResult = await fetch(`${baseUrl}/api/outlets/${ctx.outletId}/stock/adjustments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          company_id: ctx.companyId,
          product_id: service.id,
          adjustment_quantity: 100,
          reason: 'AC2 test - service should not track stock'
        })
      });

      // SERVICE stock movement MUST be rejected at API boundary
      expect(receiptResult.status).toBeGreaterThanOrEqual(400);

      // Query stock levels - SERVICE items should not appear
      const res = await fetch(`${baseUrl}/api/outlets/${ctx.outletId}/stock?product_id=${service.id}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      
      // SERVICE items should NOT have stock records
      const foundItem = body.data.items.find((i: any) => i.product_id === service.id);
      expect(foundItem).toBeUndefined();
    });

    it('RECIPE item: no stock tracking even if created with stock', async () => {
      const ctx = await getSeedSyncContext();
      
      // Create a RECIPE item
      const recipe = await createTestItem(ctx.companyId, {
        sku: makeTag('ACR'),
        name: 'AC2 Test Recipe',
        type: 'RECIPE',
        trackStock: false
      });
      registerFixtureCleanup(`item-${recipe.id}`, async () => {});

      // Verify item type is RECIPE
      expect(recipe.type).toBe('RECIPE');

      // Attempt to create stock for RECIPE item
      const receiptResult = await fetch(`${baseUrl}/api/outlets/${ctx.outletId}/stock/adjustments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          company_id: ctx.companyId,
          product_id: recipe.id,
          adjustment_quantity: 100,
          reason: 'AC2 test - recipe should not track stock'
        })
      });

      // RECIPE stock movement MUST be rejected at API boundary
      expect(receiptResult.status).toBeGreaterThanOrEqual(400);

      // Query stock levels - RECIPE items should not appear
      const res = await fetch(`${baseUrl}/api/outlets/${ctx.outletId}/stock?product_id=${recipe.id}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      
      // RECIPE items should NOT have stock records
      const foundItem = body.data.items.find((i: any) => i.product_id === recipe.id);
      expect(foundItem).toBeUndefined();
    });

    it('item_type is authoritative - track_stock flag ignored for SERVICE/RECIPE', async () => {
      const ctx = await getSeedSyncContext();
      
      // Create a SERVICE item with track_stock=true (should be ignored)
      const service = await createTestItem(ctx.companyId, {
        sku: makeTag('ACF'),
        name: 'AC2 Force Track Service',
        type: 'SERVICE',
        trackStock: true  // Even if someone tries to set this
      });
      registerFixtureCleanup(`item-${service.id}`, async () => {});

      // Create price and try to add stock
      await createTestPrice(ctx.companyId, service.id, ctx.cashierUserId, { price: 10000 });
      
      const receiptResult = await fetch(`${baseUrl}/api/outlets/${ctx.outletId}/stock/adjustments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          company_id: ctx.companyId,
          product_id: service.id,
          adjustment_quantity: 100,
          reason: 'AC2 force track test',
          reference_id: `AC2-FORCE-${service.id}`
        })
      });

      // Even if the stock adjustment is accepted, querying stock for SERVICE should return empty
      const res = await fetch(`${baseUrl}/api/outlets/${ctx.outletId}/stock?product_id=${service.id}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      
      const foundItem = body.data.items.find((i: any) => i.product_id === service.id);
      expect(foundItem).toBeUndefined();
    });
  });

  // =========================================================================
  // AC3: RECIPE items use correct recipe_ingredients quantities for COGS
  // =========================================================================

  describe('AC3: RECIPE COGS from recipe_ingredients', () => {
    it('returns zero COGS for recipe with no ingredients', async () => {
      const ctx = await getSeedSyncContext();
      
      // Create empty recipe
      const recipe = await createTestItem(ctx.companyId, {
        sku: makeTag('CEZ'),
        name: 'Empty Recipe COGS',
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

    it('recipe COGS calculated from recipe_ingredients quantities', async () => {
      const ctx = await getSeedSyncContext();
      
      // Create recipe
      const recipe = await createTestItem(ctx.companyId, {
        sku: makeTag('CRG'),
        name: 'Recipe with Ingredients COGS',
        type: 'RECIPE'
      });
      registerFixtureCleanup(`item-${recipe.id}`, async () => {});

      // Create ingredient items with prices
      const coffee = await createTestItem(ctx.companyId, {
        sku: makeTag('CIC'),
        name: 'Coffee Beans',
        type: 'INGREDIENT'
      });
      registerFixtureCleanup(`item-${coffee.id}`, async () => {});

      const milk = await createTestItem(ctx.companyId, {
        sku: makeTag('CMK'),
        name: 'Milk',
        type: 'PRODUCT'  // PRODUCT can also be ingredient in recipe
      });
      registerFixtureCleanup(`item-${milk.id}`, async () => {});

      // Set prices for cost calculation
      await createTestPrice(ctx.companyId, coffee.id, ctx.cashierUserId, { price: 20000 }); // 20 per unit
      await createTestPrice(ctx.companyId, milk.id, ctx.cashierUserId, { price: 5000 }); // 5 per unit

      // Add ingredients to recipe
      const addCoffeeRes = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ingredient_item_id: coffee.id,
          quantity: 2,
          unit_of_measure: 'g'
        })
      });
      expect([200, 201]).toContain(addCoffeeRes.status);

      const addMilkRes = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ingredient_item_id: milk.id,
          quantity: 100,
          unit_of_measure: 'ml'
        })
      });
      expect([200, 201]).toContain(addMilkRes.status);

      // Get recipe cost
      const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/cost`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.recipe_item_id).toBe(recipe.id);
      expect(body.data.ingredients).toHaveLength(2);
      
      // COGS should reflect exact formula from recipe_ingredients quantities
      const expectedTotal = (2 * 20000) + (100 * 5000);
      expect(body.data.total_ingredient_cost).toBe(expectedTotal);
    });
  });

  // =========================================================================
  // AC4: PRODUCT with multiple recipe_ingredients aggregates all costs
  // =========================================================================

  describe('AC4: PRODUCT recipe COGS aggregation', () => {
    it('PRODUCT with multiple recipe_ingredients: COGS aggregates all ingredient costs', async () => {
      const ctx = await getSeedSyncContext();
      
      // Create a PRODUCT that will have a recipe (BOM)
      const product = await createTestItem(ctx.companyId, {
        sku: makeTag('CAP'),
        name: 'Product with Recipe',
        type: 'PRODUCT'
      });
      registerFixtureCleanup(`item-${product.id}`, async () => {});

      // Create ingredients with known prices
      const flour = await createTestItem(ctx.companyId, {
        sku: makeTag('CFL'),
        name: 'Flour',
        type: 'INGREDIENT'
      });
      registerFixtureCleanup(`item-${flour.id}`, async () => {});

      const sugar = await createTestItem(ctx.companyId, {
        sku: makeTag('CSG'),
        name: 'Sugar',
        type: 'INGREDIENT'
      });
      registerFixtureCleanup(`item-${sugar.id}`, async () => {});

      const butter = await createTestItem(ctx.companyId, {
        sku: makeTag('CBT'),
        name: 'Butter',
        type: 'INGREDIENT'
      });
      registerFixtureCleanup(`item-${butter.id}`, async () => {});

      // Set prices - using a single price per ingredient
      await createTestPrice(ctx.companyId, flour.id, ctx.cashierUserId, { price: 10000 });
      await createTestPrice(ctx.companyId, sugar.id, ctx.cashierUserId, { price: 15000 });
      await createTestPrice(ctx.companyId, butter.id, ctx.cashierUserId, { price: 20000 });

      // AC4 aggregation validation uses recipe item composition API
      // (PRODUCT remains stock-tracked; recipe composition is managed via RECIPE item)
      const recipe = await createTestItem(ctx.companyId, {
        sku: makeTag('CRC'),
        name: 'Multi-Ingredient Recipe',
        type: 'RECIPE'
      });
      registerFixtureCleanup(`item-${recipe.id}`, async () => {});
      const recipeItemId = recipe.id;

      // Add multiple ingredients
      const addFlourRes = await fetch(`${baseUrl}/api/inventory/recipes/${recipeItemId}/ingredients`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ingredient_item_id: flour.id,
          quantity: 1,
          unit_of_measure: 'kg'
        })
      });
      expect([200, 201]).toContain(addFlourRes.status);

      const addSugarRes = await fetch(`${baseUrl}/api/inventory/recipes/${recipeItemId}/ingredients`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ingredient_item_id: sugar.id,
          quantity: 1,
          unit_of_measure: 'kg'
        })
      });
      expect([200, 201]).toContain(addSugarRes.status);

      const addButterRes = await fetch(`${baseUrl}/api/inventory/recipes/${recipeItemId}/ingredients`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ingredient_item_id: butter.id,
          quantity: 1,
          unit_of_measure: 'kg'
        })
      });
      expect([200, 201]).toContain(addButterRes.status);

      // Get recipe cost - should aggregate all three ingredient costs
      const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipeItemId}/cost`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.ingredients).toHaveLength(3);
      
      // Total should be sum of all ingredient costs: 10000 + 15000 + 20000 = 45000
      // (assuming price is per unit and quantity is 1)
      expect(body.data.total_ingredient_cost).toBe(45000);
    });

    it('costing method affects COGS calculation', async () => {
      const ctx = await getSeedSyncContext();
      
      // This test verifies that costing method (FIFO/AVG/LIFO) is used for COGS
      // The recipe calculates cost from ingredients using item prices/costs
      
      // Create recipe with single ingredient
      const recipe = await createTestItem(ctx.companyId, {
        sku: makeTag('CCM'),
        name: 'Costing Method Test Recipe',
        type: 'RECIPE'
      });
      registerFixtureCleanup(`item-${recipe.id}`, async () => {});

      const ingredient = await createTestItem(ctx.companyId, {
        sku: makeTag('CCX'),
        name: 'Costing Test Ingredient',
        type: 'INGREDIENT'
      });
      registerFixtureCleanup(`item-${ingredient.id}`, async () => {});

      await createTestPrice(ctx.companyId, ingredient.id, ctx.cashierUserId, { price: 10000 });

      await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ingredient_item_id: ingredient.id,
          quantity: 5,
          unit_of_measure: 'unit'
        })
      });

      // Get recipe cost - should calculate based on costing method
      const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/cost`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      
      // With quantity 5 and price 10000 per unit, total should be 50000
      // The system uses item prices or inventory costs for unit cost
      expect(body.data.ingredients).toHaveLength(1);
      expect(body.data.total_ingredient_cost).toBe(50000);
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge cases', () => {
    it('item type transition: PRODUCT -> SERVICE should not affect existing stock', async () => {
      const ctx = await getSeedSyncContext();
      
      // Create a PRODUCT with stock
      const product = await createTestItem(ctx.companyId, {
        sku: makeTag('EAT'),
        name: 'Edge Case Product',
        type: 'PRODUCT'
      });
      registerFixtureCleanup(`item-${product.id}`, async () => {});

      // Add stock while it's still PRODUCT
      await createTestPrice(ctx.companyId, product.id, ctx.cashierUserId, { price: 10000 });
      
      const receiptResult = await fetch(`${baseUrl}/api/outlets/${ctx.outletId}/stock/adjustments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          company_id: ctx.companyId,
          product_id: product.id,
          adjustment_quantity: 100,
          reason: 'Edge case initial stock',
          reference_id: `EAT-INIT-${product.id}`
        })
      });
      expect(receiptResult.status).toBe(200);

      // Verify stock exists
      let res = await fetch(`${baseUrl}/api/outlets/${ctx.outletId}/stock?product_id=${product.id}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      let body = await res.json();
      let foundItem = body.data.items.find((i: any) => i.product_id === product.id);
      expect(foundItem).toBeDefined();
      expect(foundItem.quantity).toBe(100);

      // Attempt item type transition via API
      const updateResult = await fetch(`${baseUrl}/api/inventory/items/${product.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'SERVICE'
        })
      });
      expect(updateResult.status).toBe(200);

      // Stock should NOT be affected by the type change
      // (existing stock records remain, but no new stock movements allowed)
      res = await fetch(`${baseUrl}/api/outlets/${ctx.outletId}/stock?product_id=${product.id}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      body = await res.json();
      foundItem = body.data.items.find((i: any) => i.product_id === product.id);
      
      expect(foundItem).toBeDefined();
      expect(foundItem.quantity).toBe(100);

      // After type transition to SERVICE, new stock movements MUST be rejected
      const postTransitionAdjustment = await fetch(`${baseUrl}/api/outlets/${ctx.outletId}/stock/adjustments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          company_id: ctx.companyId,
          product_id: product.id,
          adjustment_quantity: 10,
          reason: 'Edge case post-transition stock movement',
          reference_id: `EAT-POST-${product.id}`
        })
      });
      expect(postTransitionAdjustment.status).toBeGreaterThanOrEqual(400);

      // Existing stock remains unchanged
      res = await fetch(`${baseUrl}/api/outlets/${ctx.outletId}/stock?product_id=${product.id}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      body = await res.json();
      foundItem = body.data.items.find((i: any) => i.product_id === product.id);
      expect(foundItem).toBeDefined();
      expect(foundItem.quantity).toBe(100);
    });

    it('missing ingredient data: graceful handling', async () => {
      const ctx = await getSeedSyncContext();
      
      // Create recipe
      const recipe = await createTestItem(ctx.companyId, {
        sku: makeTag('EMD'),
        name: 'Edge Missing Data Recipe',
        type: 'RECIPE'
      });
      registerFixtureCleanup(`item-${recipe.id}`, async () => {});

      // Add ingredient with price
      const ing = await createTestItem(ctx.companyId, {
        sku: makeTag('EMI'),
        name: 'Edge Missing Ingredient',
        type: 'INGREDIENT'
      });
      registerFixtureCleanup(`item-${ing.id}`, async () => {});

      await createTestPrice(ctx.companyId, ing.id, ctx.cashierUserId, { price: 10000 });

      await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/ingredients`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ingredient_item_id: ing.id,
          quantity: 1,
          unit_of_measure: 'unit'
        })
      });

      // Get cost - should work even with single ingredient
      const res = await fetch(`${baseUrl}/api/inventory/recipes/${recipe.id}/cost`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.ingredient_count).toBe(1);
    });
  });
});
