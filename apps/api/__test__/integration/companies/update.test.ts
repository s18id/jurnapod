// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for companies.update
// Tests PATCH /companies/:id endpoint - update company fields.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { makeTag } from '../../helpers/tags';
import {
  cleanupTestFixtures,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext,
  createTestCompanyMinimal,
  getOrCreateTestCashierForPermission
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let companyId: number;
let companyCode: string;
let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;

describe('companies.update', { timeout: 60000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    companyCode = process.env.JP_COMPANY_CODE ?? '';
    if (!companyCode) {
      throw new Error('JP_COMPANY_CODE is required for companies.update integration tests');
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
    const res = await fetch(`${baseUrl}/api/companies/${companyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Name' })
    });
    expect(res.status).toBe(401);
  });

  it('updates company fields for own company', async () => {
    const ownerToken = accessToken;

    // Update the seed company (which the owner belongs to)
    const res = await fetch(`${baseUrl}/api/companies/${companyId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Updated Company Name',
        city: 'Jakarta'
      })
    });

    // Owner bypasses module permission on own company → success
    expect(res.status).toBe(200);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Updated Company Name');
    }
  });

  it('returns 200 for empty update payload (all fields optional)', async () => {
    const ownerToken = accessToken;

    const res = await fetch(`${baseUrl}/api/companies/${companyId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    // Own company update with OWNER token → 200
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid email format', async () => {
    const ownerToken = accessToken;

    const res = await fetch(`${baseUrl}/api/companies/${companyId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'invalid-email-format'
      })
    });

    // Own company with OWNER: validation runs → 400
    expect(res.status).toBe(400);
  });

  it('returns 403 for non-existent foreign company id (tenant isolation first)', async () => {
    const ownerToken = accessToken;

    const res = await fetch(`${baseUrl}/api/companies/999999`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Updated Name'
      })
    });

    expect(res.status).toBe(403);
  });

  it('allows timezone update', async () => {
    const ownerToken = accessToken;

    const res = await fetch(`${baseUrl}/api/companies/${companyId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        timezone: 'Asia/Makassar'
      })
    });

    // Own company with OWNER token → 200
    expect(res.status).toBe(200);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      // Company timezone should be updated
    }
  });

  it('returns 403 when updating another company (cross-company access denied)', async () => {
    // Create another company
    const otherCompany = await createTestCompanyMinimal({
      code: `CO-OTHER-${makeTag('COT')}`,
      name: 'Other Company'
    });

    // Use accessToken (OWNER) to update a different company → cross-company → must be 403
    const res = await fetch(`${baseUrl}/api/companies/${otherCompany.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Hacked Name'
      })
    });

    // Cross-company update MUST be denied regardless of role
    // (company-level scoping enforces tenant isolation)
    expect(res.status).toBe(403);
  });

  it('returns 403 for CASHIER without platform.companies.update permission', async () => {
    const { accessToken: cashierToken } = await getOrCreateTestCashierForPermission(
      companyId,
      companyCode,
      baseUrl
    );

    const res = await fetch(`${baseUrl}/api/companies/${companyId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `No Access ${makeTag('NAU')}`
      })
    });

    expect(res.status).toBe(403);
  });
});
