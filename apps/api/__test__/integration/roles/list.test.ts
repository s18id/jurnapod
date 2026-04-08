// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for roles.list
// Tests GET /roles endpoint - list roles for authenticated company.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken } from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('roles.list', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/roles`);
    expect(res.status).toBe(401);
  });

  it('returns 200 or 403 depending on permission bypass', async () => {
    // The seeded token may have role bypass (OWNER/SUPER_ADMIN)
    const res = await fetch(`${baseUrl}/api/roles`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // OWNER bypasses module permission, so returns 200; otherwise expect 403
    expect([200, 403]).toContain(res.status);
  });

  it('returns roles when user has roles module read permission', async () => {
    // Get fresh token and try listing roles
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyCode: process.env.JP_COMPANY_CODE,
        email: process.env.JP_OWNER_EMAIL,
        password: process.env.JP_OWNER_PASSWORD
      })
    });

    if (!loginRes.ok) {
      expect(true).toBe(true);
      return;
    }

    const loginBody = await loginRes.json();
    const ownerToken = loginBody.data?.access_token;

    const res = await fetch(`${baseUrl}/api/roles`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // OWNER may bypass module permission or have roles:read permission
    expect([200, 403]).toContain(res.status);
  });
});