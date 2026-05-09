// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Story 60.3: Role Boundary Tests — Inventory Module
 *
 * Verifies:
 *  - AC2: CASHIER has READ(1) on inventory.items per canonical matrix — can list items
 *  - AC7: CASHIER cannot CREATE/UPDATE/DELETE items (only READ)
 *  - Positive control: OWNER can access inventory endpoints
 *
 * Role matrix reference (canonical: packages/shared/src/constants/roles.defaults.json):
 *   CASHIER:  inventory.items = READ(1)
 *   OWNER:    inventory = CRUDAM (63)
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

describe('role-boundary-inventory', { timeout: 90000 }, () => {
  const baseUrl = getTestBaseUrl();

  let companyId: number;
  let companyCode: string;
  let outletId: number;

  let cashierUser: UserFixture;
  let cashierToken: string;
  let ownerUser: UserFixture;
  let ownerToken: string;

  beforeAll(async () => {
    await acquireReadLock();

    // ── Company setup ──
    const company = await createTestCompany({
      name: 'RB Inventory Co',
      code: makeTag('RBINV'),
      timezone: 'Asia/Jakarta',
    });
    companyId = company.id;
    companyCode = company.code;

    const outlet = await createTestOutletMinimal(companyId, {
      code: makeTag('RBINVO'),
      timezone: 'Asia/Jakarta',
    });
    outletId = outlet.id;

    // ── CASHIER user (READ=1 on inventory.items — can list, cannot create) ──
    cashierUser = await createTestUser(companyId, {
      email: `${makeTag('rbinvcsh')}@example.com`,
      name: 'RB Inventory Cashier',
      password: testPassword,
    });
    const cashierRoleId = await getRoleIdByCode('CASHIER');
    await assignUserOutletRole(cashierUser.id, cashierRoleId, outletId);
    cashierToken = await loginForTest(baseUrl, companyCode, cashierUser.email, testPassword);

    // ── OWNER user (positive control) ──
    ownerUser = await createTestUser(companyId, {
      email: `${makeTag('rbinvownr')}@example.com`,
      name: 'RB Inventory Owner',
      password: testPassword,
    });
    const ownerRoleId = await getRoleIdByCode('OWNER');
    await assignUserGlobalRole(ownerUser.id, ownerRoleId);
    ownerToken = await loginForTest(baseUrl, companyCode, ownerUser.email, testPassword);
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
  // AC2: CASHIER has READ(1) on inventory.items per canonical matrix
  // ========================================================================

  describe('AC2: CASHIER inventory READ access (canonical matrix)', () => {
    it('GET /api/inventory/items — CASHIER can list items (READ=1)', async () => {
      const res = await fetch(`${baseUrl}/api/inventory/items?limit=10`, {
        headers: { Authorization: `Bearer ${cashierToken}` },
      });
      // CASHIER has inventory.items = READ(1) per roles.defaults.json
      expect(res.status).toBe(200);
    });

    it('GET /api/inventory/items — OWNER positive control', async () => {
      const res = await fetch(`${baseUrl}/api/inventory/items?limit=10`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  // ========================================================================
  // AC7: No privilege escalation — CASHIER cannot CREATE items
  // ========================================================================

  describe('AC7: CASHIER cannot write inventory data (CREATE check)', () => {
    it('CASHIER cannot POST to /api/inventory/items (CREATE denied)', async () => {
      const res = await fetch(`${baseUrl}/api/inventory/items`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cashierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'test-item-rb',
          type: 'PRODUCT',
        }),
      });
      // CASHIER has READ(1) on inventory.items — no CREATE(2) bit, expect 403
      expect(res.status).toBe(403);
    });
  });
});
