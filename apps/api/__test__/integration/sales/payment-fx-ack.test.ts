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
  createTestCustomerForCompany,
  createTestItem,
  createTestBankAccount,
  ensureTestSalesAccountMappings,
  ensureTestPaymentVarianceMappings
} from '../../fixtures';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { makeTag } from '../../helpers/tags';
import { initializeDefaultTemplates } from '@/lib/numbering';

let baseUrl: string;
let ownerToken: string;
let testCompanyId: number;
let testOutletId: number;
let testCompanyCode: string;
let testBankAccountId: number;

const FX_ACK_SUITE_LOCK = 'jp_fx_ack_suite_lock';

async function createOwnerTokenForCompany(companyId: number, companyCode: string): Promise<string> {
  const ownerEmail = `fx-owner+${makeTag('OWN', 12)}-${Date.now()}@example.com`.toLowerCase();
  const ownerPassword = 'TestOwner123!';
  const ownerUser = await createTestUser(companyId, {
    email: ownerEmail,
    name: 'FX Test Owner',
    password: ownerPassword
  });
  const ownerRoleId = await getRoleIdByCode('OWNER');
  await assignUserGlobalRole(ownerUser.id, ownerRoleId);
  return loginForTest(baseUrl, companyCode, ownerEmail, ownerPassword);
}

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
    testCompanyCode = company.code;
    await initializeDefaultTemplates(testCompanyId);
    const outlet = await createTestOutlet(testCompanyId);
    testOutletId = outlet.id;

    // Create test fiscal year and period (required for posting)
    const fiscalYear = await createTestFiscalYear(testCompanyId);
    await createTestFiscalPeriod(fiscalYear.id);

    // Create bank account for sales payment (BANK type, is_active=1)
    testBankAccountId = await createTestBankAccount(testCompanyId);

    // Ensure AR and SALES_REVENUE account mappings exist for this outlet
    await ensureTestSalesAccountMappings(testCompanyId, testOutletId);
    await ensureTestPaymentVarianceMappings(testCompanyId);

    // Get owner token scoped to the newly created company
    ownerToken = await createOwnerTokenForCompany(testCompanyId, testCompanyCode);

    // Create customer for invoice
    await createTestCustomerForCompany(
      baseUrl,
      ownerToken,
      testCompanyId,
      `CUST-${makeTag('CUS', 12)}`,
      'FX Ack Customer'
    );
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await releaseFxAckLock();
    await closeTestDb();
    await releaseReadLock();
  });

  // Helper: Create a draft invoice and payment with non-zero FX delta
  async function createPaymentWithNonZeroDelta(): Promise<{ paymentId: number; invoiceId: number }> {
    const item = await createTestItem(testCompanyId);
    const bankAccountId = testBankAccountId;
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
        lines: [{ item_id: item.id, description: 'FX delta test', qty: 1, unit_price: 100000 }]
      })
    });

    const invoiceText = await invoiceRes.text();
    if (invoiceRes.status !== 201) {
      throw new Error(`Expected invoice create 201, got ${invoiceRes.status}: ${invoiceText}`);
    }
    const invoice = JSON.parse(invoiceText);
    const invoiceId = invoice.data.id;

    // Post the invoice first (required before posting payment)
    const postInvoiceRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    if (postInvoiceRes.status !== 200) {
      throw new Error(`Expected invoice post 200, got ${postInvoiceRes.status}: ${await postInvoiceRes.text()}`);
    }

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
        account_id: bankAccountId,
        payment_at: new Date().toISOString(),
        method: 'CASH',
        amount: 100000,
        actual_amount_idr: 100500 // Creates non-zero delta of +500 IDR
      })
    });

    const paymentText = await paymentRes.text();
    if (paymentRes.status !== 201) {
      throw new Error(`Expected payment create 201, got ${paymentRes.status}: ${paymentText}`);
    }
    const payment = JSON.parse(paymentText);
    return { paymentId: payment.data.id, invoiceId };
  }

  // Helper: Create a payment with zero FX delta
  async function createPaymentWithZeroDelta(): Promise<{ paymentId: number; invoiceId: number }> {
    const item = await createTestItem(testCompanyId);
    const bankAccountId = testBankAccountId;
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
        lines: [{ item_id: item.id, description: 'Zero delta test', qty: 1, unit_price: 50000 }]
      })
    });

    const invoiceText = await invoiceRes.text();
    if (invoiceRes.status !== 201) {
      throw new Error(`Expected invoice create 201, got ${invoiceRes.status}: ${invoiceText}`);
    }
    const invoice = JSON.parse(invoiceText);
    const invoiceId = invoice.data.id;

    // Post the invoice first (required before posting payment)
    const postInvoiceRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    if (postInvoiceRes.status !== 200) {
      throw new Error(`Expected invoice post 200, got ${postInvoiceRes.status}: ${await postInvoiceRes.text()}`);
    }

    const paymentRes = await fetch(`${baseUrl}/api/sales/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: testOutletId,
        invoice_id: invoiceId,
        account_id: bankAccountId,
        payment_at: new Date().toISOString(),
        method: 'CASH',
        amount: 50000,
        actual_amount_idr: 50000 // Same as amount -> zero delta
      })
    });

    const paymentText = await paymentRes.text();
    if (paymentRes.status !== 201) {
      throw new Error(`Expected payment create 201, got ${paymentRes.status}: ${paymentText}`);
    }
    const payment = JSON.parse(paymentText);
    return { paymentId: payment.data.id, invoiceId };
  }

  it('rejects posting non-zero delta without FX acknowledgment (422)', async () => {
    // Arrange: Create payment with non-zero FX delta
    const { paymentId } = await createPaymentWithNonZeroDelta();

    // Act: Try to post without FX acknowledgment
    const postRes = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    // Assert: Should get 422 with FX delta requiring acknowledgment
    const postText1 = await postRes.text();
    if (postRes.status !== 422) throw new Error(`Expected 422, got ${postRes.status}: ${postText1}`);
    const error = JSON.parse(postText1);
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
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fx_ack: {
          acknowledged_at: pastDate
        }
      })
    });

    // Assert: Should succeed (ack persisted then posting proceeded)
    const postText2 = await postRes.text();
    if (postRes.status !== 200) throw new Error(`Expected 200, got ${postRes.status}: ${postText2}`);
    const posted = JSON.parse(postText2);
    expect(posted.success).toBe(true);
    expect(posted.data.status).toBe('POSTED');
    // Verify fx_acknowledged_at was set
    expect(posted.data.fx_acknowledged_at).toBeDefined();
    expect(posted.data.fx_acknowledged_at).toMatch(/Z$/);
  });

  it('rejects future-dated fx_ack in POST body (422)', async () => {
    // Arrange: Create payment with non-zero FX delta
    const { paymentId } = await createPaymentWithNonZeroDelta();

    // Act: Try to post with future-dated fx_ack
    const futureDate = new Date(Date.now() + 600000).toISOString(); // 10 minutes in future
    const postRes = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fx_ack: {
          acknowledged_at: futureDate
        }
      })
    });

    // Assert: Should get 422 with future-dated error
    const postText3 = await postRes.text();
    if (postRes.status !== 422) throw new Error(`Expected 422, got ${postRes.status}: ${postText3}`);
    const error = JSON.parse(postText3);
    expect(error.error.code).toBe('fx_ack_cannot_be_future_dated');
  });

  it('allows posting zero delta without FX acknowledgment', async () => {
    // Arrange: Create payment with zero FX delta
    const { paymentId } = await createPaymentWithZeroDelta();

    // Act: Post without fx_ack (zero delta bypasses requirement)
    const postRes = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    // Assert: Should succeed (zero delta doesn't require acknowledgment)
    const postText4 = await postRes.text();
    if (postRes.status !== 200) throw new Error(`Expected 200, got ${postRes.status}: ${postText4}`);
    const posted = JSON.parse(postText4);
    expect(posted.success).toBe(true);
    expect(posted.data.status).toBe('POSTED');
    expect(posted.data.fx_acknowledged_at).toBeDefined();
    expect(posted.data.fx_acknowledged_at).toMatch(/Z$/);
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
    await initializeDefaultTemplates(company.id);
    const outlet = await createTestOutlet(company.id);
    const runNonce = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const cashierEmail = `cas-block-test+${makeTag('CBT', 16)}-${runNonce}@example.com`.toLowerCase();
    const cashierUser = await createTestUser(company.id, {
      email: cashierEmail,
      name: 'Cashier Block Test',
      password: 'TestCashier123!'
    });
    const ownerTok = await createOwnerTokenForCompany(company.id, company.code);
    const cashierRoleIdNum = await createTestRole(baseUrl, ownerTok, `CAS_BLOCK_${makeTag('CB', 8)}`);
    await assignUserGlobalRole(cashierUser.id, cashierRoleIdNum.id);
    // Set module permission: sales.payments -> CRUD (15) without ANALYZE bit
    await setModulePermission(company.id, cashierRoleIdNum.id, 'sales', 'payments', 15);

    const code = company.code;
    const cashierPassword = 'TestCashier123!';
    const casToken = await loginForTest(baseUrl, code, cashierEmail, cashierPassword);

    // Create fiscal year/period for posting
    const fiscalYear = await createTestFiscalYear(company.id);
    await createTestFiscalPeriod(fiscalYear.id);
    // Create bank account for sales payment (BANK type, is_active=1)
    const bankAccountIdForCasTest = await createTestBankAccount(company.id);
    // Ensure AR and SALES_REVENUE account mappings exist for this outlet
    await ensureTestSalesAccountMappings(company.id, outlet.id);
    await ensureTestPaymentVarianceMappings(company.id);
    await createTestCustomerForCompany(
      baseUrl,
      ownerTok,
      company.id,
      `CUST-${makeTag('CUS', 12)}`,
      'Cashier Block Customer'
    );

    // Create a draft invoice
    const item = await createTestItem(company.id);
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
        lines: [{ item_id: item.id, description: 'Cashier block test', qty: 1, unit_price: 75000 }]
      })
    });
    const invoiceText = await invoiceRes.text();
    if (invoiceRes.status !== 201) {
      throw new Error(`Expected invoice create 201, got ${invoiceRes.status}: ${invoiceText}`);
    }
    const invoice = JSON.parse(invoiceText);

    // Post the invoice first (required before posting payment)
    const postInvoiceRes = await fetch(`${baseUrl}/api/sales/invoices/${invoice.data.id}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerTok}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    if (postInvoiceRes.status !== 200) {
      throw new Error(`Expected invoice post 200, got ${postInvoiceRes.status}: ${await postInvoiceRes.text()}`);
    }

    // Create payment with non-zero delta
    const bankAccountIdForTest = bankAccountIdForCasTest;
    const paymentRes = await fetch(`${baseUrl}/api/sales/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerTok}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: outlet.id,
        invoice_id: invoice.data.id,
        account_id: bankAccountIdForTest,
        payment_at: new Date().toISOString(),
        method: 'CASH',
        amount: 75000,
        actual_amount_idr: 75100 // Creates non-zero delta
      })
    });
    const paymentText = await paymentRes.text();
    if (paymentRes.status !== 201) {
      throw new Error(`Expected payment create 201, got ${paymentRes.status}: ${paymentText}`);
    }
    const payment = JSON.parse(paymentText);

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
    const postText5 = await postRes.text();
    if (postRes.status !== 403) throw new Error(`Expected 403, got ${postRes.status}: ${postText5}`);
  });

  it('allows OWNER to acknowledge FX via POST body', async () => {
    // Arrange: Create company/outlet and owner token
    const company = await createTestCompany();
    await initializeDefaultTemplates(company.id);
    const outlet = await createTestOutlet(company.id);
    const ownerTok = await createOwnerTokenForCompany(company.id, company.code);

    // Create fiscal year/period and customer
    const fiscalYear = await createTestFiscalYear(company.id);
    await createTestFiscalPeriod(fiscalYear.id);
    // Create bank account for sales payment (BANK type, is_active=1)
    const bankAccountIdForAccTest = await createTestBankAccount(company.id);
    // Ensure AR and SALES_REVENUE account mappings exist for this outlet
    await ensureTestSalesAccountMappings(company.id, outlet.id);
    await ensureTestPaymentVarianceMappings(company.id);
    await createTestCustomerForCompany(
      baseUrl,
      ownerTok,
      company.id,
      `CUST-${makeTag('CUS', 12)}`,
      'Accountant Allow Customer'
    );

    // Create draft invoice
    const item = await createTestItem(company.id);
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
        lines: [{ item_id: item.id, description: 'Accountant allow test', qty: 1, unit_price: 90000 }]
      })
    });
    const invoiceText = await invoiceRes.text();
    if (invoiceRes.status !== 201) {
      throw new Error(`Expected invoice create 201, got ${invoiceRes.status}: ${invoiceText}`);
    }
    const invoice = JSON.parse(invoiceText);

    // Post the invoice first (required before posting payment)
    const postInvoiceRes = await fetch(`${baseUrl}/api/sales/invoices/${invoice.data.id}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerTok}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    if (postInvoiceRes.status !== 200) {
      throw new Error(`Expected invoice post 200, got ${postInvoiceRes.status}: ${await postInvoiceRes.text()}`);
    }

    // Create payment with non-zero delta
    const bankAccountIdForTest = bankAccountIdForAccTest;
    const paymentRes = await fetch(`${baseUrl}/api/sales/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerTok}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: outlet.id,
        invoice_id: invoice.data.id,
        account_id: bankAccountIdForTest,
        payment_at: new Date().toISOString(),
        method: 'CASH',
        amount: 90000,
        actual_amount_idr: 90150 // Creates non-zero delta
      })
    });
    const paymentText = await paymentRes.text();
    if (paymentRes.status !== 201) {
      throw new Error(`Expected payment create 201, got ${paymentRes.status}: ${paymentText}`);
    }
    const payment = JSON.parse(paymentText);

    // Act: Owner posts with fx_ack (ACCOUNTANT+ gate includes OWNER)
    const pastDate = new Date(Date.now() - 60000).toISOString();
    const postRes = await fetch(`${baseUrl}/api/sales/payments/${payment.data.id}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerTok}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fx_ack: {
          acknowledged_at: pastDate
        }
      })
    });

    // Assert: Should succeed (OWNER satisfies ACCOUNTANT+ gate)
    const postText6 = await postRes.text();
    if (postRes.status !== 200) throw new Error(`Expected 200, got ${postRes.status}: ${postText6}`);
    const posted = JSON.parse(postText6);
    expect(posted.success).toBe(true);
    expect(posted.data.status).toBe('POSTED');
    expect(posted.data.fx_acknowledged_at).toBeDefined();
    expect(posted.data.fx_acknowledged_at).toMatch(/Z$/);
  });
});
