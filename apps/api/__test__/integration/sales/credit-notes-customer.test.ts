// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for customer_id feature in Sales Credit Notes (Story 44.5)
// Tests credit note creation with customer_id inheritance and validation

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { sql } from 'kysely';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  createTestItem,
  createTestCompanyMinimal,
  getOrCreateTestCashierForPermission,
  createTestCustomer,
  createTestCustomerForCompany,
  registerFixtureCleanup,
} from '../../fixtures';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { makeTag } from '../../helpers/tags';

let baseUrl: string;
let ownerToken: string;
let outletId: number;
let companyId: number;
let companyCode: string;
let cashierToken: string;
const SALES_SUITE_LOCK = 'jp_sales_invoice_suite_lock';

async function acquireSalesSuiteLock() {
  const db = getTestDb();
  await sql`SELECT GET_LOCK(${SALES_SUITE_LOCK}, 120)`.execute(db);
}

async function releaseSalesSuiteLock() {
  const db = getTestDb();
  await sql`SELECT RELEASE_LOCK(${SALES_SUITE_LOCK})`.execute(db);
}

// =============================================================================
// Helper: Create a simple posted invoice for credit note testing
// =============================================================================
async function createPostedInvoice(withCustomerId: number | null): Promise<number> {
  const item = await createTestItem(companyId, {
    sku: `CN-INV-${makeTag('CNI', 20)}`,
    name: 'Credit Note Test Item',
    type: 'PRODUCT'
  });

  const payload: Record<string, unknown> = {
    outlet_id: outletId,
    invoice_date: '2026-01-15',
    draft: true,
    lines: [
      {
        item_id: item.id,
        description: 'Test line for credit note',
        qty: 1,
        unit_price: 50000
      }
    ]
  };

  if (withCustomerId !== null) {
    payload.customer_id = withCustomerId;
  }

  const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ownerToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  expect(createRes.status).toBe(201);
  const created = await createRes.json();
  const invoiceId = created.data.id;

  // Posted invoice cleanup handled by resetFixtureRegistry

  // Post the invoice
  let postRes: Response | null = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    postRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (postRes.status === 200) {
      break;
    }

    // Transient under parallel suites: 404 right after create or 409 lock wait
    if ((postRes.status === 404 || postRes.status === 409) && attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
      continue;
    }

    break;
  }

  expect(postRes?.status).toBe(200);
  return invoiceId;
}

// =============================================================================
// Helper: Create credit note payload
// =============================================================================
function createCreditNotePayload(invoiceId: number, customerId?: number | null) {
  const payload: Record<string, unknown> = {
    outlet_id: outletId,
    invoice_id: invoiceId,
    credit_note_date: '2026-02-01',
    reason: 'Customer return',
    amount: 50000,
    lines: [
      {
        description: 'Credit for returned item',
        qty: 1,
        unit_price: 50000
      }
    ]
  };

  if (customerId !== undefined) {
    payload.customer_id = customerId;
  }

  return payload;
}

