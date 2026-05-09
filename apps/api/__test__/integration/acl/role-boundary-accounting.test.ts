// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Story 60.3: Role Boundary Tests — Accounting Module
 *
 * Verifies:
 *  - AC1: CASHIER (no accounting permissions — mask=0) cannot read
 *    journals, accounts, account tree, or fiscal years
 *  - AC7: Low-privilege role cannot access higher-privilege resources
 *  - Positive control: ACCOUNTANT (accounting CRUDA=31) CAN read accounting data
 *
 * Role matrix reference (AGENTS.md):
 *   CASHIER:     accounting = 0
 *   ACCOUNTANT:  accounting = CRUDA (31)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { acquireReadLock, releaseReadLock, getTestBaseUrl } from '../../helpers/setup';
import { closeTestDb } from '../../helpers/db';
import { makeTag } from '../../helpers/tags';
import {
  createTestCompany,
  createTestOutletMinimal,
  createTestUser,
  getRoleIdByCode,
  assignUserOutletRole,
  assignUserGlobalRole,
  loginForTest,
  resetFixtureRegistry,
  type UserFixture,
} from '../../fixtures';

const testPassword = process.env.JP_OWNER_PASSWORD ?? 'testpass123';

describe('role-boundary-accounting', { timeout: 90000 }, () => {
  const baseUrl = getTestBaseUrl();

  let companyId: number;
  let companyCode: string;
  let outletId: number;

  let cashierUser: UserFixture;
  let cashierToken: string;
  let accountantUser: UserFixture;
  let accountantToken: string;

  beforeAll(async () => {
    await acquireReadLock();

    // ── Company setup ──
    const company = await createTestCompany({
      name: 'RB Accounting Co',
      code: makeTag('RBACT'),
      timezone: 'Asia/Jakarta',
    });
    companyId = company.id;
    companyCode = company.code;

    const outlet = await createTestOutletMinimal(companyId, {
      code: makeTag('RBACTO'),
      timezone: 'Asia/Jakarta',
    });
    outletId = outlet.id;

    // ── CASHIER user (negative tests) ──
    cashierUser = await createTestUser(companyId, {
      email: `${makeTag('rbacctcsh')}@example.com`,
      name: 'RB Accounting Cashier',
      password: testPassword,
    });
    const cashierRoleId = await getRoleIdByCode('CASHIER');
    await assignUserOutletRole(cashierUser.id, cashierRoleId, outletId);
    cashierToken = await loginForTest(baseUrl, companyCode, cashierUser.email, testPassword);

    // ── ACCOUNTANT user (positive control) ──
    accountantUser = await createTestUser(companyId, {
      email: `${makeTag('rbacctacc')}@example.com`,
      name: 'RB Accounting Accountant',
      password: testPassword,
    });
    const accountantRoleId = await getRoleIdByCode('ACCOUNTANT');
    await assignUserGlobalRole(accountantUser.id, accountantRoleId);
    accountantToken = await loginForTest(baseUrl, companyCode, accountantUser.email, testPassword);
  }, 60000);

  afterAll(async () => {
    try {
      await resetFixtureRegistry();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  }, 30000);

  // ========================================================================
  // AC1: CASHIER (mask=0) cannot read accounting data
  // ========================================================================

  describe('AC1: CASHIER cannot access accounting endpoints', () => {
    it('CASHIER cannot GET /api/journals', async () => {
      const res = await fetch(`${baseUrl}/api/journals?limit=1`, {
        headers: { Authorization: `Bearer ${cashierToken}` },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('CASHIER cannot GET /api/accounts', async () => {
      const res = await fetch(`${baseUrl}/api/accounts?limit=10`, {
        headers: { Authorization: `Bearer ${cashierToken}` },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('CASHIER cannot GET /api/accounts/tree', async () => {
      const res = await fetch(`${baseUrl}/api/accounts/tree`, {
        headers: { Authorization: `Bearer ${cashierToken}` },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('CASHIER cannot GET /api/accounts/fiscal-years', async () => {
      const res = await fetch(`${baseUrl}/api/accounts/fiscal-years`, {
        headers: { Authorization: `Bearer ${cashierToken}` },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  // ========================================================================
  // AC1 Positive Controls: ACCOUNTANT CAN read accounting data
  // ========================================================================

  describe('Positive control: ACCOUNTANT CAN access accounting endpoints', () => {
    it('ACCOUNTANT can GET /api/journals', async () => {
      const res = await fetch(`${baseUrl}/api/journals?limit=1`, {
        headers: { Authorization: `Bearer ${accountantToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('ACCOUNTANT can GET /api/accounts', async () => {
      const res = await fetch(`${baseUrl}/api/accounts?limit=10`, {
        headers: { Authorization: `Bearer ${accountantToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('ACCOUNTANT can GET /api/accounts/tree', async () => {
      const res = await fetch(`${baseUrl}/api/accounts/tree`, {
        headers: { Authorization: `Bearer ${accountantToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('ACCOUNTANT can GET /api/accounts/fiscal-years (auth passes, not 403)', async () => {
      const res = await fetch(`${baseUrl}/api/accounts/fiscal-years`, {
        headers: { Authorization: `Bearer ${accountantToken}` },
      });
      // Auth gate passes (400 validation, not 403 denial)
      expect(res.status).not.toBe(403);
    });
  });

  // ========================================================================
  // AC7: CASHIER cannot escalate — negative token-proof
  // ========================================================================

  describe('AC7: No privilege escalation for CASHIER', () => {
    it('CASHIER cannot POST to /api/accounts/fiscal-years (CREATE denied)', async () => {
      const res = await fetch(`${baseUrl}/api/accounts/fiscal-years`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ year: 2026 }),
      });
      expect(res.status).toBe(403);
    });

    it('CASHIER cannot access fixed-asset endpoints', async () => {
      const res = await fetch(`${baseUrl}/api/accounts/fixed-assets`, {
        headers: { Authorization: `Bearer ${cashierToken}` },
      });
      expect(res.status).toBe(403);
    });
  });
});
