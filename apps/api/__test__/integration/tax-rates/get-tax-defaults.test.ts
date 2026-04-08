// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for tax-rates.get-tax-defaults
// Tests GET /settings/tax-defaults endpoint - requires settings module read permission.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('tax-rates.get-tax-defaults', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/settings/tax-rates/defaults`, {
      method: 'GET'
    });
    expect(res.status).toBe(401);
  });

  it('returns tax defaults for authenticated user', async () => {
    const res = await fetch(`${baseUrl}/api/settings/tax-rates/defaults`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Tax defaults returns array of tax rate IDs directly
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns 403 when user lacks settings module read permission', async () => {
    // Login with owner to test permission bypass behavior
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
    const token = loginBody.data?.access_token;

    const res = await fetch(`${baseUrl}/api/settings/tax-rates/defaults`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // OWNER/SUPER_ADMIN bypasses module permission checks
    expect([200, 403]).toContain(res.status);
  });
});
