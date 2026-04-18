// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for PATCH /sales/invoices/:id
// Verifies invoice update using current mutable fields:
// outlet_id, invoice_no, invoice_date, due_date, due_term, tax_amount, lines, taxes

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { getTestDb } from '../../helpers/db';
import { sql } from 'kysely';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  createTestItem,
  createTestOutlet,
  createTestUser,
  assignUserOutletRole,
  getRoleIdByCode,
  loginForTest,
  createTestCompanyMinimal,
  getOrCreateTestCashierForPermission
} from '../../fixtures';

let baseUrl: string;
let ownerToken: string;
let outletId: number;
let companyId: number;
let scopedAdminToken: string;
let cashierToken: string;
let companyCode: string;
const SALES_SUITE_LOCK = 'jp_sales_invoice_suite_lock';

async function acquireSalesSuiteLock() {
  const db = getTestDb();
  await sql`SELECT GET_LOCK(${SALES_SUITE_LOCK}, 120)`.execute(db);
}

async function releaseSalesSuiteLock() {
  const db = getTestDb();
  await sql`SELECT RELEASE_LOCK(${SALES_SUITE_LOCK})`.execute(db);
}

async function ensureInvoiceVisible(baseUrl: string, token: string, invoiceId: number): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const probe = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (probe.status === 200) {
      return;
    }

    if (probe.status === 404 && attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
      continue;
    }

    return;
  }
}

