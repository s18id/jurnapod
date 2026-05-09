// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tenant Isolation Tests — Inventory Module (Story 60.1)
 *
 * Verifies:
 *  - AC2: Inventory module company_id + outlet_id enforcement
 *  - AC7: Cross-tenant data isolation — Company A cannot see Company B's items
 *  - Data-scoping: items returned are filtered to authenticated user's company
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import {
  createTestCompany,
  createTestOutletMinimal,
  createTestUser,
  createTestItem,
  getRoleIdByCode,
  assignUserOutletRole,
  assignUserGlobalRole,
  loginForTest,
  resetFixtureRegistry,
} from '../../fixtures';
import type { ItemFixture } from '../../fixtures';

const testPassword = process.env.JP_OWNER_PASSWORD ?? 'testpass123';

describe('tenant-scoping-inventory', { timeout: 90000 }, () => {
  let baseUrl: string;

  // Company A
  let companyIdA: number;
  let companyCodeA: string;
  let outletIdA: number;
  let cashierTokenA: string;
  let itemA: ItemFixture;

  // Company B
  let companyIdB: number;
  let companyCodeB: string;
  let outletIdB: number;
  let cashierTokenB: string;
  let itemB: ItemFixture;

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    // ── Company A ──
    const companyA = await createTestCompany({
      name: 'Tenant Scoping Inventory Co A',
      code: `TSINV-A-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    companyIdA = companyA.id;
    companyCodeA = companyA.code;

    const outletA = await createTestOutletMinimal(companyIdA, {
      name: 'TS Inventory Outlet A',
      code: `TSINVO-A-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    outletIdA = outletA.id;

    const cashierRoleId = await getRoleIdByCode('CASHIER');
    const cashierA = await createTestUser(companyIdA, {
      email: `ts-inv-cash-a-${Date.now()}@example.com`,
      name: 'TS Inventory Cashier A',
      password: testPassword,
    });
    await assignUserOutletRole(cashierA.id, cashierRoleId, outletIdA);
    cashierTokenA = await loginForTest(baseUrl, companyCodeA, cashierA.email, testPassword);

    // Create an item in Company A
    itemA = await createTestItem(companyIdA, {
      name: 'TS Inventory Item A',
      type: 'PRODUCT',
      trackStock: false,
    });

    // ── Company B ──
    const companyB = await createTestCompany({
      name: 'Tenant Scoping Inventory Co B',
      code: `TSINV-B-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    companyIdB = companyB.id;
    companyCodeB = companyB.code;

    const outletB = await createTestOutletMinimal(companyIdB, {
      name: 'TS Inventory Outlet B',
      code: `TSINVO-B-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    outletIdB = outletB.id;

    const cashierB = await createTestUser(companyIdB, {
      email: `ts-inv-cash-b-${Date.now()}@example.com`,
      name: 'TS Inventory Cashier B',
      password: testPassword,
    });
    await assignUserOutletRole(cashierB.id, cashierRoleId, outletIdB);
    cashierTokenB = await loginForTest(baseUrl, companyCodeB, cashierB.email, testPassword);

    // Create an item in Company B
    itemB = await createTestItem(companyIdB, {
      name: 'TS Inventory Item B',
      type: 'PRODUCT',
      trackStock: false,
    });
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
  // AC2: Items are scoped to authenticated user's company
  // ========================================================================
  it('Company A CASHIER sees only Company A items', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items`, {
      headers: { Authorization: `Bearer ${cashierTokenA}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const items: any[] = body.data ?? [];
    // All returned items should belong to Company A
    for (const item of items) {
      if (item.company_id != null) {
        expect(item.company_id).toBe(companyIdA);
      }
    }
    // Company A's item should be in the list
    const itemAIds = items.map((i: any) => i.id);
    expect(itemAIds).toContain(itemA.id);
    // Company B's item should NOT be in the list
    expect(itemAIds).not.toContain(itemB.id);
  });

  it('Company B CASHIER sees only Company B items', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items`, {
      headers: { Authorization: `Bearer ${cashierTokenB}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const items: any[] = body.data ?? [];
    // All returned items should belong to Company B
    for (const item of items) {
      if (item.company_id != null) {
        expect(item.company_id).toBe(companyIdB);
      }
    }
    // Company B's item should be in the list
    const itemBIds = items.map((i: any) => i.id);
    expect(itemBIds).toContain(itemB.id);
    // Company A's item should NOT be in the list
    expect(itemBIds).not.toContain(itemA.id);
  });

  // ========================================================================
  // AC2/AC7: Cross-company item access blocked at DB level
  // ========================================================================
  it('Company A token cannot retrieve Company B item by ID', async () => {
    // Try to fetch Company B's item using Company A's token
    const res = await fetch(`${baseUrl}/api/inventory/items/${itemB.id}`, {
      headers: { Authorization: `Bearer ${cashierTokenA}` },
    });
    // Should be 404 (item doesn't exist in Company A's scope) or 403
    expect([403, 404]).toContain(res.status);
  });

  it('Company B token cannot retrieve Company A item by ID', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items/${itemA.id}`, {
      headers: { Authorization: `Bearer ${cashierTokenB}` },
    });
    expect([403, 404]).toContain(res.status);
  });

  // ========================================================================
  // AC2: Direct DB verification — cross-company scoping at query level
  // ========================================================================
  it('DB query confirms items are scoped by company_id', async () => {
    const db = getTestDb();
    // Company A query must contain Company A's item
    const rowsA = await db
      .selectFrom('items')
      .select(['id', 'company_id', 'name'])
      .where('company_id', '=', companyIdA)
      .where('id', '=', itemA.id)
      .execute();
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].company_id).toBe(companyIdA);

    // Company A query must NOT contain Company B's item
    const rowsAB = await db
      .selectFrom('items')
      .select(['id'])
      .where('company_id', '=', companyIdA)
      .where('id', '=', itemB.id)
      .execute();
    expect(rowsAB).toHaveLength(0);

    // Company B query must NOT contain Company A's item
    const rowsBA = await db
      .selectFrom('items')
      .select(['id'])
      .where('company_id', '=', companyIdB)
      .where('id', '=', itemA.id)
      .execute();
    expect(rowsBA).toHaveLength(0);
  });
});
