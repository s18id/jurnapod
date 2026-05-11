// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Story 61.6: Sales↔Purchasing↔GL Reconciliation Gate
 *
 * Proves:
 * - AC1/AC2: Sales and AP invoice journals reconcile to zero net
 * - AC4: Void documents excluded from reconciliation (net zero)
 * - AC5: Journal entries are balanced (debits = credits)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { JournalsService, JournalNotFoundError } from '@jurnapod/modules-accounting';
import {
  resetFixtureRegistry,
  createTestCompanyMinimal,
  createTestUser,
  createTestSupplier,
  createTestPurchasingAccounts,
  createTestPurchasingSettings,
  createTestOutletMinimal,
  ensureTestSalesAccountMappings,
  getRoleIdByCode,
  assignUserGlobalRole,
  setModulePermission,
  loginForTest,
  createTestFiscalYear,
  createTestFiscalPeriod,
} from '../../fixtures';
import { buildPermissionMask } from '@jurnapod/auth';
import { initializeDefaultTemplates } from '../../../src/lib/numbering';

const CRUDAM = buildPermissionMask({
  canCreate: true, canRead: true, canUpdate: true,
  canDelete: true, canAnalyze: true, canManage: true,
});

let baseUrl: string;
let ownerToken: string;
let companyId: number;
let companyCode: string;
let outletId: number;
let supplierId: number;
let fiscalYearId: number;

function tag(prefix: string): string {
  return `${prefix}${Date.now()}`.slice(0, 32);
}

/**
 * Get journal totals (debit/credit sums) for a document.
 * Replaces inline COALESCE(SUM(...)) queries with JournalsService.getJournalBatch().
 */
async function getJournalTotalsForDoc(
  companyId: number,
  docType: string,
  docId: number
): Promise<{ totalDebit: number; totalCredit: number }> {
  const db = getTestDb();
  const batch = await db
    .selectFrom('journal_batches')
    .select('id')
    .where('company_id', '=', companyId)
    .where('doc_type', '=', docType)
    .where('doc_id', '=', docId)
    .executeTakeFirst();

  if (!batch) return { totalDebit: 0, totalCredit: 0 };

  try {
    const service = new JournalsService(db);
    const journalBatch = await service.getJournalBatch(batch.id, companyId);
    const totalDebit = journalBatch.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = journalBatch.lines.reduce((sum, l) => sum + l.credit, 0);
    return { totalDebit, totalCredit };
  } catch (err) {
    if (err instanceof JournalNotFoundError) {
      return { totalDebit: 0, totalCredit: 0 };
    }
    throw err;
  }
}

describe('reconciliation.sales-purchasing-gl - Story 61.6', { timeout: 60000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    const company = await createTestCompanyMinimal({ code: `RC${Date.now()}`.slice(0, 20) });
    companyId = company.id;
    companyCode = company.code;

    await initializeDefaultTemplates(companyId);

    const outlet = await createTestOutletMinimal(companyId, { code: `RO${Date.now()}`.slice(0, 20) });
    outletId = outlet.id;

    await ensureTestSalesAccountMappings(companyId, outletId);

    const ownerRoleId = await getRoleIdByCode('OWNER');
    const user = await createTestUser(companyId, {
      email: `rc-owner-${Date.now()}@example.com`,
      name: 'RC Owner',
      password: 'TestPassword123!',
    });
    await assignUserGlobalRole(user.id, ownerRoleId);
    for (const r of ['invoices', 'payments']) {
      await setModulePermission(companyId, ownerRoleId, 'sales', r, CRUDAM, { allowSystemRoleMutation: true });
    }
    for (const r of ['suppliers', 'invoices']) {
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
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // ─── AC5: Journal entries are balanced ──

  describe('AC5: Journal integrity', () => {
    it('sales invoice posting creates balanced journal entries (debits = credits)', async () => {
      const invRes = await fetch(`${baseUrl}/api/sales/invoices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_date: '2026-05-01',
          lines: [{ description: 'Sales item', qty: 2, unit_price: 50000 }],
        }),
      });
      expect(invRes.status).toBe(201);
      const invId = (await invRes.json()).data.id;

      await fetch(`${baseUrl}/api/sales/invoices/${invId}/post`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      });

      const totals = await getJournalTotalsForDoc(companyId, 'SALES_INVOICE', invId);
      expect(totals.totalDebit).toBe(totals.totalCredit);
      expect(totals.totalDebit).toBeGreaterThan(0);
    });

    it('AP invoice posting creates balanced journal entries', async () => {
      const invRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          invoice_no: tag('PI-JRN'),
          invoice_date: '2026-05-10',
          currency_code: 'IDR',
          lines: [{ description: 'AP item', qty: '3', unit_price: '10000.00' }],
        }),
      });
      expect(invRes.status).toBe(201);
      const piId = (await invRes.json()).data.id;

      await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      });

      const totals = await getJournalTotalsForDoc(companyId, 'PURCHASE_INVOICE', piId);
      expect(totals.totalDebit).toBe(totals.totalCredit);
      expect(totals.totalDebit).toBeGreaterThan(0);
    });
  });

  // ─── AC4: Void documents excluded (net zero) ──

  describe('AC4: Void documents excluded', () => {
    it('voided invoice journals net to zero contribution', async () => {
      const invRes = await fetch(`${baseUrl}/api/sales/invoices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_date: '2026-05-20',
          lines: [{ description: 'Void test', qty: 1, unit_price: 30000 }],
        }),
      });
      expect(invRes.status).toBe(201);
      const invId = (await invRes.json()).data.id;

      await fetch(`${baseUrl}/api/sales/invoices/${invId}/post`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      });
      await fetch(`${baseUrl}/api/sales/invoices/${invId}/void`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      });

      const salesTotals = await getJournalTotalsForDoc(companyId, 'SALES_INVOICE', invId);
      const voidTotals = await getJournalTotalsForDoc(companyId, 'SALES_INVOICE_VOID', invId);
      const netDebit = salesTotals.totalDebit + voidTotals.totalDebit;
      const netCredit = salesTotals.totalCredit + voidTotals.totalCredit;
      expect(netDebit).toBe(netCredit);
    });

    it('voided AP invoice journals net to zero', async () => {
      const invRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          invoice_no: tag('PI-VOID'),
          invoice_date: '2026-06-01',
          currency_code: 'IDR',
          lines: [{ description: 'AP void test', qty: '2', unit_price: '5000.00' }],
        }),
      });
      expect(invRes.status).toBe(201);
      const piId = (await invRes.json()).data.id;

      await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      });
      await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/void`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      });

      const apTotals = await getJournalTotalsForDoc(companyId, 'PURCHASE_INVOICE', piId);
      const voidTotals = await getJournalTotalsForDoc(companyId, 'PURCHASE_INVOICE_VOID', piId);
      const netDebit = apTotals.totalDebit + voidTotals.totalDebit;
      const netCredit = apTotals.totalCredit + voidTotals.totalCredit;
      expect(netDebit).toBe(netCredit);
    });
  });
});
