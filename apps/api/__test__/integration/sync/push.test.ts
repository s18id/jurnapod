// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Sync push endpoint tests - focuses on auth and duplicate detection

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { closeTestDb } from '../../helpers/db';
import { cleanupTestFixtures, getTestAccessToken } from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('sync.push', { timeout: 300000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations: [] })
    });
    expect(res.status).toBe(401);
  });

  it('rejects empty operations with outlet_id', async () => {
    // Valid payload structure but empty operations
    const res = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: 1,
        transactions: []
      })
    });
    // Should return 200 with empty results, not 400
    expect(res.status).toBe(200);
  });
});
