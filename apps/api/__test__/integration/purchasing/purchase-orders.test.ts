// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for purchasing/purchase-orders CRUD
// Tests GET /api/purchasing/orders, POST, PATCH, PATCH /status

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { sql } from 'kysely';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  getOrCreateTestCashierForPermission,
  createTestSupplier,
} from '../../fixtures';

// Deterministic counter for test data
let baseUrl: string;
let ownerToken: string;
let cashierToken: string;
let cashierCompanyId: number;
let testSupplierId: number;
let poTagCounter = 0;
const PURCHASE_ORDERS_SUITE_LOCK = 'jp_purchase_orders_suite_lock';

async function acquirePurchaseOrdersSuiteLock() {
  const db = getTestDb();
  await sql`SELECT GET_LOCK(${PURCHASE_ORDERS_SUITE_LOCK}, 120)`.execute(db);
}

async function releasePurchaseOrdersSuiteLock() {
  const db = getTestDb();
  await sql`SELECT RELEASE_LOCK(${PURCHASE_ORDERS_SUITE_LOCK})`.execute(db);
}

describe('purchasing.orders', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    await acquirePurchaseOrdersSuiteLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    cashierCompanyId = context.companyId;

    const cashier = await getOrCreateTestCashierForPermission(
      cashierCompanyId,
      process.env.JP_COMPANY_CODE ?? 'JP',
      baseUrl
    );
    cashierToken = cashier.accessToken;

    const supplier = await createTestSupplier(cashierCompanyId, {
      code: `PO-SUP-${++poTagCounter}`,
      name: 'PO Test Supplier',
      currency: 'IDR',
    });
    testSupplierId = supplier.id;
  });

  afterAll(async () => {
    // Clean up purchase orders created by this test
    try {
      const db = getTestDb();
      // @fixture-teardown-allowed rationale="cleanup only"
      // Delete lines first (FK cascade should handle but be safe)
      await sql`DELETE FROM purchase_order_lines WHERE company_id = ${cashierCompanyId}`.execute(db);
      await sql`DELETE FROM purchase_orders WHERE company_id = ${cashierCompanyId}`.execute(db);
    } catch (e) {
      // ignore cleanup errors
    }
    resetFixtureRegistry();
    await releasePurchaseOrdersSuiteLock();
    await closeTestDb();
    await releaseReadLock();
  });

  // -------------------------------------------------------------------------
  // AC: 401 without authentication
  // -------------------------------------------------------------------------
  it('returns 401 when no auth token is provided', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/orders`);
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // AC: 403 for CASHIER (no purchasing.orders permission)
  // -------------------------------------------------------------------------
  it('returns 403 when CASHIER tries to list purchase orders', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 when CASHIER tries to create a purchase order', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-01',
        lines: [{ qty: '10', unit_price: '100.00', tax_rate: '0.10' }]
      })
    });
    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // AC: List purchase orders with filters (OWNER)
  // -------------------------------------------------------------------------
  it('lists purchase orders with default pagination', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('orders');
    expect(body.data).toHaveProperty('total');
    expect(body.data).toHaveProperty('limit');
    expect(body.data).toHaveProperty('offset');
    expect(Array.isArray(body.data.orders)).toBe(true);
  });

  it('lists purchase orders with custom pagination', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/orders?limit=5&offset=0`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.limit).toBe(5);
    expect(body.data.offset).toBe(0);
  });

  // -------------------------------------------------------------------------
  // AC: Create purchase order (OWNER)
  // -------------------------------------------------------------------------
  it('creates a purchase order with valid data', async () => {
    const supplierId = testSupplierId;
    const res = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: supplierId,
        order_date: '2026-04-15',
        currency_code: 'IDR',
        notes: 'Test PO',
        lines: [
          { qty: '10', unit_price: '10000.00', tax_rate: '0.10', description: 'Item 1' },
          { qty: '5', unit_price: '20000.00', tax_rate: '0.10', description: 'Item 2' }
        ]
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('DRAFT');
    expect(body.data.supplier_id).toBe(supplierId);
    expect(body.data.currency_code).toBe('IDR');
    expect(body.data.lines).toHaveLength(2);
    // total = (10 * 10000 * 1.1) + (5 * 20000 * 1.1) = 110000 + 110000 = 220000
    expect(body.data.total_amount).toBe('220000.0000');
  });

  it('creates a purchase order with minimum required fields', async () => {
    const supplierId = testSupplierId;
    const res = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: supplierId,
        order_date: '2026-04-16',
        lines: [
          { qty: '1', unit_price: '5000.00' }
        ]
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('DRAFT');
    expect(body.data.lines).toHaveLength(1);
  });

  it('returns 400 for purchase order without lines', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-17',
        lines: []
      })
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent supplier', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: 999999,
        order_date: '2026-04-18',
        lines: [{ qty: '1', unit_price: '1000.00' }]
      })
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent item_id during create', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-05-01',
        lines: [{ item_id: 99999999, qty: '1', unit_price: '1000.00' }]
      })
    });
    expect(res.status).toBe(404);
  });

  it('rolls back PO header when create fails due to invalid item_id', async () => {
    const db = getTestDb();
    const markerNotes = `rollback-check-${++poTagCounter}`;

    const beforeCount = await sql<{ c: string }>`
      SELECT COUNT(*) as c
      FROM purchase_orders
      WHERE company_id = ${cashierCompanyId}
        AND notes = ${markerNotes}
    `.execute(db);

    const before = Number(beforeCount.rows[0]?.c ?? 0);

    const res = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-05-02',
        notes: markerNotes,
        lines: [
          { qty: '1', unit_price: '1000.00' },
          { item_id: 99999999, qty: '1', unit_price: '2000.00' }
        ]
      })
    });
    expect(res.status).toBe(404);

    const afterCount = await sql<{ c: string }>`
      SELECT COUNT(*) as c
      FROM purchase_orders
      WHERE company_id = ${cashierCompanyId}
        AND notes = ${markerNotes}
    `.execute(db);

    const after = Number(afterCount.rows[0]?.c ?? 0);
    expect(after).toBe(before);
  });

  // -------------------------------------------------------------------------
  // AC: Get purchase order by ID (OWNER)
  // -------------------------------------------------------------------------
  it('gets purchase order by ID', async () => {
    // Create a PO first
    const createRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-19',
        lines: [{ qty: '2', unit_price: '3000.00' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const orderId = created.data.id;

    const res = await fetch(`${baseUrl}/api/purchasing/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(orderId);
    expect(body.data.status).toBe('DRAFT');
    expect(body.data.lines).toHaveLength(1);
  });

  it('returns 404 for non-existent purchase order ID', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/orders/999999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // AC: Update purchase order (DRAFT only)
  // -------------------------------------------------------------------------
  it('updates purchase order notes (DRAFT only)', async () => {
    // Create a DRAFT PO
    const createRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-20',
        lines: [{ qty: '3', unit_price: '1500.00' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const orderId = created.data.id;

    const res = await fetch(`${baseUrl}/api/purchasing/orders/${orderId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        notes: 'Updated notes'
      })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.notes).toBe('Updated notes');
  });

  it('returns 400 when PATCH has empty body', async () => {
    // Create a DRAFT PO
    const createRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-21',
        lines: [{ qty: '4', unit_price: '2000.00' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const orderId = created.data.id;

    const res = await fetch(`${baseUrl}/api/purchasing/orders/${orderId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  it('replaces lines via PATCH and recomputes total_amount', async () => {
    const createRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-21',
        lines: [
          { qty: '2', unit_price: '1000.00', tax_rate: '0.00' }
        ]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const orderId = created.data.id;
    expect(created.data.total_amount).toBe('2000.0000');

    const patchRes = await fetch(`${baseUrl}/api/purchasing/orders/${orderId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        lines: [
          { qty: '3', unit_price: '2000.00', tax_rate: '0.00' },
          { qty: '1', unit_price: '500.00', tax_rate: '0.10' }
        ]
      })
    });

    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.data.lines).toHaveLength(2);
    // 3*2000 + 1*500*1.1 = 6000 + 550 = 6550
    expect(patched.data.total_amount).toBe('6550.0000');
  });

  it('returns 400 when PATCH includes empty lines array', async () => {
    const createRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-21',
        lines: [{ qty: '1', unit_price: '1000.00' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const orderId = created.data.id;

    const res = await fetch(`${baseUrl}/api/purchasing/orders/${orderId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ lines: [] })
    });

    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent item_id during PATCH line replacement', async () => {
    const createRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-21',
        lines: [{ qty: '1', unit_price: '1000.00' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const orderId = created.data.id;

    const res = await fetch(`${baseUrl}/api/purchasing/orders/${orderId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        lines: [{ item_id: 99999999, qty: '1', unit_price: '1000.00' }]
      })
    });
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // AC: Status transitions
  // -------------------------------------------------------------------------
  it('transitions DRAFT -> SENT', async () => {
    // Create a DRAFT PO
    const createRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-22',
        lines: [{ qty: '5', unit_price: '5000.00' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const orderId = created.data.id;

    const res = await fetch(`${baseUrl}/api/purchasing/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'SENT' })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('SENT');
  });

  it('returns 400 for invalid status transition', async () => {
    // Create a DRAFT PO
    const createRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-23',
        lines: [{ qty: '6', unit_price: '6000.00' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const orderId = created.data.id;

    // Try invalid transition: DRAFT -> RECEIVED (must go through SENT first)
    const res = await fetch(`${baseUrl}/api/purchasing/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'RECEIVED' })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('Cannot transition');
  });

  it('transitions SENT -> PARTIAL_RECEIVED', async () => {
    // Create a PO and send it
    const createRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-24',
        lines: [{ qty: '10', unit_price: '1000.00' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const orderId = created.data.id;

    // Send the PO
    await fetch(`${baseUrl}/api/purchasing/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'SENT' })
    });

    // Transition to PARTIAL_RECEIVED
    const res = await fetch(`${baseUrl}/api/purchasing/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'PARTIAL_RECEIVED' })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('PARTIAL_RECEIVED');
  });

  it('returns 400 for SENT -> RECEIVED when lines not fully received', async () => {
    // Create a PO and send it
    const createRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-25',
        lines: [{ qty: '8', unit_price: '800.00' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const orderId = created.data.id;

    // Send the PO
    await fetch(`${baseUrl}/api/purchasing/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'SENT' })
    });

    // Transition directly to RECEIVED should fail (received_qty still 0)
    const res = await fetch(`${baseUrl}/api/purchasing/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'RECEIVED' })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('not all lines have been fully received');
  });

  it('returns 400 for PARTIAL_RECEIVED -> RECEIVED when lines not fully received', async () => {
    // Create a PO and send it
    const createRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-26',
        lines: [{ qty: '7', unit_price: '900.00' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const orderId = created.data.id;

    // Send and mark partial received
    await fetch(`${baseUrl}/api/purchasing/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'SENT' })
    });
    await fetch(`${baseUrl}/api/purchasing/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'PARTIAL_RECEIVED' })
    });

    // Move to RECEIVED should fail because received_qty is still incomplete
    const res = await fetch(`${baseUrl}/api/purchasing/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'RECEIVED' })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('not all lines have been fully received');
  });

  it('allows DRAFT -> CLOSED (cancel without receipt)', async () => {
    const createRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-27',
        lines: [{ qty: '3', unit_price: '1200.00' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const orderId = created.data.id;

    // Cancel directly from DRAFT
    const res = await fetch(`${baseUrl}/api/purchasing/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'CLOSED' })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('CLOSED');
  });

  // -------------------------------------------------------------------------
  // AC: Line item total computation
  // -------------------------------------------------------------------------
  it('computes line_total correctly: qty * unit_price * (1 + tax_rate)', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-28',
        lines: [
          { qty: '100', unit_price: '10.00', tax_rate: '0.10' } // 100 * 10 * 1.1 = 1100
        ]
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.lines[0].line_total).toBe('1100.0000');
    expect(body.data.total_amount).toBe('1100.0000');
  });

  it('computes multiple line totals correctly', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-29',
        lines: [
          { qty: '10', unit_price: '100.00', tax_rate: '0.00' },  // 1000
          { qty: '5', unit_price: '200.00', tax_rate: '0.10' }     // 5 * 200 * 1.1 = 1100
        ]
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.lines).toHaveLength(2);
    expect(body.data.total_amount).toBe('2100.0000');
  });

  // -------------------------------------------------------------------------
  // AC: Currency code handling
  // -------------------------------------------------------------------------
  it('uses default IDR currency when not specified', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-30',
        lines: [{ qty: '1', unit_price: '50000.00' }]
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.currency_code).toBe('IDR');
  });
});
