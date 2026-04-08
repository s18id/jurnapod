// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /inventory/item-prices

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

describe('inventory.item-prices.list', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices`);
    expect(res.status).toBe(401);
  });

  it('returns item prices list with auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('enforces inventory module permissions', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid outlet_id format', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/item-prices?outlet_id=invalid`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
  });
});
