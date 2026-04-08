// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /outlets/:outletId/stock/transactions
// Tests stock transaction history with pagination and type filtering

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext, createTestItem, registerFixtureCleanup } from '../../fixtures';
import { sql } from 'kysely';

let baseUrl: string;
let accessToken: string;
let outletId: number;
let companyId: number;

describe('stock.transactions', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const syncContext = await getSeedSyncContext();
    outletId = syncContext.outletId;
    companyId = syncContext.companyId;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth token', async () => {
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/transactions`);
    expect(res.status).toBe(401);
  });

  it('returns stock transactions with pagination', async () => {
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/transactions`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.company_id).toBe(companyId);
    expect(body.data.outlet_id).toBe(outletId);
    expect(Array.isArray(body.data.transactions)).toBe(true);
    expect(body.data.pagination).toBeDefined();
    expect(typeof body.data.pagination.total).toBe('number');
    expect(typeof body.data.pagination.limit).toBe('number');
    expect(typeof body.data.pagination.offset).toBe('number');
    expect(typeof body.data.pagination.has_more).toBe('boolean');
  });

  it('supports pagination with limit and offset', async () => {
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/transactions?limit=10&offset=0`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.pagination.limit).toBe(10);
    expect(body.data.pagination.offset).toBe(0);
  });

  it('supports filtering by product_id', async () => {
    // Create a test item with stock transaction
    const item = await createTestItem(companyId, {
      sku: `STOCK-TXN-TEST-${Date.now()}`,
      name: 'Stock Transaction Test Item',
      type: 'PRODUCT',
      trackStock: true
    });

    // Insert inventory_stock record
    const db = getTestDb();
    await sql`
      INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
      VALUES (${companyId}, ${outletId}, ${item.id}, 100, 0, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `.execute(db);

    // Create a transaction record
    await sql`
      INSERT INTO inventory_transactions (company_id, outlet_id, transaction_type, reference_type, reference_id, product_id, quantity_delta, created_at)
      VALUES (${companyId}, ${outletId}, 5, 'ADJUSTMENT', 'TEST-REF-001', ${item.id}, 50, CURRENT_TIMESTAMP)
    `.execute(db);

    registerFixtureCleanup(`stock_txn_${item.id}`, async () => {
      await sql`DELETE FROM inventory_transactions WHERE product_id = ${item.id} AND reference_id = 'TEST-REF-001'`.execute(db);
      await sql`DELETE FROM inventory_stock WHERE product_id = ${item.id} AND outlet_id = ${outletId}`.execute(db);
    });

    // Query with product_id filter
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/transactions?product_id=${item.id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.transactions).toBeInstanceOf(Array);
    
    // The transaction for our item should be in the results
    const foundTxn = body.data.transactions.find((t: any) => t.product_id === item.id);
    expect(foundTxn).toBeDefined();
    expect(foundTxn.quantity_delta).toBe(50);
    expect(foundTxn.transaction_type).toBe(5); // ADJUSTMENT
  });

  it('supports filtering by transaction_type', async () => {
    // transaction_type 5 = ADJUSTMENT
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/transactions?transaction_type=5`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    
    // All transactions should be type 5 (ADJUSTMENT)
    for (const txn of body.data.transactions) {
      expect(txn.transaction_type).toBe(5);
    }
  });

  it('validates limit max value', async () => {
    // limit max is 500
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/transactions?limit=1000`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    // Should return 400 for validation error
    expect(res.status).toBe(400);
  });

  it('validates negative offset', async () => {
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/transactions?offset=-1`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(400);
  });

  it('returns correct has_more based on pagination', async () => {
    // First get total count
    const countRes = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/transactions?limit=1&offset=0`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(countRes.status).toBe(200);
    const countBody = await countRes.json();
    const total = countBody.data.pagination.total;

    if (total > 1) {
      expect(countBody.data.pagination.has_more).toBe(true);
    }
  });
});
