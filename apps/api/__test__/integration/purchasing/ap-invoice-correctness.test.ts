// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for AP Invoice Write-Path Correctness (Story 54.1)
 *
 * Proves:
 * - AC2: Idempotent create (no duplicate PI or journal batch)
 * - AC3: Post creates correct journal entries (debit expense, debit tax, credit AP)
 * - AC4: Void creates correct reversal journal (credit expense, credit tax, debit AP)
 * - AC5: Multi-currency base amount exact (BigInt scaled, no float drift)
 * - AC6: Concurrent post safe (exactly 1 journal batch, 1 success + 1 conflict)
 * - Error: Post without AP account → 400 ACCOUNT_MISSING
 * - Error: Post already-posted → 400 INVALID_STATUS_TRANSITION
 * - Error: Void draft → 400 INVALID_STATUS_TRANSITION
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { sql } from 'kysely';
import {
  resetFixtureRegistry,
  createTestCompanyMinimal,
  createTestUser,
  getRoleIdByCode,
  assignUserGlobalRole,
  setModulePermission,
  loginForTest,
  createTestSupplier,
  createTestPurchasingAccounts,
  createTestPurchasingSettings,
} from '../../fixtures';
import { toScaledBigInt } from '../../helpers/money.js';
import { createAccount } from '../../../src/lib/accounts.js';
import { createTaxRate } from '../../../src/lib/tax-rates.js';

// =============================================================================
// Helpers
// =============================================================================

import { makeTag } from "../../helpers/tags";

// =============================================================================
// Suite State
// =============================================================================

let baseUrl: string;
let ownerToken: string;
let testCompanyId: number;
let testSupplierId: number;
let apAccountId: number;
let expenseAccountId: number;
let taxAccountId: number;
let taxRateId: number;
let piTagCounter = 0;

