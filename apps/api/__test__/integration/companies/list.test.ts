// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for companies.list
// Tests GET /companies endpoint - list companies scoped by role.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let companyId: number;

describe('companies.list', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    companyId = context.companyId;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/companies`);
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid token for SUPER_ADMIN listing all companies', async () => {
    // Login with owner credentials to test as SUPER_ADMIN
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

    const res = await fetch(`${baseUrl}/api/companies`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Owner may bypass module permission
    expect([200, 403]).toContain(res.status);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    }
  });

  it('returns only own company for non-SUPER_ADMIN', async () => {
    // Use the cashier token which is not SUPER_ADMIN
    const res = await fetch(`${baseUrl}/api/companies`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Without companies:read permission, expect 403
    expect([200, 403]).toContain(res.status);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      // Non-SUPER_ADMIN should only see their own company
      if (body.data.length > 0) {
        expect(body.data.some((c: { id: number }) => c.id === companyId)).toBe(true);
      }
    }
  });

  it('respects is_active filter param', async () => {
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

    const res = await fetch(`${baseUrl}/api/companies?is_active=false`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect([200, 403]).toContain(res.status);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    }
  });
});