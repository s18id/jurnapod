// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for PATCH /inventory/item-groups/:id

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

describe('inventory.item-groups.update', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
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
      body: JSON.stringify({ name: `Original Name ${Date.now()}` })
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
    const timestamp = Date.now();

    // Create a group first
    const createRes = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: `Group For Code Update ${timestamp}` })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    registerFixtureCleanup(`group-${created.data.id}`, async () => {});

    const newCode = `UPDATED-CODE-${timestamp}`.slice(0, 20);
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
    const timestamp = Date.now();

    // Create a group first
    const createRes = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: `Group For Parent Test ${timestamp}` })
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
    const timestamp = Date.now();

    // Create an active group
    const createRes = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: `Group For Active Test ${timestamp}`, is_active: true })
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
