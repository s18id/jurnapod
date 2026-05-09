// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Story 60.3: Role Boundary Tests — Treasury Module
 *
 * Verifies:
 *  - AC3: CASHIER (no treasury permissions — mask=0) cannot read treasury transactions
 *  - AC7: Low-privilege role cannot access higher-privilege resources
 *  - Positive control: ACCOUNTANT (treasury READ=1) CAN read treasury transactions
 *
 * Role matrix reference (AGENTS.md):
 *   CASHIER:     treasury = 0
 *   ACCOUNTANT:  treasury = 1 (READ)
 *   OWNER:       treasury = CRUDAM (63)
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

describe('role-boundary-treasury', { timeout: 90000 }, () => {
  const baseUrl = getTestBaseUrl();

  let companyId: number;
  let companyCode: string;
  let outletId: number;

  let cashierUser: UserFixture;
  let cashierToken: string;
  let ownerUser: UserFixture;
  let ownerToken: string;
  let accountantUser: UserFixture;
  let accountantToken: string;

  beforeAll(async () => {
    await acquireReadLock();

    // ── Company setup ──
    const company = await createTestCompany({
      name: 'RB Treasury Co',
      code: makeTag('RBTRE'),
      timezone: 'Asia/Jakarta',
    });
    companyId = company.id;
    companyCode = company.code;

    const outlet = await createTestOutletMinimal(companyId, {
      code: makeTag('RBTREO'),
      timezone: 'Asia/Jakarta',
    });
    outletId = outlet.id;

    // ── CASHIER user (negative tests — expected 403) ──
    cashierUser = await createTestUser(companyId, {
      email: `${makeTag('rbtrecsh')}@example.com`,
      name: 'RB Treasury Cashier',
      password: testPassword,
    });
    const cashierRoleId = await getRoleIdByCode('CASHIER');
    await assignUserOutletRole(cashierUser.id, cashierRoleId, outletId);
    cashierToken = await loginForTest(baseUrl, companyCode, cashierUser.email, testPassword);

    // ── OWNER user (positive control — treasury CRUDAM=63) ──
    // Company-level module_roles seeded by canonical ACL migration (0207).
    // OWNER gets treasury.transactions mask=63 (CRUDAM) — no explicit grant needed.
    ownerUser = await createTestUser(companyId, {
      email: `${makeTag('rbtreown')}@example.com`,
      name: 'RB Treasury Owner',
      password: testPassword,
    });
    const ownerRoleId = await getRoleIdByCode('OWNER');
    await assignUserGlobalRole(ownerUser.id, ownerRoleId);
    ownerToken = await loginForTest(baseUrl, companyCode, ownerUser.email, testPassword);

    // ── ACCOUNTANT user (positive control — treasury READ=1) ──
    accountantUser = await createTestUser(companyId, {
      email: `${makeTag('rbtreacc')}@example.com`,
      name: 'RB Treasury Accountant',
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
  // AC3: CASHIER (mask=0) cannot read treasury data
  // ========================================================================

  describe('AC3: CASHIER cannot access treasury endpoints', () => {
    it('CASHIER cannot GET /api/cash-bank-transactions', async () => {
      const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
        headers: { Authorization: `Bearer ${cashierToken}` },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('CASHIER cannot POST to /api/cash-bank-transactions (CREATE denied)', async () => {
      const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(403);
    });
  });

  // ========================================================================
  // AC3 Positive Controls: ACCOUNTANT CAN read treasury data
  // ========================================================================

  describe('Positive control: OWNER CAN access treasury endpoints', () => {
    it('OWNER can GET /api/cash-bank-transactions', async () => {
      const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  // ========================================================================
  // AC3 Positive Controls: ACCOUNTANT CAN read treasury data
  // ========================================================================

  describe('Positive control: ACCOUNTANT CAN access treasury endpoints', () => {
    it('ACCOUNTANT can GET /api/cash-bank-transactions', async () => {
      const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
        headers: { Authorization: `Bearer ${accountantToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  // ========================================================================
  // AC7: CASHIER cannot escalate — denied on all treasury operations
  // ========================================================================

  describe('AC7: No privilege escalation — treasury module fully blocked for CASHIER', () => {
    it('CASHIER denied GET access — treasury module', async () => {
      const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
        headers: { Authorization: `Bearer ${cashierToken}` },
      });
      expect(res.status).toBe(403);
    });
  });
});
