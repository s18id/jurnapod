// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for users.create
// Tests POST /users endpoint - requires users module create permission.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { makeTag } from '../../helpers/tags';
import {
  cleanupTestFixtures,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext,
  getOrCreateTestCashierForPermission
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let companyId: number;
let companyCode: string;
let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;

describe('users.create', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    companyCode = process.env.JP_COMPANY_CODE ?? '';
    if (!companyCode) {
      throw new Error('JP_COMPANY_CODE is required for users.create integration tests');
    }
    accessToken = await getTestAccessToken(baseUrl);
    seedCtx = await loadSeedSyncContext();
    companyId = seedCtx.companyId;
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
    });
    expect(res.status).toBe(401);
  });

  it('create user succeeds when OWNER role bypasses module permission', async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: `no-permission+${makeTag('UP1')}@example.com`,
        password: 'password123'
      })
    });
    // OWNER bypasses module permission on own company → expect success
    expect(res.status).toBe(201);
  });

  it('creates user with valid payload when OWNER role bypasses module permission', async () => {
    const email = `newuser+${makeTag('UP2')}@example.com`;

    // Use OWNER access token from beforeAll.
    const createRes = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password: 'password123',
        is_active: true,
        role_codes: ['CASHIER'],
        outlet_ids: [seedCtx.outletId]
      })
    });

    // OWNER can create users and assign CASHIER role with outlet context.
    expect(createRes.status).toBe(201);

    const body = await createRes.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.email).toBe(email.toLowerCase());

    const createdUserId = Number(body.data.id);
    expect(Number.isFinite(createdUserId)).toBe(true);

    const db = getTestDb();

    const createdUser = await db
      .selectFrom('users')
      .select(['id', 'company_id', 'email'])
      .where('id', '=', createdUserId)
      .executeTakeFirst();

    expect(createdUser).toBeDefined();
    expect(Number(createdUser!.company_id)).toBe(companyId);

    const roleAssignment = await db
      .selectFrom('user_role_assignments as ura')
      .innerJoin('roles as r', 'r.id', 'ura.role_id')
      .select(['ura.user_id', 'ura.company_id', 'ura.outlet_id', 'r.code'])
      .where('ura.user_id', '=', createdUserId)
      .where('ura.company_id', '=', companyId)
      .where('r.code', '=', 'CASHIER')
      .executeTakeFirst();

    expect(roleAssignment).toBeDefined();
    expect(Number(roleAssignment!.user_id)).toBe(createdUserId);
    expect(Number(roleAssignment!.company_id)).toBe(companyId);
    expect(Number(roleAssignment!.outlet_id)).toBe(seedCtx.outletId);
  });

  it('returns 403 for CASHIER without platform.users.create permission', async () => {
    const { accessToken: cashierToken } = await getOrCreateTestCashierForPermission(
      companyId,
      companyCode,
      baseUrl
    );

    const res = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: `cashier-denied+${makeTag('UDN')}@example.com`,
        password: 'password123'
      })
    });

    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'not-an-email',
        password: 'password123'
      })
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for password too short', async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'short-pw@example.com',
        password: '123'
      })
    });

    expect(res.status).toBe(400);
  });
});
