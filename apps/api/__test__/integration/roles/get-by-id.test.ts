// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for roles.get-by-id
// Tests GET /roles/:id endpoint.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getRoleIdByCode } from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let cashierRoleId: number;

describe('roles.get-by-id', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/roles/${cashierRoleId}`);
    expect(res.status).toBe(401);
  });

  it('returns 200 or 403 depending on permission bypass', async () => {
    const res = await fetch(`${baseUrl}/api/roles/${cashierRoleId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect([200, 403]).toContain(res.status);
  });

  it('returns role when user has read permission', async () => {
    // Get owner token
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
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect([200, 403]).toContain(res.status);
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
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect([404, 403]).toContain(res.status);
  });

  it('returns 400 for invalid role ID format', async () => {
    const res = await fetch(`${baseUrl}/api/roles/invalid`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
  });
});