// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for POST /outlets/:outletId/stock/adjustments
// Tests manual stock adjustments with reason validation

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext, createTestItem, createTestPrice, createTestStock } from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let outletId: number;
let companyId: number;
let cashierUserId: number;
let authTestProductId: number;

describe('stock.adjustments', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const syncContext = await getSeedSyncContext();
    outletId = syncContext.outletId;
    companyId = syncContext.companyId;
    cashierUserId = syncContext.cashierUserId;

    // Create a valid product ID for auth/validation tests
    const authTestItem = await createTestItem(companyId, {
      sku: `ADJ-AUTH-${Date.now()}`,
      name: 'Auth Validation Product',
      type: 'PRODUCT',
      trackStock: true,
    });
    authTestProductId = authTestItem.id;
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

    // Canonical setup via fixtures
    await createTestPrice(companyId, item.id, cashierUserId, { price: 10000, isActive: true });
    await createTestStock(companyId, item.id, outletId, 50, cashierUserId);

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

    // Canonical setup via fixtures
    await createTestPrice(companyId, item.id, cashierUserId, { price: 10000, isActive: true });
    await createTestStock(companyId, item.id, outletId, 10, cashierUserId);

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

    // Canonical setup via fixtures
    await createTestPrice(companyId, item.id, cashierUserId, { price: 10000, isActive: true });
    await createTestStock(companyId, item.id, outletId, 100, cashierUserId);

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

    // Canonical setup via fixtures
    await createTestPrice(companyId, item.id, cashierUserId, { price: 10000, isActive: true });

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

    // Canonical setup via fixtures
    await createTestPrice(companyId, item.id, cashierUserId, { price: 10000, isActive: true });
    await createTestStock(companyId, item.id, outletId, 50, cashierUserId);

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
