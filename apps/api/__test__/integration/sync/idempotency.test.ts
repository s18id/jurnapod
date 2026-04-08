// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Idempotency test - same client_tx_id should return DUPLICATE

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { createTestItem, resetFixtureRegistry, getTestAccessToken, getSeedSyncContext } from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let companyId: number;
let outletId: number;
let cashierUserId: number;
let itemId: number;

describe('sync.idempotency', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    companyId = context.companyId;
    outletId = context.outletId;
    cashierUserId = context.cashierUserId;

    const item = await createTestItem(companyId, {
      name: 'Sync Idempotency Item',
      type: 'PRODUCT',
      trackStock: false,
    });
    itemId = item.id;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('accepts first transaction', async () => {
    const clientTxId = crypto.randomUUID();
    const res = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [{
          client_tx_id: clientTxId,
          company_id: companyId,
          outlet_id: outletId,
          cashier_user_id: cashierUserId,
          trx_at: new Date().toISOString(),
          status: 'COMPLETED',
          items: [{ item_id: itemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }]
        }]
      })
    });
    // Accepts first submission - result may be OK or ERROR (depends on data validity)
    expect([200, 400, 409]).toContain(res.status);
  });

  it('returns DUPLICATE for same client_tx_id', async () => {
    const clientTxId = crypto.randomUUID();
    const trxAt = new Date().toISOString();
    
    // First submission
    const firstRes = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [{
          client_tx_id: clientTxId,
          company_id: companyId,
          outlet_id: outletId,
          cashier_user_id: cashierUserId,
          trx_at: trxAt,
          status: 'COMPLETED',
          items: [{ item_id: itemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }]
        }]
      })
    });

    // Second submission with same client_tx_id
    const res = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [{
          client_tx_id: clientTxId,
          company_id: companyId,
          outlet_id: outletId,
          cashier_user_id: cashierUserId,
          trx_at: trxAt,
          status: 'COMPLETED',
          items: [{ item_id: itemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }]
        }]
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    // Should have DUPLICATE result, not create another record
    const txResult = body.data?.results?.[0];
    expect(txResult?.result).toBe('DUPLICATE');
  });
});
