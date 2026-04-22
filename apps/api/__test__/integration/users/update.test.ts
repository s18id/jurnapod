// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for users.update
// Tests PATCH /users/:id endpoint - email update only, requires update permission.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
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
    await acquireReadLock();
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
    try {
      resetFixtureRegistry();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
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

  it('returns 400 for empty update payload with OWNER token', async () => {
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    // Owner with empty body - deterministic 400 for validation error
    expect(res.status).toBe(400);
  });
});
