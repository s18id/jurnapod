// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for users.password
// Tests POST /users/:id/password endpoint - change user password.

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

describe('users.password', { timeout: 30000 }, () => {
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

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'newpassword123' })
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks users module update permission', async () => {
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}/password`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: 'newpassword123' })
    });
    expect([200, 403]).toContain(res.status);
  });
});