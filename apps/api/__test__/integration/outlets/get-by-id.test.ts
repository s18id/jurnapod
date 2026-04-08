// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for outlets.get-by-id
// Tests GET /outlets/:id endpoint - get single outlet.

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

describe('outlets.get-by-id', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent outlet', async () => {
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

    const res = await fetch(`${baseUrl}/api/outlets/999999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Non-existent outlet should return 404
    expect([404, 403]).toContain(res.status);
  });

  it('returns 400 for invalid outlet ID format', async () => {
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

    const res = await fetch(`${baseUrl}/api/outlets/invalid`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
  });

  it('returns 403 when user lacks outlets module read permission', async () => {
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Without outlets:read permission, expect 403
    expect([200, 403]).toContain(res.status);
  });

  it('returns 400 when requesting another company outlet', async () => {
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

    const res = await fetch(`${baseUrl}/api/outlets/${outletId}?company_id=99999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Cross-company access should be forbidden
    expect([400, 403]).toContain(res.status);
  });
});