describe('purchasing.ap-invoice-correctness', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    const testCompany = await createTestCompanyMinimal();
    testCompanyId = testCompany.id;

    const testEmail = `pi-correctness-${++piTagCounter}@example.com`;
    const testUser = await createTestUser(testCompany.id, {
      email: testEmail,
      name: 'PI Correctness Test Owner',
      password: 'TestPassword123!'
    });

    const ownerRoleId = await getRoleIdByCode('OWNER');
    await assignUserGlobalRole(testUser.id, ownerRoleId);

    // Purchasing module permissions
    await setModulePermission(testCompany.id, ownerRoleId, 'purchasing', 'invoices', 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompany.id, ownerRoleId, 'purchasing', 'exchange_rates', 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompany.id, ownerRoleId, 'purchasing', 'suppliers', 63, { allowSystemRoleMutation: true });

    // Accounting module permissions (for account creation via library)
    await setModulePermission(testCompany.id, ownerRoleId, 'accounting', 'accounts', 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompany.id, ownerRoleId, 'accounting', 'journals', 63, { allowSystemRoleMutation: true });

    // Purchasing accounts (AP + expense)
    const accounts = await createTestPurchasingAccounts(testCompany.id);
    apAccountId = accounts.ap_account_id;
    expenseAccountId = accounts.expense_account_id;

    // Tax liability account (canonical library path — no raw SQL)
    const taxAccount = await createAccount({
      company_id: testCompany.id,
      code: 'TAX-INPUT-TEST',
      name: 'Test Tax Input',
      type_name: 'LIABILITY',
      normal_balance: 'K',
      is_group: false,
      is_payable: false,
      is_active: true,
    });
    taxAccountId = taxAccount.id;

    // Tax rate linked to tax account
    const taxRate = await createTaxRate(testCompany.id, {
      code: 'TAX10',
      name: 'Test 10% Tax',
      rate_percent: 10,
      account_id: taxAccount.id,
    });
    taxRateId = taxRate.id;

    // Purchasing settings
    await createTestPurchasingSettings(testCompany.id, apAccountId, expenseAccountId);

    // Supplier
    const supplier = await createTestSupplier(testCompany.id, {
      code: makeTag('PICORR', 32),
      name: 'PI Correctness Supplier',
      currency: 'IDR',
    });
    testSupplierId = supplier.id;

    // Login
    try {
      ownerToken = await loginForTest(baseUrl, testCompany.code, testEmail, 'TestPassword123!');
    } catch {
      ownerToken = await loginForTest(baseUrl, process.env.JP_COMPANY_CODE!, process.env.JP_OWNER_EMAIL!, process.env.JP_OWNER_PASSWORD!);
    }

  });

  afterAll(async () => {
    try {
      const db = getTestDb();
      await sql`DELETE FROM purchase_invoice_lines WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM purchase_invoices WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM journal_lines WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM journal_batches WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM exchange_rates WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM tax_rates WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM accounts WHERE company_id = ${testCompanyId}`.execute(db);
    } catch (e) {
      // ignore cleanup errors
    }
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // ---------------------------------------------------------------------------
  // AC2: Invoice create idempotency proven
  // ---------------------------------------------------------------------------
  it('create idempotent — same PI, no duplicate, no journal batch', async () => {
    const idempotencyKey = makeTag('PIIDEM', 32);
    const invoiceNo = makeTag('PIIDNO', 32);

    const payload = {
      supplier_id: testSupplierId,
      idempotency_key: idempotencyKey,
      invoice_no: invoiceNo,
      invoice_date: '2026-04-23',
      currency_code: 'IDR',
      lines: [{ description: 'Idempotent line', qty: '1', unit_price: '42000.00', line_type: 'SERVICE' }]
    };

    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }),
      fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1.data.id).toBe(body2.data.id);
    expect(body1.data.invoice_no).toBe(body2.data.invoice_no);

    const db = getTestDb();
    const idemCount = await sql<{ c: string }>`
      SELECT COUNT(*) as c FROM purchase_invoices
      WHERE company_id = ${testCompanyId} AND idempotency_key = ${idempotencyKey}
    `.execute(db);
    expect(Number(idemCount.rows[0]?.c ?? 0)).toBe(1);

    // Draft invoice must have no journal batch
    const piCheck = await sql<{ journal_batch_id: number | null }>`
      SELECT journal_batch_id FROM purchase_invoices WHERE id = ${body1.data.id}
    `.execute(db);
    expect(piCheck.rows[0]?.journal_batch_id).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // AC3: Invoice post produces correct GL entries
  // ---------------------------------------------------------------------------
  it('post creates correct journal entries — debit expense, debit tax, credit AP', async () => {
    const invoiceNo = makeTag('PIJNL', 32);

    // Create invoice: $1000 expense + $100 tax (10%) = $1100 AP
    const createRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        invoice_no: invoiceNo,
        invoice_date: '2026-04-15',
        currency_code: 'IDR',
        lines: [
          { description: 'Service with tax', qty: '10', unit_price: '100.00', line_type: 'SERVICE', tax_rate_id: taxRateId },
        ]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const piId = created.data.id;

    // Post
    const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    const batchId = postBody.data.journal_batch_id;

    // Verify journal lines
    const db = getTestDb();
    const journalLines = await sql<{ account_id: number; debit: string; credit: string; description: string }>`
      SELECT account_id, debit, credit, description
      FROM journal_lines
      WHERE journal_batch_id = ${batchId} AND company_id = ${testCompanyId}
    `.execute(db);

    expect(journalLines.rows.length).toBeGreaterThanOrEqual(2);

    const expenseLine = journalLines.rows.find(l => l.account_id === expenseAccountId);
    const taxLine = journalLines.rows.find(l => l.account_id === taxAccountId);
    const apLine = journalLines.rows.find(l => l.account_id === apAccountId);

    expect(expenseLine).toBeDefined();
    expect(toScaledBigInt(expenseLine!.debit)).toBe(toScaledBigInt('1000.0000'));
    expect(toScaledBigInt(expenseLine!.credit)).toBe(0n);

    expect(taxLine).toBeDefined();
    expect(toScaledBigInt(taxLine!.debit)).toBe(toScaledBigInt('100.0000'));
    expect(toScaledBigInt(taxLine!.credit)).toBe(0n);

    expect(apLine).toBeDefined();
    expect(toScaledBigInt(apLine!.debit)).toBe(0n);
    expect(toScaledBigInt(apLine!.credit)).toBe(toScaledBigInt('1100.0000'));

    // Batch must balance
    let totalDebits = 0n;
    let totalCredits = 0n;
    for (const line of journalLines.rows) {
      totalDebits += toScaledBigInt(line.debit);
      totalCredits += toScaledBigInt(line.credit);
    }
    expect(totalDebits).toBe(totalCredits);

    // PI status must be POSTED
    const getRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.status).toBe('POSTED');
  });

  // ---------------------------------------------------------------------------
  // AC4: Invoice void reverses GL entries correctly
  // ---------------------------------------------------------------------------
  it('void creates correct reversal journal — credit expense, credit tax, debit AP', async () => {
    const invoiceNo = makeTag('PIVOID', 32);

    // Create and post: $1000 expense + $100 tax = $1100 AP
    const createRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        invoice_no: invoiceNo,
        invoice_date: '2026-04-16',
        currency_code: 'IDR',
        lines: [
          { description: 'Void service with tax', qty: '10', unit_price: '100.00', line_type: 'SERVICE', tax_rate_id: taxRateId },
        ]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const piId = created.data.id;

    const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    const originalBatchId = postBody.data.journal_batch_id;

    // Void
    const voidRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/void`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(voidRes.status).toBe(200);
    const voidBody = await voidRes.json();
    const reversalBatchId = voidBody.data.reversal_batch_id;
    expect(reversalBatchId).toBeGreaterThan(0);
    expect(reversalBatchId).not.toBe(originalBatchId);

    // Verify reversal journal lines
    const db = getTestDb();
    const reversalLines = await sql<{ account_id: number; debit: string; credit: string; description: string }>`
      SELECT account_id, debit, credit, description
      FROM journal_lines
      WHERE journal_batch_id = ${reversalBatchId} AND company_id = ${testCompanyId}
    `.execute(db);

    expect(reversalLines.rows.length).toBeGreaterThanOrEqual(2);

    const expenseLine = reversalLines.rows.find(l => l.account_id === expenseAccountId);
    const taxLine = reversalLines.rows.find(l => l.account_id === taxAccountId);
    const apLine = reversalLines.rows.find(l => l.account_id === apAccountId);

    expect(expenseLine).toBeDefined();
    expect(toScaledBigInt(expenseLine!.credit)).toBe(toScaledBigInt('1000.0000'));
    expect(toScaledBigInt(expenseLine!.debit)).toBe(0n);

    expect(taxLine).toBeDefined();
    expect(toScaledBigInt(taxLine!.credit)).toBe(toScaledBigInt('100.0000'));
    expect(toScaledBigInt(taxLine!.debit)).toBe(0n);

    expect(apLine).toBeDefined();
    expect(toScaledBigInt(apLine!.debit)).toBe(toScaledBigInt('1100.0000'));
    expect(toScaledBigInt(apLine!.credit)).toBe(0n);

    // Reversal batch must balance
    let totalDebits = 0n;
    let totalCredits = 0n;
    for (const line of reversalLines.rows) {
      totalDebits += toScaledBigInt(line.debit);
      totalCredits += toScaledBigInt(line.credit);
    }
    expect(totalDebits).toBe(totalCredits);

    // PI status must be VOID
    const getRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.status).toBe('VOID');
  });

  // ---------------------------------------------------------------------------
  // AC5: Multi-currency invoice computes base amount correctly
  // ---------------------------------------------------------------------------
  it('multi-currency base amount exact — no floating-point drift', async () => {
    const fxDate = '2026-04-20';

    // Create exchange rate: 1 USD = 15,000 IDR
    const fxRes = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: testCompanyId,
        currency_code: 'USD',
        rate: '15000.00000000',
        effective_date: fxDate,
      })
    });
    expect(fxRes.status).toBe(201);

    const invoiceNo = makeTag('PIFX', 32);
    const createRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        invoice_no: invoiceNo,
        invoice_date: fxDate,
        currency_code: 'USD',
        exchange_rate: '15000.00000000',
        lines: [
          { description: 'USD service', qty: '1', unit_price: '100.0000', line_type: 'SERVICE' }
        ]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const piId = created.data.id;
    expect(created.data.subtotal).toBe('100.0000');

    // Post
    const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    const batchId = postBody.data.journal_batch_id;

    // Verify base amount: 100 USD * 15,000 = 1,500,000 IDR exact
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

    // Expected base: 100.0000 * 15000.00000000 = 1,500,000.0000
    const expectedBase = toScaledBigInt('1500000.0000');
    expect(totalDebits).toBe(expectedBase);
    expect(totalCredits).toBe(expectedBase);

    // Verify exchange rate saved on PI
    const getRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.exchange_rate).toBe('15000.00000000');
  });

  // ---------------------------------------------------------------------------
  // AC6: Concurrent invoice post with same ID is safe
  // ---------------------------------------------------------------------------
  it('concurrent post safe — exactly 1 journal batch, 1 success + 1 conflict', async () => {
    const invoiceNo = makeTag('PIRACE', 32);

    // Create draft
    const createRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        invoice_no: invoiceNo,
        invoice_date: '2026-04-18',
        currency_code: 'IDR',
        lines: [{ description: 'Race test', qty: '1', unit_price: '100000.00', line_type: 'SERVICE' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const piId = created.data.id;

    // Concurrent post
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      }),
      fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      })
    ]);

    const statuses = [res1.status, res2.status];
    const successCount = statuses.filter(s => s === 200).length;
    const conflictCount = statuses.filter(s => s === 400 || s === 409).length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(1);

    // Exactly 1 journal batch for this invoice
    const db = getTestDb();
    const batchCount = await sql<{ c: string }>`
      SELECT COUNT(*) as c FROM journal_batches
      WHERE company_id = ${testCompanyId} AND doc_type = 'PURCHASE_INVOICE' AND doc_id = ${piId}
    `.execute(db);
    expect(Number(batchCount.rows[0]?.c ?? 0)).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Concurrent void safe — exactly 1 reversal batch, 1 success + 1 conflict
  // ---------------------------------------------------------------------------
  it('concurrent void safe — exactly 1 reversal batch, 1 success + 1 conflict', async () => {
    const invoiceNo = makeTag('PIVRACE', 32);

    // Create and post invoice
    const createRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        invoice_no: invoiceNo,
        invoice_date: '2026-04-25',
        currency_code: 'IDR',
        lines: [{ description: 'Void race test', qty: '1', unit_price: '50000.00', line_type: 'SERVICE' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const piId = created.data.id;

    const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(200);

    // Concurrent void
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/purchasing/invoices/${piId}/void`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      }),
      fetch(`${baseUrl}/api/purchasing/invoices/${piId}/void`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      })
    ]);

    const statuses = [res1.status, res2.status];
    const successCount = statuses.filter(s => s === 200).length;
    const conflictCount = statuses.filter(s => s === 400 || s === 409).length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(1);

    // Exactly 1 reversal batch for this invoice
    const db = getTestDb();
    const batchCount = await sql<{ c: string }>`
      SELECT COUNT(*) as c FROM journal_batches
      WHERE company_id = ${testCompanyId} AND doc_type = 'PURCHASE_INVOICE_VOID' AND doc_id = ${piId}
    `.execute(db);
    expect(Number(batchCount.rows[0]?.c ?? 0)).toBe(1);

    // PI status must be VOID
    const getRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.status).toBe('VOID');
  });

  // ---------------------------------------------------------------------------
  // Error: Post without AP account config → 400 ACCOUNT_MISSING
  // ---------------------------------------------------------------------------
  it('returns 400 when posting PI with missing AP account config', async () => {
    // Create a company WITHOUT purchasing accounts configured
    const noConfigCompany = await createTestCompanyMinimal();
    const noConfigEmail = `pi-nocfg-${++piTagCounter}@example.com`;
    const noConfigUser = await createTestUser(noConfigCompany.id, {
      email: noConfigEmail,
      name: 'PI No Config Owner',
      password: 'TestPassword123!'
    });
    const ownerRoleId = await getRoleIdByCode('OWNER');
    await assignUserGlobalRole(noConfigUser.id, ownerRoleId);
    await setModulePermission(noConfigCompany.id, ownerRoleId, 'purchasing', 'invoices', 63, { allowSystemRoleMutation: true });
    await setModulePermission(noConfigCompany.id, ownerRoleId, 'purchasing', 'suppliers', 63, { allowSystemRoleMutation: true });

    // DO NOT create purchasing accounts — leave AP account unconfigured

    const noConfigSupplier = await createTestSupplier(noConfigCompany.id, {
      code: makeTag('PINOCFG', 32),
      name: 'PI No Config Supplier',
      currency: 'IDR',
    });

    const noConfigToken = await loginForTest(baseUrl, noConfigCompany.code, noConfigEmail, 'TestPassword123!');

    // Create PI
    const createRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${noConfigToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: noConfigSupplier.id,
        invoice_no: makeTag('PINOPOST', 32),
        invoice_date: '2026-04-10',
        currency_code: 'IDR',
        lines: [{ description: 'No config test', qty: '1', unit_price: '100.00', line_type: 'SERVICE' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const piId = created.data.id;

    // Post should fail
    const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${noConfigToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(400);
    const postBody = await postRes.json();
    expect(postBody.success).toBe(false);
    expect(postBody.error.code).toBe('ACCOUNT_MISSING');
  });

  // ---------------------------------------------------------------------------
  // Error: Post already-posted PI → 400 INVALID_STATUS_TRANSITION
  // ---------------------------------------------------------------------------
  it('returns 400 when posting an already posted PI', async () => {
    const invoiceNo = makeTag('PIDP', 32);

    const createRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        invoice_no: invoiceNo,
        invoice_date: '2026-04-08',
        currency_code: 'IDR',
        lines: [{ description: 'Double post test', qty: '1', unit_price: '50000.00', line_type: 'SERVICE' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const piId = created.data.id;

    // First post
    const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postRes.status).toBe(200);

    // Second post
    const postAgainRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(postAgainRes.status).toBe(400);
    const postAgainBody = await postAgainRes.json();
    expect(postAgainBody.success).toBe(false);
    expect(postAgainBody.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  // ---------------------------------------------------------------------------
  // Error: Void draft PI → 400 INVALID_STATUS_TRANSITION
  // ---------------------------------------------------------------------------
  it('returns 400 when trying to void a draft PI', async () => {
    const invoiceNo = makeTag('PIVDFT', 32);

    const createRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        invoice_no: invoiceNo,
        invoice_date: '2026-04-12',
        currency_code: 'IDR',
        lines: [{ description: 'Void draft test', qty: '1', unit_price: '25000.00', line_type: 'SERVICE' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const piId = created.data.id;

    const voidRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/void`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    });
    expect(voidRes.status).toBe(400);
    const voidBody = await voidRes.json();
    expect(voidBody.success).toBe(false);
    expect(voidBody.error.code).toBe('INVALID_STATUS_TRANSITION');
  });
});
