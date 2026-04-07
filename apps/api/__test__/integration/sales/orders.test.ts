// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Sales orders endpoint tests

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { closeTestDb } from '../../helpers/db';
import { cleanupTestFixtures, getTestAccessToken } from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('sales.orders', { timeout: 300000 }, () => {
  beforeAll(async () => {
    baseUrl = await acquireReadLock();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  it('requires auth', async () => {
    const res = await fetch(`${baseUrl}/api/sales/orders`);
    expect(res.status).toBe(401);
  });

  it('returns orders list with auth', async () => {
    const res = await fetch(`${baseUrl}/api/sales/orders`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });
});
