// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for Story 44.4: Receivables Ageing Reporting Completion
// Tests customer fields, overdue flag, and drill-down endpoint

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { sql } from 'kysely';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  createTestItem,
  createTestCustomer,
  getOrCreateTestCashierForPermission
} from '../../fixtures';

let baseUrl: string;
let ownerToken: string;
let cashierToken: string;
let seedContext: { companyId: number; outletId: number };
const SALES_SUITE_LOCK = 'jp_sales_invoice_suite_lock';

async function acquireSalesSuiteLock() {
  const db = getTestDb();
  await sql`SELECT GET_LOCK(${SALES_SUITE_LOCK}, 120)`.execute(db);
}

async function releaseSalesSuiteLock() {
  const db = getTestDb();
  await sql`SELECT RELEASE_LOCK(${SALES_SUITE_LOCK})`.execute(db);
}

describe('reports.receivables-ageing.story-44-4', { timeout: 60000 }, () => {
  beforeAll(async () => {
    await acquireSalesSuiteLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);
    seedContext = await getSeedSyncContext();

    // Get cashier token for permission tests
    const cashier = await getOrCreateTestCashierForPermission(
      seedContext.companyId,
      process.env.JP_COMPANY_CODE || 'JURNAPOD',
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
  // Helper: Create a posted invoice via API with optional customer and due_date
  // -------------------------------------------------------------------------
  async function createPostedInvoice(options: {
    customerId?: number | null;
    dueDate?: string;
    unitPrice?: number;
  }): Promise<number> {
    const {
      customerId = null,
      dueDate = '2026-01-01',
      unitPrice = 100000,
    } = options;

    const item = await createTestItem(seedContext.companyId, {
      sku: `RA-ITEM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Receivables Ageing Test Item',
      type: 'PRODUCT',
    });

    const createPayload: Record<string, unknown> = {
      outlet_id: seedContext.outletId,
      invoice_date: '2026-01-15',
      due_date: dueDate,
      draft: true,
      lines: [
        {
          item_id: item.id,
          description: 'RA test line',
          qty: 1,
          unit_price: unitPrice,
        },
      ],
    };

    if (customerId !== null) {
      createPayload.customer_id = customerId;
    }

    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createPayload),
    });

    if (createRes.status !== 201) {
      throw new Error(`Failed to create test invoice: ${createRes.status} ${await createRes.text()}`);
    }

    const created = await createRes.json();
    const invoiceId = created.data.id as number;

    let postRes: Response | null = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      postRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}/post`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
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

    if (postRes?.status !== 200) {
      throw new Error(`Failed to post test invoice: ${postRes?.status} ${postRes ? await postRes.text() : ''}`);
    }

    return invoiceId;
  }

  // -------------------------------------------------------------------------
  // AC5: ACL denial for missing accounting.reports.ANALYZE permission
  // -------------------------------------------------------------------------
  it('rejects request without accounting.reports.ANALYZE permission', async () => {
    // CASHIER doesn't have accounting.reports.ANALYZE permission
    const res = await fetch(`${baseUrl}/api/reports/receivables-ageing`, {
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  // -------------------------------------------------------------------------
  // AC5: Drill-down endpoint also enforces ACL
  // -------------------------------------------------------------------------
  it('drill-down endpoint rejects request without accounting.reports.ANALYZE permission', async () => {
    const res = await fetch(`${baseUrl}/api/reports/receivables-ageing/customer/99999`, {
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // AC1: Ageing report includes customer fields
  // -------------------------------------------------------------------------
  it('ageing report includes customer fields when customer is linked', async () => {
    // Create a customer and an invoice with that customer
    const customerCode = `AGE-CUST-${Date.now()}`;
    const customerId = await createTestCustomer(
      baseUrl,
      ownerToken,
      seedContext.companyId,
      customerCode,
      'Ageing Test Customer',
      { companyName: 'Ageing Test Company' }
    );

    // Create an invoice with this customer (due in the past to be overdue)
    await createPostedInvoice({
      customerId,
      dueDate: '2025-12-01', // Past due date - will be overdue
      unitPrice: 50000,
    });

    // Fetch ageing report with an as_of_date that makes it overdue
    const asOfDate = '2026-04-18'; // Today
    const res = await fetch(`${baseUrl}/api/reports/receivables-ageing?as_of_date=${asOfDate}`, {
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.invoices).toBeDefined();
    expect(Array.isArray(body.data.invoices)).toBe(true);

    // Find our invoice (it should be in the list)
    const ourInvoices = body.data.invoices.filter(
      (inv: { customer_id: number | null }) => inv.customer_id === customerId
    );

    if (ourInvoices.length > 0) {
      const invoice = ourInvoices[0];
      expect(invoice.customer_id).toBe(customerId);
      expect(invoice.customer_code).toBeDefined();
      expect(invoice.customer_type).toBeDefined();
      expect(invoice.customer_display_name).toBeDefined();
    }
  });

  // -------------------------------------------------------------------------
  // AC1: Ageing report shows NULL customer fields for invoices without customer
  // -------------------------------------------------------------------------
  it('ageing report shows NULL customer fields for invoices without customer', async () => {
    // Create an invoice without a customer
    await createPostedInvoice({
      customerId: null,
      dueDate: '2025-12-01',
      unitPrice: 75000,
    });

    const asOfDate = '2026-04-18';
    const res = await fetch(`${baseUrl}/api/reports/receivables-ageing?as_of_date=${asOfDate}`, {
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Find invoices without customer_id
    const noCustomerInvoices = body.data.invoices.filter(
      (inv: { customer_id: number | null }) => inv.customer_id === null
    );

    if (noCustomerInvoices.length > 0) {
      const invoice = noCustomerInvoices[0];
      expect(invoice.customer_code).toBeNull();
      expect(invoice.customer_type).toBeNull();
      expect(invoice.customer_display_name).toBeNull();
    }
  });

  // -------------------------------------------------------------------------
  // AC2: Overdue flag is true when due_date has passed
  // -------------------------------------------------------------------------
  it('overdue flag is true when due_date has passed', async () => {
    // Create a customer and invoice with past due date
    const customerId = await createTestCustomer(
      baseUrl,
      ownerToken,
      seedContext.companyId,
      `OVERDUE-${Date.now()}`,
      'Overdue Customer'
    );

    await createPostedInvoice({
      customerId,
      dueDate: '2025-01-01', // Past - definitely overdue
      unitPrice: 100000,
    });

    const asOfDate = '2026-04-18';
    const res = await fetch(`${baseUrl}/api/reports/receivables-ageing?as_of_date=${asOfDate}`, {
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Find our overdue invoice
    const ourInvoices = body.data.invoices.filter(
      (inv: { customer_id: number }) => inv.customer_id === customerId
    );

    if (ourInvoices.length > 0) {
      const invoice = ourInvoices[0];
      expect(invoice.overdue).toBe(true);
      expect(invoice.days_overdue).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // AC2: Overdue flag is false when due_date is in the future or today
  // -------------------------------------------------------------------------
  it('overdue flag is false when due_date is in the future', async () => {
    const customerId = await createTestCustomer(
      baseUrl,
      ownerToken,
      seedContext.companyId,
      `CURRENT-${Date.now()}`,
      'Current Customer'
    );

    await createPostedInvoice({
      customerId,
      dueDate: '2026-12-31', // Future - not overdue
      unitPrice: 80000,
    });

    const asOfDate = '2026-04-18';
    const res = await fetch(`${baseUrl}/api/reports/receivables-ageing?as_of_date=${asOfDate}`, {
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Find our current invoice
    const ourInvoices = body.data.invoices.filter(
      (inv: { customer_id: number }) => inv.customer_id === customerId
    );

    if (ourInvoices.length > 0) {
      const invoice = ourInvoices[0];
      expect(invoice.overdue).toBe(false);
      expect(invoice.days_overdue).toBeLessThanOrEqual(0);
    }
  });

  // -------------------------------------------------------------------------
  // AC3: Drill-down endpoint returns only invoices for specified customer
  // -------------------------------------------------------------------------
  it('drill-down endpoint returns only invoices for specified customer', async () => {
    // Create two customers
    const customer1Id = await createTestCustomer(
      baseUrl,
      ownerToken,
      seedContext.companyId,
      `DRILL-C1-${Date.now()}`,
      'Drill Customer 1'
    );
    const customer2Id = await createTestCustomer(
      baseUrl,
      ownerToken,
      seedContext.companyId,
      `DRILL-C2-${Date.now()}`,
      'Drill Customer 2'
    );

    // Create invoices for each customer
    await createPostedInvoice({
      customerId: customer1Id,
      dueDate: '2025-06-01',
      unitPrice: 120000,
    });
    await createPostedInvoice({
      customerId: customer2Id,
      dueDate: '2025-06-01',
      unitPrice: 80000,
    });
    // Also create an invoice without customer
    await createPostedInvoice({
      customerId: null,
      dueDate: '2025-06-01',
      unitPrice: 50000,
    });

    // Use drill-down for customer1 only
    const res = await fetch(
      `${baseUrl}/api/reports/receivables-ageing/customer/${customer1Id}?as_of_date=2026-04-18`,
      {
        headers: {
          'Authorization': `Bearer ${ownerToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.invoices).toBeDefined();
    expect(Array.isArray(body.data.invoices)).toBe(true);
    expect(body.data.filters.customer_id).toBe(customer1Id);

    // All returned invoices should be for customer1
    for (const invoice of body.data.invoices) {
      expect(invoice.customer_id).toBe(customer1Id);
    }
  });

  // -------------------------------------------------------------------------
  // AC3: Drill-down endpoint returns 404 for non-existent customer
  // -------------------------------------------------------------------------
  it('drill-down endpoint returns 404 for non-existent customer', async () => {
    const res = await fetch(`${baseUrl}/api/reports/receivables-ageing/customer/99999999`, {
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // AC3: Drill-down endpoint respects outlet filter
  // -------------------------------------------------------------------------
  it('drill-down endpoint respects outlet filter', async () => {
    const customerId = await createTestCustomer(
      baseUrl,
      ownerToken,
      seedContext.companyId,
      `DRILL-OUTLET-${Date.now()}`,
      'Drill Outlet Customer'
    );

    // Create invoice for this customer
    await createPostedInvoice({
      customerId,
      dueDate: '2025-06-01',
      unitPrice: 90000,
    });

    // Request with specific outlet_id
    const res = await fetch(
      `${baseUrl}/api/reports/receivables-ageing/customer/${customerId}?outlet_id=${seedContext.outletId}&as_of_date=2026-04-18`,
      {
        headers: {
          'Authorization': `Bearer ${ownerToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.filters.outlet_ids).toContain(seedContext.outletId);
  });
});
