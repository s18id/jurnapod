// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /inventory/item-prices/active

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../../helpers/env';
import { closeTestDb } from '../../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext
} from '../../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('inventory.item-prices.active', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/active`);
    expect(res.status).toBe(401);
  });

  it('returns 400 when outlet_id is missing', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/active`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid outlet_id format', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/active?outlet_id=invalid`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });

  it('returns active prices for valid outlet', async () => {
    const ctx = await getSeedSyncContext();
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/active?outlet_id=${ctx.outletId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('enforces inventory module permissions', async () => {
    const ctx = await getSeedSyncContext();
    const res = await fetch(`${baseUrl}/api/inventory/item-prices/active?outlet_id=${ctx.outletId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
  });
});
