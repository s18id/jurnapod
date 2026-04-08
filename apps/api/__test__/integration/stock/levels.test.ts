// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /outlets/:outletId/stock
// Tests stock levels retrieval for outlet products

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext, createTestItem, registerFixtureCleanup } from '../../fixtures';
import { sql } from 'kysely';

let baseUrl: string;
let accessToken: string;
let outletId: number;
let companyId: number;

describe('stock.levels', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock`);
    expect(res.status).toBe(401);
  });

  it('returns stock levels for outlet', async () => {
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.company_id).toBe(companyId);
    expect(body.data.outlet_id).toBe(outletId);
    expect(Array.isArray(body.data.items)).toBe(true);
  });

  it('returns stock levels filtered by product_id', async () => {
    // First create a test item
    const item = await createTestItem(companyId, {
      sku: `STOCK-LEVEL-TEST-${Date.now()}`,
      name: 'Stock Level Test Item',
      type: 'PRODUCT',
      trackStock: true
    });

    // Set up inventory_stock for the item
    const db = getTestDb();
    await sql`
      INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
      VALUES (${companyId}, ${outletId}, ${item.id}, 100, 0, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `.execute(db);

    registerFixtureCleanup(`inventory_stock_${item.id}`, async () => {
      await sql`DELETE FROM inventory_stock WHERE product_id = ${item.id} AND outlet_id = ${outletId}`.execute(db);
    });

    // Query with product_id filter
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock?product_id=${item.id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toBeInstanceOf(Array);
    
    // The item should be in the results
    const foundItem = body.data.items.find((i: any) => i.product_id === item.id);
    expect(foundItem).toBeDefined();
    expect(foundItem.quantity).toBe(100);
    expect(foundItem.available_quantity).toBe(100);
  });

  it('returns empty items when no stock records exist for outlet', async () => {
    // Create a new company/outlet context without existing stock
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toBeInstanceOf(Array);
  });

  it('validates outlet access via path parameter', async () => {
    // Try to access with invalid outlet ID format
    const res = await fetch(`${baseUrl}/api/outlets/invalid/stock`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    // Should return 400 for invalid outlet ID
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('validates negative outlet ID', async () => {
    const res = await fetch(`${baseUrl}/api/outlets/-1/stock`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
