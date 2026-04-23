// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for PATCH /inventory/items/:id

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../../helpers/env';
import { closeTestDb } from '../../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../../helpers/setup';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext,
  registerFixtureCleanup
} from '../../../fixtures';
import { makeTag } from '../../../helpers/tags';

let baseUrl: string;
let accessToken: string;

describe('inventory.items.update', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/inventory/items/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' })
    });
    expect(res.status).toBe(401);
  });

  it('updates item name', async () => {
    const ctx = await getSeedSyncContext();

    // Create item via API - use random suffix to prevent SKU collisions in parallel
    const createRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: makeTag('UN'),
        name: 'Original Name',
        type: 'PRODUCT'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`item-${created.data.id}`, async () => {});

    // Update the item
    const res = await fetch(`${baseUrl}/api/inventory/items/${created.data.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Updated Name' })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Updated Name');
  });

  it('updates item is_active status', async () => {
    const ctx = await getSeedSyncContext();

    // Create item via API - use random suffix to prevent SKU collisions in parallel
    const createRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: makeTag('UA'),
        name: 'Active Item',
        type: 'PRODUCT',
        is_active: true
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`item-${created.data.id}`, async () => {});

    // Update to inactive
    const res = await fetch(`${baseUrl}/api/inventory/items/${created.data.id}`, {
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

  it('returns 404 for non-existent item', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items/999999999`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Updated' })
    });
    expect(res.status).toBe(404);
  });

  it('rejects update with no fields', async () => {
    const ctx = await getSeedSyncContext();

    // Create item via API - use random suffix to prevent SKU collisions in parallel
    const createRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: makeTag('UE'),
        name: 'Item for Empty Update',
        type: 'PRODUCT'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`item-${created.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/items/${created.data.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  it('rejects SKU conflict on update', async () => {
    const ctx = await getSeedSyncContext();
    const sku1 = makeTag('C1');
    const sku2 = makeTag('C2');

    // Create first item via API
    const createRes1 = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: sku1,
        name: 'Item 1',
        type: 'PRODUCT'
      })
    });
    expect(createRes1.status).toBe(201);
    const item1 = await createRes1.json();
    registerFixtureCleanup(`item-${item1.data.id}`, async () => {});

    // Create second item via API
    const createRes2 = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: sku2,
        name: 'Item 2',
        type: 'PRODUCT'
      })
    });
    expect(createRes2.status).toBe(201);
    const item2 = await createRes2.json();
    registerFixtureCleanup(`item-${item2.data.id}`, async () => {});

    // Try to update item2 with item1's SKU
    const res = await fetch(`${baseUrl}/api/inventory/items/${item2.data.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sku: sku1 })
    });
    expect(res.status).toBe(409);
  });
});
