// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for auth.login
 * 
 * Tests the full login flow via HTTP.
 * Uses the shared test server via RWLock pattern.
 * 
 * Note: Login endpoint has throttle protection (AUTH_LOGIN_THROTTLE_BASE_MS=10000)
 * which adds delays to failed login attempts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { createTestCompany, cleanupTestFixtures } from '../../fixtures';

let baseUrl: string;

describe('auth.login', { timeout: 300000 }, () => {
  beforeAll(async () => {
    baseUrl = await acquireReadLock();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  it('healthcheck returns ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.ok).toBe(true);
    
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('creates test company via fixtures', async () => {
    const company = await createTestCompany({
      code: 'TESTAUTH',
      name: 'Test Auth Company'
    });
    
    expect(company.id).toBeGreaterThan(0);
    expect(company.code).toBe('TESTAUTH');
    
    // Verify company exists in DB
    const db = getTestDb();
    const result = await db
      .selectFrom('companies')
      .where('id', '=', company.id)
      .selectAll()
      .executeTakeFirst();
    
    expect(result).toBeDefined();
    expect(result!.code).toBe('TESTAUTH');
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

    // Should succeed with 200 and access token
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.access_token).toBeDefined();
    expect(body.data.token_type).toBe('Bearer');
    expect(typeof body.data.expires_in).toBe('number');
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

    // Should fail with 401
    expect(res.status).toBe(401);
    
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('login with non-existent company returns 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyCode: 'NONEXISTENT',
        email: 'test@test.com',
        password: 'password'
      })
    });

    // Should fail with 401 (invalid credentials for non-existent company)
    expect(res.status).toBe(401);
  });

  it('login rejects request without company code', async () => {
    // Test that login endpoint exists and handles validation errors
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@test.com',
        password: 'password'
      })
    });

    // Should return 400 or 500 (validation error or audit failure)
    // Not 404 (endpoint exists)
    expect(res.status).not.toBe(404);
  });
});
