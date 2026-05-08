// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for POST /outlets/:outletId/stock/adjustments
// Tests manual stock adjustments with reason validation

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  createTestItem,
  createTestPrice,
  createTestStock,
  createTestInventoryGLAccount,
  createTestVarianceAccount,
  setTestCompanyStringSetting,
  setTestItemInventoryAssetAccount,
} from '../../fixtures';
import { makeTag } from '../../helpers/tags';
import { sql } from 'kysely';

let baseUrl: string;
let accessToken: string;
let outletId: number;
let companyId: number;
let cashierUserId: number;
let authTestProductId: number;

describe('stock.adjustments', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const syncContext = await getSeedSyncContext();
    outletId = syncContext.outletId;
    companyId = syncContext.companyId;
    cashierUserId = syncContext.cashierUserId;

    // Create a valid product ID for auth/validation tests
    const authTestItem = await createTestItem(companyId, {
      sku: makeTag('ADJ'),
      name: 'Auth Validation Product',
      type: 'PRODUCT',
      trackStock: true,
    });
    authTestProductId = authTestItem.id;
  });

  afterAll(async () => {
    try {
      resetFixtureRegistry();
    } finally {
      try {
        await closeTestDb();
      } finally {
        await releaseReadLock();
      }
    }
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
      sku: makeTag('ADJ'),
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
      sku: makeTag('ADJ'),
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
    expect(body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('creates negative adjustment when sufficient stock exists', async () => {
    // Create test item
    const item = await createTestItem(companyId, {
      sku: makeTag('ADJ'),
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

  it('AC4: posts balanced STOCK_ADJUSTMENT journal to variance account', async () => {
    const db = getTestDb();
    const item = await createTestItem(companyId, {
      sku: makeTag('ADJ'),
      name: 'Variance Posting Test',
      type: 'PRODUCT',
      trackStock: true
    });
    await createTestPrice(companyId, item.id, cashierUserId, { price: 10000, isActive: true });
    await createTestStock(companyId, item.id, outletId, 20, cashierUserId);

    const inventoryAssetAccount = await createTestInventoryGLAccount(companyId, {
      code: `INV-${makeTag('AC4')}`,
      name: 'Inventory Asset AC4',
    });
    const varianceAccount = await createTestVarianceAccount(companyId, {
      code: `VAR-${makeTag('AC4')}`,
      name: 'Inventory Variance AC4',
    });

    await setTestItemInventoryAssetAccount(companyId, item.id, inventoryAssetAccount.id);
    await setTestCompanyStringSetting(companyId, 'inventory.standard_variance_account_id', String(varianceAccount.id));

    const res = await fetch(`${baseUrl}/api/outlets/${outletId}/stock/adjustments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_id: item.id,
        adjustment_quantity: 5,
        reason: 'AC4 variance posting check'
      })
    });
    expect(res.status).toBe(200);

    const txRows = await sql<{ id: number }>`
      SELECT id
      FROM inventory_transactions
      WHERE company_id = ${companyId}
        AND product_id = ${item.id}
        AND transaction_type = 5
      ORDER BY id DESC
      LIMIT 1
    `.execute(db);
    expect(txRows.rows.length).toBe(1);
    const txId = Number(txRows.rows[0].id);

    const batchRows = await sql<{ id: number }>`
      SELECT id
      FROM journal_batches
      WHERE company_id = ${companyId}
        AND doc_type = 'STOCK_ADJUSTMENT'
        AND doc_id = ${txId}
      ORDER BY id DESC
      LIMIT 1
    `.execute(db);
    expect(batchRows.rows.length).toBe(1);
    const batchId = Number(batchRows.rows[0].id);

    const lines = await sql<{ account_id: number; debit: string; credit: string }>`
      SELECT account_id, debit, credit
      FROM journal_lines
      WHERE company_id = ${companyId} AND journal_batch_id = ${batchId}
      ORDER BY id ASC
    `.execute(db);
    expect(lines.rows.length).toBe(2);

    const expectedVarianceAccountId = String(varianceAccount.id);
    const expectedInventoryAccountId = String(inventoryAssetAccount.id);
    const accountIds = lines.rows.map((l) => String(l.account_id));
    expect(accountIds).toContain(expectedVarianceAccountId);
    expect(accountIds).toContain(expectedInventoryAccountId);
    const varianceLine = lines.rows.find((l) => String(l.account_id) === expectedVarianceAccountId);
    const inventoryLine = lines.rows.find((l) => String(l.account_id) === expectedInventoryAccountId);
    expect(varianceLine).toBeDefined();
    expect(inventoryLine).toBeDefined();

    const totalDebit = lines.rows.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = lines.rows.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(totalCredit);
    expect(Math.abs(Number(varianceLine!.credit) - Number(inventoryLine!.debit))).toBeLessThan(0.0001);
  });

  it('validates required reason field', async () => {
    // Create test item
    const item = await createTestItem(companyId, {
      sku: makeTag('ADJ'),
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
      sku: makeTag('ADJ'),
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

  it('rejects zero adjustment quantity', async () => {
    const item = await createTestItem(companyId, {
      sku: makeTag('ADJ'),
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

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('creates adjustment transaction record', async () => {
    // Create test item
    const item = await createTestItem(companyId, {
      sku: makeTag('ADJ'),
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
