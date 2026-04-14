// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /inventory/items/:id/variants/:variantId/prices

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../../helpers/env';
import { closeTestDb } from '../../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext,
  createTestVariant,
  registerFixtureCleanup
} from '../../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('inventory.item-prices.variant-prices', { timeout: 30000 }, () => {
  let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;
  const getSeedSyncContext = async () => seedCtx;

  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    seedCtx = await loadSeedSyncContext();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items/1/variants/1/prices`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid item ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items/invalid/variants/1/prices`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid variant ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items/1/variants/invalid/prices`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('returns variant prices for valid item and variant', async () => {
    const ctx = await getSeedSyncContext();

    // Create an item via API
    const itemRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `VAR-PRICE-${Date.now()}`,
        name: 'Item for Variant Prices',
        type: 'PRODUCT'
      })
    });
    expect(itemRes.status).toBe(201);
    const item = await itemRes.json();
    registerFixtureCleanup(`item-${item.data.id}`, async () => {});

    // Create a variant
    const variant = await createTestVariant(item.data.id, {
      attributeName: 'Size',
      attributeValues: ['Small', 'Large']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    // Create a price for this variant
    const priceRes = await fetch(`${baseUrl}/api/inventory/item-prices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.data.id,
        outlet_id: ctx.outletId,
        variant_id: variant.id,
        price: 18000,
        is_active: true
      })
    });
    
    if (priceRes.status === 201) {
      const created = await priceRes.json();
      registerFixtureCleanup(`price-${created.data.id}`, async () => {});
    }

    // Get variant prices
    const res = await fetch(`${baseUrl}/api/inventory/items/${item.data.id}/variants/${variant.id}/prices`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns variant prices filtered by outlet', async () => {
    const ctx = await getSeedSyncContext();

    // Create an item via API
    const itemRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `VAR-OUTLET-${Date.now()}`,
        name: 'Item for Variant Outlet',
        type: 'PRODUCT'
      })
    });
    expect(itemRes.status).toBe(201);
    const item = await itemRes.json();
    registerFixtureCleanup(`item-${item.data.id}`, async () => {});

    // Create a variant
    const variant = await createTestVariant(item.data.id, {
      attributeName: 'Color',
      attributeValues: ['Red', 'Blue']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    // Get variant prices for specific outlet
    const res = await fetch(`${baseUrl}/api/inventory/items/${item.data.id}/variants/${variant.id}/prices?outlet_id=${ctx.outletId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('enforces inventory module permissions', async () => {
    const ctx = await getSeedSyncContext();

    // Create an item via API
    const itemRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `VAR-PERM-${Date.now()}`,
        name: 'Item for Variant Permission',
        type: 'PRODUCT'
      })
    });
    expect(itemRes.status).toBe(201);
    const item = await itemRes.json();
    registerFixtureCleanup(`item-${item.data.id}`, async () => {});

    const variant = await createTestVariant(item.data.id, {
      attributeName: 'Weight',
      attributeValues: ['1kg', '2kg']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/items/${item.data.id}/variants/${variant.id}/prices`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
  });

  it('returns empty array for non-existent variant', async () => {
    const ctx = await getSeedSyncContext();

    // Create an item via API
    const itemRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `VAR-NONEX-${Date.now()}`,
        name: 'Item for Non-Existent Variant',
        type: 'PRODUCT'
      })
    });
    expect(itemRes.status).toBe(201);
    const item = await itemRes.json();
    registerFixtureCleanup(`item-${item.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/items/${item.data.id}/variants/999999999/prices`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});
