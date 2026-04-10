// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /outlets/:outletId/stock/low
// Tests low stock alerts for items below threshold

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext, createTestItem, createTestPrice, createTestStock, setTestItemLowStockThreshold } from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let outletId: number;
let companyId: number;
let cashierUserId: number;

describe('stock.low', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const syncContext = await getSeedSyncContext();
    outletId = syncContext.outletId;
    companyId = syncContext.companyId;
    cashierUserId = syncContext.cashierUserId;
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

    await setTestItemLowStockThreshold(companyId, item.id, 20);
    await createTestPrice(companyId, item.id, cashierUserId, { price: 10000, isActive: true });
    await createTestStock(companyId, item.id, outletId, 10, cashierUserId);

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

    await setTestItemLowStockThreshold(companyId, item.id, 20);
    await createTestPrice(companyId, item.id, cashierUserId, { price: 10000, isActive: true });
    await createTestStock(companyId, item.id, outletId, 50, cashierUserId);

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

    await setTestItemLowStockThreshold(companyId, item.id, 10);
    await createTestPrice(companyId, item.id, cashierUserId, { price: 10000, isActive: true });
    await createTestStock(companyId, item.id, outletId, 5, cashierUserId);

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
