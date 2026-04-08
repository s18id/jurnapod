// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for users.tenant-scope
// Tests tenant isolation and cross-company access controls.

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

describe('users.tenant-scope', { timeout: 30000 }, () => {
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

  it('returns 403 for users list (requires users module read permission)', async () => {
    const res = await fetch(`${baseUrl}/api/users?company_id=${companyId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Without users:read permission, expect 403
    expect(res.status).toBe(403);
  });

  it('cross-company access returns 403 for non-SUPER_ADMIN', async () => {
    const res = await fetch(`${baseUrl}/api/users?company_id=99999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(403);
  });

  it('GET /users/:id returns 404 for user in different company', async () => {
    // Attempting to get a user that doesn't belong to current company
    const res = await fetch(`${baseUrl}/api/users/999999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Should be 404 (not found) since user 999999 doesn't belong to this company
    expect(res.status).toBe(404);
  });
});