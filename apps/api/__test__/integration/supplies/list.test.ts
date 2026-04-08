// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /inventory/supplies

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  registerFixtureCleanup
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('inventory.supplies.list', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies`);
    expect(res.status).toBe(401);
  });

  it('returns supplies list with auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns supplies filtered by is_active=true', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies?is_active=true`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data));
  });

  it('returns supplies filtered by is_active=false', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies?is_active=false`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data));
  });

  it('rejects invalid is_active parameter', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies?is_active=invalid`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('rejects company_id parameter', async () => {
    const ctx = await getSeedSyncContext();
    const res = await fetch(`${baseUrl}/api/inventory/supplies?company_id=${ctx.companyId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('enforces inventory module permissions', async () => {
    const ctx = await getSeedSyncContext();
    const uniqueSku = `LIST-PERM-${Date.now()}`;

    const createRes = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: uniqueSku,
        name: 'Permission Test Supply',
        unit: 'kg'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`supply-${created.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/supplies`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
  });
});
