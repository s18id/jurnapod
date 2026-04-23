// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration Tests: FX Acknowledgment Gating for Sales AR Payment Posting
// Tests the complete FX acknowledgment flow including:
// 1. Non-zero delta without marker -> 422
// 2. Non-zero delta with explicit marker in POST body -> success
// 3. Cashier blocked for ack -> 403
// 4. Future-dated ack -> 422
// 5. Zero-delta no marker -> allowed

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { sql } from 'kysely';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  createTestCompany,
  createTestOutlet,
  createTestUser,
  assignUserGlobalRole,
  getRoleIdByCode,
  createTestRole,
  setModulePermission,
  createTestFiscalYear,
  createTestFiscalPeriod,
  loginForTest,
  createTestCustomerForCompany
} from '../../fixtures';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { makeTag } from '../../helpers/tags';

let baseUrl: string;
let ownerToken: string;
let accountantToken: string;
let testCompanyId: number;
let testOutletId: number;

const FX_ACK_SUITE_LOCK = 'jp_fx_ack_suite_lock';

async function acquireFxAckLock() {
  const db = getTestDb();
  await sql`SELECT GET_LOCK(${FX_ACK_SUITE_LOCK}, 120)`.execute(db);
}

async function releaseFxAckLock() {
  const db = getTestDb();
  await sql`SELECT RELEASE_LOCK(${FX_ACK_SUITE_LOCK})`.execute(db);
}

