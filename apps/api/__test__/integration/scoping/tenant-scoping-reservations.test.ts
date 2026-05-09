// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tenant Isolation Tests — Reservations Module (Story 60.1)
 *
 * Verifies:
 *  - AC6: Reservations module company_id + outlet_id enforcement
 *  - AC7: Cross-tenant access returns 403
 *  - CASHIER (who HAS reservations permissions) cannot read bookings
 *    from another company
 *  - Outlet-scoped CASHIER cannot read bookings from another outlet
 *
 * NOTE: CASHIER system role has CRUDA (31) on reservations module,
 * making this a true cross-tenant scoping test (not just a permission denial test).
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

describe('tenant-scoping-reservations', { timeout: 90000 }, () => {
  let baseUrl: string;

  // Company A
  let companyIdA: number;
  let companyCodeA: string;
  let outletIdA1: number;
  let outletIdA2: number;
  let cashierTokenA1: string; // Outlet-scoped to A1

  // Company B
  let companyIdB: number;
  let companyCodeB: string;
  let outletIdB: number;
  let cashierTokenB: string; // Outlet-scoped to B

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    // ── Company A ──
    const companyA = await createTestCompany({
      name: 'Tenant Scoping Reservations Co A',
      code: `TSRES-A-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    companyIdA = companyA.id;
    companyCodeA = companyA.code;

    // Outlet A1
    const outA1 = await createTestOutletMinimal(companyIdA, {
      name: 'TS Reservations Outlet A1',
      code: `TSRESO-A1-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    outletIdA1 = outA1.id;

    // Outlet A2
    const outA2 = await createTestOutletMinimal(companyIdA, {
      name: 'TS Reservations Outlet A2',
      code: `TSRESO-A2-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    outletIdA2 = outA2.id;

    const cashierRoleId = await getRoleIdByCode('CASHIER');

    // CASHIER assigned to Outlet A1 only (outlet-scoped, NOT global)
    const cashierA1 = await createTestUser(companyIdA, {
      email: `ts-res-cash-a1-${Date.now()}@example.com`,
      name: 'TS Reservations Cashier A1',
      password: testPassword,
    });
    // Only assign outlet role to A1 — NO global role
    await assignUserOutletRole(cashierA1.id, cashierRoleId, outletIdA1);
    cashierTokenA1 = await loginForTest(baseUrl, companyCodeA, cashierA1.email, testPassword);

    // ── Company B ──
    const companyB = await createTestCompany({
      name: 'Tenant Scoping Reservations Co B',
      code: `TSRES-B-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    companyIdB = companyB.id;
    companyCodeB = companyB.code;

    const outletB = await createTestOutletMinimal(companyIdB, {
      name: 'TS Reservations Outlet B',
      code: `TSRESO-B-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    outletIdB = outletB.id;

    const cashierB = await createTestUser(companyIdB, {
      email: `ts-res-cash-b-${Date.now()}@example.com`,
      name: 'TS Reservations Cashier B',
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
  // AC6: CASHIER from Company A cannot read bookings from Company B
  // CASHIER HAS reservations permissions (CRUDA=31), so this tests
  // true cross-tenant data isolation (not just permission denial)
  // ========================================================================
  it('CASHIER from Company A cannot read bookings from Company B outlet', async () => {
    // Try to access Company B's outlet bookings using Company A's token
    const res = await fetch(`${baseUrl}/api/dinein/sessions?outletId=${outletIdB}&limit=5`, {
      headers: { Authorization: `Bearer ${cashierTokenA1}` },
    });
    // Should be denied — Company A's CASHIER cannot access Company B's outlet
    // The outlet doesn't belong to Company A, and the CASHIER isn't assigned to it
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('CASHIER from Company B cannot read bookings from Company A outlet', async () => {
    const res = await fetch(`${baseUrl}/api/dinein/sessions?outletId=${outletIdA1}&limit=5`, {
      headers: { Authorization: `Bearer ${cashierTokenB}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  // ========================================================================
  // AC6: Outlet-scoped CASHIER cannot read bookings from unassigned outlet
  // (within same company)
  // ========================================================================
  it('outlet-scoped CASHIER (A1) cannot read bookings from unassigned outlet (A2)', async () => {
    // CASHIER A1 is only assigned to Outlet A1 — accessing Outlet A2 should fail
    const res = await fetch(`${baseUrl}/api/dinein/sessions?outletId=${outletIdA2}&limit=5`, {
      headers: { Authorization: `Bearer ${cashierTokenA1}` },
    });
    // Should be 403 — CASHIER A1 is not assigned to Outlet A2
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  // ========================================================================
  // AC6: Tables endpoint — same cross-tenant and outlet-scoping checks
  // ========================================================================
  it('CASHIER from Company A cannot read tables from Company B outlet', async () => {
    const res = await fetch(`${baseUrl}/api/dinein/tables?outletId=${outletIdB}`, {
      headers: { Authorization: `Bearer ${cashierTokenA1}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('outlet-scoped CASHIER (A1) cannot read tables from unassigned outlet (A2)', async () => {
    const res = await fetch(`${baseUrl}/api/dinein/tables?outletId=${outletIdA2}`, {
      headers: { Authorization: `Bearer ${cashierTokenA1}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
