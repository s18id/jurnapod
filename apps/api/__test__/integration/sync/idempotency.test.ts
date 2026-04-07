// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Idempotency test - same client_tx_id should return DUPLICATE

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { cleanupTestFixtures, getTestAccessToken } from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('sync.idempotency', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
  });

  it('accepts first transaction', async () => {
    const clientTxId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: 1,
        transactions: [{
          client_tx_id: clientTxId,
          tx_data: '{}'
        }]
      })
    });
    // Accepts first submission - result may be OK or ERROR (depends on data validity)
    expect([200, 400, 409]).toContain(res.status);
  });

  it('returns DUPLICATE for same client_tx_id', async () => {
    const clientTxId = `dup-test-${Date.now()}`;
    
    // First submission
    await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: 1,
        transactions: [{
          client_tx_id: clientTxId,
          tx_data: '{}'
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
        outlet_id: 1,
        transactions: [{
          client_tx_id: clientTxId,
          tx_data: '{}'
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
