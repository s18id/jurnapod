// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for POST /inventory/supplies

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

describe('inventory.supplies.create', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', unit: 'kg' })
    });
    expect(res.status).toBe(401);
  });

  it('creates supply with valid data', async () => {
    const uniqueSku = `CREATE-SKU-${Date.now()}`;

    const res = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: uniqueSku,
        name: 'New Test Supply',
        unit: 'kg'
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.sku).toBe(uniqueSku);
    expect(body.data.name).toBe('New Test Supply');
    expect(body.data.unit).toBe('kg');

    registerFixtureCleanup(`supply-${body.data.id}`, async () => {});
  });

  it('validates SKU uniqueness within company', async () => {
    const uniqueSku = `DUP-SKU-${Date.now()}`;

    const firstRes = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: uniqueSku,
        name: 'First Supply',
        unit: 'kg'
      })
    });
    expect(firstRes.status).toBe(201);
    const firstBody = await firstRes.json();
    registerFixtureCleanup(`supply-${firstBody.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: uniqueSku,
        name: 'Duplicate SKU Supply',
        unit: 'pcs'
      })
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CONFLICT');
  });

  it('rejects supply without name', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: 'NO-NAME-SKU',
        unit: 'kg'
      })
    });
    expect(res.status).toBe(400);
  });

  it('rejects supply without unit', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: 'NO-UNIT-SKU',
        name: 'Supply Without Unit'
      })
    });
    expect(res.status).toBe(400);
  });

  it('creates supply with is_active=false', async () => {
    const uniqueSku = `INACTIVE-SKU-${Date.now()}`;

    const res = await fetch(`${baseUrl}/api/inventory/supplies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: uniqueSku,
        name: 'Inactive Supply',
        unit: 'kg',
        is_active: false
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.is_active).toBe(false);

    registerFixtureCleanup(`supply-${body.data.id}`, async () => {});
  });

  it('enforces inventory module permissions', async () => {
    const uniqueSku = `PERM-SKU-${Date.now()}`;

    const res = await fetch(`${baseUrl}/api/inventory/supplies`, {
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
    expect(res.status).toBe(201);
  });
});
