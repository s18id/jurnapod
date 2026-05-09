// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Story 60.3: Role Boundary Tests — POS Module
 *
 * Verifies:
 *  - AC4: ACCOUNTANT (POS READ=1 only, NOT in allowed roles list) cannot
 *    POST to /api/sync/push (write POS transactions)
 *  - Positive control: CASHIER (POS CRUDA=31, IN allowed roles list)
 *    CAN push to sync/push (at minimum, auth gate passes — may get 4xx on validation)
 *
 * Role matrix reference (AGENTS.md):
 *   ACCOUNTANT:  pos = 1 (READ only)
 *   CASHIER:     pos = CRUDA (31)
 *
 * Route guard (from routes/sync/push.ts):
 *   requireAccess({
 *     roles: ["OWNER", "ADMIN", "CASHIER"],
 *     module: "pos",
 *     resource: "transactions",
 *     permission: "create",
 *     outletId: validatedOutletId,
 *   })
 *
 * ACCOUNTANT is NOT in the roles list → must be 403.
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

describe('role-boundary-pos', { timeout: 90000 }, () => {
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
      name: 'RB POS Co',
      code: makeTag('RBPOS'),
      timezone: 'Asia/Jakarta',
    });
    companyId = company.id;
    companyCode = company.code;

    const outlet = await createTestOutletMinimal(companyId, {
      code: makeTag('RBPOSO'),
      timezone: 'Asia/Jakarta',
    });
    outletId = outlet.id;

    // ── CASHIER user (positive control — IN allowed roles) ──
    cashierUser = await createTestUser(companyId, {
      email: `${makeTag('rbposcsh')}@example.com`,
      name: 'RB POS Cashier',
      password: testPassword,
    });
    const cashierRoleId = await getRoleIdByCode('CASHIER');
    await assignUserOutletRole(cashierUser.id, cashierRoleId, outletId);
    cashierToken = await loginForTest(baseUrl, companyCode, cashierUser.email, testPassword);

    // ── ACCOUNTANT user (negative test — NOT in allowed roles) ──
    accountantUser = await createTestUser(companyId, {
      email: `${makeTag('rbposacc')}@example.com`,
      name: 'RB POS Accountant',
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
  // AC4: ACCOUNTANT cannot POST to /api/sync/push
  // ========================================================================

  describe('AC4: ACCOUNTANT cannot write POS transactions', () => {
    it('ACCOUNTANT POST /api/sync/push → 403 (not in allowed roles)', async () => {
      const res = await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accountantToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outlet_id: outletId,
          client_tx_id: `RB-POS-TEST-${Date.now()}`,
          transactions: [],
        }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    // NOTE: /api/sync/check-duplicate returns 400 for ACCOUNTANT (not 403).
    // The endpoint does not enforce the same roles list guard as /api/sync/push.
    // This is a P2 finding: inconsistent role enforcement across sync endpoints.
  });

  // ========================================================================
  // AC4 Positive Control: CASHIER CAN push (auth gate passes)
  // ========================================================================

  describe('Positive control: CASHIER CAN push POS transactions', () => {
    it('CASHIER POST /api/sync/push — auth passes (may get 4xx validation)', async () => {
      const res = await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outlet_id: outletId,
          client_tx_id: `RB-POS-CASH-${Date.now()}`,
          transactions: [],
        }),
      });
      // CASHIER is in the allowed roles list — auth gate MUST pass (not 403)
      // The body may fail validation (4xx), but that's not a role boundary issue
      expect(res.status).not.toBe(403);
    });

    it('CASHIER GET /api/sync/health — can access', async () => {
      const res = await fetch(`${baseUrl}/api/sync/health`, {
        headers: { Authorization: `Bearer ${cashierToken}` },
      });
      // CASHIER has POS permissions, should be able to check sync health
      // May be 200 (success) or other (endpoint may not be fully implemented)
      expect(res.status).not.toBe(403);
    });
  });

  // ========================================================================
  // AC7: ACCOUNTANT cannot escalate — POS write fully blocked
  // ========================================================================

  describe('AC7: No privilege escalation — POS write blocked for ACCOUNTANT', () => {
    it('ACCOUNTANT cannot push — roles list excludes ACCOUNTANT', async () => {
      const res = await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accountantToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outlet_id: outletId,
          client_tx_id: `RB-POS-ESC-${Date.now()}`,
          transactions: [],
        }),
      });
      expect(res.status).toBe(403);
    });
  });
});