describe('sales.payments.fx-ack', { timeout: 60000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    await acquireFxAckLock();
    baseUrl = getTestBaseUrl();

    // Create test company and outlet
    const company = await createTestCompany();
    testCompanyId = company.id;
    const outlet = await createTestOutlet(testCompanyId);
    testOutletId = outlet.id;

    // Create test fiscal year and period (required for posting)
    const fiscalYear = await createTestFiscalYear(testCompanyId);
    await createTestFiscalPeriod(fiscalYear.id);

    // Get owner token
    ownerToken = await getTestAccessToken(baseUrl);

    // Create customer for invoice
    await createTestCustomerForCompany(
      baseUrl,
      ownerToken,
      testCompanyId,
      `CUST-${makeTag('CUS', 12)}`,
      'FX Ack Customer'
    );

    // Create accountant user with proper permissions
    const accountantUser = await createTestUser(testCompanyId, {
      email: `fx-ack-test+acc-${makeTag('ACC', 16)}@example.com`,
      name: 'FX Ack Accountant'
    });
    const accountantRoleId = await getRoleIdByCode('ACCOUNTANT');
    await assignUserGlobalRole(accountantUser.id, accountantRoleId);
    // Set module permission: sales.payments -> CRUD (15)
    await setModulePermission(testCompanyId, accountantRoleId, 'sales', 'payments', 15);

    const companyCode = process.env.JP_COMPANY_CODE || 'JURNAPOD';
    const accountantEmail = `fx-ack-test+acc-${makeTag('ACC', 16)}@example.com`.toLowerCase();
    const accountantPassword = 'TestAccountant123!';
    await loginForTest(baseUrl, companyCode, accountantEmail, accountantPassword);
    accountantToken = await getTestAccessToken(baseUrl);

  });

  afterAll(async () => {
    resetFixtureRegistry();
    await releaseFxAckLock();
    await closeTestDb();
    await releaseReadLock();
  });

  // Helper: Create a draft invoice and payment with non-zero FX delta
  async function createPaymentWithNonZeroDelta(): Promise<{ paymentId: number; invoiceId: number }> {
    // Create a draft invoice
    const invoiceRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: testOutletId,
        invoice_date: '2026-04-01',
        draft: true,
        lines: [{ description: 'FX delta test', qty: 1, unit_price: 100000 }]
      })
    });

    expect(invoiceRes.status).toBe(201);
    const invoice = await invoiceRes.json();
    const invoiceId = invoice.data.id;

    // Create payment with actual_amount_idr different from amount to create delta
    // When actual_amount_idr != amount, payment_delta_idr is set
    const paymentRes = await fetch(`${baseUrl}/api/sales/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: testOutletId,
        invoice_id: invoiceId,
        account_id: 1, // Cash account
        payment_at: new Date().toISOString(),
        method: 'CASH',
        amount: 100000,
        actual_amount_idr: 100500 // Creates non-zero delta of +500 IDR
      })
    });

    expect(paymentRes.status).toBe(201);
    const payment = await paymentRes.json();
    return { paymentId: payment.data.id, invoiceId };
  }

  // Helper: Create a payment with zero FX delta
  async function createPaymentWithZeroDelta(): Promise<{ paymentId: number; invoiceId: number }> {
    const invoiceRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: testOutletId,
        invoice_date: '2026-04-01',
        draft: true,
        lines: [{ description: 'Zero delta test', qty: 1, unit_price: 50000 }]
      })
    });

    expect(invoiceRes.status).toBe(201);
    const invoice = await invoiceRes.json();
    const invoiceId = invoice.data.id;

    const paymentRes = await fetch(`${baseUrl}/api/sales/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: testOutletId,
        invoice_id: invoiceId,
        account_id: 1,
        payment_at: new Date().toISOString(),
        method: 'CASH',
        amount: 50000,
        actual_amount_idr: 50000 // Same as amount -> zero delta
      })
    });

    expect(paymentRes.status).toBe(201);
    const payment = await paymentRes.json();
    return { paymentId: payment.data.id, invoiceId };
  }

  it('rejects posting non-zero delta without FX acknowledgment (422)', async () => {
    // Arrange: Create payment with non-zero FX delta
    const { paymentId } = await createPaymentWithNonZeroDelta();

    // Act: Try to post without FX acknowledgment
    const postRes = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accountantToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    // Assert: Should get 422 with FX delta requiring acknowledgment
    expect(postRes.status).toBe(422);
    const error = await postRes.json();
    expect(error.error.code).toBe('FX_DELTA_REQUIRES_ACKNOWLEDGMENT');
  });

  it('allows posting non-zero delta with explicit fx_ack in POST body', async () => {
    // Arrange: Create payment with non-zero FX delta
    const { paymentId } = await createPaymentWithNonZeroDelta();

    // Act: Post with inline fx_ack (ACCOUNTANT+ role required)
    const pastDate = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
    const postRes = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accountantToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fx_ack: {
          acknowledged_at: pastDate
        }
      })
    });

    // Assert: Should succeed (ack persisted then posting proceeded)
    expect(postRes.status).toBe(200);
    const posted = await postRes.json();
    expect(posted.success).toBe(true);
    expect(posted.data.status).toBe('POSTED');
    // Verify fx_acknowledged_at was set
    expect(posted.data.fx_acknowledged_at).toBeDefined();
  });

  it('rejects future-dated fx_ack in POST body (422)', async () => {
    // Arrange: Create payment with non-zero FX delta
    const { paymentId } = await createPaymentWithNonZeroDelta();

    // Act: Try to post with future-dated fx_ack
    const futureDate = new Date(Date.now() + 600000).toISOString(); // 10 minutes in future
    const postRes = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accountantToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fx_ack: {
          acknowledged_at: futureDate
        }
      })
    });

    // Assert: Should get 422 with future-dated error
    expect(postRes.status).toBe(422);
    const error = await postRes.json();
    expect(error.error.code).toBe('fx_ack_cannot_be_future_dated');
  });

  it('allows posting zero delta without FX acknowledgment', async () => {
    // Arrange: Create payment with zero FX delta
    const { paymentId } = await createPaymentWithZeroDelta();

    // Act: Post without fx_ack (zero delta bypasses requirement)
    const postRes = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accountantToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    // Assert: Should succeed (zero delta doesn't require acknowledgment)
    expect(postRes.status).toBe(200);
    const posted = await postRes.json();
    expect(posted.success).toBe(true);
    expect(posted.data.status).toBe('POSTED');
  });
});

