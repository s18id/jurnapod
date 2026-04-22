// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for companies.get-by-id
// Tests GET /companies/:id endpoint - get company details.

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

describe('companies.get-by-id', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/companies/${companyId}`);
    expect(res.status).toBe(401);
  });

  it('returns company details for own company', async () => {
    // Use OWNER token - should be able to access own company
    const res = await fetch(`${baseUrl}/api/companies/${companyId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // User can access their own company - deterministic 200
    expect(res.status).toBe(200);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('id');
      expect(body.data.id).toBe(companyId);
      expect(body.data).toHaveProperty('code');
      expect(body.data).toHaveProperty('name');
    }
  });

  it('returns 404 for non-existent company', async () => {
    const ownerToken = accessToken;

    const res = await fetch(`${baseUrl}/api/companies/999999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid company ID format', async () => {
    const res = await fetch(`${baseUrl}/api/companies/invalid-id`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
  });

  it('returns 404 for inaccessible/non-existent foreign company id', async () => {
    // Use OWNER token against unrelated/non-existent company id
    const res = await fetch(`${baseUrl}/api/companies/99999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Route returns NOT_FOUND for inaccessible or non-existent foreign id in this path.
    expect(res.status).toBe(404);
  });
});
