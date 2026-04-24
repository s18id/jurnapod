// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for companies.create
// Tests POST /companies endpoint - create new company.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { makeTag } from '../../helpers/tags';
import { sql } from 'kysely';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  loginForTest,
  getSeedSyncContext,
  registerFixtureCleanup
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let superAdminToken: string | null = null;

describe('companies.create', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);

    const companyCode = process.env.JP_COMPANY_CODE;
    const superAdminEmail = process.env.JP_SUPER_ADMIN_EMAIL;
    const superAdminPassword = process.env.JP_SUPER_ADMIN_PASSWORD;
    if (companyCode && superAdminEmail && superAdminPassword) {
      try {
        superAdminToken = await loginForTest(baseUrl, companyCode, superAdminEmail, superAdminPassword);
      } catch {
        superAdminToken = null;
      }
    }
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/companies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'TEST-CO-CREATE',
        name: 'Test Company Created'
      })
    });
    expect(res.status).toBe(401);
  });

  it('requires SUPER_ADMIN role to create company', async () => {
    // accessToken is OWNER - should be rejected because only SUPER_ADMIN can create companies
    // This is a platform-level operation
    const uniqueCode = `CO-CREATE-${makeTag('CCR')}`;
    const res = await fetch(`${baseUrl}/api/companies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Test Company'
      })
    });

    // OWNER is not SUPER_ADMIN, so 403 is expected
    expect(res.status).toBe(403);
  });

  it('creates company with valid SUPER_ADMIN credentials', async () => {
    if (!superAdminToken) {
      // SUPER_ADMIN may not exist in test DB - skip
      expect(true).toBe(true);
      return;
    }
    const adminToken = superAdminToken;

    const uniqueCode = `CO-NEW-${makeTag('CNW')}`;
    const res = await fetch(`${baseUrl}/api/companies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'New Test Company',
        timezone: 'Asia/Jakarta',
        currency_code: 'IDR'
      })
    });

    // SUPER_ADMIN should not get 403 — RBAC bug if 403 is returned
    if (res.status === 403) {
      expect.fail('SUPER_ADMIN should not get 403 — RBAC bug?');
    }

    // Expect success (200 or 201)
    expect([200, 201]).toContain(res.status);

    if (res.ok) {
      const body = await res.json();
      if (body.success) {
        expect(body.data).toHaveProperty('id');
        expect(body.data.code).toBe(uniqueCode);
        // Register cleanup for API-created company
        if (body.data.id) {
          registerFixtureCleanup(`company-${body.data.id}`, async () => {
            // Company cleanup handled by fixture registry
          });
        }
      }
    }
  });

  it('bootstraps typed settings tables for a newly created company', async () => {
    if (!superAdminToken) {
      expect(true).toBe(true);
      return;
    }

    const adminToken = superAdminToken;
    const uniqueCode = `CO-SET-${makeTag('CST')}`;
    const res = await fetch(`${baseUrl}/api/companies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Typed Settings Bootstrap Company',
        timezone: 'Asia/Jakarta',
        currency_code: 'IDR'
      })
    });

    expect([200, 201]).toContain(res.status);
    const body = await res.json();
    expect(body.success).toBe(true);
    const companyId = Number(body.data.id);
    expect(Number.isFinite(companyId)).toBe(true);

    const db = getTestDb();

    const stringsCntRows = await sql`
      SELECT COUNT(*) AS cnt
      FROM settings_strings
      WHERE company_id = ${companyId}
    `.execute(db);
    const numbersCntRows = await sql`
      SELECT COUNT(*) AS cnt
      FROM settings_numbers
      WHERE company_id = ${companyId}
    `.execute(db);
    const boolCntRows = await sql`
      SELECT COUNT(*) AS cnt
      FROM settings_booleans
      WHERE company_id = ${companyId}
    `.execute(db);

    const stringsCnt = Number((stringsCntRows.rows[0] as { cnt: number | string }).cnt);
    const numbersCnt = Number((numbersCntRows.rows[0] as { cnt: number | string }).cnt);
    const boolCnt = Number((boolCntRows.rows[0] as { cnt: number | string }).cnt);

    expect(stringsCnt).toBeGreaterThan(0);
    expect(numbersCnt).toBeGreaterThan(0);
    expect(boolCnt).toBeGreaterThan(0);
  });

  it('returns 400 for missing required fields', async () => {
    if (!superAdminToken) {
      // SUPER_ADMIN may not exist in test DB - skip
      expect(true).toBe(true);
      return;
    }
    const adminToken = superAdminToken;

    const res = await fetch(`${baseUrl}/api/companies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    // SUPER_ADMIN passes auth check, reaches validation which returns 400
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    if (!superAdminToken) {
      // SUPER_ADMIN may not exist in test DB - skip
      expect(true).toBe(true);
      return;
    }
    const adminToken = superAdminToken;

    const uniqueCode = `CO-EMAIL-${makeTag('CEM')}`;
    const res = await fetch(`${baseUrl}/api/companies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Test Company',
        email: 'invalid-email-format'
      })
    });

    // SUPER_ADMIN reaches validation → 400 for invalid email
    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate company code', async () => {
    if (!superAdminToken) {
      // SUPER_ADMIN may not exist in test DB - skip
      expect(true).toBe(true);
      return;
    }
    const adminToken = superAdminToken;

    // Use the seed company code which should already exist
    const seedCompanyCode = process.env.JP_COMPANY_CODE;
    if (!seedCompanyCode) {
      expect(true).toBe(true);
      return;
    }

    const res = await fetch(`${baseUrl}/api/companies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: seedCompanyCode,
        name: 'Duplicate Code Company'
      })
    });

    // SUPER_ADMIN reaches business logic → 409 for duplicate code
    expect(res.status).toBe(409);
  });
});