describe('sales.invoices.update', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireSalesSuiteLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);

    const seedCtx = await getSeedSyncContext();
    outletId = seedCtx.outletId;
    companyId = seedCtx.companyId;
    companyCode = process.env.JP_COMPANY_CODE || 'JURNAPOD';

    // Create an ADMIN user with outlet-scoped access to outletId only.
    // This user can PATCH invoices on the source outlet but cannot reassign to other outlets.
    const scopedAdminEmail = `inv-test-admin+${Date.now()}@example.com`;
    const scopedAdminPassword = 'TestAdmin123!';

    const scopedAdmin = await createTestUser(companyId, {
      email: scopedAdminEmail,
      name: 'Invoice Scoped Admin',
      password: scopedAdminPassword
    });

    const adminRoleId = await getRoleIdByCode('ADMIN');
    await assignUserOutletRole(scopedAdmin.id, adminRoleId, outletId);

    // Login as scoped ADMIN
    scopedAdminToken = await loginForTest(baseUrl, companyCode, scopedAdminEmail.toLowerCase(), scopedAdminPassword);

    // Get or create a CASHIER user for permission tests
    // CASHIER has platform.customers = 0 (no READ permission)
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
  });

  it('updates invoice_no via PATCH', async () => {
    // Create a test item for the invoice
    const item = await createTestItem(companyId, {
      sku: `INV-UPD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Invoice Update Test Item',
      type: 'PRODUCT'
    });

    // Create a draft invoice with the item
    const createPayload = {
      outlet_id: outletId,
      invoice_date: '2026-01-15',
      draft: true,
      lines: [
        {
          item_id: item.id,
          description: 'Test line',
          qty: 1,
          unit_price: 10000
        }
      ]
    };

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.success).toBe(true);
    const invoiceId = created.data.id;
    await ensureInvoiceVisible(baseUrl, ownerToken, invoiceId);

    // PATCH with new invoice_no
    const patchPayload = { invoice_no: `INV-NEW-${Date.now()}` };
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
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
    expect(patched.data.invoice_no).toBe(patchPayload.invoice_no);
  });

  it('updates invoice_date and due_date via PATCH', async () => {
    const item = await createTestItem(companyId, {
      sku: `INV-DATE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Date Update Item',
      type: 'SERVICE'
    });

    const createPayload = {
      outlet_id: outletId,
      invoice_date: '2026-01-01',
      draft: true,
      lines: [
        {
          description: 'Service line',
          qty: 1,
          unit_price: 5000
        }
      ]
    };

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const invoiceId = created.data.id;
    await ensureInvoiceVisible(baseUrl, ownerToken, invoiceId);

    // PATCH with new dates
    const patchPayload = {
      invoice_date: '2026-02-20',
      due_date: '2026-03-20'
    };
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
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
    expect(patched.data.invoice_date).toBe('2026-02-20');
    expect(patched.data.due_date).toBe('2026-03-20');
  });

  it('updates due_term via PATCH', async () => {
    const item = await createTestItem(companyId, {
      sku: `INV-TERM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Term Update Item',
      type: 'SERVICE'
    });

    const createPayload = {
      outlet_id: outletId,
      invoice_date: '2026-01-10',
      draft: true,
      lines: [
        {
          description: 'Term line',
          qty: 1,
          unit_price: 2000
        }
      ]
    };

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const invoiceId = created.data.id;
    await ensureInvoiceVisible(baseUrl, ownerToken, invoiceId);

    // PATCH with due_term
    const patchPayload = { due_term: 'NET_30' };
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
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
    expect(patched.data.due_date).toBeDefined(); // NET_30 resolves to a due_date
  });

  it('updates tax_amount via PATCH', async () => {
    const item = await createTestItem(companyId, {
      sku: `INV-TAX-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Tax Update Item',
      type: 'PRODUCT'
    });

    const createPayload = {
      outlet_id: outletId,
      invoice_date: '2026-01-05',
      draft: true,
      tax_amount: 0,
      lines: [
        {
          item_id: item.id,
          description: 'Tax test line',
          qty: 2,
          unit_price: 10000
        }
      ]
    };

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const invoiceId = created.data.id;
    await ensureInvoiceVisible(baseUrl, ownerToken, invoiceId);

    // PATCH with new tax_amount
    const patchPayload = { tax_amount: 2000 };
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
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
    expect(Number(patched.data.tax_amount)).toBe(2000);
  });

  it('rejects PATCH with empty body', async () => {
    // First create an invoice
    const item = await createTestItem(companyId, {
      sku: `INV-EMPTY-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Empty Patch Item',
      type: 'SERVICE'
    });

    const createPayload = {
      outlet_id: outletId,
      invoice_date: '2026-01-20',
      draft: true,
      lines: [{ description: 'Empty patch test', qty: 1, unit_price: 1000 }]
    };

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const invoiceId = created.data.id;
    await ensureInvoiceVisible(baseUrl, ownerToken, invoiceId);

    // PATCH with empty object — should fail schema validation
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    expect(patchRes.status).toBe(400);
    const body = await patchRes.json();
    expect(body.success).toBe(false);
  });

  it('returns 403 when reassigning invoice to inaccessible outlet', async () => {
    // Create a second outlet that the scoped ADMIN user does NOT have access to
    const inaccessibleOutlet = await createTestOutlet(companyId, {
      code: `INV-INACC-${Date.now()}`.slice(0, 20),
      name: 'Inaccessible Outlet'
    });

    const item = await createTestItem(companyId, {
      sku: `INV-REASSIGN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Reassign Item',
      type: 'PRODUCT'
    });

    const createPayload = {
      outlet_id: outletId,
      invoice_date: '2026-01-25',
      draft: true,
      lines: [{ item_id: item.id, description: 'Reassign test', qty: 1, unit_price: 5000 }]
    };

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const invoiceId = created.data.id;
    await ensureInvoiceVisible(baseUrl, ownerToken, invoiceId);

    // Scoped ADMIN user only has access to outletId, not to inaccessibleOutlet
    // Attempting to reassign the invoice to the inaccessible outlet should return 403
    const patchPayload = { outlet_id: inaccessibleOutlet.id };
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${scopedAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(patchPayload)
    });

    expect(patchRes.status).toBe(403);
    const body = await patchRes.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

// =============================================================================
// Helper to create a customer via API
// =============================================================================
async function createTestCustomer(
  token: string,
  custCompanyId: number,
  code: string,
  displayName: string
): Promise<number> {
  const normalizedCode = code.slice(0, 32);

  const res = await fetch(`${baseUrl}/api/platform/customers`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      company_id: custCompanyId,
      code: normalizedCode,
      type: 'PERSON',
      display_name: displayName
    })
  });

  if (!res.ok) {
    throw new Error(`Failed to create customer: ${res.status} ${await res.text()}`);
  }

  const result = await res.json();
  return result.data.id;
}

