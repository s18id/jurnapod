// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for header discounts on sales invoices.
// Covers: discount_percent, discount_fixed, combined discounts,
//        overflow rejection (400), and PATCH recalculation.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { sql } from 'kysely';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext
} from '../../fixtures';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';

let baseUrl: string;
let ownerToken: string;
let outletId: number;
const SALES_SUITE_LOCK = 'jp_sales_invoice_suite_lock';

async function acquireSalesSuiteLock() {
  const db = getTestDb();
  await sql`SELECT GET_LOCK(${SALES_SUITE_LOCK}, 120)`.execute(db);
}

async function releaseSalesSuiteLock() {
  const db = getTestDb();
  await sql`SELECT RELEASE_LOCK(${SALES_SUITE_LOCK})`.execute(db);
}

describe('sales.invoices.discounts', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    await acquireSalesSuiteLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);

    const seedCtx = await getSeedSyncContext();
    outletId = seedCtx.outletId;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await releaseSalesSuiteLock();
    await closeTestDb();
    await releaseReadLock();
  });

  // -------------------------------------------------------------------------
  // Helper: create a draft invoice with given lines
  // -------------------------------------------------------------------------
  async function createDraftInvoice(lines: Array<{
    description: string;
    qty: number;
    unit_price: number;
    item_id?: number;
  }>, options?: {
    discount_percent?: number;
    discount_fixed?: number;
  }): Promise<{ id: number; subtotal: number; tax_amount: number; grand_total: number }> {
    const res = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: outletId,
        invoice_date: '2026-04-01',
        draft: true,
        lines,
        ...(options?.discount_percent !== undefined && { discount_percent: options.discount_percent }),
        ...(options?.discount_fixed !== undefined && { discount_fixed: options.discount_fixed })
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    const invoiceId = Number(body.data.id);

    // Ensure invoice is visible before caller issues PATCH in parallel-suite runs.
    for (let attempt = 1; attempt <= 5; attempt++) {
      const probe = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
        headers: {
          'Authorization': `Bearer ${ownerToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (probe.status === 200) {
        break;
      }

      if (probe.status === 404 && attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 100));
        continue;
      }

      break;
    }

    return {
      id: invoiceId,
      subtotal: Number(body.data.subtotal),
      tax_amount: Number(body.data.tax_amount),
      grand_total: Number(body.data.grand_total)
    };
  }

  // -------------------------------------------------------------------------
  // a) discount_percent only — verify subtotal/tax/grand_total behavior
  // -------------------------------------------------------------------------
  it('applies discount_percent correctly to invoice totals', async () => {
    // Lines: qty=2, price=10000 each → subtotal = 20000
    const invoice = await createDraftInvoice(
      [
        { description: 'Item A', qty: 2, unit_price: 10000 },
        { description: 'Item B', qty: 1, unit_price: 5000 }  // 2*10000 + 1*5000 = 25000
      ],
      { discount_percent: 10 }
    );

    // With 10% discount on 25000: discount = 2500, taxable = 22500
    // Assuming 10% tax rate: tax = 2250, grand_total = 24750
    expect(invoice.subtotal).toBe(25000);
    // grand_total = taxable + tax_amount
    expect(invoice.grand_total).toBe(22500 + invoice.tax_amount);
  });

  // -------------------------------------------------------------------------
  // b) discount_fixed only
  // -------------------------------------------------------------------------
  it('applies discount_fixed correctly to invoice totals', async () => {
    // Lines: qty=2, price=10000 → subtotal = 20000
    const invoice = await createDraftInvoice(
      [
        { description: 'Fixed Discount Item', qty: 2, unit_price: 10000 }
      ],
      { discount_fixed: 5000 }
    );

    expect(invoice.subtotal).toBe(20000);
    // grand_total = taxable + tax_amount
    expect(invoice.grand_total).toBe(15000 + invoice.tax_amount);
  });

  // -------------------------------------------------------------------------
  // c) both discount_percent and discount_fixed
  // -------------------------------------------------------------------------
  it('applies both discount_percent and discount_fixed', async () => {
    // Lines: qty=2, price=10000 → subtotal = 20000
    const invoice = await createDraftInvoice(
      [
        { description: 'Combo Discount Item', qty: 2, unit_price: 10000 }
      ],
      { discount_percent: 10, discount_fixed: 2000 }
    );

    expect(invoice.subtotal).toBe(20000);
    // 10% of 20000 = 2000, plus fixed 2000 = total discount 4000
    // grand_total = taxable + tax_amount = 16000 + tax_amount
    expect(invoice.grand_total).toBe(16000 + invoice.tax_amount);
  });

  // -------------------------------------------------------------------------
  // d) reject when total discount exceeds subtotal with 400 INVALID_REQUEST
  // -------------------------------------------------------------------------
  it('rejects invoice when total discount exceeds subtotal (400)', async () => {
    // Lines: qty=2, price=5000 → subtotal = 10000
    const res = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: outletId,
        invoice_date: '2026-04-02',
        draft: true,
        lines: [
          { description: 'Expensive Item', qty: 2, unit_price: 5000 }
        ],
        discount_fixed: 15000  // exceeds subtotal of 10000
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toBe('Total discount cannot exceed subtotal');
  });

  it('rejects invoice when percent+fixed discount exceeds subtotal (400)', async () => {
    // Lines: qty=1, price=10000 → subtotal = 10000
    // 80% discount = 8000, plus fixed 5000 = 13000 > 10000
    const res = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: outletId,
        invoice_date: '2026-04-03',
        draft: true,
        lines: [
          { description: 'Overflow Item', qty: 1, unit_price: 10000 }
        ],
        discount_percent: 80,
        discount_fixed: 5000
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toBe('Total discount cannot exceed subtotal');
  });

  // -------------------------------------------------------------------------
  // e) patch invoice to add/modify/remove discounts and verify totals recalc
  // -------------------------------------------------------------------------
  it('PATCH adds discount_percent to existing invoice', async () => {
    // Create invoice without discount
    const created = await createDraftInvoice([
      { description: 'Patch Add Item', qty: 2, unit_price: 10000 }
    ]);

    // PATCH with discount_percent
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${created.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ discount_percent: 20 })
    });

    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.success).toBe(true);
    expect(Number(patched.data.discount_percent)).toBe(20);
    expect(Number(patched.data.grand_total)).toBeLessThan(created.grand_total);
  });

  it('PATCH modifies existing discount', async () => {
    // Create invoice with 10% discount
    const created = await createDraftInvoice(
      [{ description: 'Modify Discount Item', qty: 1, unit_price: 20000 }],
      { discount_percent: 10 }
    );
    expect(Number(created.subtotal)).toBe(20000);

    // PATCH to increase discount to 30%
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${created.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ discount_percent: 30 })
    });

    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.success).toBe(true);
    expect(Number(patched.data.discount_percent)).toBe(30);
    expect(Number(patched.data.grand_total)).toBeLessThan(created.grand_total);
  });

  it('PATCH removes discount by setting to null', async () => {
    // Create invoice with discount
    const created = await createDraftInvoice(
      [{ description: 'Remove Discount Item', qty: 1, unit_price: 10000 }],
      { discount_fixed: 2000 }
    );
    expect(Number(created.subtotal)).toBe(10000);

    // PATCH to remove discount_fixed (set to null)
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${created.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ discount_fixed: null })
    });

    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.success).toBe(true);
    // discount_fixed should be null after removal
    expect(patched.data.discount_fixed == null).toBe(true);
    // grand_total should now equal subtotal (no discount applied)
    expect(Number(patched.data.grand_total)).toBe(Number(patched.data.subtotal));
  });

  it('PATCH replaces discount_fixed with discount_percent', async () => {
    // Create invoice with fixed discount
    const created = await createDraftInvoice(
      [{ description: 'Switch Discount Type', qty: 2, unit_price: 5000 }],
      { discount_fixed: 3000 }
    );

    // PATCH to replace fixed with percent
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${created.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ discount_fixed: null, discount_percent: 25 })
    });

    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.success).toBe(true);
    expect(Number(patched.data.discount_percent)).toBe(25);
    expect(patched.data.discount_fixed == null).toBe(true);
  });

  it('PATCH discount that exceeds subtotal returns 400', async () => {
    // Create invoice without discount
    const created = await createDraftInvoice([
      { description: 'Patch Overflow Item', qty: 1, unit_price: 5000 }
    ]);

    // PATCH with excessive discount
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${created.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ discount_fixed: 10000 })
    });

    expect(patchRes.status).toBe(400);
    const body = await patchRes.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toBe('Total discount cannot exceed subtotal');
  });

  // -------------------------------------------------------------------------
  // Zero discount edge cases
  // -------------------------------------------------------------------------
  it('accepts discount_percent of 0', async () => {
    const invoice = await createDraftInvoice(
      [{ description: 'Zero Pct Item', qty: 1, unit_price: 10000 }],
      { discount_percent: 0 }
    );
    expect(invoice.subtotal).toBe(10000);
  });

  it('accepts discount_fixed of 0', async () => {
    const invoice = await createDraftInvoice(
      [{ description: 'Zero Fixed Item', qty: 1, unit_price: 10000 }],
      { discount_fixed: 0 }
    );
    expect(invoice.subtotal).toBe(10000);
  });

  it('accepts both discounts as 0', async () => {
    const invoice = await createDraftInvoice(
      [{ description: 'Zero Both Item', qty: 1, unit_price: 10000 }],
      { discount_percent: 0, discount_fixed: 0 }
    );
    expect(invoice.subtotal).toBe(10000);
  });
});

// =============================================================================
// OpenAPI handler tests (same scenarios via OpenAPI route)
// =============================================================================
describe('sales.invoices.discounts - OpenAPI handler', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);

    const seedCtx = await getSeedSyncContext();
    outletId = seedCtx.outletId;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  it('OpenAPI: rejects discount exceeding subtotal with 400', async () => {
    const res = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: outletId,
        invoice_date: '2026-04-10',
        draft: true,
        lines: [{ description: 'OpenAPI Overflow', qty: 1, unit_price: 5000 }],
        discount_fixed: 10000
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('OpenAPI: PATCH discount exceeding subtotal returns 400', async () => {
    // Create invoice first
    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: outletId,
        invoice_date: '2026-04-11',
        draft: true,
        lines: [{ description: 'OpenAPI Patch Overflow', qty: 1, unit_price: 5000 }]
      })
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const invoiceId = created.data.id;

    // Ensure invoice is visible before PATCH under parallel suite execution.
    for (let attempt = 1; attempt <= 5; attempt++) {
      const probe = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
        headers: {
          'Authorization': `Bearer ${ownerToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (probe.status === 200) break;
      if (probe.status === 404 && attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 100));
        continue;
      }
      break;
    }

    // PATCH with excessive discount
    const patchRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ discount_fixed: 10000 })
    });

    expect(patchRes.status).toBe(400);
    const body = await patchRes.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });
});
