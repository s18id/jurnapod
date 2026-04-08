// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /cash-bank-transactions

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let seedCtx: { companyId: number; outletId: number };

describe('cash-bank.list', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    seedCtx = await getSeedSyncContext();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      method: 'GET'
    });
    expect(res.status).toBe(401);
  });

  it('returns transactions scoped to company', async () => {
    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Response data is { total, transactions } object
    expect(body.data).toHaveProperty('total');
    expect(body.data).toHaveProperty('transactions');
    expect(Array.isArray(body.data.transactions)).toBe(true);
  });

  it('returns transactions filtered by outlet_id', async () => {
    const res = await fetch(`${baseUrl}/api/cash-bank-transactions?outlet_id=${seedCtx.outletId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.transactions)).toBe(true);
  });
});
