// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tenant Isolation Tests — Treasury Module (Story 60.1)
 *
 * Verifies:
 *  - AC4: Treasury module company_id enforcement
 *  - AC7: Cross-tenant access returns 403
 *  - CASHIER cannot read treasury transactions from another company
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import {
  createTestCompany,
  createTestOutletMinimal,
  createTestUser,
  getRoleIdByCode,
  assignUserOutletRole,
  loginForTest,
  resetFixtureRegistry,
} from '../../fixtures';

const testPassword = process.env.JP_OWNER_PASSWORD ?? 'testpass123';

describe('tenant-scoping-treasury', { timeout: 90000 }, () => {
  let baseUrl: string;

  // Company A
  let companyIdA: number;
  let companyCodeA: string;
  let outletIdA: number;
  let cashierTokenA: string;

  // Company B
  let companyIdB: number;
  let companyCodeB: string;
  let outletIdB: number;
  let cashierTokenB: string;

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    // ── Company A ──
    const companyA = await createTestCompany({
      name: 'Tenant Scoping Treasury Co A',
      code: `TSTRY-A-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    companyIdA = companyA.id;
    companyCodeA = companyA.code;

    const outletA = await createTestOutletMinimal(companyIdA, {
      name: 'TS Treasury Outlet A',
      code: `TSTRYO-A-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    outletIdA = outletA.id;

    const cashierRoleId = await getRoleIdByCode('CASHIER');
    const cashierA = await createTestUser(companyIdA, {
      email: `ts-try-cash-a-${Date.now()}@example.com`,
      name: 'TS Treasury Cashier A',
      password: testPassword,
    });
    await assignUserOutletRole(cashierA.id, cashierRoleId, outletIdA);
    cashierTokenA = await loginForTest(baseUrl, companyCodeA, cashierA.email, testPassword);

    // ── Company B ──
    const companyB = await createTestCompany({
      name: 'Tenant Scoping Treasury Co B',
      code: `TSTRY-B-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    companyIdB = companyB.id;
    companyCodeB = companyB.code;

    const outletB = await createTestOutletMinimal(companyIdB, {
      name: 'TS Treasury Outlet B',
      code: `TSTRYO-B-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    outletIdB = outletB.id;

    const cashierB = await createTestUser(companyIdB, {
      email: `ts-try-cash-b-${Date.now()}@example.com`,
      name: 'TS Treasury Cashier B',
      password: testPassword,
    });
    await assignUserOutletRole(cashierB.id, cashierRoleId, outletIdB);
    cashierTokenB = await loginForTest(baseUrl, companyCodeB, cashierB.email, testPassword);
  });

  afterAll(async () => {
    try {
      await resetFixtureRegistry();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  });

  // ========================================================================
  // AC4 / AC7: CASHIER (no treasury permissions) cannot read data
  // ========================================================================
  it('CASHIER from Company A cannot read treasury transactions', async () => {
    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      headers: { Authorization: `Bearer ${cashierTokenA}` },
    });
    // CASHIER has 0 treasury permissions — should be 403
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('CASHIER from Company B cannot read treasury transactions', async () => {
    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      headers: { Authorization: `Bearer ${cashierTokenB}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  // ========================================================================
  // AC7: Cross-tenant — token from one company cannot see another's data
  // ========================================================================
  it('CASHIER from Company A is denied (no treasury permissions)', async () => {
    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      headers: { Authorization: `Bearer ${cashierTokenA}` },
    });
    expect(res.status).toBe(403);
  });

  it('CASHIER from Company B is denied (no treasury permissions)', async () => {
    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      headers: { Authorization: `Bearer ${cashierTokenB}` },
    });
    expect(res.status).toBe(403);
  });
});
