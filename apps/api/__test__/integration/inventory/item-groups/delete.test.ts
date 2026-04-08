// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for DELETE /inventory/item-groups/:id

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

describe('inventory.item-groups.delete', { timeout: 30000 }, () => {
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
      method: 'DELETE'
    });
    expect(res.status).toBe(401);
  });

  it('deletes existing item group', async () => {
    const timestamp = Date.now();

    // Create a group to delete
    const createRes = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: `Group To Delete ${timestamp}` })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/inventory/item-groups/${created.data.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 for non-existent group', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-groups/999999999`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid group ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-groups/invalid`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });
});
