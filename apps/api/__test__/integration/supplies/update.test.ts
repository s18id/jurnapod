// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for PATCH /inventory/supplies/:id

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

describe('inventory.supplies.update', { timeout: 30000 }, () => {
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
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' })
    });
    expect(res.status).toBe(401);
  });

  it('updates supply name', async () => {
    const createRes = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `UPDATE-NAME-${Date.now()}`,
        name: 'Original Name',
        unit: 'kg'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`supply-${created.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/supplies/${created.data.id}`, {
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

  it('updates supply unit', async () => {
    const createRes = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `UPDATE-UNIT-${Date.now()}`,
        name: 'Unit Test Supply',
        unit: 'kg'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`supply-${created.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/supplies/${created.data.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ unit: 'pcs' })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.unit).toBe('pcs');
  });

  it('updates supply is_active status', async () => {
    const createRes = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `UPDATE-ACTIVE-${Date.now()}`,
        name: 'Active Supply',
        unit: 'kg',
        is_active: true
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`supply-${created.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/supplies/${created.data.id}`, {
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

  it('returns 404 for non-existent supply', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies/999999999`, {
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
    const createRes = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `UPDATE-EMPTY-${Date.now()}`,
        name: 'Supply for Empty Update',
        unit: 'kg'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`supply-${created.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/supplies/${created.data.id}`, {
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
    const timestamp = Date.now();

    const createRes1 = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `CONFLICT1-${timestamp}`,
        name: 'Supply 1',
        unit: 'kg'
      })
    });
    expect(createRes1.status).toBe(201);
    const supply1 = await createRes1.json();
    registerFixtureCleanup(`supply-${supply1.data.id}`, async () => {});

    const createRes2 = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `CONFLICT2-${timestamp}`,
        name: 'Supply 2',
        unit: 'kg'
      })
    });
    expect(createRes2.status).toBe(201);
    const supply2 = await createRes2.json();
    registerFixtureCleanup(`supply-${supply2.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/supplies/${supply2.data.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sku: `CONFLICT1-${timestamp}` })
    });
    expect(res.status).toBe(409);
  });

  it('enforces inventory module permissions', async () => {
    const createRes = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: `PERM-UPDATE-${Date.now()}`,
        name: 'Permission Test Supply',
        unit: 'kg'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`supply-${created.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/supplies/${created.data.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Updated by Owner' })
    });
    expect(res.status).toBe(200);
  });
});
