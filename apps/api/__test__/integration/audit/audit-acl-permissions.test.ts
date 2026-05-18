// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Story 68-4: platform.audit ACL enforcement verification.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { getTestBaseUrl } from '../../helpers/env';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import {
  getOrCreateTestCashierForPermission,
  getSeedSyncContext,
  getTestAccessToken,
  loginForTest,
  resetFixtureRegistry,
} from '../../fixtures';
import { getRoleIdByCode, assignUserGlobalRole, createTestUser } from '@/lib/test-fixtures.js';

let baseUrl: string;
let accessToken: string;
let adminToken: string;
let accountantToken: string;
let cashierToken: string;
let seedCompanyId: number;

async function requestAuditLogs(query = '', token = accessToken): Promise<Response> {
  return fetch(`${baseUrl}/api/audit-logs${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function requestPeriodTransitions(token = accessToken): Promise<Response> {
  return fetch(`${baseUrl}/api/audit/period-transitions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe('audit.platform-audit-acl', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const seedCtx = await getSeedSyncContext();
    seedCompanyId = seedCtx.companyId;
    const companyCode = process.env.JP_COMPANY_CODE;
    if (!companyCode) throw new Error('JP_COMPANY_CODE must be set');
    cashierToken = (await getOrCreateTestCashierForPermission(seedCompanyId, companyCode, baseUrl)).accessToken;

    const adminRoleId = await getRoleIdByCode('ADMIN');
    const accountantRoleId = await getRoleIdByCode('ACCOUNTANT');

    const adminUser = await createTestUser(seedCompanyId, {
      email: `perm-test-admin+${seedCompanyId}@example.com`,
      name: 'Permission Test Admin',
      password: 'TestAdmin123!'
    });
    await assignUserGlobalRole(adminUser.id, adminRoleId);
    adminToken = await loginForTest(baseUrl, companyCode, adminUser.email, 'TestAdmin123!');

    const accountantUser = await createTestUser(seedCompanyId, {
      email: `perm-test-accountant+${seedCompanyId}@example.com`,
      name: 'Permission Test Accountant',
      password: 'TestAccountant123!'
    });
    await assignUserGlobalRole(accountantUser.id, accountantRoleId);
    accountantToken = await loginForTest(baseUrl, companyCode, accountantUser.email, 'TestAccountant123!');
  });

  afterAll(async () => {
    await closeTestDb();
    await releaseReadLock();
    resetFixtureRegistry();
  });

  it('grants audit-logs access to OWNER with platform.audit.READ', async () => {
    const response = await requestAuditLogs('?limit=1');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('grants period-transitions access to OWNER with platform.audit.READ', async () => {
    const response = await requestPeriodTransitions();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('grants audit-logs access to ADMIN with platform.audit.READ', async () => {
    const response = await requestAuditLogs('?limit=1', adminToken);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('grants audit-logs access to ACCOUNTANT with platform.audit.READ', async () => {
    const response = await requestAuditLogs('?limit=1', accountantToken);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('denies audit-logs access to CASHIER without platform.audit.READ', async () => {
    const response = await requestAuditLogs('?limit=1', cashierToken);
    expect(response.status).toBe(403);
  });

  it('denies period-transitions access to CASHIER without platform.audit.READ', async () => {
    const response = await requestPeriodTransitions(cashierToken);
    expect(response.status).toBe(403);
  });
});