describe('sales.payments.fx-ack.cashier-blocked', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    await acquireFxAckLock();
    baseUrl = getTestBaseUrl();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await releaseFxAckLock();
    await closeTestDb();
    await releaseReadLock();
  });

  it('blocks CASHIER from inline fx_ack in POST (403)', async () => {
    // Arrange: Create company/outlet and get tokens
    const company = await createTestCompany();
    const outlet = await createTestOutlet(company.id);
    const cashierUser = await createTestUser(company.id, {
      email: `cas-block-test+${makeTag('CBT', 16)}@example.com`,
      name: 'Cashier Block Test'
    });
    const ownerTok = await getTestAccessToken(baseUrl);
    const cashierRoleIdNum = await createTestRole(baseUrl, ownerTok, `CAS_BLOCK_${makeTag('CB', 8)}`);
    await assignUserGlobalRole(cashierUser.id, cashierRoleIdNum.id);
    // Set module permission: sales.payments -> CRUD (15) without ANALYZE bit
    await setModulePermission(company.id, cashierRoleIdNum.id, 'sales', 'payments', 15);

    const code = process.env.JP_COMPANY_CODE || 'JURNAPOD';
    const cashierEmail = `cas-block-test+${makeTag('CBT', 16)}@example.com`.toLowerCase();
    const cashierPassword = 'TestCashier123!';
    await loginForTest(baseUrl, code, cashierEmail, cashierPassword);
    const casToken = await getTestAccessToken(baseUrl);

    // Create fiscal year/period for posting
    const fiscalYear = await createTestFiscalYear(company.id);
    await createTestFiscalPeriod(fiscalYear.id);
    await createTestCustomerForCompany(
      baseUrl,
      ownerTok,
      company.id,
      `CUST-${makeTag('CUS', 12)}`,
      'Cashier Block Customer'
    );

    // Create a draft invoice
    const invoiceRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerTok}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: outlet.id,
        invoice_date: '2026-04-10',
        draft: true,
        lines: [{ description: 'Cashier block test', qty: 1, unit_price: 75000 }]
      })
    });
    expect(invoiceRes.status).toBe(201);
    const invoice = await invoiceRes.json();

    // Create payment with non-zero delta
    const paymentRes = await fetch(`${baseUrl}/api/sales/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerTok}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: outlet.id,
        invoice_id: invoice.data.id,
        account_id: 1,
        payment_at: new Date().toISOString(),
        method: 'CASH',
        amount: 75000,
        actual_amount_idr: 75100 // Creates non-zero delta
      })
    });
    expect(paymentRes.status).toBe(201);
    const payment = await paymentRes.json();

    // Act: Try to post with fx_ack as CASHIER
    const pastDate = new Date(Date.now() - 60000).toISOString();
    const postRes = await fetch(`${baseUrl}/api/sales/payments/${payment.data.id}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${casToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fx_ack: {
          acknowledged_at: pastDate
        }
      })
    });

    // Assert: Should get 403 Forbidden (cashier lacks ACCOUNTANT+ role)
    expect(postRes.status).toBe(403);
  });

  it('allows ACCOUNTANT to acknowledge FX via POST body', async () => {
    // Arrange: Create company/outlet and accountant
    const company = await createTestCompany();
    const outlet = await createTestOutlet(company.id);

    const accountantUser = await createTestUser(company.id, {
      email: `acc-allow-test+${makeTag('AAT', 16)}@example.com`,
      name: 'Accountant Allow Test'
    });
    const accountantRoleId = await getRoleIdByCode('ACCOUNTANT');
    await assignUserGlobalRole(accountantUser.id, accountantRoleId);
    await setModulePermission(company.id, accountantRoleId, 'sales', 'payments', 31); // CRUDA = 31 (has ANALYZE bit)

    const code = process.env.JP_COMPANY_CODE || 'JURNAPOD';
    const accEmail = `acc-allow-test+${makeTag('AAT', 16)}@example.com`.toLowerCase();
    const accPassword = 'TestAccountant123!';
    await loginForTest(baseUrl, code, accEmail, accPassword);
    const accToken = await getTestAccessToken(baseUrl);
    const ownerTok = await getTestAccessToken(baseUrl);

    // Create fiscal year/period and customer
    const fiscalYear = await createTestFiscalYear(company.id);
    await createTestFiscalPeriod(fiscalYear.id);
    await createTestCustomerForCompany(
      baseUrl,
      ownerTok,
      company.id,
      `CUST-${makeTag('CUS', 12)}`,
      'Accountant Allow Customer'
    );

    // Create draft invoice
    const invoiceRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerTok}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: outlet.id,
        invoice_date: '2026-04-10',
        draft: true,
        lines: [{ description: 'Accountant allow test', qty: 1, unit_price: 90000 }]
      })
    });
    expect(invoiceRes.status).toBe(201);
    const invoice = await invoiceRes.json();

    // Create payment with non-zero delta
    const paymentRes = await fetch(`${baseUrl}/api/sales/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerTok}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: outlet.id,
        invoice_id: invoice.data.id,
        account_id: 1,
        payment_at: new Date().toISOString(),
        method: 'CASH',
        amount: 90000,
        actual_amount_idr: 90150 // Creates non-zero delta
      })
    });
    expect(paymentRes.status).toBe(201);
    const payment = await paymentRes.json();

    // Act: ACCOUNTANT posts with fx_ack
    const pastDate = new Date(Date.now() - 60000).toISOString();
    const postRes = await fetch(`${baseUrl}/api/sales/payments/${payment.data.id}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fx_ack: {
          acknowledged_at: pastDate
        }
      })
    });

    // Assert: Should succeed (ACCOUNTANT has required role)
    expect(postRes.status).toBe(200);
    const posted = await postRes.json();
    expect(posted.success).toBe(true);
    expect(posted.data.status).toBe('POSTED');
    expect(posted.data.fx_acknowledged_at).toBeDefined();
  });
});
