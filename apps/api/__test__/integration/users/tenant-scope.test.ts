// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for users.tenant-scope
// Tests tenant isolation and cross-company access controls.

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
let companyId: number;
let companyCode: string;

describe('users.tenant-scope', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    companyId = context.companyId;
    companyCode = process.env.JP_COMPANY_CODE ?? 'JP';

    // Get or create a CASHIER user for permission tests
    // CASHIER has platform.users = 0 (no permission)
    const cashier = await getOrCreateTestCashierForPermission(
      companyId,
      companyCode,
      baseUrl
    );
    cashierToken = cashier.accessToken;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('returns 403 for users list without permission (CASHIER)', async () => {
    // CASHIER has platform.users = 0 (no permission)
    const res = await fetch(`${baseUrl}/api/users?company_id=${companyId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Without users:read permission, expect 403
    expect(res.status).toBe(403);
  });

  it('cross-company access returns 403 for non-SUPER_ADMIN (CASHIER)', async () => {
    const res = await fetch(`${baseUrl}/api/users?company_id=99999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(403);
  });

  it('GET /users/:id returns 404 for user in different company', async () => {
    // Attempting to get a user that doesn't belong to current company
    // This uses OWNER token - should still return 404 (not found) not 403 (forbidden)
    // because the user genuinely doesn't exist in this company's scope
    const res = await fetch(`${baseUrl}/api/users/999999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Should be 404 (not found) since user 999999 doesn't belong to this company
    expect(res.status).toBe(404);
  });
});