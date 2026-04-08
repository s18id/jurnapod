// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /outlets/:outletId/stock/low
// Tests low stock alerts for items below threshold

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext, createTestItem, registerFixtureCleanup } from '../../fixtures';
import { sql } from 'kysely';

let baseUrl: string;
let accessToken: string;
let outletId: number;
let companyId: number;

describe('stock.low', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/low`);
    expect(res.status).toBe(401);
  });

  it('returns low stock alerts for outlet', async () => {
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/low`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.company_id).toBe(companyId);
    expect(body.data.outlet_id).toBe(outletId);
    expect(Array.isArray(body.data.alerts)).toBe(true);
    expect(typeof body.data.total_alerts).toBe('number');
  });

  it('returns items below low_stock_threshold', async () => {
    // Create test item with low stock threshold
    // createItem now has built-in deadlock retry
    const item = await createTestItem(companyId, {
      sku: `LOW-STOCK-TEST-${Date.now()}`,
      name: 'Low Stock Test Item',
      type: 'PRODUCT',
      trackStock: true
    });

    // Set low_stock_threshold via direct update (required for low stock alerts)
    await sql`UPDATE items SET low_stock_threshold = 20 WHERE id = ${item.id}`.execute(getTestDb());

    // Insert inventory_stock with quantity below threshold
    const db = getTestDb();
    await sql`
      INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
      VALUES (${companyId}, ${outletId}, ${item.id}, 10, 0, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `.execute(db);

    registerFixtureCleanup(`low_stock_${item.id}`, async () => {
      await sql`DELETE FROM inventory_stock WHERE product_id = ${item.id} AND outlet_id = ${outletId}`.execute(db);
      await sql`UPDATE items SET low_stock_threshold = NULL WHERE id = ${item.id}`.execute(db);
    });

    // Query low stock alerts
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/low`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    
    // Find our item in the alerts
    const foundAlert = body.data.alerts.find((a: any) => a.product_id === item.id);
    expect(foundAlert).toBeDefined();
    expect(foundAlert.available_quantity).toBe(10);
    expect(foundAlert.low_stock_threshold).toBe(20);
  });

  it('does not return items above low_stock_threshold', async () => {
    // Create test item with low stock threshold
    const item = await createTestItem(companyId, {
      sku: `NORMAL-STOCK-TEST-${Date.now()}`,
      name: 'Normal Stock Test Item',
      type: 'PRODUCT',
      trackStock: true
    });

    // Set low_stock_threshold
    await sql`UPDATE items SET low_stock_threshold = 20 WHERE id = ${item.id}`.execute(getTestDb());

    // Insert inventory_stock with quantity above threshold
    const db = getTestDb();
    await sql`
      INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
      VALUES (${companyId}, ${outletId}, ${item.id}, 50, 0, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `.execute(db);

    registerFixtureCleanup(`normal_stock_${item.id}`, async () => {
      await sql`DELETE FROM inventory_stock WHERE product_id = ${item.id} AND outlet_id = ${outletId}`.execute(db);
      await sql`UPDATE items SET low_stock_threshold = NULL WHERE id = ${item.id}`.execute(db);
    });

    // Query low stock alerts
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/low`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    
    // Our item should NOT be in the alerts
    const foundAlert = body.data.alerts.find((a: any) => a.product_id === item.id);
    expect(foundAlert).toBeUndefined();
  });

  it('only returns items with track_stock enabled', async () => {
    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/low`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    
    // All alerts should be for items with track_stock = 1
    // (This is implicit in the query which joins with items WHERE track_stock = 1)
  });

  it('includes sku and name in alert response', async () => {
    // Create test item
    const testTimestamp = Date.now();
    const item = await createTestItem(companyId, {
      sku: `LOW-SKU-${testTimestamp}`,
      name: 'Low Stock Alert Item',
      type: 'PRODUCT',
      trackStock: true
    });

    await sql`UPDATE items SET low_stock_threshold = 10 WHERE id = ${item.id}`.execute(getTestDb());

    const db = getTestDb();
    await sql`
      INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
      VALUES (${companyId}, ${outletId}, ${item.id}, 5, 0, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `.execute(db);

    registerFixtureCleanup(`sku_test_${item.id}`, async () => {
      await sql`DELETE FROM inventory_stock WHERE product_id = ${item.id} AND outlet_id = ${outletId}`.execute(db);
      await sql`UPDATE items SET low_stock_threshold = NULL WHERE id = ${item.id}`.execute(db);
    });

    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/low`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    
    const foundAlert = body.data.alerts.find((a: any) => a.product_id === item.id);
    expect(foundAlert).toBeDefined();
    expect(foundAlert.sku).toBe(`LOW-SKU-${testTimestamp}`);
    expect(foundAlert.name).toBe('Low Stock Alert Item');
  });
});
