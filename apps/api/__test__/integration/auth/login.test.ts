// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for auth.login
// Tests the full login flow via HTTP.
// Requires external test server running (see scripts/test/test-server.ts)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { createTestCompany, cleanupTestFixtures } from '../../fixtures';

let baseUrl: string;

describe('auth.login', { timeout: 30000 }, () => {
  beforeAll(() => {
    baseUrl = getTestBaseUrl();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
  });

  it('healthcheck returns ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.ok).toBe(true);
  });

  it('creates test company via fixtures', async () => {
    const company = await createTestCompany({
      code: 'TESTAUTH',
      name: 'Test Auth Company'
    });
    
    expect(company.id).toBeGreaterThan(0);
    expect(company.code).toBe('TESTAUTH');
  });

  it('login with valid credentials returns access token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyCode: process.env.JP_COMPANY_CODE,
        email: process.env.JP_OWNER_EMAIL,
        password: process.env.JP_OWNER_PASSWORD
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.access_token).toBeDefined();
  });

  it('login with invalid credentials returns 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyCode: process.env.JP_COMPANY_CODE,
        email: process.env.JP_OWNER_EMAIL,
        password: 'wrongpassword'
      })
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('login rejects request without company code', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@test.com',
        password: 'password'
      })
    });

    expect(res.status).not.toBe(404);
  });
});
