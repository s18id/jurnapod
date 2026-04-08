// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for users.list
// Tests GET /users endpoint - list users scoped to authenticated company.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext } from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let companyId: number;

describe('users.list', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    companyId = context.companyId;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/users`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks users module read permission', async () => {
    // The seeded token (JP_OWNER_EMAIL) has OWNER role but may not have users:read module permission
    // GET /users requires users module read permission
    const res = await fetch(`${baseUrl}/api/users`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Without users:read permission, expect 403
    expect(res.status).toBe(403);
  });

  it('returns 403 when using company_id query param (requires users:read)', async () => {
    const res = await fetch(`${baseUrl}/api/users?company_id=${companyId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Even with own company_id, requires users:read permission
    expect(res.status).toBe(403);
  });

  it('returns 403 when non-SUPER_ADMIN requests another company', async () => {
    const res = await fetch(`${baseUrl}/api/users?company_id=99999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Cross-company access should be forbidden for non-SUPER_ADMIN
    expect(res.status).toBe(403);
  });
});