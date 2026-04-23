// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /inventory/items/:id

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../../helpers/env';
import { closeTestDb } from '../../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../../helpers/setup';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  createTestItem,
  createTestCompanyMinimal,
  registerFixtureCleanup
} from '../../../fixtures';
import { makeTag } from '../../../helpers/tags';

let baseUrl: string;
let accessToken: string;

describe('inventory.items.get-by-id', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
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
    const res = await fetch(`${baseUrl}/api/inventory/items/1`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid item ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items/invalid`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent item', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items/999999999`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(404);
  });

  it('returns item by ID', async () => {
    const ctx = await getSeedSyncContext();
    
    // Create item under seeded company
    const item = await createTestItem(ctx.companyId, {
      sku: makeTag('GI'),
      name: 'Test Item for GetById',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/items/${item.id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(item.id);
    expect(body.data.sku).toBe(item.sku);
  });

  it('enforces company scoping - cannot access other company items', async () => {
    // Create a second company and item under it
    const otherCompany = await createTestCompanyMinimal({ 
      code: makeTag('OC'),
      name: 'Other Company'
    });
    const otherCompanyItem = await createTestItem(otherCompany.id, {
      sku: makeTag('OI'),
      name: 'Other Company Item',
      type: 'PRODUCT'
    });

    // Request with token from seeded company - should not find this item
    const res = await fetch(`${baseUrl}/api/inventory/items/${otherCompanyItem.id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    // Should be 404 since item belongs to different company
    expect(res.status).toBe(404);
  });
});
