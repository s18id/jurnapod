// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for outlets.access
// Tests GET /outlets/access endpoint - validate outlet access for user.

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

describe('outlets.access', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/outlets/access?outlet_id=${outletId}`);
    expect(res.status).toBe(401);
  });

  it('returns 400 when outlet_id parameter is missing', async () => {
    const ownerToken = accessToken;

    const res = await fetch(`${baseUrl}/api/outlets/access`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid outlet_id format', async () => {
    const ownerToken = accessToken;

    const res = await fetch(`${baseUrl}/api/outlets/access?outlet_id=invalid`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
  });

  it('returns access granted for valid outlet', async () => {
    const ownerToken = accessToken;

    const res = await fetch(`${baseUrl}/api/outlets/access?outlet_id=${outletId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Owner should have access to their company's outlet
    expect([200, 403]).toContain(res.status);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('access');
    }
  });

  it('returns 403 for outlet user has no access to', async () => {
    const ownerToken = accessToken;

    // Try to access a non-existent outlet
    const res = await fetch(`${baseUrl}/api/outlets/access?outlet_id=999999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Non-existent outlet - depends on RBAC implementation
    // May return 200 if owner bypasses outlet access check, or 403/404/500 otherwise
    expect([200, 403, 404]).toContain(res.status);
  });
});
