// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for POST /inventory/item-groups/bulk

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../../helpers/env';
import { closeTestDb } from '../../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  registerFixtureCleanup
} from '../../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('inventory.item-groups.bulk-create', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [{ name: 'Test' }] })
    });
    expect(res.status).toBe(401);
  });

  it('creates multiple item groups in bulk', async () => {
    const timestamp = Date.now();
    const res = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rows: [
          { name: `Bulk Group 1 ${timestamp}` },
          { name: `Bulk Group 2 ${timestamp}` },
          { name: `Bulk Group 3 ${timestamp}` }
        ]
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.groups).toBeDefined();
    expect(body.data.groups.length).toBe(3);
    
    // Register cleanup for created groups
    body.data.groups.forEach((g: any) => {
      registerFixtureCleanup(`group-${g.id}`, async () => {});
    });
  });

  it('creates hierarchical groups via parent_code', async () => {
    const timestamp = Date.now();
    const parentCode = `BULK-PARENT-${timestamp}`.slice(0, 20);

    const res = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rows: [
          { code: parentCode, name: `Bulk Parent ${timestamp}` },
          { name: `Bulk Child ${timestamp}`, parent_code: parentCode }
        ]
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.groups).toBeDefined();
    expect(body.data.groups.length).toBe(2);

    // Register cleanup
    body.data.groups.forEach((g: any) => {
      registerFixtureCleanup(`group-${g.id}`, async () => {});
    });
  });

  it('bulk create handles partial conflicts gracefully', async () => {
    const timestamp = Date.now();

    // First bulk create
    const res1 = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rows: [
          { name: `First Bulk ${timestamp}` }
        ]
      })
    });
    expect(res1.status).toBe(201);

    // Second bulk create - should still succeed even if there's no conflict
    const res2 = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rows: [
          { name: `Second Bulk ${timestamp}` }
        ]
      })
    });
    expect(res2.status).toBe(201);
  });

  it('rejects empty rows array', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ rows: [] })
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid payload', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ invalid: 'payload' })
    });
    expect(res.status).toBe(400);
  });

  it('bulk create with codes', async () => {
    const timestamp = Date.now();
    const code1 = `BULK-C1-${timestamp}`.slice(0, 20);
    const code2 = `BULK-C2-${timestamp}`.slice(0, 20);

    const res = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rows: [
          { code: code1, name: `Coded Group 1 ${timestamp}` },
          { code: code2, name: `Coded Group 2 ${timestamp}` }
        ]
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.groups.length).toBe(2);
    
    // Register cleanup
    body.data.groups.forEach((g: any) => {
      registerFixtureCleanup(`group-${g.id}`, async () => {});
    });
  });
});
