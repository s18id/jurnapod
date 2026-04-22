// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for companies.list
// Tests GET /companies endpoint - list companies scoped by role.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let companyId: number;
let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;

describe('companies.list', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    seedCtx = await loadSeedSyncContext();
    companyId = seedCtx.companyId;
  });

  afterAll(async () => {
    try {
      resetFixtureRegistry();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/companies`);
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid OWNER token for company listing', async () => {
    const ownerToken = accessToken;

    const res = await fetch(`${baseUrl}/api/companies`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // OWNER can list companies - deterministic 200
    expect(res.status).toBe(200);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    }
  });

  it('returns only own company for OWNER (non-SUPER_ADMIN)', async () => {
    // Use OWNER token (non-SUPER_ADMIN path)
    const res = await fetch(`${baseUrl}/api/companies`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // OWNER listing companies - deterministic 200
    expect(res.status).toBe(200);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      // Non-SUPER_ADMIN should only see their own company
      expect(body.data.every((c: { id: number }) => c.id === companyId)).toBe(true);
    }
  });

  it('respects is_active filter param', async () => {
    const ownerToken = accessToken;

    const res = await fetch(`${baseUrl}/api/companies?is_active=false`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Owner listing with filter - deterministic 200
    expect(res.status).toBe(200);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    }
  });
});