// =============================================================================
// Tests: Credit Note customer_id feature (Story 44.5)
// =============================================================================
describe('sales.credit-notes.customer - customer_id feature', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    await acquireSalesSuiteLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);

    const seedCtx = await getSeedSyncContext();
    outletId = seedCtx.outletId;
    companyId = seedCtx.companyId;
    companyCode = process.env.JP_COMPANY_CODE || 'JURNAPOD';

    const cashier = await getOrCreateTestCashierForPermission(
      companyId,
      companyCode,
      baseUrl
    );
    cashierToken = cashier.accessToken;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await releaseSalesSuiteLock();
    await closeTestDb();
    await releaseReadLock();
  });

  // -------------------------------------------------------------------------
  // Test 1: Credit note created from invoice inherits customer_id
  // -------------------------------------------------------------------------
  it('credit note created from invoice inherits customer_id', async () => {
    // Create a customer
    const customerCode = `CN-INH-${makeTag('INH', 20)}`;
    const customerId = await createTestCustomer(
      baseUrl,
      ownerToken,
      companyId,
      customerCode,
      'Inherit Test Customer'
    );

    // Create a posted invoice with the customer
    const invoiceId = await createPostedInvoice(customerId);

    // Create credit note from that invoice (no customer_id in payload)
    const payload = createCreditNotePayload(invoiceId);
    delete payload.customer_id;

    const createRes = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.success).toBe(true);
    expect(created.data.customer_id).toBe(customerId);
  });

  // -------------------------------------------------------------------------
  // Test 2: Credit note created manually with customer_id succeeds
  // -------------------------------------------------------------------------
  it('credit note created manually with customer_id succeeds', async () => {
    // Create a customer
    const customerCode = `CN-MAN-${makeTag('MAN', 20)}`;
    const customerId = await createTestCustomer(
      baseUrl,
      ownerToken,
      companyId,
      customerCode,
      'Manual Customer'
    );

    // Create a posted invoice (without customer)
    const invoiceId = await createPostedInvoice(null);

    // Create credit note with explicit customer_id
    const payload = createCreditNotePayload(invoiceId, customerId);

    const createRes = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.success).toBe(true);
    expect(created.data.customer_id).toBe(customerId);
  });

  // -------------------------------------------------------------------------
  // Test 3: Credit note created with invalid customer_id returns 404
  // -------------------------------------------------------------------------
  it('credit note created with invalid customer_id returns 404', async () => {
    // Create a posted invoice first
    const invoiceId = await createPostedInvoice(null);

    // Create credit note with non-existent customer ID
    const payload = createCreditNotePayload(invoiceId, 99999999);

    const createRes = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    expect(createRes.status).toBe(404);
    const body = await createRes.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // Test 4: Credit note created with customer_id from different company returns 404
  // -------------------------------------------------------------------------
  it('credit note created with customer_id from different company returns 404', async () => {
    // Create another company with its own owner user
    const otherCompany = await createTestCompanyMinimal({
      code: `OTHER-CN-${makeTag('OCN', 20).toUpperCase()}`,
      name: 'Other Company for CN Customer Test'
    });

    // Create a customer in the other company via canonical fixture helper
    const otherCustomerCode = `CROSS-CO-CN-${makeTag('CCN', 20)}`;
    const otherCompanyCustomerId = await createTestCustomerForCompany(
      baseUrl,
      ownerToken,
      otherCompany.id,
      otherCustomerCode,
      'Cross Company Customer'
    );

    // Create a posted invoice in our company
    const invoiceId = await createPostedInvoice(null);

    // Try to create credit note with customer from other company
    const payload = createCreditNotePayload(invoiceId, otherCompanyCustomerId);

    const createRes = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // Should return 404 because customer doesn't exist in this company
    expect(createRes.status).toBe(404);
    const body = await createRes.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // Test 5: PATCH credit note customer_id to valid customer updates credit note
  // -------------------------------------------------------------------------
  it('PATCH credit note customer_id to valid customer updates credit note', async () => {
    // Create a customer
    const customerCode = `CN-PATCH-${makeTag('PAT', 20)}`;
    const customerId = await createTestCustomer(
      baseUrl,
      ownerToken,
      companyId,
      customerCode,
      'Patch Customer'
    );

    // Create a posted invoice
    const invoiceId = await createPostedInvoice(null);

    // Create credit note without customer first
    const createPayload = createCreditNotePayload(invoiceId);
    delete createPayload.customer_id;

    const createRes = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const creditNoteId = created.data.id;
    expect(created.data.customer_id == null).toBe(true);

    // PATCH with customer_id
    const patchPayload = { customer_id: customerId };
    const patchRes = await fetch(`${baseUrl}/api/sales/credit-notes/${creditNoteId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(patchPayload)
    });

    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.success).toBe(true);
    expect(patched.data.customer_id).toBe(customerId);
  });

  // -------------------------------------------------------------------------
  // Test 6: PATCH credit note customer_id to null clears customer link
  // -------------------------------------------------------------------------
  it('PATCH credit note customer_id to null clears customer link', async () => {
    // Create a customer
    const customerCode = `CN-NULL-${makeTag('NUL', 20)}`;
    const customerId = await createTestCustomer(
      baseUrl,
      ownerToken,
      companyId,
      customerCode,
      'Null Customer'
    );

    // Create a posted invoice
    const invoiceId = await createPostedInvoice(null);

    // Create credit note WITH customer
    const createPayload = createCreditNotePayload(invoiceId, customerId);

    const createRes = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const creditNoteId = created.data.id;
    expect(created.data.customer_id).toBe(customerId);

    // PATCH with customer_id: null to clear the link
    const patchPayload = { customer_id: null };
    const patchRes = await fetch(`${baseUrl}/api/sales/credit-notes/${creditNoteId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(patchPayload)
    });

    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.success).toBe(true);
    expect(patched.data.customer_id == null).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 7: PATCH with customer_id requires platform.customers.READ permission
  // -------------------------------------------------------------------------
  it('PATCH with customer_id requires platform.customers.READ permission', async () => {
    // Create a customer
    const customerCode = `CN-PERM-${makeTag('PRM', 20)}`;
    const customerId = await createTestCustomer(
      baseUrl,
      ownerToken,
      companyId,
      customerCode,
      'Permission Customer'
    );

    // Create a posted invoice
    const invoiceId = await createPostedInvoice(null);

    // Create credit note without customer
    const createPayload = createCreditNotePayload(invoiceId);
    delete createPayload.customer_id;

    const createRes = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const creditNoteId = created.data.id;

    // CASHIER has no platform.customers.READ permission
    // Try to PATCH with customer_id using CASHIER token
    const patchPayload = { customer_id: customerId };
    const patchRes = await fetch(`${baseUrl}/api/sales/credit-notes/${creditNoteId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(patchPayload)
    });

    expect(patchRes.status).toBe(403);
    const body = await patchRes.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  // -------------------------------------------------------------------------
  // Test 7b: PATCH customer_id to null (clearing) also requires platform.customers.READ
  // -------------------------------------------------------------------------
  it('PATCH customer_id to null requires platform.customers.READ permission', async () => {
    // Create a customer
    const customerCode = `CN-CLEAR-${makeTag('CLR', 20)}`;
    const customerId = await createTestCustomer(
      baseUrl,
      ownerToken,
      companyId,
      customerCode,
      'Clear Customer'
    );

    // Create a posted invoice
    const invoiceId = await createPostedInvoice(null);

    // Create credit note WITH customer (as owner)
    const createPayload = createCreditNotePayload(invoiceId, customerId);

    const createRes = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const creditNoteId = created.data.id;
    expect(created.data.customer_id).toBe(customerId);

    // CASHIER tries to clear the customer link — should be denied
    const patchPayload = { customer_id: null };
    const patchRes = await fetch(`${baseUrl}/api/sales/credit-notes/${creditNoteId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(patchPayload)
    });

    expect(patchRes.status).toBe(403);
    const patchBody = await patchRes.json();
    expect(patchBody.error.code).toBe('FORBIDDEN');
  });

  // -------------------------------------------------------------------------
  // Test 8: POST with customer_id requires platform.customers.READ permission
  // -------------------------------------------------------------------------
  it('POST with customer_id requires platform.customers.READ permission', async () => {
    // Create a customer
    const customerCode = `CN-PERM-POST-${makeTag('CPP', 20)}`;
    const customerId = await createTestCustomer(
      baseUrl,
      ownerToken,
      companyId,
      customerCode,
      'Permission Post Customer'
    );

    // Create a posted invoice without customer
    const invoiceId = await createPostedInvoice(null);

    // Try to create credit note with customer_id using CASHIER token
    // CASHIER has no platform.customers.READ permission
    const payload = createCreditNotePayload(invoiceId, customerId);

    const createRes = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    expect(createRes.status).toBe(403);
    const body = await createRes.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  // -------------------------------------------------------------------------
  // Test 9: Source invoice customer_id is inherited and request customer_id is ignored
  // -------------------------------------------------------------------------
  it('source invoice customer_id is inherited and request customer_id is ignored', async () => {
    // Create two customers
    const invoiceCustomerCode = `CN-INV-CUST-${makeTag('INVC', 20)}`;
    const invoiceCustomerId = await createTestCustomer(
      baseUrl,
      ownerToken,
      companyId,
      invoiceCustomerCode,
      'Invoice Customer'
    );

    const overrideCustomerCode = `CN-OVR-${makeTag('OVR', 20)}`;
    const overrideCustomerId = await createTestCustomer(
      baseUrl,
      ownerToken,
      companyId,
      overrideCustomerCode,
      'Override Customer'
    );

    // Create a posted invoice with the invoice customer
    const invoiceId = await createPostedInvoice(invoiceCustomerId);

    // Create credit note WITH a different customer_id in payload (should be ignored)
    const payload = createCreditNotePayload(invoiceId, overrideCustomerId);

    const createRes = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.success).toBe(true);
    // Must inherit from invoice, NOT from request body
    expect(created.data.customer_id).toBe(invoiceCustomerId);
    expect(created.data.customer_id).not.toBe(overrideCustomerId);
  });

  // -------------------------------------------------------------------------
  // Test 10: Credit note list response includes customer_id field
  // -------------------------------------------------------------------------
  it('credit note list response includes customer_id field', async () => {
    // Create a customer
    const customerCode = `CN-LIST-${makeTag('LST', 20)}`;
    const customerId = await createTestCustomer(
      baseUrl,
      ownerToken,
      companyId,
      customerCode,
      'List Customer'
    );

    // Create a posted invoice with customer
    const invoiceId = await createPostedInvoice(customerId);

    // Create credit note with customer
    const payload = createCreditNotePayload(invoiceId, customerId);

    const createRes = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const creditNoteId = created.data.id;

    // List credit notes
    const listRes = await fetch(`${baseUrl}/api/sales/credit-notes?outlet_id=${outletId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.success).toBe(true);
    expect(listData.data.credit_notes).toBeDefined();
    expect(Array.isArray(listData.data.credit_notes)).toBe(true);

    // Find our specific credit note in the list by id
    const ourCreditNote = listData.data.credit_notes.find(
      (cn: { id: number }) => cn.id === creditNoteId
    );
    expect(ourCreditNote).toBeDefined();
    // The credit note should include customer_id field and match our customer
    expect('customer_id' in ourCreditNote).toBe(true);
    expect(ourCreditNote.customer_id).toBe(customerId);
  });

});
