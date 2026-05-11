// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Story 61.4: AP Invoice/Payment Lifecycle & Period-Close Enforcement
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  createTestCompanyMinimal,
  createTestUser,
  createTestSupplier,
  createTestPurchasingAccounts,
  createTestPurchasingSettings,
  getRoleIdByCode,
  assignUserGlobalRole,
  setModulePermission,
  loginForTest,
  createTestFiscalYear,
  createTestFiscalPeriod,
  setTestFiscalPeriodStatus,
  getOrCreateTestCashierForPermission,
} from '../../fixtures';
import { buildPermissionMask } from '@jurnapod/auth';
import { initializeDefaultTemplates } from '../../../src/lib/numbering';

const CRUDAM = buildPermissionMask({
  canCreate: true, canRead: true, canUpdate: true,
  canDelete: true, canAnalyze: true, canManage: true,
});

let baseUrl: string;
let ownerToken: string;
let cashierToken: string;
let companyId: number;
let companyCode: string;
let supplierId: number;
let fiscalYearId: number;
let tagCounter = 0;

function tag(prefix: string): string {
  return `${prefix}${++tagCounter}${Date.now()}`.slice(0, 32);
}

describe('purchasing.period-close - Story 61.4', { timeout: 60000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    const company = await createTestCompanyMinimal({ code: `PC${Date.now()}`.slice(0, 20) });
    companyId = company.id;
    companyCode = company.code;

    await initializeDefaultTemplates(companyId);

    const ownerRoleId = await getRoleIdByCode('OWNER');
    const user = await createTestUser(companyId, {
      email: `pc-owner-${Date.now()}@example.com`,
      name: 'PC Owner',
      password: 'TestPassword123!',
    });
    await assignUserGlobalRole(user.id, ownerRoleId);
    for (const r of ['suppliers', 'orders', 'receipts', 'invoices', 'payments']) {
      await setModulePermission(companyId, ownerRoleId, 'purchasing', r, CRUDAM, { allowSystemRoleMutation: true });
    }
    ownerToken = await loginForTest(baseUrl, companyCode, user.email, 'TestPassword123!');

    const accounts = await createTestPurchasingAccounts(companyId);
    await createTestPurchasingSettings(companyId, accounts.ap_account_id, accounts.expense_account_id);

    const supplier = await createTestSupplier(companyId, { code: tag('SUP') });
    supplierId = supplier.id;

    const fy = await createTestFiscalYear(companyId, {
      year: 2026, startDate: '2026-01-01', endDate: '2026-12-31', status: 'OPEN',
    });
    fiscalYearId = fy.id;
    await createTestFiscalPeriod(fiscalYearId);

    const cashier = await getOrCreateTestCashierForPermission(companyId, companyCode, baseUrl);
    cashierToken = cashier.accessToken;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // ─── AC1: AP invoice posting rejected when fiscal year is closed ──

  describe('AC1: AP invoice period-close', () => {
    it('posts AP invoice when fiscal year is OPEN (200)', async () => {
      const res = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          invoice_no: tag('PI-OPEN'),
          invoice_date: '2026-05-01',
          currency_code: 'IDR',
          lines: [{ description: 'Test item', qty: '10', unit_price: '5000.00' }],
        }),
      });
      expect(res.status).toBe(201);
      const pi = await res.json();
      const piId = pi.data.id;

      const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      });
      expect(postRes.status).toBe(200);
      const postBody = await postRes.json();
      expect(postBody.success).toBe(true);
      expect(postBody.data.journal_batch_id).toBeGreaterThan(0);
    });

    it('rejects AP invoice posting when fiscal period is CLOSED (409)', async () => {
      // Create draft while period is still OPEN
      // NOTE: invoice_date must fall within the created fiscal period (2026-01-01 to 2026-01-31)
      // so that the period-close guardrail detects the closed period.
      const res = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          invoice_no: tag('PI-CLOSED'),
          invoice_date: '2026-01-15',
          currency_code: 'IDR',
          lines: [{ description: 'Blocked item', qty: '5', unit_price: '3000.00' }],
        }),
      });
      expect(res.status).toBe(201);
      const piId = (await res.json()).data.id;

      // Close the fiscal period
      await setTestFiscalPeriodStatus(fiscalYearId, companyId, 'CLOSED');

      // Post should fail — period is closed
      const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      });
      expect(postRes.status).toBe(409);
      const postBody = await postRes.json();
      expect(postBody.success).toBe(false);
      expect(postBody.error.code).toBe('PERIOD_CLOSED');
    });
  });

  // ─── AC3: AP invoice void creates reversal journals ──

  describe('AC3: Void reversal journals', () => {
    it('voiding a posted PI creates reversal journal entries', async () => {
      await setTestFiscalPeriodStatus(fiscalYearId, companyId, 'OPEN');

      const res = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          invoice_no: tag('PI-VOID'),
          invoice_date: '2026-07-01',
          currency_code: 'IDR',
          lines: [{ description: 'Voidable item', qty: '2', unit_price: '4000.00' }],
        }),
      });
      expect(res.status).toBe(201);
      const piId = (await res.json()).data.id;

      const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      });
      expect(postRes.status).toBe(200);

      const voidRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/void`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      });
      expect(voidRes.status).toBe(200);
      const voidBody = await voidRes.json();
      expect(voidBody.success).toBe(true);
      expect(voidBody.data.reversal_batch_id).toBeGreaterThan(0);
    });
  });

  // ─── AC4: Void uses DELETE permission ──

  describe('AC4: Void requires DELETE permission', () => {
    it('CASHIER cannot void PI (403)', async () => {
      const res = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          invoice_no: tag('PI-CASH'),
          invoice_date: '2026-08-01',
          currency_code: 'IDR',
          lines: [{ description: 'Cashier-blocked', qty: '1', unit_price: '2000.00' }],
        }),
      });
      expect(res.status).toBe(201);
      const piId = (await res.json()).data.id;

      const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      });
      expect(postRes.status).toBe(200);

      const voidRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/void`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cashierToken}`, 'Content-Type': 'application/json' },
      });
      expect(voidRes.status).toBe(403);
    });
  });
});
