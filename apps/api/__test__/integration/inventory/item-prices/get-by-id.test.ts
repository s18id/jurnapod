// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /inventory/item-prices/:id

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../../helpers/env';
import { closeTestDb } from '../../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  registerFixtureCleanup
} from '../../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('inventory.item-prices.get-by-id', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/1`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid price ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/invalid`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent price', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/999999999`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(404);
  });

  it('returns price by ID', async () => {
    const ctx = await getSeedSyncContext();

    // First create an item and price via API
    const itemRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `PRICE-GETBYID-${Date.now()}`,
        name: 'Item for Price GetById',
        type: 'PRODUCT'
      })
    });
    expect(itemRes.status).toBe(201);
    const item = await itemRes.json();
    registerFixtureCleanup(`item-${item.data.id}`, async () => {});

    // Create a price via API
    const priceRes = await fetch(`${baseUrl}/api/inventory/item-prices`, {
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
    expect(priceRes.status).toBe(201);
    const created = await priceRes.json();
    registerFixtureCleanup(`price-${created.data.id}`, async () => {});

    // Get price by ID
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/${created.data.id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(created.data.id);
  });
});
