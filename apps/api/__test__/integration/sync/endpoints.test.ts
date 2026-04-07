// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// /**
//  * Integration tests for sync endpoints
//  * 
//  * Tests sync operations via HTTP.
//  * Uses the shared test server via RWLock pattern.
//  */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { closeTestDb } from '../../helpers/db';
import { cleanupTestFixtures, getTestAccessToken } from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('sync.endpoints', { timeout: 300000 }, () => {
  beforeAll(async () => {
    baseUrl = await acquireReadLock();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  it('healthcheck returns ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.ok).toBe(true);
  });

  it('sync health endpoint requires auth', async () => {
    const res = await fetch(`${baseUrl}/api/sync/health`);
    // Should be 401 without auth
    expect(res.status).toBe(401);
  });

  it('sync push endpoint requires auth', async () => {
    const res = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations: [] })
    });
    
    // Should be 401 without auth
    expect(res.status).toBe(401);
  });

  it('sync pull endpoint requires auth', async () => {
    const res = await fetch(`${baseUrl}/api/sync/pull?since_version=0`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Should be 401 without auth
    expect(res.status).toBe(401);
  });

  it('sync pull endpoint requires outlet_id', async () => {
    const res = await fetch(`${baseUrl}/api/sync/pull?since_version=0`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    // outlet_id is required, so should be 400 without it
    expect(res.status).toBe(400);
  });
});
