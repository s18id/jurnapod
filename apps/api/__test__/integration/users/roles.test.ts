// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for users.roles
// Tests POST /users/:id/roles endpoint - set user roles, enforces role hierarchy.

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
let ownerToken: string;
let cashierToken: string;
let cashierUserId: number;
let cashierCompanyId: number;
let companyCode: string;

describe('users.roles', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    cashierUserId = context.cashierUserId;
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
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_codes: ['CASHIER'] })
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks users module update permission (CASHIER)', async () => {
    // CASHIER has platform.users = 0 (no UPDATE permission)
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}/roles`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role_codes: ['CASHIER'] })
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid role payload when permission is granted (OWNER)', async () => {
    // OWNER has platform.users = CRUDAM (63) which includes UPDATE
    // Invalid payload should return 400 (validation error)
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}/roles`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role_codes: 'not-an-array' })
    });
    // With permission but invalid payload, expect 400
    expect(res.status).toBe(400);
  });
});