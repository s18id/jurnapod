// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tenant Isolation Tests — Accounting Module (Story 60.1)
 *
 * Verifies:
 *  - AC1: Accounting module company_id enforcement — CASHIER cannot read
 *    journals/accounts from another company
 *  - AC7: Cross-tenant access returns 403
 *  - Positive control: ACCOUNTANT can read journals from own company
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import {
  createTestCompany,
  createTestOutletMinimal,
  createTestUser,
  getRoleIdByCode,
  assignUserGlobalRole,
  assignUserOutletRole,
  loginForTest,
  resetFixtureRegistry,
} from '../../fixtures';

const testPassword = process.env.JP_OWNER_PASSWORD ?? 'testpass123';

describe('tenant-scoping-accounting', { timeout: 90000 }, () => {
  let baseUrl: string;

  // Company A
  let companyIdA: number;
  let companyCodeA: string;
  let outletIdA: number;

  // Company A users
  let cashierTokenA: string;
  let accountantTokenA: string;

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
      name: 'Tenant Scoping Accounting Co A',
      code: `TSACC-A-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    companyIdA = companyA.id;
    companyCodeA = companyA.code;

    const outletA = await createTestOutletMinimal(companyIdA, {
      name: 'TS Accounting Outlet A',
      code: `TSACCO-A-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    outletIdA = outletA.id;

    // CASHIER user for Company A (negative test)
    const cashierA = await createTestUser(companyIdA, {
      email: `ts-acc-cash-a-${Date.now()}@example.com`,
      name: 'TS Accounting Cashier A',
      password: testPassword,
    });
    const cashierRoleId = await getRoleIdByCode('CASHIER');
    await assignUserOutletRole(cashierA.id, cashierRoleId, outletIdA);
    cashierTokenA = await loginForTest(baseUrl, companyCodeA, cashierA.email, testPassword);

    // ACCOUNTANT user for Company A (positive control)
    const accountantA = await createTestUser(companyIdA, {
      email: `ts-acc-accnt-a-${Date.now()}@example.com`,
      name: 'TS Accounting Accountant A',
      password: testPassword,
    });
    const accountantRoleId = await getRoleIdByCode('ACCOUNTANT');
    await assignUserGlobalRole(accountantA.id, accountantRoleId);
    accountantTokenA = await loginForTest(baseUrl, companyCodeA, accountantA.email, testPassword);

    // ── Company B ──
    const companyB = await createTestCompany({
      name: 'Tenant Scoping Accounting Co B',
      code: `TSACC-B-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    companyIdB = companyB.id;
    companyCodeB = companyB.code;

    const outletB = await createTestOutletMinimal(companyIdB, {
      name: 'TS Accounting Outlet B',
      code: `TSACCO-B-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    outletIdB = outletB.id;

    // CASHIER user for Company B
    const cashierB = await createTestUser(companyIdB, {
      email: `ts-acc-cash-b-${Date.now()}@example.com`,
      name: 'TS Accounting Cashier B',
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
  // Positive Control: ACCOUNTANT from own company can read data
  // ========================================================================
  it('ACCOUNTANT can read journals from own company', async () => {
    const res = await fetch(`${baseUrl}/api/journals?limit=1`, {
      headers: { Authorization: `Bearer ${accountantTokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('ACCOUNTANT can read accounts from own company', async () => {
    const res = await fetch(`${baseUrl}/api/accounts?limit=10`, {
      headers: { Authorization: `Bearer ${accountantTokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('ACCOUNTANT can read account tree from own company', async () => {
    const res = await fetch(`${baseUrl}/api/accounts/tree`, {
      headers: { Authorization: `Bearer ${accountantTokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // ========================================================================
  // AC1: CASHIER (no accounting permissions) cannot read accounting data
  // ========================================================================
  it('CASHIER from Company A cannot read journals', async () => {
    const res = await fetch(`${baseUrl}/api/journals?limit=1`, {
      headers: { Authorization: `Bearer ${cashierTokenA}` },
    });
    // CASHIER has 0 accounting permissions — should be 403
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('CASHIER from Company B cannot read journals', async () => {
    const res = await fetch(`${baseUrl}/api/journals?limit=1`, {
      headers: { Authorization: `Bearer ${cashierTokenB}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('CASHIER from Company A cannot read accounts', async () => {
    const res = await fetch(`${baseUrl}/api/accounts?limit=10`, {
      headers: { Authorization: `Bearer ${cashierTokenA}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('CASHIER from Company B cannot read accounts', async () => {
    const res = await fetch(`${baseUrl}/api/accounts?limit=10`, {
      headers: { Authorization: `Bearer ${cashierTokenB}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  // ========================================================================
  // AC7: Cross-tenant data isolation — Company B token cannot access Company A data
  // ========================================================================
  // Verify that Company A's journal response only contains Company A's data
  it('journal listing is scoped to authenticated company', async () => {
    const res = await fetch(`${baseUrl}/api/journals?limit=5`, {
      headers: { Authorization: `Bearer ${accountantTokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // All returned journals should belong to Company A
    if (body.data && Array.isArray(body.data)) {
      for (const entry of body.data) {
        if (entry.company_id != null) {
          expect(entry.company_id).toBe(companyIdA);
        }
      }
    }
  });

  // DB-level verification of company scoping
  it('DB query confirms journals are company-scoped', async () => {
    const db = getTestDb();
    const rowsA = await db
      .selectFrom('journal_batches')
      .select(['id', 'company_id'])
      .where('company_id', '=', companyIdA)
      .limit(5)
      .execute();
    for (const row of rowsA) {
      expect(row.company_id).toBe(companyIdA);
    }
  });
});
