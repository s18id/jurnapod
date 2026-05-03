// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Story 54.2 — AP Payment Write-Path Correctness Hardening
// Integration test suite proving the payment path is correct, idempotent,
// and produces accurate invoice open amount updates.
//
// Execution order per story spec:
// 1. AC1b (concurrent create idempotency) MUST be written first — this is
//    a P0 discovery test. If it fails, a production bug must be fixed before
//    proceeding.
// 2. AC2–AC7 in parallel batches where independent.
// 3. AC8: 3 consecutive green.
// 4. AC9: code review GO.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { sql } from 'kysely';
import {
  cleanupTestFixtures,
  createTestCompanyMinimal,
  createTestUser,
  getRoleIdByCode,
  assignUserGlobalRole,
  setModulePermission,
  loginForTest,
  createTestSupplier,
  createTestPurchasingAccounts,
  createTestBankAccount,
} from '../../fixtures';

// Deterministic code generator for constrained fields
function makeTag(prefix: string, counter: number): string {
  const worker = process.env.VITEST_POOL_ID ?? '0';
  const pidTag = String(process.pid % 10000).padStart(4, '0');
  return `${prefix}${worker}${pidTag}${String(counter).padStart(4, '0')}`;
}

// AP payment status constants (mirrors AP_PAYMENT_STATUS.POSTED from @jurnapod/shared)
const AP_PAYMENT_STATUS_POSTED = 40;

// Helper: compute invoice open amount via direct SQL
// Matches computePurchaseInvoiceOpenAmount logic:
//   open_amount = grand_total - SUM(posted payment allocations) - SUM(applied credits)
async function getInvoiceOpenAmount(db: ReturnType<typeof getTestDb>, invoiceId: number): Promise<number> {
  const result = await sql<{ open_amount: string }>`
    SELECT (pi.grand_total - COALESCE(SUM(apl.allocation_amount), 0)) AS open_amount
    FROM purchase_invoices pi
    LEFT JOIN ap_payment_lines apl ON apl.purchase_invoice_id = pi.id
    LEFT JOIN ap_payments ap ON ap.id = apl.ap_payment_id AND ap.status = ${AP_PAYMENT_STATUS_POSTED}
    WHERE pi.id = ${invoiceId}
    GROUP BY pi.id, pi.grand_total
  `.execute(db);
  if (result.rows.length === 0) {
    throw new Error(`Invoice ${invoiceId} not found when computing open amount`);
  }
  // Returns DECIMAL(19,4) as string like "70000.0000" — convert to number
  return Number(result.rows[0].open_amount);
}

let baseUrl: string;
let ownerToken: string;
let testCompanyId: number;
let testSupplierId: number;
let bankAccountId: number;
let apAccountId: number;
let expenseAccountId: number;

// Invoice assignments (each used by exactly one test group to avoid cross-contamination):
// PI-1 ($1000) -> AC2 (GL correctness, post $500), AC7 (concurrent post, draft $100)
// PI-2 ($300)  -> AC5 (overpayment, try $400)
// PI-3 ($700)  -> AC6 (multi-invoice, $300)
// PI-4 ($300)  -> AC6 (multi-invoice, $200)
// PI-5 ($1000) -> AC3 (partial payment, $300)
// PI-6 ($1000) -> AC4 (full payment, $1000)
let postedPi1Id: number;  // $1000 — AC2, AC7
let postedPi2Id: number;  // $300  — AC5
let postedPi3Id: number;  // $700  — AC6
let postedPi4Id: number;  // $300  — AC6
let postedPi5Id: number;  // $1000 — AC3
let postedPi6Id: number;  // $1000 — AC4
let apTagCounter = 0;

