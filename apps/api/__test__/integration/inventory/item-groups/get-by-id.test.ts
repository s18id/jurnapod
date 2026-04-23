// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /inventory/item-groups/:id

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../../helpers/env';
import { closeTestDb } from '../../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../../helpers/setup';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  registerFixtureCleanup
} from '../../../fixtures';
import { makeTag } from '../../../helpers/tags';

let baseUrl: string;
let accessToken: string;

describe('inventory.item-groups.get-by-id', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/inventory/item-groups/1`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid group ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-groups/invalid`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent group', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-groups/999999999`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(404);
  });

  it('returns item group by ID', async () => {
    const ctx = await getSeedSyncContext();
    
    // Create a group via API
    const createRes = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: makeTag('GG') })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`group-${created.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/item-groups/${created.data.id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(created.data.id);
  });
});
