// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /inventory/supplies/:id

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

describe('inventory.supplies.get-by-id', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies/1`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid supply ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies/invalid`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent supply', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies/999999999`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(404);
  });

  it('returns supply by ID', async () => {
    const uniqueSku = `GETBYID-SKU-${Date.now()}`;

    const createRes = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: uniqueSku,
        name: 'Test Supply for GetById',
        unit: 'pcs'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`supply-${created.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/supplies/${created.data.id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(created.data.id);
    expect(body.data.sku).toBe(uniqueSku);
    expect(body.data.name).toBe('Test Supply for GetById');
  });

  it('enforces company scoping - cannot access other company supplies', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies/999999999`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(404);
  });
});