// =============================================================================
// Tests for customer_id feature (Story 44.2)
// =============================================================================
describe('sales.invoices.update - customer_id', { timeout: 30000 }, () => {
  beforeAll(async () => {
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
  });

  // -------------------------------------------------------------------------
  // POST with customer_id creates invoice with customer link
  // -------------------------------------------------------------------------
  it('POST with customer_id creates invoice with customer link', async () => {
    // Create a test customer
    const customerCode = `CUST-POST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const customerId = await createTestCustomer(
      ownerToken,
      companyId,
      customerCode,
      'POST Customer Test'
    );

    // Create a test item
    const item = await createTestItem(companyId, {
      sku: `INV-CUST-POST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Customer POST Test Item',
      type: 'PRODUCT'
    });

    // Create invoice with customer_id
    const createPayload = {
      outlet_id: outletId,
      invoice_date: '2026-03-01',
      draft: true,
      customer_id: customerId,
      lines: [
        {
          item_id: item.id,
          description: 'Line with customer',
          qty: 1,
          unit_price: 50000
        }
      ]
    };

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.success).toBe(true);
    expect(created.data.customer_id).toBe(customerId);
  });

  // -------------------------------------------------------------------------
  // POST with customer_id requires platform.customers.READ permission
  // -------------------------------------------------------------------------
  it('POST with customer_id requires platform.customers.READ permission', async () => {
    // Create a customer (owner can do this)
    const customerCode = `CUST-POST-PERM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const customerId = await createTestCustomer(
      ownerToken,
      companyId,
      customerCode,
      'POST Permission Test Customer'
    );

    // Create a test item
    const item = await createTestItem(companyId, {
      sku: `INV-POST-PERM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'POST Permission Test Item',
      type: 'PRODUCT'
    });

    // CASHIER has no platform.customers.READ permission
    // Try to create invoice with customer_id using CASHIER token
    const createPayload = {
      outlet_id: outletId,
      invoice_date: '2026-03-09',
      draft: true,
      customer_id: customerId,
      lines: [
        {
          item_id: item.id,
          description: 'Line with customer',
          qty: 1,
          unit_price: 50000
        }
      ]
    };

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(403);
    const body = await createRes.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  // -------------------------------------------------------------------------
  // POST with invalid customer_id returns 404
  // -------------------------------------------------------------------------
  it('POST with invalid customer_id returns 404', async () => {
    const item = await createTestItem(companyId, {
      sku: `INV-INVALID-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Invalid Customer Test Item',
      type: 'PRODUCT'
    });

    // Use a non-existent customer ID (high number unlikely to exist)
    const nonExistentCustomerId = 99999999;

    const createPayload = {
      outlet_id: outletId,
      invoice_date: '2026-03-02',
      draft: true,
      customer_id: nonExistentCustomerId,
      lines: [
        {
          item_id: item.id,
          description: 'Line with invalid customer',
          qty: 1,
          unit_price: 10000
        }
      ]
    };

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(404);
    const body = await createRes.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // POST with customer_id from different company returns 404
  // -------------------------------------------------------------------------
  it('POST with customer_id from different company returns 404', async () => {
    // Create another company
    const otherCompany = await createTestCompanyMinimal({
      code: `OTHER-CO-${Date.now()}`.slice(0, 20).toUpperCase(),
      name: 'Other Company for Customer Test'
    });

    // Create a customer in the other company using direct DB insert
    // This is necessary because we don't have API access to create customers in another company
    const db = getTestDb();
    const otherCustomerCode = `CROSS-CO-CUST-${Date.now()}`;
    const insertResult = await db
      .insertInto('customers')
      .values({
        company_id: otherCompany.id,
        code: otherCustomerCode,
        type: 1, // PERSON
        display_name: 'Cross Company Customer',
        is_active: 1,
        created_by_user_id: null,
        updated_by_user_id: null
      })
      .executeTakeFirst();

    // Get the inserted customer ID - we need to query since insertResult doesn't give us the id easily
    const customerRow = await db
      .selectFrom('customers')
      .where('company_id', '=', otherCompany.id)
      .where('code', '=', otherCustomerCode)
      .select(['id'])
      .executeTakeFirst();

    expect(customerRow).toBeDefined();
    const otherCompanyCustomerId = customerRow!.id;

    // Create a test item
    const item = await createTestItem(companyId, {
      sku: `INV-CROSS-CO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Cross Company Test Item',
      type: 'PRODUCT'
    });

    // Try to create invoice with customer from other company
    const createPayload = {
      outlet_id: outletId,
      invoice_date: '2026-03-03',
      draft: true,
      customer_id: otherCompanyCustomerId,
      lines: [
        {
          item_id: item.id,
          description: 'Line with cross-company customer',
          qty: 1,
          unit_price: 15000
        }
      ]
    };

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    // Should return 404 because customer doesn't exist in this company
    expect(createRes.status).toBe(404);
    const body = await createRes.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // POST without customer_id creates invoice with null customer
  // -------------------------------------------------------------------------
  it('POST without customer_id creates invoice with null customer', async () => {
    const item = await createTestItem(companyId, {
      sku: `INV-NO-CUST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'No Customer Test Item',
      type: 'PRODUCT'
    });

    // Create invoice WITHOUT customer_id
    const createPayload = {
      outlet_id: outletId,
      invoice_date: '2026-03-04',
      draft: true,
      lines: [
        {
          item_id: item.id,
          description: 'Line without customer',
          qty: 1,
          unit_price: 7500
        }
      ]
    };

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.success).toBe(true);
    // customer_id should be null or undefined when not provided
    expect(created.data.customer_id == null).toBe(true);
  });

  // -------------------------------------------------------------------------
  // PATCH customer_id to valid customer updates invoice
  // -------------------------------------------------------------------------
  it('PATCH customer_id to valid customer updates invoice', async () => {
    // Create a customer
    const customerCode = `CUST-PATCH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const customerId = await createTestCustomer(
      ownerToken,
      companyId,
      customerCode,
      'PATCH Customer Test'
    );

    // Create an invoice without customer first
    const item = await createTestItem(companyId, {
      sku: `INV-PATCH-UPD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Patch Update Test Item',
      type: 'PRODUCT'
    });

    const createPayload = {
      outlet_id: outletId,
      invoice_date: '2026-03-05',
      draft: true,
      lines: [
        {
          item_id: item.id,
          description: 'Line to be updated',
          qty: 1,
          unit_price: 20000
        }
      ]
    };

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const invoiceId = created.data.id;
    await ensureInvoiceVisible(baseUrl, ownerToken, invoiceId);
    expect(created.data.customer_id == null).toBe(true);

    // PATCH with customer_id
    const patchPayload = { customer_id: customerId };
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
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
  // PATCH customer_id to null clears customer link
  // -------------------------------------------------------------------------
  it('PATCH customer_id to null clears customer link', async () => {
    // Create a customer
    const customerCode = `CUST-NULL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const customerId = await createTestCustomer(
      ownerToken,
      companyId,
      customerCode,
      'Null Customer Test'
    );

    // Create an invoice WITH customer
    const item = await createTestItem(companyId, {
      sku: `INV-NULL-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Null Customer Test Item',
      type: 'PRODUCT'
    });

    const createPayload = {
      outlet_id: outletId,
      invoice_date: '2026-03-06',
      draft: true,
      customer_id: customerId,
      lines: [
        {
          item_id: item.id,
          description: 'Line with customer to be cleared',
          qty: 1,
          unit_price: 30000
        }
      ]
    };

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const invoiceId = created.data.id;
    await ensureInvoiceVisible(baseUrl, ownerToken, invoiceId);
    expect(created.data.customer_id).toBe(customerId);

    // PATCH with customer_id: null to clear the link
    const patchPayload = { customer_id: null };
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
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
    // customer_id should be null after clearing
    expect(patched.data.customer_id == null).toBe(true);
  });

  // -------------------------------------------------------------------------
  // PATCH with invalid customer_id returns 404
  // -------------------------------------------------------------------------
  it('PATCH with invalid customer_id returns 404', async () => {
    // Create an invoice first
    const item = await createTestItem(companyId, {
      sku: `INV-PATCH-INVALID-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Patch Invalid Customer Item',
      type: 'PRODUCT'
    });

    const createPayload = {
      outlet_id: outletId,
      invoice_date: '2026-03-07',
      draft: true,
      lines: [
        {
          item_id: item.id,
          description: 'Line for invalid patch',
          qty: 1,
          unit_price: 10000
        }
      ]
    };

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const invoiceId = created.data.id;
    await ensureInvoiceVisible(baseUrl, ownerToken, invoiceId);

    // PATCH with non-existent customer_id
    const nonExistentCustomerId = 99999998;
    const patchPayload = { customer_id: nonExistentCustomerId };
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(patchPayload)
    });

    expect(patchRes.status).toBe(404);
    const body = await patchRes.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // PATCH with customer_id requires platform.customers.READ permission
  // -------------------------------------------------------------------------
  it('PATCH with customer_id requires platform.customers.READ permission', async () => {
    // Create a customer
    const customerCode = `CUST-PERM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const customerId = await createTestCustomer(
      ownerToken,
      companyId,
      customerCode,
      'Permission Test Customer'
    );

    // Create an invoice
    const item = await createTestItem(companyId, {
      sku: `INV-PERM-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Permission Test Item',
      type: 'PRODUCT'
    });

    const createPayload = {
      outlet_id: outletId,
      invoice_date: '2026-03-08',
      draft: true,
      lines: [
        {
          item_id: item.id,
          description: 'Line for permission test',
          qty: 1,
          unit_price: 5000
        }
      ]
    };

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const invoiceId = created.data.id;
    await ensureInvoiceVisible(baseUrl, ownerToken, invoiceId);

    // CASHIER has no platform.customers.READ permission
    // Try to PATCH with customer_id using CASHIER token
    const patchPayload = { customer_id: customerId };
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
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
});
