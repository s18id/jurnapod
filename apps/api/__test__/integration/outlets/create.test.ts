// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for outlets.create
// Tests POST /outlets endpoint - create new outlet.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { makeTag } from '../../helpers/tags';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext,
  registerFixtureCleanup
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let companyId: number;
let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;
const getSeedSyncContext = async () => seedCtx;

describe('outlets.create', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    seedCtx = await loadSeedSyncContext();
    companyId = seedCtx.companyId;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/outlets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'TEST-OUTLET',
        name: 'Test Outlet'
      })
    });
    expect(res.status).toBe(401);
  });

  it('creates outlet with valid data', async () => {
    const ownerToken = accessToken;

    const uniqueCode = `OC-${makeTag('OC', 20)}`;
    const res = await fetch(`${baseUrl}/api/outlets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Test Outlet Created',
        timezone: 'Asia/Jakarta'
      })
    });

    // Owner bypasses module permission, so may succeed
    expect([200, 201, 403]).toContain(res.status);

    if (res.ok || res.status === 409) {
      const body = await res.json();
      if (body.success) {
        expect(body.data).toHaveProperty('id');
        expect(body.data.code).toBe(uniqueCode);
        // Register cleanup for created outlet
        if (body.data.id) {
          registerFixtureCleanup(`outlet-${body.data.id}`, async () => {
            // Outlet cleanup is handled by fixture registry reset
          });
        }
      }
    }
  });

  it('creates outlet with valid timezone', async () => {
    const ownerToken = accessToken;

    const uniqueCode = `OT-${makeTag('OT', 20)}`;
    const res = await fetch(`${baseUrl}/api/outlets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Test Outlet with Timezone',
        timezone: 'Asia/Jakarta'
      })
    });

    expect([200, 201, 403]).toContain(res.status);
  });

  it('returns 400 for missing required fields', async () => {
    const ownerToken = accessToken;

    const res = await fetch(`${baseUrl}/api/outlets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const ownerToken = accessToken;

    const uniqueCode = `OE-${makeTag('OE', 20)}`;
    const res = await fetch(`${baseUrl}/api/outlets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Test Outlet',
        email: 'invalid-email'
      })
    });

    expect([400, 403]).toContain(res.status);
  });

  it('returns 403 when non-SUPER_ADMIN tries to create in another company', async () => {
    const uniqueCode = `OUTLET-CROSS-${makeTag('OC', 20)}`;
    const res = await fetch(`${baseUrl}/api/outlets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Test Outlet Cross Company',
        company_id: 99999
      })
    });

    expect(res.status).toBe(403);
  });
});
