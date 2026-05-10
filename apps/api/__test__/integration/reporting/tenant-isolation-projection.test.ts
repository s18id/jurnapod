// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Story 62.4 AC2, AC5: Tenant Isolation — Projection Endpoints
 *
 * Verifies:
 *  - AC2: CASHIER role boundary — 403 on endpoints where CASHIER has mask=0
 *  - AC5: Cross-company tenant isolation — OWNER of Company A cannot access Company B data
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import {
  resetFixtureRegistry,
  createTestCompanyMinimal,
  createTestOutletMinimal,
  createTestUser,
  getRoleIdByCode,
  assignUserGlobalRole,
  assignUserOutletRole,
  setModulePermission,
  loginForTest,
  getOrCreateTestCashierForPermission,
} from '../../fixtures';
import { makeTag } from '../../helpers/tags';
import { sql } from 'kysely';
import { getDb } from '@/lib/db';

// Deterministic future dates — beyond any real transaction
const FIXED_AS_OF_DATE = '2099-12-31';
const FIXED_DATE_FROM = '2099-01-01';
const FIXED_DATE_TO = '2099-12-31';

describe('tenant-isolation-projection', { timeout: 60000 }, () => {
  let baseUrl: string;

  // Company A
  let companyAId: number;
  let outletAId: number;

  // Company B
  let companyBId: number;
  let outletBId: number;

  // Tokens
  let cashierTokenA: string;
  let cashierTokenB: string;
  let ownerTokenA: string;
  let ownerTokenB: string;

  const getJson = async (path: string, token: string) => {
    return fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  };

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    // ── Create Company A ──
    const companyA = await createTestCompanyMinimal();
    companyAId = companyA.id;
    const outletA = await createTestOutletMinimal(companyAId);
    outletAId = outletA.id;

    // Company A OWNER
    const ownerEmailA = `ti-own-a-${makeTag('TENANT')}@example.com`;
    const ownerA = await createTestUser(companyAId, { email: ownerEmailA, name: 'Tenant Owner A', password: 'TestPassword123!' });
    const ownerRoleId = await getRoleIdByCode('OWNER');
    await assignUserGlobalRole(ownerA.id, ownerRoleId);
    await assignUserOutletRole(ownerA.id, ownerRoleId, outletAId);
    await setModulePermission(companyAId, ownerRoleId, 'accounting', 'reports', 63, { allowSystemRoleMutation: true });
    await setModulePermission(companyAId, ownerRoleId, 'purchasing', 'reports', 63, { allowSystemRoleMutation: true });
    await setModulePermission(companyAId, ownerRoleId, 'treasury', 'transactions', 63, { allowSystemRoleMutation: true });
    ownerTokenA = await loginForTest(baseUrl, companyA.code, ownerEmailA, 'TestPassword123!');

    // Company A CASHIER
    const cashierA = await getOrCreateTestCashierForPermission(companyAId, companyA.code, baseUrl);
    cashierTokenA = cashierA.accessToken;

    // ── Create Company B ──
    const companyB = await createTestCompanyMinimal();
    companyBId = companyB.id;
    const outletB = await createTestOutletMinimal(companyBId);
    outletBId = outletB.id;

    // Company B OWNER
    const ownerEmailB = `ti-own-b-${makeTag('TENANT')}@example.com`;
    const ownerB = await createTestUser(companyBId, { email: ownerEmailB, name: 'Tenant Owner B', password: 'TestPassword123!' });
    await assignUserGlobalRole(ownerB.id, ownerRoleId);
    await assignUserOutletRole(ownerB.id, ownerRoleId, outletBId);
    await setModulePermission(companyBId, ownerRoleId, 'accounting', 'reports', 63, { allowSystemRoleMutation: true });
    await setModulePermission(companyBId, ownerRoleId, 'purchasing', 'reports', 63, { allowSystemRoleMutation: true });
    await setModulePermission(companyBId, ownerRoleId, 'treasury', 'transactions', 63, { allowSystemRoleMutation: true });
    ownerTokenB = await loginForTest(baseUrl, companyB.code, ownerEmailB, 'TestPassword123!');

    // Company B CASHIER
    const cashierB = await getOrCreateTestCashierForPermission(companyBId, companyB.code, baseUrl);
    cashierTokenB = cashierB.accessToken;
  });

  afterAll(async () => {
    try { resetFixtureRegistry(); } finally {
    try { await closeTestDb(); } finally {
    try { await releaseReadLock(); } catch { /* noop */ } } }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC2: CASHIER role boundary — 403 on endpoints where mask=0
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC2: CASHIER 403 on no-permission endpoints', () => {
    it('AR aging → 403 (CASHIER mask=0 on accounting)', async () => {
      const res = await getJson(`/api/reports/receivables-ageing?as_of_date=${FIXED_AS_OF_DATE}`, cashierTokenA);
      expect(res.status).toBe(403);
    });

    it('AP aging → 403 (CASHIER mask=0 on purchasing)', async () => {
      const res = await getJson(`/api/purchasing/reports/ap-aging?as_of_date=${FIXED_AS_OF_DATE}`, cashierTokenA);
      expect(res.status).toBe(403);
    });

    it('GL Trial Balance → 403 (CASHIER mask=0 on accounting)', async () => {
      const res = await getJson(`/api/reports/trial-balance?date_from=${FIXED_DATE_FROM}&date_to=${FIXED_DATE_TO}`, cashierTokenA);
      expect(res.status).toBe(403);
    });

    it('Cash-bank transactions → 403 (CASHIER mask=0 on treasury)', async () => {
      const res = await getJson('/api/cash-bank-transactions', cashierTokenA);
      expect(res.status).toBe(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC5: Cross-tenant data isolation — OWNER of Company A cannot see Company B
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC5: Cross-tenant OWNER isolation', () => {
    it('AR aging: Company A OWNER does not see Company B data', async () => {
      // Seed an invoice in Company A only
      const db = getDb();
      const tag = makeTag('TENISO');
      const custResult = await sql<{ insertId: number }>`
        INSERT INTO customers (company_id, code, display_name, type, is_active, created_at, updated_at)
        VALUES (${companyAId}, ${`CA-${tag}`.slice(0, 20)}, ${`Tenant Customer ${tag}`}, 1, 1, NOW(), NOW())
      `.execute(db);
      await sql`
        INSERT INTO sales_invoices (company_id, outlet_id, invoice_no, invoice_date, due_date, customer_id, status, payment_status, grand_total, subtotal, tax_amount, paid_total, created_at, updated_at)
        VALUES (${companyAId}, ${outletAId}, ${`SIA-${tag}`}, ${FIXED_AS_OF_DATE}, '2020-01-01', ${Number(custResult.insertId)}, 'POSTED', 'UNPAID', 500000, 500000, 0, 0, NOW(), NOW())
      `.execute(db);

      const resA = await getJson(`/api/reports/receivables-ageing?as_of_date=${FIXED_AS_OF_DATE}`, ownerTokenA);
      expect(resA.status).toBe(200);
      const bodyA = await resA.json();
      const invoicesA = bodyA.data.invoices as Array<{ invoice_no: string }>;

      const resB = await getJson(`/api/reports/receivables-ageing?as_of_date=${FIXED_AS_OF_DATE}`, ownerTokenB);
      expect(resB.status).toBe(200);
      const bodyB = await resB.json();
      const invoicesB = bodyB.data.invoices as Array<{ invoice_no: string }>;

      // Company A invoices MUST NOT appear in Company B results
      const companyAInvoiceNos = invoicesA.map((inv) => inv.invoice_no);
      const companyBInvoiceNos = invoicesB.map((inv) => inv.invoice_no);
      for (const invNo of companyAInvoiceNos) {
        expect(companyBInvoiceNos).not.toContain(invNo);
      }
    });

    it('GL Trial Balance: isolated per company', async () => {
      const resA = await getJson(`/api/reports/trial-balance?date_from=${FIXED_DATE_FROM}&date_to=${FIXED_DATE_TO}`, ownerTokenA);
      expect(resA.status).toBe(200);
      const bodyA = await resA.json();

      const resB = await getJson(`/api/reports/trial-balance?date_from=${FIXED_DATE_FROM}&date_to=${FIXED_DATE_TO}`, ownerTokenB);
      expect(resB.status).toBe(200);
      const bodyB = await resB.json();

      // Filters should reference different outlet sets
      const outletIdsA: number[] = bodyA.data.filters?.outlet_ids ?? [];
      const outletIdsB: number[] = bodyB.data.filters?.outlet_ids ?? [];

      // Company B outlet MUST NOT be in Company A's filter
      for (const id of outletIdsB) {
        if (id === outletBId) expect(outletIdsA).not.toContain(id);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC2: Unauthenticated → 401 on all projection endpoints
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC2: Unauthenticated → 401', () => {
    it('AR aging → 401 without auth', async () => {
      const res = await fetch(`${baseUrl}/api/reports/receivables-ageing?as_of_date=${FIXED_AS_OF_DATE}`);
      expect(res.status).toBe(401);
    });

    it('GL Trial Balance → 401 without auth', async () => {
      const res = await fetch(`${baseUrl}/api/reports/trial-balance?date_from=${FIXED_DATE_FROM}&date_to=${FIXED_DATE_TO}`);
      expect(res.status).toBe(401);
    });

    it('Daily sales → 401 without auth', async () => {
      const res = await fetch(`${baseUrl}/api/reports/daily-sales?date_from=${FIXED_DATE_FROM}&date_to=${FIXED_DATE_TO}`);
      expect(res.status).toBe(401);
    });

    it('Cash-bank → 401 without auth', async () => {
      const res = await fetch(`${baseUrl}/api/cash-bank-transactions`);
      expect(res.status).toBe(401);
    });
  });
});
