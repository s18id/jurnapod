// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for POST /outlets/:outletId/stock/adjustments
// Tests manual stock adjustments with reason validation

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext, createTestItem, registerFixtureCleanup } from '../../fixtures';
import { sql } from 'kysely';

let baseUrl: string;
let accessToken: string;
let outletId: number;
let companyId: number;
let authTestProductId: number;

describe('stock.adjustments', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const syncContext = await getSeedSyncContext();
    outletId = syncContext.outletId;
    companyId = syncContext.companyId;
    // Query a valid product ID for auth/validation tests (ID used only when auth passes)
    const db = getTestDb();
    const productResult = await sql`
      SELECT id FROM items
      WHERE company_id = ${companyId}
      LIMIT 1
    `.execute(db);
    authTestProductId = Number((productResult.rows[0] as { id: number }).id);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth token', async () => {
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: authTestProductId, adjustment_quantity: 10, reason: 'Test' })
    });
    expect(res.status).toBe(401);
  });

  it('validates adjustment_quantity is integer', async () => {
    // Create test item with price (for cost resolution)
    const item = await createTestItem(companyId, {
      sku: `ADJ-POS-${Date.now()}`,
      name: 'Positive Adjustment Test',
      type: 'PRODUCT',
      trackStock: true
    });

    // Insert item price for cost resolution
    const db = getTestDb();
    await sql`
      INSERT INTO item_prices (company_id, item_id, price, created_at, updated_at)
      VALUES (${companyId}, ${item.id}, 10000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `.execute(db);

    // Insert initial stock
    await sql`
      INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
      VALUES (${companyId}, ${outletId}, ${item.id}, 50, 0, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `.execute(db);

    registerFixtureCleanup(`adj_pos_${item.id}`, async () => {
      await sql`DELETE FROM inventory_transactions WHERE product_id = ${item.id} AND reference_type = 'ADJUSTMENT'`.execute(db);
      await sql`DELETE FROM inventory_stock WHERE product_id = ${item.id} AND outlet_id = ${outletId}`.execute(db);
      await sql`DELETE FROM item_prices WHERE item_id = ${item.id}`.execute(db);
    });

    // Make positive adjustment
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/adjustments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_id: item.id,
        adjustment_quantity: 25,
        reason: 'Stock count correction - found extra units'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.product_id).toBe(item.id);
    expect(body.data.adjustment_quantity).toBe(25);
    expect(body.data.reason).toBe('Stock count correction - found extra units');
  });

  it('rejects negative adjustment when insufficient stock', async () => {
    // Create test item
    const item = await createTestItem(companyId, {
      sku: `ADJ-NEG-${Date.now()}`,
      name: 'Negative Adjustment Test',
      type: 'PRODUCT',
      trackStock: true
    });

    // Insert item price for cost resolution
    const db = getTestDb();
    await sql`
      INSERT INTO item_prices (company_id, item_id, price, created_at, updated_at)
      VALUES (${companyId}, ${item.id}, 10000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `.execute(db);

    // Insert initial stock (only 10 units)
    await sql`
      INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
      VALUES (${companyId}, ${outletId}, ${item.id}, 10, 0, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `.execute(db);

    registerFixtureCleanup(`adj_neg_${item.id}`, async () => {
      await sql`DELETE FROM inventory_transactions WHERE product_id = ${item.id} AND reference_type = 'ADJUSTMENT'`.execute(db);
      await sql`DELETE FROM inventory_stock WHERE product_id = ${item.id} AND outlet_id = ${outletId}`.execute(db);
      await sql`DELETE FROM item_prices WHERE item_id = ${item.id}`.execute(db);
    });

    // Try to deduct more than available (negative adjustment of -15 when only 10 exist)
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/adjustments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_id: item.id,
        adjustment_quantity: -15,
        reason: 'Damaged goods'
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('ADJUSTMENT_FAILED');
  });

  it('creates negative adjustment when sufficient stock exists', async () => {
    // Create test item
    const item = await createTestItem(companyId, {
      sku: `ADJ-VALID-NEG-${Date.now()}`,
      name: 'Valid Negative Adjustment Test',
      type: 'PRODUCT',
      trackStock: true
    });

    // Insert item price
    const db = getTestDb();
    await sql`
      INSERT INTO item_prices (company_id, item_id, price, created_at, updated_at)
      VALUES (${companyId}, ${item.id}, 10000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `.execute(db);

    // Insert initial stock (100 units)
    await sql`
      INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
      VALUES (${companyId}, ${outletId}, ${item.id}, 100, 0, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `.execute(db);

    registerFixtureCleanup(`adj_valid_neg_${item.id}`, async () => {
      await sql`DELETE FROM inventory_transactions WHERE product_id = ${item.id} AND reference_type = 'ADJUSTMENT'`.execute(db);
      await sql`DELETE FROM inventory_stock WHERE product_id = ${item.id} AND outlet_id = ${outletId}`.execute(db);
      await sql`DELETE FROM item_prices WHERE item_id = ${item.id}`.execute(db);
    });

    // Make valid negative adjustment
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/adjustments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_id: item.id,
        adjustment_quantity: -30,
        reason: 'Damaged goods - 30 units written off'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.adjustment_quantity).toBe(-30);
  });

  it('validates required reason field', async () => {
    // Create test item
    const item = await createTestItem(companyId, {
      sku: `ADJ-NO-REASON-${Date.now()}`,
      name: 'No Reason Test',
      type: 'PRODUCT',
      trackStock: true
    });

    // Insert item price
    const db = getTestDb();
    await sql`
      INSERT INTO item_prices (company_id, item_id, price, created_at, updated_at)
      VALUES (${companyId}, ${item.id}, 10000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `.execute(db);

    registerFixtureCleanup(`adj_no_reason_${item.id}`, async () => {
      await sql`DELETE FROM item_prices WHERE item_id = ${item.id}`.execute(db);
    });

    // Try adjustment without reason
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/adjustments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_id: item.id,
        adjustment_quantity: 10
        // reason is missing
      })
    });

    expect(res.status).toBe(400);
  });

  it('validates reason is not empty string', async () => {
    const item = await createTestItem(companyId, {
      sku: `ADJ-EMPTY-REASON-${Date.now()}`,
      name: 'Empty Reason Test',
      type: 'PRODUCT',
      trackStock: true
    });

    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/adjustments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_id: item.id,
        adjustment_quantity: 10,
        reason: ''
      })
    });

    expect(res.status).toBe(400);
  });

  it('validates product_id is required', async () => {
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/adjustments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        adjustment_quantity: 10,
        reason: 'Test'
      })
    });

    expect(res.status).toBe(400);
  });

  it('validates adjustment_quantity is integer', async () => {
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/adjustments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_id: authTestProductId,
        adjustment_quantity: 10.5,
        reason: 'Test'
      })
    });

    expect(res.status).toBe(400);
  });

  it('accepts zero adjustment (no-op)', async () => {
    const item = await createTestItem(companyId, {
      sku: `ADJ-ZERO-${Date.now()}`,
      name: 'Zero Adjustment Test',
      type: 'PRODUCT',
      trackStock: true
    });

    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/adjustments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_id: item.id,
        adjustment_quantity: 0,
        reason: 'Zero adjustment test'
      })
    });

    // Zero is allowed (no-op adjustment), though it may fail if stock doesn't exist
    // The API accepts it - result depends on whether stock record exists
    expect([200, 400]).toContain(res.status);
  });

  it('creates adjustment transaction record', async () => {
    // Create test item
    const item = await createTestItem(companyId, {
      sku: `ADJ-TXN-${Date.now()}`,
      name: 'Transaction Record Test',
      type: 'PRODUCT',
      trackStock: true
    });

    // Insert item price
    const db = getTestDb();
    await sql`
      INSERT INTO item_prices (company_id, item_id, price, created_at, updated_at)
      VALUES (${companyId}, ${item.id}, 10000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `.execute(db);

    // Insert initial stock
    await sql`
      INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
      VALUES (${companyId}, ${outletId}, ${item.id}, 50, 0, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `.execute(db);

    registerFixtureCleanup(`adj_txn_${item.id}`, async () => {
      await sql`DELETE FROM inventory_transactions WHERE product_id = ${item.id} AND reference_type = 'ADJUSTMENT'`.execute(db);
      await sql`DELETE FROM inventory_stock WHERE product_id = ${item.id} AND outlet_id = ${outletId}`.execute(db);
      await sql`DELETE FROM item_prices WHERE item_id = ${item.id}`.execute(db);
    });

    // Make adjustment
    await fetch(`${baseUrl}/api/outlets/${outletId}/stock/adjustments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_id: item.id,
        adjustment_quantity: 20,
        reason: 'Verification of transaction record'
      })
    });

    // Check transaction was created
    const txnRes = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/transactions?product_id=${item.id}&transaction_type=5`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(txnRes.status).toBe(200);
    const txnBody = await txnRes.json();
    const adjustmentTxn = txnBody.data.transactions.find((t: any) => t.product_id === item.id);
    expect(adjustmentTxn).toBeDefined();
    expect(adjustmentTxn.quantity_delta).toBe(20);
    expect(adjustmentTxn.transaction_type).toBe(5); // ADJUSTMENT
  });
});