describe('purchasing.ap-payment-correctness', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    const testCompany = await createTestCompanyMinimal({
      code: makeTag('APCO', ++apTagCounter).toUpperCase(),
      name: `AP Payment Correctness Company ${process.pid}`,
    });
    testCompanyId = testCompany.id;

    const testEmail = `ap-pay-correctness-${++apTagCounter}@example.com`;
    const testUser = await createTestUser(testCompanyId, {
      email: testEmail,
      name: 'AP Payment Correctness Owner',
      password: 'TestPassword123!',
    });

    const ownerRoleId = await getRoleIdByCode('OWNER');
    await assignUserGlobalRole(testUser.id, ownerRoleId);

    for (const [module, resource] of [
      ['purchasing', 'payments'],
      ['purchasing', 'invoices'],
      ['purchasing', 'suppliers'],
      ['purchasing', 'exchange_rates'],
      ['accounting', 'journals'],
      ['accounting', 'accounts'],
    ] as [string, string][]) {
      await setModulePermission(testCompanyId, ownerRoleId, module, resource, 63, { allowSystemRoleMutation: true });
    }

    const supplier = await createTestSupplier(testCompanyId, {
      code: makeTag('APPSUP', ++apTagCounter),
      name: 'AP Payment Correctness Supplier',
      currency: 'IDR',
    });
    testSupplierId = supplier.id;

    const accounts = await createTestPurchasingAccounts(testCompanyId);
    apAccountId = accounts.ap_account_id;
    expenseAccountId = accounts.expense_account_id;

    bankAccountId = await createTestBankAccount(testCompanyId, { typeName: 'BANK', isActive: true });
    ownerToken = await loginForTest(baseUrl, testCompany.code, testEmail, 'TestPassword123!');

    // Helper to create and post a purchase invoice
    async function createPostedPi(unitPrice: string, tag: string): Promise<number> {
      const piRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supplier_id: testSupplierId,
          invoice_no: tag,
          invoice_date: '2026-04-01',
          currency_code: 'IDR',
          notes: `PI for correctness test`,
          lines: [
            { description: 'Service line', qty: '1', unit_price: unitPrice, line_type: 'SERVICE' },
          ],
        }),
      });
      expect(piRes.status).toBe(201);
      const pi = await piRes.json();
      const piId = pi.data.id;

      const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
      });
      expect(postRes.status).toBe(200);
      return piId;
    }

    // PI-1: $1000 — AC2 (GL correctness), AC7 (concurrent post)
    postedPi1Id = await createPostedPi('100000.0000', makeTag('APIPI1', ++apTagCounter));

    // PI-2: $300 — AC5 (overpayment test)
    postedPi2Id = await createPostedPi('30000.0000', makeTag('APIPI2', ++apTagCounter));

    // PI-3: $700 — AC6 (multi-invoice)
    postedPi3Id = await createPostedPi('70000.0000', makeTag('APIPI3', ++apTagCounter));

    // PI-4: $300 — AC6 (multi-invoice)
    postedPi4Id = await createPostedPi('30000.0000', makeTag('APIPI4', ++apTagCounter));

    // PI-5: $1000 — AC3 (partial payment)
    postedPi5Id = await createPostedPi('100000.0000', makeTag('APIPI5', ++apTagCounter));

    // PI-6: $1000 — AC4 (full payment)
    postedPi6Id = await createPostedPi('100000.0000', makeTag('APIPI6', ++apTagCounter));
  });

  // Cleanup only removes app-level records we created (payments, invoices).
  // journal_lines/batches are immutable by DB trigger (migration 0114) — intentionally skipped.
  // accounts, suppliers are shared setup data — left for next test run.
  afterAll(async () => {
    try {
      const db = getTestDb();
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`UPDATE ap_payments SET journal_batch_id = NULL WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE apl FROM ap_payment_lines apl INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id WHERE ap.company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM ap_payments WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM purchase_invoice_lines WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM purchase_invoices WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM company_modules WHERE company_id = ${testCompanyId}`.execute(db);
      await cleanupTestFixtures();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  });

  // ========================================================================
  // AC1a: Sequential idempotent create
  // ========================================================================
  it('AC1a: sequential duplicate create with same idempotency_key returns same payment', async () => {
    const idempotencyKey = makeTag('APPIDEMSEQ', ++apTagCounter);
    const payload = {
      payment_date: '2026-04-15',
      bank_account_id: bankAccountId,
      supplier_id: testSupplierId,
      idempotency_key: idempotencyKey,
      lines: [
        { purchase_invoice_id: postedPi1Id, allocation_amount: '10000.0000' },
      ],
    };

    const firstRes = await fetch(`${baseUrl}/api/purchasing/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(firstRes.status).toBe(201);
    const firstBody = await firstRes.json();

    const secondRes = await fetch(`${baseUrl}/api/purchasing/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(secondRes.status).toBe(201);
    const secondBody = await secondRes.json();

    expect(firstBody.data.id).toBe(secondBody.data.id);

    const db = getTestDb();
    const count = await sql<{ c: string }>`
      SELECT COUNT(*) as c FROM ap_payments
      WHERE company_id = ${testCompanyId} AND idempotency_key = ${idempotencyKey}
    `.execute(db);
    expect(count.rows.length).toBe(1);
    expect(Number(count.rows[0].c)).toBe(1);
  });

  // ========================================================================
  // AC1b: Concurrent idempotent create — FIRST DISCOVERY TEST
  // ========================================================================
  // This test proves or disproves a P0 production bug: concurrent CREATE
  // requests with the same idempotency_key may produce duplicate payments
  // because there is no UNIQUE KEY on (company_id, idempotency_key).
  //
  // If this test fails:
  //   -> Scope expands: add UNIQUE KEY or strengthen lock, then re-run.
  // If this test passes:
  //   -> Production is safe for this path; continue with AC2-AC7.
  // ========================================================================
  it('AC1b: concurrent duplicate create with same idempotency_key returns same payment and creates 1 row', async () => {
    const idempotencyKey = makeTag('APPIDEMCONC', ++apTagCounter);
    const payload = {
      payment_date: '2026-04-15',
      bank_account_id: bankAccountId,
      supplier_id: testSupplierId,
      idempotency_key: idempotencyKey,
      lines: [
        { purchase_invoice_id: postedPi1Id, allocation_amount: '10000.0000' },
      ],
    };

    const [r1, r2] = await Promise.allSettled([
      fetch(`${baseUrl}/api/purchasing/payments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      fetch(`${baseUrl}/api/purchasing/payments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    ]);

    const res1 = r1.status === 'fulfilled' ? r1.value : null;
    const res2 = r2.status === 'fulfilled' ? r2.value : null;

    expect(res1?.status).toBe(201);
    expect(res2?.status).toBe(201);

    const body1 = await res1!.json();
    const body2 = await res2!.json();
    expect(body1.data.id).toBe(body2.data.id);

    const db = getTestDb();
    const count = await sql<{ c: string }>`
      SELECT COUNT(*) as c FROM ap_payments
      WHERE company_id = ${testCompanyId} AND idempotency_key = ${idempotencyKey}
    `.execute(db);
    expect(count.rows.length).toBe(1);
    expect(Number(count.rows[0].c)).toBe(1);
  });

  // ========================================================================
  // AC2: Payment post produces correct GL entries
  // ========================================================================
  it('AC2: posting a payment produces balanced journal entries (DR AP, CR Bank)', async () => {
    const createRes = await fetch(`${baseUrl}/api/purchasing/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_date: '2026-04-15',
        bank_account_id: bankAccountId,
        supplier_id: testSupplierId,
        lines: [
          { purchase_invoice_id: postedPi1Id, allocation_amount: '50000.0000' },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const payment = await createRes.json();
    const paymentId = payment.data.id;

    const postRes = await fetch(`${baseUrl}/api/purchasing/payments/${paymentId}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    const batchId = postBody.data.journal_batch_id;
    expect(Number(batchId)).toBeGreaterThan(0);

    const db = getTestDb();
    const journal = await sql<{ account_id: number; debit: string; credit: string }>`
      SELECT account_id, debit, credit
      FROM journal_lines
      WHERE journal_batch_id = ${batchId}
      ORDER BY id
    `.execute(db);

    // Should have exactly 2 lines: DR AP, CR Bank
    expect(journal.rows.length).toBe(2);

    const drLine = journal.rows.find((r) => Number(r.debit) > 0);
    const crLine = journal.rows.find((r) => Number(r.credit) > 0);
    expect(drLine).toBeDefined();
    expect(crLine).toBeDefined();

    // Amount stored as DECIMAL(19,4): "50000.0000" -> Number = 50000
    expect(Number(drLine!.debit)).toBe(50000);
    expect(Number(crLine!.credit)).toBe(50000);

    const totalDr = journal.rows.reduce((sum, row) => sum + Number(row.debit), 0);
    const totalCr = journal.rows.reduce((sum, row) => sum + Number(row.credit), 0);
    expect(totalDr).toBe(totalCr);
  });

  // ========================================================================
  // AC3: Partial payment reduces invoice open amount correctly
  // ========================================================================
  it('AC3: partial payment reduces invoice open amount proportionally', async () => {
    const createRes = await fetch(`${baseUrl}/api/purchasing/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_date: '2026-04-15',
        bank_account_id: bankAccountId,
        supplier_id: testSupplierId,
        lines: [
          { purchase_invoice_id: postedPi5Id, allocation_amount: '30000.0000' },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const payment = await createRes.json();
    const paymentId = payment.data.id;

    const postRes = await fetch(`${baseUrl}/api/purchasing/payments/${paymentId}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(200);

    const db = getTestDb();
    // PI-5 grand_total = 100000.0000 ($1000); payment = 30000.0000 ($300)
    // open_amount should be 70000.0000 ($700)
    const openAfter = await getInvoiceOpenAmount(db, postedPi5Id);
    expect(openAfter).toBe(70000);

    // Verify invoice status remains POSTED (not PAID)
    const pi = await sql<{ status: number }>`
      SELECT status FROM purchase_invoices WHERE id = ${postedPi5Id}
    `.execute(db);
    expect(pi.rows[0].status).toBe(2); // POSTED
  });

  // ========================================================================
  // AC4: Full payment sets invoice balance to zero
  // ========================================================================
  it('AC4: full payment sets invoice open amount to $0.00', async () => {
    const createRes = await fetch(`${baseUrl}/api/purchasing/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_date: '2026-04-15',
        bank_account_id: bankAccountId,
        supplier_id: testSupplierId,
        lines: [
          { purchase_invoice_id: postedPi6Id, allocation_amount: '100000.0000' },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const payment = await createRes.json();
    const paymentId = payment.data.id;

    const postRes = await fetch(`${baseUrl}/api/purchasing/payments/${paymentId}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(200);

    const db = getTestDb();
    // Full payment: open_amount should be 0.0000
    const openAfter = await getInvoiceOpenAmount(db, postedPi6Id);
    expect(openAfter).toBe(0);

    const pi = await sql<{ status: number }>`
      SELECT status FROM purchase_invoices WHERE id = ${postedPi6Id}
    `.execute(db);
    expect(pi.rows[0].status).toBe(2); // POSTED (Epic 46: no PAID status)
  });

  // ========================================================================
  // AC5: Overpayment is rejected
  // ========================================================================
  it('AC5: overpayment allocation is rejected with 400 OVERPAYMENT', async () => {
    const createRes = await fetch(`${baseUrl}/api/purchasing/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_date: '2026-04-15',
        bank_account_id: bankAccountId,
        supplier_id: testSupplierId,
        lines: [
          // PI-2 open amount = $300; try to allocate $400
          { purchase_invoice_id: postedPi2Id, allocation_amount: '40000.0000' },
        ],
      }),
    });

    expect(createRes.status).toBe(400);
    const body = await createRes.json();
    // Error response format: { success: false, error: { code: "OVERPAYMENT", message: "..." } }
    expect(body).toHaveProperty('error');
    expect(body.error.code).toBe('OVERPAYMENT');
  });

  // ========================================================================
  // AC6: Multi-invoice allocation is correct
  // ========================================================================
  it('AC6: payment allocated to multiple invoices updates each open amount correctly', async () => {
    const createRes = await fetch(`${baseUrl}/api/purchasing/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_date: '2026-04-15',
        bank_account_id: bankAccountId,
        supplier_id: testSupplierId,
        lines: [
          { purchase_invoice_id: postedPi4Id, allocation_amount: '20000.0000' },
          { purchase_invoice_id: postedPi3Id, allocation_amount: '30000.0000' },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const payment = await createRes.json();
    const paymentId = payment.data.id;

    const postRes = await fetch(`${baseUrl}/api/purchasing/payments/${paymentId}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(200);

    const db = getTestDb();

    // Verify allocation rows (amounts in DB as DECIMAL(19,4) returned as string)
    const lines = await sql<{ invoice_id: number; amount: string }>`
      SELECT purchase_invoice_id AS invoice_id, allocation_amount AS amount
      FROM ap_payment_lines
      WHERE ap_payment_id = ${paymentId}
      ORDER BY line_no
    `.execute(db);
    expect(lines.rows.length).toBe(2);
    expect(Number(lines.rows[0].amount)).toBe(20000);      // $200
    expect(Number(lines.rows[1].amount)).toBe(30000);      // $300

    // PI-4: $300 original - $200 payment = $100 remaining
    const openPi4 = await getInvoiceOpenAmount(db, postedPi4Id);
    expect(openPi4).toBe(10000);  // $100

    // PI-3: $700 original - $300 payment = $400 remaining
    const openPi3 = await getInvoiceOpenAmount(db, postedPi3Id);
    expect(openPi3).toBe(40000);  // $400
  });

  // ========================================================================
  // AC7: Concurrent payment post with same ID is safe
  // ========================================================================
  it('AC7: concurrent post of the same draft payment is safe (exactly 1 journal batch)', async () => {
    const createRes = await fetch(`${baseUrl}/api/purchasing/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_date: '2026-04-15',
        bank_account_id: bankAccountId,
        supplier_id: testSupplierId,
        lines: [
          { purchase_invoice_id: postedPi1Id, allocation_amount: '10000.0000' },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const payment = await createRes.json();
    const paymentId = payment.data.id;

    const [r1, r2] = await Promise.allSettled([
      fetch(`${baseUrl}/api/purchasing/payments/${paymentId}/post`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      }),
      fetch(`${baseUrl}/api/purchasing/payments/${paymentId}/post`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      }),
    ]);

    const res1 = r1.status === 'fulfilled' ? r1.value : null;
    const res2 = r2.status === 'fulfilled' ? r2.value : null;

    const statuses = [res1?.status ?? -1, res2?.status ?? -1];
    const successCount = statuses.filter((s) => s === 200).length;
    const conflictCount = statuses.filter((s) => s === 409).length;

    // Both requests succeed (first post, second idempotent replay).
    // The DB count below is the real invariant: exactly 1 journal batch created.
    expect(successCount).toBeGreaterThanOrEqual(1);
    expect(successCount + conflictCount).toBe(2);

    // Verify exactly one journal batch for this payment
    const db = getTestDb();
    const batchCount = await sql<{ c: string }>`
      SELECT COUNT(*) as c FROM journal_batches
      WHERE doc_type = 'AP_PAYMENT' AND doc_id = ${paymentId}
    `.execute(db);
    expect(batchCount.rows.length).toBe(1);
    expect(Number(batchCount.rows[0].c)).toBe(1);
  });
});
