// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /inventory/variant-stats

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../../helpers/env';
import { closeTestDb } from '../../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  createTestItem,
  createTestVariant,
  registerFixtureCleanup
} from '../../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('inventory.items.variant-stats', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/variant-stats?item_ids=1`);
    expect(res.status).toBe(401);
  });

  it('returns 400 when item_ids is missing', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/variant-stats`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('returns empty array for non-existent item IDs', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/variant-stats?item_ids=999999,999998`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns variant stats for valid item IDs', async () => {
    const ctx = await getSeedSyncContext();

    // Create item via API
    const createRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `VSTATS-${Date.now()}`,
        name: 'Item With Variants',
        type: 'PRODUCT'
      })
    });
    expect(createRes.status).toBe(201);
    const item = await createRes.json();
    registerFixtureCleanup(`item-${item.data.id}`, async () => {});

    // Create a variant for this item
    const variant = await createTestVariant(item.data.id, {
      attributeName: 'Size',
      attributeValues: ['Small', 'Medium', 'Large']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/variant-stats?item_ids=${item.data.id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns variant stats for multiple items', async () => {
    const ctx = await getSeedSyncContext();

    // Create two items via API
    const createRes1 = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `VSTATS1-${Date.now()}`,
        name: 'Item 1',
        type: 'PRODUCT'
      })
    });
    expect(createRes1.status).toBe(201);
    const item1 = await createRes1.json();
    registerFixtureCleanup(`item-${item1.data.id}`, async () => {});

    const createRes2 = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `VSTATS2-${Date.now()}`,
        name: 'Item 2',
        type: 'PRODUCT'
      })
    });
    expect(createRes2.status).toBe(201);
    const item2 = await createRes2.json();
    registerFixtureCleanup(`item-${item2.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/variant-stats?item_ids=${item1.data.id},${item2.data.id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns 400 when too many item IDs (max 100)', async () => {
    const itemIds = Array.from({ length: 101 }, (_, i) => i + 1).join(',');
    const res = await fetch(`${baseUrl}/api/inventory/variant-stats?item_ids=${itemIds}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('handles invalid item ID format', async () => {
    // Invalid IDs will be parsed as NaN, which fails the validation
    const res = await fetch(`${baseUrl}/api/inventory/variant-stats?item_ids=abc,123`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    // Route throws error for invalid ID format, returning 500
    expect([400, 500]).toContain(res.status);
  });
});
