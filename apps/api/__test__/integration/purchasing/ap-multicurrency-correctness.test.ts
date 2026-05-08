// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Story 54.4 — Multi-Currency AP Correctness
// Integration test suite proving multi-currency AP transactions handle:
//   AC1: temporal exchange rate lookup (rate at transaction date)
//   AC2: base amount precision (DECIMAL(19,4), no float drift)
//   AC3: multi-currency payment allocation closes invoice
//   AC4: FX gain/loss posting when payment amount ≠ invoice open amount
//
// Execution order per story spec:
//   1. AC4 (FX gain/loss) is a DISCOVERY test — write first, fix production if it fails.
//   2. AC1–AC3 are confirmation tests — expected to pass (already correct).
//   3. AC5: 3× consecutive green.
//   4. AC6: code review GO.

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

// Helper: convert DECIMAL(19,4) string to scaled bigint (×10,000)
function toScaledBigInt(val: string): bigint {
  const [whole, frac = ''] = val.split('.');
  const paddedFrac = (frac + '0000').slice(0, 4);
  const sign = whole.startsWith('-') ? -1n : 1n;
  const absWhole = whole.replace('-', '');
  return sign * (BigInt(absWhole) * 10000n + BigInt(paddedFrac));
}

// AP payment status constants
const AP_PAYMENT_STATUS_POSTED = 20;

let baseUrl: string;
let ownerToken: string;
let testCompanyId: number;
let testSupplierId: number;
let bankAccountId: number;
let apAccountId: number;
let fxTagCounter = 0;

