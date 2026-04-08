// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for DELETE /inventory/items/:id

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

describe('inventory.items.delete', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items/1`, {
      method: 'DELETE'
    });
    expect(res.status).toBe(401);
  });

  it('deletes existing item', async () => {
    const ctx = await getSeedSyncContext();

    // Create item via API
    const createRes = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `DELETE-SKU-${Date.now()}`,
        name: 'Item To Delete',
        type: 'PRODUCT'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/inventory/items/${created.data.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });

  it('returns 404 for non-existent item', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items/999999999`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid item ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items/invalid`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });
});
