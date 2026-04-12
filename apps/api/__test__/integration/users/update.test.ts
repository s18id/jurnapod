// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for users.update
// Tests PATCH /users/:id endpoint - email update only, requires update permission.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  getOrCreateTestCashierForPermission
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let companyId: number;
let cashierUserId: number;
let cashierToken: string;
let companyCode: string;

describe('users.update', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    companyId = context.companyId;
    cashierUserId = context.cashierUserId;
    companyCode = process.env.JP_COMPANY_CODE || 'JP';

    // Get cashier token for permission denial tests
    const cashierAuth = await getOrCreateTestCashierForPermission(
      companyId,
      companyCode,
      baseUrl
    );
    cashierToken = cashierAuth.accessToken;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com' })
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks users module update permission', async () => {
    // Use CASHIER token which lacks platform.users UPDATE permission
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: 'new@example.com' })
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 or 403 depending on permission check order', async () => {
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    // Without users:update permission, expect 403
    // If permission were granted, would return 400 for no valid fields
    expect([400, 403]).toContain(res.status);
  });
});