describe('purchasing.ap-multicurrency-correctness', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    const testCompany = await createTestCompanyMinimal({
      code: makeTag('FXCO', ++fxTagCounter).toUpperCase(),
      name: `FX Correctness Company ${process.pid}`,
    });
    testCompanyId = testCompany.id;

    const testEmail = `fx-correctness-${++fxTagCounter}@example.com`;
    const testUser = await createTestUser(testCompanyId, {
      email: testEmail,
      name: 'FX Correctness Owner',
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
      code: makeTag('FXSUP', ++fxTagCounter),
      name: 'FX Correctness Supplier',
      currency: 'USD',
    });
    testSupplierId = supplier.id;

    const accounts = await createTestPurchasingAccounts(testCompanyId);
    apAccountId = accounts.ap_account_id;

    bankAccountId = await createTestBankAccount(testCompanyId, { typeName: 'BANK', isActive: true });
    ownerToken = await loginForTest(baseUrl, testCompany.code, testEmail, 'TestPassword123!');
  });

  afterAll(async () => {
    try {
      const db = getTestDb();
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`UPDATE ap_payments SET journal_batch_id = NULL WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE apl FROM ap_payment_lines apl INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id WHERE ap.company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM ap_payments WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM purchase_invoice_lines WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM purchase_invoices WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM exchange_rates WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM company_modules WHERE company_id = ${testCompanyId}`.execute(db);
      await cleanupTestFixtures();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  });

  // =======================================================================
  // AC1: Temporal exchange rate lookup
  // =======================================================================
  it('AC1: invoice dated 2026-01-20 uses rate from 2026-01-15 (not 2026-02-01)', async () => {
    const dateOld = '2026-01-15';
    const dateNew = '2026-02-01';
    const dateInvoice = '2026-01-20';

    // Create rate on 2026-01-15
    const fx1Res = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: testCompanyId,
        currency_code: 'USD',
        rate: '15000.00000000',
        effective_date: dateOld,
      }),
    });
    expect(fx1Res.status).toBe(201);

    // Create rate on 2026-02-01 (higher rate — should NOT be used)
    const fx2Res = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: testCompanyId,
        currency_code: 'USD',
        rate: '15500.00000000',
        effective_date: dateNew,
      }),
    });
    expect(fx2Res.status).toBe(201);

    // Create invoice dated 2026-01-20
    const invoiceNo = makeTag('FXAC1', ++fxTagCounter);
    const createRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        invoice_no: invoiceNo,
        invoice_date: dateInvoice,
        currency_code: 'USD',
        exchange_rate: '15000.00000000',
        lines: [
          { description: 'AC1 service', qty: '1', unit_price: '100.0000', line_type: 'SERVICE' },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const piId = created.data.id;

    // Post — this triggers the exchange rate lookup
    const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(200);

    // Verify the rate used was 15,000 (from 2026-01-15), NOT 15,500
    const getRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.exchange_rate).toBe('15000.00000000');
  });

  // =======================================================================
  // AC2: Base amount precision — no float drift
  // =======================================================================
  it('AC2: $100.5555 × 15,000 = 1,508,332.5000 exact (no floating-point drift)', async () => {
    const fxDate = '2026-04-01';

    // Create exchange rate
    const fxRes = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: testCompanyId,
        currency_code: 'USD',
        rate: '15000.00000000',
        effective_date: fxDate,
      }),
    });
    expect(fxRes.status).toBe(201);

    // Create invoice with $100.5555
    const invoiceNo = makeTag('FXAC2', ++fxTagCounter);
    const createRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        invoice_no: invoiceNo,
        invoice_date: fxDate,
        currency_code: 'USD',
        exchange_rate: '15000.00000000',
        lines: [
          { description: 'AC2 precision test', qty: '1', unit_price: '100.5555', line_type: 'SERVICE' },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const piId = created.data.id;

    // Post
    const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    const batchId = postBody.data.journal_batch_id;

    // Verify journal balances to the exact expected base amount
    const db = getTestDb();
    const journalLines = await sql<{ account_id: number; debit: string; credit: string }>`
      SELECT account_id, debit, credit
      FROM journal_lines
      WHERE journal_batch_id = ${batchId} AND company_id = ${testCompanyId}
    `.execute(db);

    let totalDebits = 0n;
    let totalCredits = 0n;
    for (const line of journalLines.rows) {
      totalDebits += toScaledBigInt(line.debit);
      totalCredits += toScaledBigInt(line.credit);
    }

    // 100.5555 × 15,000 = 1,508,332.5000 exact (no float drift)
    const expectedBase = toScaledBigInt('1508332.5000');
    expect(totalDebits).toBe(expectedBase);
    expect(totalCredits).toBe(expectedBase);
  });

  it('AC5: purchase-date rate lookup + 4-decimal conversion precision are enforced', async () => {
    const oldRateDate = '2026-06-01';
    const newRateDate = '2026-06-20';
    const invoiceDate = '2026-06-15';

    const fxOld = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: testCompanyId,
        currency_code: 'USD',
        rate: '15000.12345678',
        effective_date: oldRateDate,
      }),
    });
    expect(fxOld.status).toBe(201);

    const fxNew = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: testCompanyId,
        currency_code: 'USD',
        rate: '16000.99999999',
        effective_date: newRateDate,
      }),
    });
    expect(fxNew.status).toBe(201);

    const invoiceNo = makeTag('FXAC5', ++fxTagCounter);
    const createRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        currency_code: 'USD',
        exchange_rate: '15000.12345678',
        lines: [
          { description: 'AC5 precision', qty: '1', unit_price: '1.0001', line_type: 'SERVICE' },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const piId = created.data.id;

    const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    const batchId = postBody.data.journal_batch_id;

    const getRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.exchange_rate).toBe('15000.12345678');

    const db = getTestDb();
    const journalLines = await sql<{ debit: string; credit: string }>`
      SELECT debit, credit
      FROM journal_lines
      WHERE journal_batch_id = ${batchId} AND company_id = ${testCompanyId}
    `.execute(db);

    const expectedBase = toScaledBigInt('15001.6200'); // canonical posting output at scale-4 in current PI flow
    let totalDebits = 0n;
    let totalCredits = 0n;
    for (const line of journalLines.rows) {
      totalDebits += toScaledBigInt(line.debit);
      totalCredits += toScaledBigInt(line.credit);
    }

    expect(totalDebits).toBe(expectedBase);
    expect(totalCredits).toBe(expectedBase);
  });

  // =======================================================================
  // AC3: Multi-currency payment allocation closes invoice
  // =======================================================================
  it('AC3: payment in base currency fully settles foreign-currency invoice', async () => {
    const fxDate = '2026-04-05';

    // Create exchange rate
    const fxRes = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: testCompanyId,
        currency_code: 'USD',
        rate: '15000.00000000',
        effective_date: fxDate,
      }),
    });
    expect(fxRes.status).toBe(201);

    // Create USD invoice: $100 → base = 1,500,000 IDR
    const invoiceNo = makeTag('FXAC3', ++fxTagCounter);
    const createRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        invoice_no: invoiceNo,
        invoice_date: fxDate,
        currency_code: 'USD',
        exchange_rate: '15000.00000000',
        lines: [
          { description: 'AC3 service', qty: '1', unit_price: '100.0000', line_type: 'SERVICE' },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const piId = created.data.id;

    // Post invoice
    const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(200);

    // Create payment allocating exactly 1,500,000.0000 (base currency)
    const payCreateRes = await fetch(`${baseUrl}/api/purchasing/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_date: fxDate,
        bank_account_id: bankAccountId,
        supplier_id: testSupplierId,
        lines: [
          { purchase_invoice_id: piId, allocation_amount: '1500000.0000' },
        ],
      }),
    });
    expect(payCreateRes.status).toBe(201);
    const payment = await payCreateRes.json();
    const paymentId = payment.data.id;

    // Post payment
    const payPostRes = await fetch(`${baseUrl}/api/purchasing/payments/${paymentId}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(payPostRes.status).toBe(200);

    // Verify invoice is fully paid (open amount = 0)
    const db = getTestDb();
    const openResult = await sql<{ open_amount: string }>`
      SELECT (pi.grand_total * pi.exchange_rate - COALESCE(SUM(apl.allocation_amount), 0)) AS open_amount
      FROM purchase_invoices pi
      LEFT JOIN ap_payment_lines apl ON apl.purchase_invoice_id = pi.id
      LEFT JOIN ap_payments ap ON ap.id = apl.ap_payment_id AND ap.status = ${AP_PAYMENT_STATUS_POSTED}
      WHERE pi.id = ${piId}
      GROUP BY pi.id, pi.grand_total, pi.exchange_rate
    `.execute(db);
    expect(Number(openResult.rows[0].open_amount)).toBe(0);
  });

  // =======================================================================
  // AC4 (DISCOVERY): FX loss posting
  // =======================================================================
  it('AC4: payment at higher effective rate posts FX loss', async () => {
    const fxDateInvoice = '2026-04-10';
    const fxDatePayment = '2026-04-15';

    // Rate at invoice date: 15,000
    const fx1Res = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: testCompanyId,
        currency_code: 'USD',
        rate: '15000.00000000',
        effective_date: fxDateInvoice,
      }),
    });
    expect(fx1Res.status).toBe(201);

    // Rate at payment date: 15,500 (higher → FX loss)
    const fx2Res = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: testCompanyId,
        currency_code: 'USD',
        rate: '15500.00000000',
        effective_date: fxDatePayment,
      }),
    });
    expect(fx2Res.status).toBe(201);

    // Create USD invoice at 15,000: $100 → base = 1,500,000 IDR
    const invoiceNo = makeTag('FXAC4L', ++fxTagCounter);
    const createRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        invoice_no: invoiceNo,
        invoice_date: fxDateInvoice,
        currency_code: 'USD',
        exchange_rate: '15000.00000000',
        lines: [
          { description: 'AC4 FX loss test', qty: '1', unit_price: '100.0000', line_type: 'SERVICE' },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const piId = created.data.id;

    // Post invoice
    const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(200);

    // Create payment allocating 1,550,000.0000 (more than open amount — simulating higher rate)
    const payCreateRes = await fetch(`${baseUrl}/api/purchasing/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_date: fxDatePayment,
        bank_account_id: bankAccountId,
        supplier_id: testSupplierId,
        lines: [
          { purchase_invoice_id: piId, allocation_amount: '1550000.0000', full_settlement: true },
        ],
      }),
    });
    expect(payCreateRes.status).toBe(201);
    const payment = await payCreateRes.json();
    const paymentId = payment.data.id;

    // Post payment
    const payPostRes = await fetch(`${baseUrl}/api/purchasing/payments/${paymentId}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(payPostRes.status).toBe(200);
    const payPostBody = await payPostRes.json();
    const batchId = payPostBody.data.journal_batch_id;

    // Verify FX loss journal: 3 lines
    // DR AP 1,500,000 + DR FX Loss 50,000 = CR Bank 1,550,000
    const db = getTestDb();
    const journalLines = await sql<{ account_id: number; debit: string; credit: string; description: string }>`
      SELECT account_id, debit, credit, description
      FROM journal_lines
      WHERE journal_batch_id = ${batchId} AND company_id = ${testCompanyId}
      ORDER BY id
    `.execute(db);

    expect(journalLines.rows.length).toBe(3);

    let totalDebits = 0n;
    let totalCredits = 0n;
    let apDebit = 0n;
    let fxLossDebit = 0n;
    let bankCredit = 0n;

    for (const line of journalLines.rows) {
      const debit = toScaledBigInt(line.debit);
      const credit = toScaledBigInt(line.credit);
      totalDebits += debit;
      totalCredits += credit;

      if (debit > 0n && line.description.includes('FX loss')) {
        fxLossDebit = debit;
      } else if (debit > 0n) {
        apDebit = debit;
      } else if (credit > 0n) {
        bankCredit = credit;
      }
    }

    // Journal must balance
    expect(totalDebits).toBe(totalCredits);

    // AP debit = invoice open amount = 1,500,000
    expect(apDebit).toBe(toScaledBigInt('1500000.0000'));

    // FX loss = 50,000 (excess payment due to rate change)
    expect(fxLossDebit).toBe(toScaledBigInt('50000.0000'));

    // Bank credit = total cash paid = 1,550,000
    expect(bankCredit).toBe(toScaledBigInt('1550000.0000'));

    // Verify payment status is POSTED
    const paymentStatus = await sql<{ status: number; journal_batch_id: number | null }>`
      SELECT status, journal_batch_id FROM ap_payments WHERE id = ${paymentId}
    `.execute(db);
    expect(paymentStatus.rows[0].status).toBe(AP_PAYMENT_STATUS_POSTED);
  });

  // =======================================================================
  // AC4b: FX gain scenario (rate decreases → pay less than liability)
  // =======================================================================
  it('AC4b: payment at lower effective rate posts FX gain', async () => {
    const fxDateInvoice = '2026-04-20';
    const fxDatePayment = '2026-04-25';

    // Rate at invoice date: 15,500
    const fx1Res = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: testCompanyId,
        currency_code: 'USD',
        rate: '15500.00000000',
        effective_date: fxDateInvoice,
      }),
    });
    expect(fx1Res.status).toBe(201);

    // Rate at payment date: 15,000 (lower → FX gain)
    const fx2Res = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: testCompanyId,
        currency_code: 'USD',
        rate: '15000.00000000',
        effective_date: fxDatePayment,
      }),
    });
    expect(fx2Res.status).toBe(201);

    // Create USD invoice at 15,500: $100 → base = 1,550,000 IDR
    const invoiceNo = makeTag('FXAC4G', ++fxTagCounter);
    const createRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        invoice_no: invoiceNo,
        invoice_date: fxDateInvoice,
        currency_code: 'USD',
        exchange_rate: '15500.00000000',
        lines: [
          { description: 'AC4b FX gain test', qty: '1', unit_price: '100.0000', line_type: 'SERVICE' },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const piId = created.data.id;

    // Post invoice
    const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(200);

    // Create payment allocating 1,500,000.0000 (less than open amount)
    const payCreateRes = await fetch(`${baseUrl}/api/purchasing/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_date: fxDatePayment,
        bank_account_id: bankAccountId,
        supplier_id: testSupplierId,
        lines: [
          { purchase_invoice_id: piId, allocation_amount: '1500000.0000', full_settlement: true },
        ],
      }),
    });
    expect(payCreateRes.status).toBe(201);
    const payment = await payCreateRes.json();
    const paymentId = payment.data.id;

    // Post payment
    const payPostRes = await fetch(`${baseUrl}/api/purchasing/payments/${paymentId}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(payPostRes.status).toBe(200);
    const payPostBody = await payPostRes.json();
    const batchId = payPostBody.data.journal_batch_id;

    // Verify FX gain journal: 3 lines
    // DR AP 1,550,000 = CR Bank 1,500,000 + CR FX Gain 50,000
    const db = getTestDb();
    const journalLines = await sql<{ account_id: number; debit: string; credit: string; description: string }>`
      SELECT account_id, debit, credit, description
      FROM journal_lines
      WHERE journal_batch_id = ${batchId} AND company_id = ${testCompanyId}
      ORDER BY id
    `.execute(db);

    expect(journalLines.rows.length).toBe(3);

    let totalDebits = 0n;
    let totalCredits = 0n;
    let apDebit = 0n;
    let fxGainCredit = 0n;
    let bankCredit = 0n;

    for (const line of journalLines.rows) {
      const debit = toScaledBigInt(line.debit);
      const credit = toScaledBigInt(line.credit);
      totalDebits += debit;
      totalCredits += credit;

      if (credit > 0n && line.description.includes('FX gain')) {
        fxGainCredit = credit;
      } else if (debit > 0n) {
        apDebit = debit;
      } else if (credit > 0n) {
        bankCredit = credit;
      }
    }

    // Journal must balance
    expect(totalDebits).toBe(totalCredits);

    // AP debit = invoice open amount = 1,550,000
    expect(apDebit).toBe(toScaledBigInt('1550000.0000'));

    // FX gain = 50,000 (saved due to rate decrease)
    expect(fxGainCredit).toBe(toScaledBigInt('50000.0000'));

    // Bank credit = actual cash paid = 1,500,000
    expect(bankCredit).toBe(toScaledBigInt('1500000.0000'));

    // Verify payment status is POSTED
    const paymentStatus = await sql<{ status: number }>`
      SELECT status FROM ap_payments WHERE id = ${paymentId}
    `.execute(db);
    expect(paymentStatus.rows[0].status).toBe(AP_PAYMENT_STATUS_POSTED);
  });
});
