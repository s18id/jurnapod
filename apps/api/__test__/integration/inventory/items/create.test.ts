// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for POST /inventory/items

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../../helpers/env';
import { closeTestDb } from '../../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../../helpers/setup';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext,
  createTestItem,
  registerFixtureCleanup
} from '../../../fixtures';
import { makeTag } from '../../../helpers/tags';

let baseUrl: string;
let accessToken: string;

describe('inventory.items.create', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', type: 'PRODUCT' })
    });
    expect(res.status).toBe(401);
  });

  it('creates item with valid data', async () => {
    const ctx = await getSeedSyncContext();
    const uniqueSku = makeTag('OC');

    const res = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: uniqueSku,
        name: 'New Test Product',
        type: 'PRODUCT'
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.sku).toBe(uniqueSku);
    expect(body.data.name).toBe('New Test Product');
    expect(body.data.type).toBe('PRODUCT');

    // Register for cleanup since this was created via API
    registerFixtureCleanup(`item-${body.data.id}`, async () => {});
  });

  it('validates SKU uniqueness within company', async () => {
    const ctx = await getSeedSyncContext();
    const uniqueSku = makeTag('DU');

    // Create first item via API
    const firstRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: uniqueSku,
        name: 'First Item',
        type: 'PRODUCT'
      })
    });
    expect(firstRes.status).toBe(201);
    const firstBody = await firstRes.json();
    registerFixtureCleanup(`item-${firstBody.data.id}`, async () => {});

    // Try to create second item with same SKU
    const res = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: uniqueSku,
        name: 'Duplicate SKU Item',
        type: 'PRODUCT'
      })
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CONFLICT');
  });

  it('rejects invalid item type', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Invalid Type Item',
        type: 'INVALID_TYPE'
      })
    });
    expect(res.status).toBe(400);
  });

  it('rejects item without name', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'PRODUCT'
      })
    });
    expect(res.status).toBe(400);
  });

  it('creates SERVICE type item', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Service',
        type: 'SERVICE'
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('SERVICE');
    registerFixtureCleanup(`item-${body.data.id}`, async () => {});
  });

  it('creates INGREDIENT type item', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Ingredient',
        type: 'INGREDIENT'
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('INGREDIENT');
    registerFixtureCleanup(`item-${body.data.id}`, async () => {});
  });

  it('creates item with is_active=false', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Inactive Item',
        type: 'PRODUCT',
        is_active: false
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.is_active).toBe(false);
    registerFixtureCleanup(`item-${body.data.id}`, async () => {});
  });
});
