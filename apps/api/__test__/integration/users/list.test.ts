// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for users.list
// Tests GET /users endpoint - list users scoped to authenticated company.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext, getOrCreateTestCashierForPermission } from '../../fixtures';

let baseUrl: string;
let ownerToken: string;
let cashierToken: string;
let cashierCompanyId: number;
let companyCode: string;

describe('users.list', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    cashierCompanyId = context.companyId;
    companyCode = process.env.JP_COMPANY_CODE ?? 'JP';

    // Get or create a CASHIER user for permission tests
    // CASHIER has platform.users = 0 (no permission)
    const cashier = await getOrCreateTestCashierForPermission(
      cashierCompanyId,
      companyCode,
      baseUrl
    );
    cashierToken = cashier.accessToken;
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
    const res = await fetch(`${baseUrl}/api/users`);
    expect(res.status).toBe(401);
  });

  it('returns 200 when user has users module read permission (OWNER)', async () => {
    // OWNER has platform.users = CRUDAM (63) which includes READ
    const res = await fetch(`${baseUrl}/api/users`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // With users:read permission, expect 200
    expect(res.status).toBe(200);
  });

  it('returns 403 when user lacks users module read permission (CASHIER)', async () => {
    // CASHIER has platform.users = 0 (no permission)
    const res = await fetch(`${baseUrl}/api/users`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Without users:read permission, expect 403
    expect(res.status).toBe(403);
  });

  it('returns 403 when CASHIER uses company_id query param', async () => {
    const res = await fetch(`${baseUrl}/api/users?company_id=${cashierCompanyId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Even with own company_id, requires users:read permission
    expect(res.status).toBe(403);
  });

  it('returns 403 when non-SUPER_ADMIN requests another company', async () => {
    const res = await fetch(`${baseUrl}/api/users?company_id=99999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Cross-company access should be forbidden for non-SUPER_ADMIN
    expect(res.status).toBe(403);
  });
});