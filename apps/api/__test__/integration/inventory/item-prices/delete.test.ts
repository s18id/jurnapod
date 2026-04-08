// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for DELETE /inventory/item-prices/:id

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

describe('inventory.item-prices.delete', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/1`, {
      method: 'DELETE'
    });
    expect(res.status).toBe(401);
  });

  it('deletes existing item price', async () => {
    const ctx = await getSeedSyncContext();

    // Create item and price via API
    const itemRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `PRICE-DELETE-${Date.now()}`,
        name: 'Item for Price Delete',
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

    // Delete the price
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/${created.data.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });

  it('returns 404 for non-existent price', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/999999999`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid price ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/invalid`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });
});
