// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for purchasing/goods-receipts CRUD
// Tests GET /api/purchasing/receipts, GET /:id, POST

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
  createTestItem,
  createTestSupplier,
} from '../../fixtures';

// Deterministic code generator for constrained fields (max 20 chars)
function makeTag(prefix: string, counter: number): string {
  const worker = process.env.VITEST_POOL_ID ?? '0';
  return `${prefix}${worker}${String(counter).padStart(4, '0')}`.slice(0, 20);
}

let baseUrl: string;
let ownerToken: string;
let cashierToken: string;
let cashierCompanyId: number;
let testSupplierId: number;
let testItemId: number;
let grTagCounter = 0;
const GOODS_RECEIPTS_SUITE_LOCK = 'jp_goods_receipts_suite_lock';

async function acquireGoodsReceiptsSuiteLock() {
  const db = getTestDb();
  await sql`SELECT GET_LOCK(${GOODS_RECEIPTS_SUITE_LOCK}, 120)`.execute(db);
}

async function releaseGoodsReceiptsSuiteLock() {
  const db = getTestDb();
  await sql`SELECT RELEASE_LOCK(${GOODS_RECEIPTS_SUITE_LOCK})`.execute(db);
}

describe('purchasing.receipts', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    await acquireGoodsReceiptsSuiteLock();
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
      code: makeTag('SUPBASE', ++grTagCounter),
      name: 'GR Test Supplier Base',
      currency: 'IDR',
    });
    testSupplierId = supplier.id;

    const testItem = await createTestItem(cashierCompanyId);
    testItemId = testItem.id;
  });

  afterAll(async () => {
    // Clean up goods receipts and PO lines created by this test
    try {
      const db = getTestDb();
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM goods_receipt_lines WHERE company_id = ${cashierCompanyId}`.execute(db);
      await sql`DELETE FROM goods_receipts WHERE company_id = ${cashierCompanyId}`.execute(db);
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM purchase_order_lines WHERE company_id = ${cashierCompanyId}`.execute(db);
      await sql`DELETE FROM purchase_orders WHERE company_id = ${cashierCompanyId}`.execute(db);
    } catch (e) {
      // ignore cleanup errors
    }
    resetFixtureRegistry();
    await releaseGoodsReceiptsSuiteLock();
    await closeTestDb();
    await releaseReadLock();
  });

  // -------------------------------------------------------------------------
  // Helper: create a PO in SENT status with lines for GR testing
  // -------------------------------------------------------------------------
  async function createSentPO(supplierId: number, lines: Array<{ item_id?: number; qty: string; unit_price: string; tax_rate?: string }>) {
    // Create PO
    const poRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        order_date: '2026-04-01',
        lines
      })
    });
    expect(poRes.status).toBe(201);
    const po = await poRes.json();
    expect(po.data.status).toBe('DRAFT');
    const poId = po.data.id;

    // Transition to SENT
    const statusRes = await fetch(`${baseUrl}/api/purchasing/orders/${poId}/status`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SENT' })
    });
    expect(statusRes.status).toBe(200);
    const updatedPo = await statusRes.json();
    expect(updatedPo.data.status).toBe('SENT');

    // Return poId, original line IDs, and order_id (same as poId)
    return {
      poId,
      lineIds: po.data.lines.map((l: any) => l.id),
      orderId: poId
    };
  }

  // -------------------------------------------------------------------------
  // AC: 401 without authentication
  // -------------------------------------------------------------------------
  it('returns 401 when no auth token is provided', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/receipts`);
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // AC: 403 for CASHIER (no purchasing.receipts permission)
  // -------------------------------------------------------------------------
  it('returns 403 when CASHIER tries to list goods receipts', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${cashierToken}`, 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 when CASHIER tries to create a goods receipt', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cashierToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        reference_number: 'GR-TEST',
        receipt_date: '2026-04-19',
        lines: [{ qty: '1', unit: 'pcs' }]
      })
    });
    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // AC: List goods receipts with filters (OWNER)
  // -------------------------------------------------------------------------
  it('lists goods receipts with default pagination', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('receipts');
    expect(body.data).toHaveProperty('total');
    expect(body.data).toHaveProperty('limit');
    expect(body.data).toHaveProperty('offset');
    expect(Array.isArray(body.data.receipts)).toBe(true);
  });

  it('lists goods receipts with custom pagination', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/receipts?limit=5&offset=0`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.limit).toBe(5);
    expect(body.data.offset).toBe(0);
  });

  it('filters goods receipts by supplier_id', async () => {
    // Create GR first
    const supplierId = testSupplierId;
    const po = await createSentPO(supplierId, [{ qty: '10', unit_price: '1000.00' }]);

    await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        reference_number: makeTag('GRSF', ++grTagCounter),
        receipt_date: '2026-04-19',
        lines: [{ po_line_id: po.lineIds[0], qty: '5' }]
      })
    });

    const res = await fetch(`${baseUrl}/api/purchasing/receipts?supplier_id=${supplierId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.receipts.every((r: any) => r.supplier_id === supplierId)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // AC: Get goods receipt by ID (OWNER)
  // -------------------------------------------------------------------------
  it('gets a goods receipt by ID', async () => {
    const supplierId = testSupplierId;
    const po = await createSentPO(supplierId, [{ qty: '10', unit_price: '1000.00' }]);

    const createRes = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        reference_number: makeTag('GRGT', ++grTagCounter),
        receipt_date: '2026-04-19',
        lines: [{ po_line_id: po.lineIds[0], qty: '3', unit: 'pcs' }]
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.data.status).toBe('RECEIVED');

    const getRes = await fetch(`${baseUrl}/api/purchasing/receipts/${created.data.id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.data.id).toBe(created.data.id);
    expect(body.data.reference_number).toBe(created.data.reference_number);
    expect(body.data.status).toBe('RECEIVED');
    expect(Array.isArray(body.data.lines)).toBe(true);
    expect(body.data.lines[0].qty).toBe('3.0000');
  });

  it('returns 404 for non-existent goods receipt', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/receipts/999999`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // AC1: Create GR - creates GR with status RECEIVED and updates PO received_qty
  // -------------------------------------------------------------------------
  it('creates a GR against a PO line and updates received_qty', async () => {
    const supplierId = testSupplierId;
    const po = await createSentPO(supplierId, [
      { qty: '10', unit_price: '5000.00', tax_rate: '0' },
      { qty: '5', unit_price: '3000.00', tax_rate: '0' }
    ]);

    const res = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        reference_number: makeTag('GRCR', ++grTagCounter),
        receipt_date: '2026-04-19',
        lines: [
          { po_line_id: po.lineIds[0], qty: '6', unit: 'pcs' },
          { po_line_id: po.lineIds[1], qty: '2', unit: 'pcs' }
        ]
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('RECEIVED');
    expect(body.data.lines).toHaveLength(2);
    expect(body.data.lines[0].over_receipt_allowed).toBe(false);
    expect(body.data.lines[1].over_receipt_allowed).toBe(false);

    // Verify PO received_qty was updated
    const poCheck = await fetch(`${baseUrl}/api/purchasing/orders/${po.orderId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    const poBody = await poCheck.json();
    const line0 = poBody.data.lines.find((l: any) => l.id === po.lineIds[0]);
    const line1 = poBody.data.lines.find((l: any) => l.id === po.lineIds[1]);
    expect(line0.received_qty).toBe('6.0000');
    expect(line1.received_qty).toBe('2.0000');
  });

  // -------------------------------------------------------------------------
  // AC2: GR with item_id only (no PO line reference)
  // -------------------------------------------------------------------------
  it('creates a GR with item_id only (no PO line reference)', async () => {
    const supplierId = testSupplierId;

    // Create GR without PO line reference
    const res = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        reference_number: makeTag('GRIT', ++grTagCounter),
        receipt_date: '2026-04-19',
        lines: [{ item_id: testItemId, qty: '5', unit: 'box', description: 'Misc items' }]
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('RECEIVED');
    expect(body.data.lines[0].item_id).toBe(testItemId);
    expect(body.data.lines[0].po_line_id).toBeNull();
    expect(body.data.po_reference).toBeNull();
  });

  // -------------------------------------------------------------------------
  // AC3: PO status auto-update from GR
  // -------------------------------------------------------------------------
  it('auto-transitions PO to PARTIAL_RECEIVED when some lines partially received', async () => {
    const supplierId = testSupplierId;
    const po = await createSentPO(supplierId, [
      { qty: '10', unit_price: '1000.00' }
    ]);

    // Partial receipt - not all qty received
    const res = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        reference_number: makeTag('GRPT', ++grTagCounter),
        receipt_date: '2026-04-19',
        lines: [{ po_line_id: po.lineIds[0], qty: '5' }]
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.status).toBe('RECEIVED'); // GR itself is always RECEIVED

    // Check PO status auto-transitioned to PARTIAL_RECEIVED
    const poCheck = await fetch(`${baseUrl}/api/purchasing/orders/${po.orderId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    const poBody = await poCheck.json();
    expect(poBody.data.status).toBe('PARTIAL_RECEIVED');
  });

  it('auto-transitions PO to RECEIVED when all lines fully received', async () => {
    const supplierId = testSupplierId;
    const po = await createSentPO(supplierId, [
      { qty: '10', unit_price: '1000.00' }
    ]);

    // Full receipt
    const res = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        reference_number: makeTag('GRFL', ++grTagCounter),
        receipt_date: '2026-04-19',
        lines: [{ po_line_id: po.lineIds[0], qty: '10' }]
      })
    });

    expect(res.status).toBe(201);

    const poCheck = await fetch(`${baseUrl}/api/purchasing/orders/${po.orderId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    const poBody = await poCheck.json();
    expect(poBody.data.status).toBe('RECEIVED');
    expect(poBody.data.lines[0].received_qty).toBe('10.0000');
  });

  // -------------------------------------------------------------------------
  // Over-receipt: warning issued but not blocked
  // -------------------------------------------------------------------------
  it('issues warning for over-receipt but allows it', async () => {
    const supplierId = testSupplierId;
    const po = await createSentPO(supplierId, [
      { qty: '5', unit_price: '1000.00' }
    ]);

    const res = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        reference_number: makeTag('GROV', ++grTagCounter),
        receipt_date: '2026-04-19',
        lines: [{ po_line_id: po.lineIds[0], qty: '8' }] // 8 > 5 (over-receipt)
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.warnings).toBeDefined();
    expect(body.data.warnings.length).toBeGreaterThan(0);
    expect(body.data.warnings[0]).toContain('exceeds remaining PO qty');
    expect(body.data.lines[0].over_receipt_allowed).toBe(true);

    // Verify PO received_qty was updated (8 > 5 remaining)
    const poCheck = await fetch(`${baseUrl}/api/purchasing/orders/${po.orderId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    const poBody = await poCheck.json();
    expect(poBody.data.lines[0].received_qty).toBe('8.0000');
  });

  it('sets PO to PARTIAL_RECEIVED when one line full and another zero', async () => {
    const supplierId = testSupplierId;
    const po = await createSentPO(supplierId, [
      { qty: '10', unit_price: '1000.00' },
      { qty: '4', unit_price: '1000.00' }
    ]);

    const res = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        reference_number: makeTag('GRMP', ++grTagCounter),
        receipt_date: '2026-04-19',
        lines: [{ po_line_id: po.lineIds[0], qty: '10' }]
      })
    });

    expect(res.status).toBe(201);

    const poCheck = await fetch(`${baseUrl}/api/purchasing/orders/${po.orderId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    const poBody = await poCheck.json();
    expect(poBody.data.status).toBe('PARTIAL_RECEIVED');
  });

  it('updates PO received_qty correctly when first GR line has no po_line_id', async () => {
    const supplierId = testSupplierId;
    const po = await createSentPO(supplierId, [
      { qty: '10', unit_price: '1000.00' }
    ]);

    const res = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        reference_number: makeTag('GRML', ++grTagCounter),
        receipt_date: '2026-04-19',
        lines: [
          { item_id: testItemId, qty: '1', description: 'Non-PO line' },
          { po_line_id: po.lineIds[0], qty: '3' }
        ]
      })
    });

    expect(res.status).toBe(201);

    const poCheck = await fetch(`${baseUrl}/api/purchasing/orders/${po.orderId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    const poBody = await poCheck.json();
    expect(poBody.data.lines[0].received_qty).toBe('3.0000');
  });

  it('returns 404 when supplier does not belong to tenant', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: 99999999,
        reference_number: makeTag('GRNF', ++grTagCounter),
        receipt_date: '2026-04-19',
        lines: [{ item_id: testItemId, qty: '1' }]
      })
    });

    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------
  it('returns 400 when PO is not in SENT or PARTIAL_RECEIVED status', async () => {
    // Create PO but leave it in DRAFT
    const supplierId = testSupplierId;
    const poRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        order_date: '2026-04-01',
        lines: [{ qty: '10', unit_price: '1000.00' }]
      })
    });
    expect(poRes.status).toBe(201);
    const po = await poRes.json();
    expect(po.data.status).toBe('DRAFT');

    // Try to create GR against DRAFT PO
    const grRes = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        reference_number: makeTag('GRDR', ++grTagCounter),
        receipt_date: '2026-04-19',
        lines: [{ po_line_id: po.data.lines[0].id, qty: '5' }]
      })
    });
    expect(grRes.status).toBe(400);
    const errBody = await grRes.json();
    expect(errBody.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 when GR supplier does not match PO supplier', async () => {
    // Create PO with the primary test supplier
    const po1Res = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-01',
        lines: [{ qty: '10', unit_price: '1000.00' }]
      })
    });
    const po1 = await po1Res.json();
    expect(po1.data.status).toBe('DRAFT');

    // Transition to SENT
    await fetch(`${baseUrl}/api/purchasing/orders/${po1.data.id}/status`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SENT' })
    });

    // Try to create GR with a different supplier id
    const supplier2 = await createTestSupplier(cashierCompanyId, {
      code: makeTag('SUP', ++grTagCounter),
      name: 'Test Supplier 2',
      currency: 'IDR',
    });
    const supplier2Id = supplier2.id;

    const grRes = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplier2Id,
        reference_number: makeTag('GRSM', ++grTagCounter),
        receipt_date: '2026-04-19',
        lines: [{ po_line_id: po1.data.lines[0].id, qty: '5' }]
      })
    });
    expect(grRes.status).toBe(400);
    const errBody = await grRes.json();
    expect(errBody.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 404 for non-existent PO line', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        reference_number: makeTag('GRPF', ++grTagCounter),
        receipt_date: '2026-04-19',
        lines: [{ po_line_id: 99999999, qty: '5' }]
      })
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when GR line item_id does not match PO line item_id', async () => {
    const supplierId = testSupplierId;

    // Create PO with specific item
    const item = await createTestItem(cashierCompanyId);
    const poRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        order_date: '2026-04-01',
        lines: [{ item_id: item.id, qty: '10', unit_price: '1000.00' }]
      })
    });
    const po = await poRes.json();

    // Transition to SENT
    await fetch(`${baseUrl}/api/purchasing/orders/${po.data.id}/status`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SENT' })
    });

    // Create another item with different id
    const item2 = await createTestItem(cashierCompanyId);

    // Try GR with wrong item_id
    const grRes = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        reference_number: makeTag('GRIM', ++grTagCounter),
        receipt_date: '2026-04-19',
        lines: [{ po_line_id: po.data.lines[0].id, item_id: item2.id, qty: '5' }]
      })
    });
    expect(grRes.status).toBe(400);
    const errBody = await grRes.json();
    expect(errBody.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 when no lines provided', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        reference_number: 'GR-NO-LINES',
        receipt_date: '2026-04-19',
        lines: []
      })
    });
    expect(res.status).toBe(400);
  });
});
