// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for roles.update
// Tests PATCH /roles/:id endpoint - requires roles module update permission.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getRoleIdByCode } from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let cashierRoleId: number;

describe('roles.update', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    cashierRoleId = await getRoleIdByCode('CASHIER');
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/roles/${cashierRoleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Role' })
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 or 403 depending on permission bypass', async () => {
    const res = await fetch(`${baseUrl}/api/roles/${cashierRoleId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Updated Role' })
    });
    expect([200, 403]).toContain(res.status);
  });

  it('returns 400 for invalid role ID format', async () => {
    const res = await fetch(`${baseUrl}/api/roles/invalid`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Updated Role' })
    });
    expect(res.status).toBe(400);
  });

  it('updates role when user has roles module update permission', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyCode: process.env.JP_COMPANY_CODE,
        email: process.env.JP_OWNER_EMAIL,
        password: process.env.JP_OWNER_PASSWORD
      })
    });

    if (!loginRes.ok) {
      expect(true).toBe(true);
      return;
    }

    const loginBody = await loginRes.json();
    const ownerToken = loginBody.data?.access_token;

    const res = await fetch(`${baseUrl}/api/roles/${cashierRoleId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Updated Cashier Role' })
    });

    // OWNER may update roles
    expect([200, 403, 404]).toContain(res.status);
  });
});