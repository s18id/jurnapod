// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for POST /inventory/item-groups

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

describe('inventory.item-groups.create', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Group' })
    });
    expect(res.status).toBe(401);
  });

  it('creates item group with valid data', async () => {
    const uniqueName = makeTag('TG');

    const res = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: uniqueName })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe(uniqueName);

    registerFixtureCleanup(`group-${body.data.id}`, async () => {});
  });

  it('creates item group with code', async () => {
    const uniqueCode = makeTag('GC');
    const uniqueName = makeTag('CG');

    const res = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code: uniqueCode, name: uniqueName })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.code).toBe(uniqueCode);
    registerFixtureCleanup(`group-${body.data.id}`, async () => {});
  });

  it('supports hierarchical parent-child relationships', async () => {
    const parentName = makeTag('PG');
    const childName = makeTag('CG');

    // Create parent
    const parentRes = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: parentName })
    });
    expect(parentRes.status).toBe(201);
    const parent = await parentRes.json();
    registerFixtureCleanup(`group-${parent.data.id}`, async () => {});

    // Create child with parent_id
    const childRes = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: childName, parent_id: parent.data.id })
    });
    expect(childRes.status).toBe(201);
    const child = await childRes.json();
    expect(child.data.parent_id).toBe(parent.data.id);
    registerFixtureCleanup(`group-${child.data.id}`, async () => {});
  });

  it('returns 404 for non-existent parent_id', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Orphan Group', parent_id: 999999999 })
    });
    expect(res.status).toBe(404);
  });

  it('rejects group without name', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  it('creates group with is_active=false', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Inactive Group', is_active: false })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.is_active).toBe(false);
    registerFixtureCleanup(`group-${body.data.id}`, async () => {});
  });
});
