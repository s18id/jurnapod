// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for stock route outlet access enforcement
// Verifies GET /outlets/:outletId/stock returns 403 when user has no access to that outlet

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import {
  cleanupTestFixtures,
  getTestAccessToken,
  createTestOutlet,
  createTestUser,
  assignUserOutletRole,
  getRoleIdByCode,
  loginForTest,
  getSeedSyncContext,
  type UserFixture
} from '../../fixtures';
import { makeTag } from '../../helpers/tags';

// Use a known password so we can log in as the created user
const KNOWN_PASSWORD = 'TestPassword123!';

let baseUrl: string;
let outletId: number;
let companyId: number;
let companyCode: string;

let scopedUser: UserFixture;
let scopedOutletId: number;

describe('stock.outlet-access', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    await getTestAccessToken(baseUrl);

    // Get primary seeded company context
    const seedCtx = await getSeedSyncContext();
    outletId = seedCtx.outletId;
    companyId = seedCtx.companyId;
    companyCode = process.env.JP_COMPANY_CODE ?? 'JURNAPOD';

    // Create a second outlet in the SAME company
    const scopedOutlet = await createTestOutlet(companyId);
    scopedOutletId = scopedOutlet.id;

    // Create a user for the seeded company with a KNOWN PASSWORD so we can log in
    scopedUser = await createTestUser(companyId, {
      email: `stock-scope-user-${makeTag('SSU')}@example.com`,
      name: 'Stock Scope User',
      password: KNOWN_PASSWORD
    });

    // Assign ADMIN role to the user for scopedOutletId only (not the primary seeded outlet)
    // ADMIN has inventory read permission; outlet assignment limits scope to scopedOutletId.
    const adminRoleId = await getRoleIdByCode('ADMIN');
    await assignUserOutletRole(scopedUser.id, adminRoleId, scopedOutletId);
  });

  afterAll(async () => {
    try {
      await cleanupTestFixtures();
    } finally {
      try {
        await closeTestDb();
      } finally {
        await releaseReadLock();
      }
    }
  });

  it('returns 403 when user accesses stock for outlet they do not belong to', async () => {
    // scopedUser is an ADMIN for seeded company with access only to scopedOutletId
    // Trying to access the PRIMARY seeded outlet (outletId) should return 403
    const otherUserToken = await loginForTest(
      baseUrl,
      companyCode,
      scopedUser.email,
      KNOWN_PASSWORD
    );

    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock`, {
      headers: {
        'Authorization': `Bearer ${otherUserToken}`,
        'Content-Type': 'application/json'
      }
    });

    // The user has NO assignment to outletId (primary seeded outlet)
    // stock.ts requireOutletAccess should return 403
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 200 when accessing own company outlet', async () => {
    // User is an ADMIN for scopedOutletId — should have access to that outlet's stock
    const otherUserToken = await loginForTest(
      baseUrl,
      companyCode,
      scopedUser.email,
      KNOWN_PASSWORD
    );

    const res = await fetch(`${baseUrl}/api/outlets/${scopedOutletId}/stock`, {
      headers: {
        'Authorization': `Bearer ${otherUserToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Should succeed — scopedOutletId is assigned to this user
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
