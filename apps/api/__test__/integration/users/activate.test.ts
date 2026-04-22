// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for users.activate
// Tests POST /users/:id/deactivate and /reactivate endpoints.

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
let ownerToken: string;
let cashierToken: string;
let cashierUserId: number;
let companyId: number;
let companyCode: string;

describe('users.activate', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    cashierUserId = context.cashierUserId;
    companyId = context.companyId;
    companyCode = process.env.JP_COMPANY_CODE || 'JP';

    // Get CASHIER token for permission denial tests
    const cashier = await getOrCreateTestCashierForPermission(
      companyId,
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

  it('rejects deactivate request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}/deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(401);
  });

  it('rejects reactivate request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}/reactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks users module delete permission (CASHIER)', async () => {
    // CASHIER has platform.users = 0 (no DELETE permission)
    const deactivateRes = await fetch(`${baseUrl}/api/users/${cashierUserId}/deactivate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(deactivateRes.status).toBe(403);
  });
});