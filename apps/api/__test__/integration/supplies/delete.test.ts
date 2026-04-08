// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for DELETE /inventory/supplies/:id

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  registerFixtureCleanup
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('inventory.supplies.delete', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies/1`, {
      method: 'DELETE'
    });
    expect(res.status).toBe(401);
  });

  it('deletes existing supply', async () => {
    const createRes = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `DELETE-SKU-${Date.now()}`,
        name: 'Supply To Delete',
        unit: 'kg'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/inventory/supplies/${created.data.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });

  it('returns 404 for non-existent supply', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies/999999999`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid supply ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies/invalid`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('enforces inventory module permissions', async () => {
    const createRes = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `PERM-DELETE-${Date.now()}`,
        name: 'Permission Delete Supply',
        unit: 'kg'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/inventory/supplies/${created.data.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
  });
});
