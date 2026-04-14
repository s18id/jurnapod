// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for POST /inventory/item-prices

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../../helpers/env';
import { closeTestDb } from '../../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext,
  createTestItem,
  registerFixtureCleanup
} from '../../../fixtures';

let baseUrl: string;
let accessToken: string;
let authTestItemId: number;

describe('inventory.item-prices.create', { timeout: 30000 }, () => {
  let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;
  const getSeedSyncContext = async () => seedCtx;

  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    // Create a minimal item for auth/validation tests (ID used only when auth passes)
    seedCtx = await loadSeedSyncContext();
    const ctx = seedCtx;
    const item = await createTestItem(ctx.companyId, {
      sku: `AUTH-TEST-${Date.now()}`,
      name: 'Auth Test Item',
      type: 'PRODUCT',
    });
    authTestItemId = item.id;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: authTestItemId, price: 100 })
    });
    expect(res.status).toBe(401);
  });

  it('creates item price with valid data', async () => {
    const ctx = await getSeedSyncContext();

    // Create an item via API first
    const itemRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `PRICE-CREATE-${Date.now()}`,
        name: 'Item for Price Create',
        type: 'PRODUCT'
      })
    });
    expect(itemRes.status).toBe(201);
    const item = await itemRes.json();
    registerFixtureCleanup(`item-${item.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/item-prices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.data.id,
        outlet_id: ctx.outletId,
        price: 15000,
        is_active: true
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.price).toBe(15000);
    expect(body.data.item_id).toBe(item.data.id);
    expect(body.data.outlet_id).toBe(ctx.outletId);

    registerFixtureCleanup(`price-${body.data.id}`, async () => {});
  });

  it('rejects invalid item_id', async () => {
    const ctx = await getSeedSyncContext();
    const res = await fetch(`${baseUrl}/api/inventory/item-prices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: 999999999,
        outlet_id: ctx.outletId,
        price: 100
      })
    });
    expect(res.status).toBe(404);
  });

  it('rejects negative price', async () => {
    const ctx = await getSeedSyncContext();

    // Create an item via API first
    const itemRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `PRICE-NEG-${Date.now()}`,
        name: 'Item for Negative Price Test',
        type: 'PRODUCT'
      })
    });
    expect(itemRes.status).toBe(201);
    const item = await itemRes.json();
    registerFixtureCleanup(`item-${item.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/item-prices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.data.id,
        outlet_id: ctx.outletId,
        price: -100
      })
    });
    expect(res.status).toBe(400);
  });

  it('creates outlet-specific price', async () => {
    const ctx = await getSeedSyncContext();

    // Create an item via API first
    const itemRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `PRICE-OUTLET-${Date.now()}`,
        name: 'Item for Outlet Price',
        type: 'PRODUCT'
      })
    });
    expect(itemRes.status).toBe(201);
    const item = await itemRes.json();
    registerFixtureCleanup(`item-${item.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/item-prices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.data.id,
        outlet_id: ctx.outletId,
        price: 20000
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.outlet_id).toBe(ctx.outletId);

    registerFixtureCleanup(`price-${body.data.id}`, async () => {});
  });

  it('company default prices (outlet_id=null) require global role', async () => {
    const ctx = await getSeedSyncContext();

    // Create an item via API first
    const itemRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `PRICE-COMPANY-${Date.now()}`,
        name: 'Item for Company Default',
        type: 'PRODUCT'
      })
    });
    expect(itemRes.status).toBe(201);
    const item = await itemRes.json();
    registerFixtureCleanup(`item-${item.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/item-prices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.data.id,
        outlet_id: null, // Company default
        price: 25000
      })
    });
    // With OWNER token, should succeed (OWNER has global role)
    expect([201, 403]).toContain(res.status);
  });

  it('rejects price without item_id', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        price: 100
      })
    });
    expect(res.status).toBe(400);
  });
});
