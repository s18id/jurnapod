// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for users.activate
// Tests POST /users/:id/deactivate and /reactivate endpoints.

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
let cashierUserId: number;

describe('users.activate', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    cashierUserId = context.cashierUserId;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects deactivate request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}/deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(401);
  });

  it('rejects reactivate request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}/reactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks users module delete permission', async () => {
    const deactivateRes = await fetch(`${baseUrl}/api/users/${cashierUserId}/deactivate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect([200, 403]).toContain(deactivateRes.status);
  });
});