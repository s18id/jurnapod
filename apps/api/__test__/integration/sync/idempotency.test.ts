// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Idempotency test - same client_tx_id should return DUPLICATE

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { createTestItem, cleanupTestFixtures, getTestAccessToken, getSeedSyncContext } from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let companyId: number;
let outletId: number;
let cashierUserId: number;
let itemId: number;
let firstClientTxId: string;
let dupClientTxId: string;

function deterministicUuidFromSeed(seed: number): string {
  const suffix = Math.abs(seed).toString(16).padStart(12, '0').slice(-12);
  return `550e8400-e29b-41d4-a716-${suffix}`;
}

describe('sync.idempotency', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
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

    // Deterministic-per-run IDs derived from fixture-created item id.
    // This prevents collisions with persistent DB rows from previous runs
    // while keeping deterministic (no random/time-based generation).
    firstClientTxId = deterministicUuidFromSeed(itemId * 10 + 1);
    dupClientTxId = deterministicUuidFromSeed(itemId * 10 + 2);
  });

  afterAll(async () => {
    try {
      // Teardown-only cleanup for deterministic client_tx_id records created by this suite.
      const db = getTestDb();
      await db
        .deleteFrom('pos_transactions')
        .where('company_id', '=', companyId)
        .where('client_tx_id', 'in', [firstClientTxId, dupClientTxId])
        .execute();

      await cleanupTestFixtures();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  });

  // Deterministic constant for trx_at (client_tx_id values are computed in beforeAll)
  const FIXTURE_TRX_AT = '2024-01-15T10:30:00+07:00';

  it('accepts first transaction', async () => {
    const res = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [{
          client_tx_id: firstClientTxId,
          company_id: companyId,
          outlet_id: outletId,
          cashier_user_id: cashierUserId,
          trx_at: FIXTURE_TRX_AT,
          status: 'COMPLETED',
          items: [{ item_id: itemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }]
        }]
      })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const txResult = body.data?.results?.[0];
    expect(txResult?.result).toBe('OK');
  });

  it('returns DUPLICATE for same client_tx_id', async () => {
    // Use same fixed client_tx_id and trx_at for duplicate detection
    const clientTxId = dupClientTxId;
    const trxAt = FIXTURE_TRX_AT;
    
    // First submission must succeed before duplicate replay assertion.
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

    expect(firstRes.status).toBe(200);
    const firstBody = await firstRes.json();
    const firstTxResult = firstBody.data?.results?.[0];
    expect(firstTxResult?.result).toBe('OK');

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

    // Persistence invariant: only one row exists for this client_tx_id.
    const db = getTestDb();
    const duplicateRows = await db
      .selectFrom('pos_transactions')
      .select(['id'])
      .where('company_id', '=', companyId)
      .where('client_tx_id', '=', clientTxId)
      .execute();
    expect(duplicateRows).toHaveLength(1);
  });
});
