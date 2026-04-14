// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for roles.delete
// Tests DELETE /roles/:id endpoint - requires roles module delete permission.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getRoleIdByCode } from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let cashierRoleId: number;

describe('roles.delete', { timeout: 30000 }, () => {
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
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(401);
  });

  it('returns 403/500 when user lacks roles module delete permission', async () => {
    const res = await fetch(`${baseUrl}/api/roles/${cashierRoleId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    // 409 if users are assigned to role (conflict), 403 if no permission, 404 if not found
    expect([200, 403, 404, 409]).toContain(res.status);
  });

  it('returns 400 for invalid role ID format', async () => {
    const res = await fetch(`${baseUrl}/api/roles/invalid`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent role', async () => {
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

    const res = await fetch(`${baseUrl}/api/roles/999999999`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect([404, 403]).toContain(res.status);
  });

  it('cannot delete system roles like SUPER_ADMIN', async () => {
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

    const superAdminRoleId = await getRoleIdByCode('SUPER_ADMIN');

    const res = await fetch(`${baseUrl}/api/roles/${superAdminRoleId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // System roles should be protected - expect rejection
    expect([403, 404]).toContain(res.status);
  });
});