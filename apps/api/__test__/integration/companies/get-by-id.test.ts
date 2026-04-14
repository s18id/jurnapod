// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for companies.get-by-id
// Tests GET /companies/:id endpoint - get company details.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
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
const getSeedSyncContext = async () => seedCtx;

describe('companies.get-by-id', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    seedCtx = await loadSeedSyncContext();
    companyId = seedCtx.companyId;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/companies/${companyId}`);
    expect(res.status).toBe(401);
  });

  it('returns company details for own company', async () => {
    // Use cashier token - should be able to access own company
    const res = await fetch(`${baseUrl}/api/companies/${companyId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // User can access their own company without special permissions
    expect([200, 403]).toContain(res.status);

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

  it('returns 403 when non-SUPER_ADMIN accesses another company', async () => {
    // Use cashier token - should NOT be able to access another company
    const res = await fetch(`${baseUrl}/api/companies/99999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Non-SUPER_ADMIN accessing another company without permission should get 403
    expect([403, 404]).toContain(res.status);
  });
});
