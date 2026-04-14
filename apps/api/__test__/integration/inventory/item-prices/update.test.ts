// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for PATCH /inventory/item-prices/:id

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../../helpers/env';
import { closeTestDb } from '../../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext,
  registerFixtureCleanup
} from '../../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('inventory.item-prices.update', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: 200 })
    });
    expect(res.status).toBe(401);
  });

  it('updates item price', async () => {
    const ctx = await getSeedSyncContext();

    // Create item and price via API
    const itemRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `PRICE-UPDATE-${Date.now()}`,
        name: 'Item for Price Update',
        type: 'PRODUCT'
      })
    });
    expect(itemRes.status).toBe(201);
    const item = await itemRes.json();
    registerFixtureCleanup(`item-${item.data.id}`, async () => {});

    // Create a price
    const createRes = await fetch(`${baseUrl}/api/inventory/item-prices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.data.id,
        outlet_id: ctx.outletId,
        price: 10000,
        is_active: true
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`price-${created.data.id}`, async () => {});

    // Update the price
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/${created.data.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ price: 20000 })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.price).toBe(20000);
  });

  it('updates is_active status', async () => {
    const ctx = await getSeedSyncContext();

    // Create item and price via API
    const itemRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `PRICE-ACTIVE-UPD-${Date.now()}`,
        name: 'Item for Active Update',
        type: 'PRODUCT'
      })
    });
    expect(itemRes.status).toBe(201);
    const item = await itemRes.json();
    registerFixtureCleanup(`item-${item.data.id}`, async () => {});

    // Create an active price
    const createRes = await fetch(`${baseUrl}/api/inventory/item-prices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.data.id,
        outlet_id: ctx.outletId,
        price: 10000,
        is_active: true
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`price-${created.data.id}`, async () => {});

    // Update to inactive
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/${created.data.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ is_active: false })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.is_active).toBe(false);
  });

  it('returns 404 for non-existent price', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/999999999`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ price: 200 })
    });
    expect(res.status).toBe(404);
  });

  it('validates outlet access for outlet-specific prices', async () => {
    const ctx = await getSeedSyncContext();

    // Create item and price via API
    const itemRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `PRICE-OUTLET-UPD-${Date.now()}`,
        name: 'Item for Outlet Access Test',
        type: 'PRODUCT'
      })
    });
    expect(itemRes.status).toBe(201);
    const item = await itemRes.json();
    registerFixtureCleanup(`item-${item.data.id}`, async () => {});

    // Create a price
    const createRes = await fetch(`${baseUrl}/api/inventory/item-prices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.data.id,
        outlet_id: ctx.outletId,
        price: 10000,
        is_active: true
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`price-${created.data.id}`, async () => {});

    // Update the price should succeed for the same outlet
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/${created.data.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ price: 25000 })
    });
    expect(res.status).toBe(200);
  });
});
