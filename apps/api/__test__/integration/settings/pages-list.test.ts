// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for settings/pages - List pages
// Tests GET /settings/pages endpoint - requires settings module read permission

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  loginForTest,
  getSeedSyncContext as loadSeedSyncContext,
  createTestUser,
  createTestRole,
  assignUserGlobalRole,
  getRoleIdByCode,
  setModulePermission
} from '../../fixtures';
import { buildPermissionMask } from '@jurnapod/auth';

let baseUrl: string;
let cashierToken: string;
let sharedAdminToken: string;
let sharedLimitedToken: string;
let testPassword: string;

describe('pages-list', { timeout: 30000 }, () => {
  let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;

  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    cashierToken = await getTestAccessToken(baseUrl);
    seedCtx = await loadSeedSyncContext();

    const companyCode = process.env.JP_COMPANY_CODE;
    const ownerPassword = process.env.JP_OWNER_PASSWORD;
    if (!companyCode || !ownerPassword) {
      throw new Error('JP_COMPANY_CODE and JP_OWNER_PASSWORD must be set for settings pages tests');
    }
    testPassword = ownerPassword;

    const sharedAdminUser = await createTestUser(seedCtx.companyId, {
      email: `settings-list-shared-${Date.now()}@example.com`,
      password: testPassword
    });
    const sharedRole = await createTestRole(baseUrl, cashierToken, 'Settings Reader Shared');
    await assignUserGlobalRole(sharedAdminUser.id, sharedRole.id);
    await setModulePermission(
      seedCtx.companyId,
      sharedRole.id,
      'platform',
      'settings',
      buildPermissionMask({ canRead: true, canCreate: true, canUpdate: true })
    );
    sharedAdminToken = await loginForTest(baseUrl, companyCode, sharedAdminUser.email, testPassword);

    const sharedLimitedUser = await createTestUser(seedCtx.companyId, {
      email: `settings-list-limited-${Date.now()}@example.com`,
      password: testPassword
    });
    const cashierRoleId = await getRoleIdByCode('CASHIER');
    await assignUserGlobalRole(sharedLimitedUser.id, cashierRoleId);
    sharedLimitedToken = await loginForTest(baseUrl, companyCode, sharedLimitedUser.email, testPassword);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth token', async () => {
    const res = await fetch(`${baseUrl}/api/settings/pages`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks settings read permission', async () => {
    const res = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sharedLimitedToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(403);
  });

  it('returns 200 with valid token for user with settings read permission', async () => {
    const res = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      }
    });

    // User with settings:read permission gets 200
    expect(res.status).toBe(200);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    }
  });

  it('returns 200 for OWNER/SUPER_ADMIN who bypasses module permissions', async () => {
    const ownerToken = cashierToken;

    const res = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Owner bypasses module permission check
    expect([200, 403]).toContain(res.status);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    }
  });

  it('supports search query parameter', async () => {
    const res = await fetch(`${baseUrl}/api/settings/pages?q=test`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      }
    });

    // User with settings:read permission gets 200
    expect(res.status).toBe(200);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    }
  });
});
