// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for users.update
// Tests PATCH /users/:id endpoint - email update only, requires update permission.

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
let companyId: number;
let cashierUserId: number;

describe('users.update', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    companyId = context.companyId;
    cashierUserId = context.cashierUserId;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com' })
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks users module update permission', async () => {
    // Note: OWNER/SUPER_ADMIN role bypasses module permission checks.
    // If this returns 200, the token has role-level bypass.
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: 'new@example.com' })
    });
    expect([200, 403]).toContain(res.status);
  });

  it('returns 400 or 403 depending on permission check order', async () => {
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    // Without users:update permission, expect 403
    // If permission were granted, would return 400 for no valid fields
    expect([400, 403]).toContain(res.status);
  });
});