// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for PATCH /inventory/item-groups/:id

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

describe('inventory.item-groups.update', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/inventory/item-groups/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' })
    });
    expect(res.status).toBe(401);
  });

  it('updates item group name', async () => {
    // Create a group first
    const createRes = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: makeTag('ON') })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`group-${created.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/item-groups/${created.data.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Updated Group Name' })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Updated Group Name');
  });

  it('updates item group code', async () => {
    // Create a group first
    const createRes = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: makeTag('GC') })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`group-${created.data.id}`, async () => {});

    const newCode = makeTag('UC');
    const res = await fetch(`${baseUrl}/api/inventory/item-groups/${created.data.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code: newCode })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.code).toBe(newCode);
  });

  it('returns 404 for non-existent group', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-groups/999999999`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Updated' })
    });
    expect(res.status).toBe(404);
  });

  it('rejects update with invalid parent_id', async () => {
    // Create a group first
    const createRes = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: makeTag('GP') })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`group-${created.data.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/inventory/item-groups/${created.data.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ parent_id: 999999999 })
    });
    expect(res.status).toBe(404);
  });

  it('updates is_active status', async () => {
    // Create an active group
    const createRes = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: makeTag('GA'), is_active: true })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`group-${created.data.id}`, async () => {});

    // Update to inactive
    const res = await fetch(`${baseUrl}/api/inventory/item-groups/${created.data.id}`, {
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
});
