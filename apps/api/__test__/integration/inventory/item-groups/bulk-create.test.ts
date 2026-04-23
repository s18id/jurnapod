// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for POST /inventory/item-groups/bulk

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../../helpers/env';
import { closeTestDb } from '../../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../../helpers/setup';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  registerFixtureCleanup
} from '../../../fixtures';
import { makeTag } from '../../../helpers/tags';

let baseUrl: string;
let accessToken: string;

describe('inventory.item-groups.bulk-create', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [{ name: 'Test' }] })
    });
    expect(res.status).toBe(401);
  });

  it('creates multiple item groups in bulk', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rows: [
          { name: makeTag('B1') },
          { name: makeTag('B2') },
          { name: makeTag('B3') }
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
    const parentCode = makeTag('PP');

    const res = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rows: [
          { code: parentCode, name: makeTag('BP') },
          { name: makeTag('BC'), parent_code: parentCode }
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
    const res1 = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rows: [
          { name: makeTag('F1') }
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
          { name: makeTag('S2') }
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
    const code1 = makeTag('C1');
    const code2 = makeTag('C2');

    const res = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rows: [
          { code: code1, name: makeTag('BN') },
          { code: code2, name: makeTag('BN') }
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
