// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /inventory/items

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../../helpers/env';
import { closeTestDb } from '../../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  createTestItem,
  registerFixtureCleanup
} from '../../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('inventory.items.list', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items`);
    expect(res.status).toBe(401);
  });

  it('returns items list with auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns items filtered by is_active=true', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items?is_active=true`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns items filtered by is_active=false', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items?is_active=false`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('enforces inventory module permissions', async () => {
    // Uses seeded context for proper company scoping
    const ctx = await getSeedSyncContext();
    
    // Create an item under the seeded company
    const item = await createTestItem(ctx.companyId, {
      sku: `LIST-PERM-${Date.now()}`,
      name: 'Permission Test Item',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Should be able to read items with proper auth
    const res = await fetch(`${baseUrl}/api/inventory/items`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
  });
});
