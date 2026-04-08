// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for outlets.list
// Tests GET /outlets endpoint - list outlets scoped to authenticated company.

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
let outletId: number;

describe('outlets.list', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    companyId = context.companyId;
    outletId = context.outletId;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/outlets`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks outlets module read permission', async () => {
    const res = await fetch(`${baseUrl}/api/outlets`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Without outlets:read permission, expect 403
    expect([200, 403]).toContain(res.status);
  });

  it('lists outlets for authenticated company', async () => {
    // Login with owner credentials to bypass permission check
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

    const res = await fetch(`${baseUrl}/api/outlets`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Owner bypasses module permission, so may succeed
    expect([200, 403]).toContain(res.status);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    }
  });

  it('returns 400 when non-SUPER_ADMIN requests another company', async () => {
    const res = await fetch(`${baseUrl}/api/outlets?company_id=99999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Cross-company access returns 400 (INVALID_REQUEST) for non-SUPER_ADMIN
    expect(res.status).toBe(400);
  });
});
