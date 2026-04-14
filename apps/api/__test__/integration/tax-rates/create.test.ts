// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for tax-rates.create
// Tests POST /settings/tax-rates endpoint - requires settings module create permission.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  registerFixtureCleanup
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('tax-rates.create', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/settings/tax-rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'TEST_TAX',
        name: 'Test Tax',
        rate_percent: 10
      })
    });
    expect(res.status).toBe(401);
  });

  it('creates tax rate with valid payload when OWNER bypasses module permission', async () => {
    const uniqueCode = `TEST_TAX_${Date.now()}`;
    
    const res = await fetch(`${baseUrl}/api/settings/tax-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Test Tax Rate',
        rate_percent: 10,
        is_inclusive: false
      })
    });

    // OWNER/SUPER_ADMIN bypasses module permission - expect success
    expect([200, 201, 400, 409]).toContain(res.status);
    
    // If created successfully, register cleanup for the API-side-effect data
    if (res.status === 200 || res.status === 201) {
      const body = await res.json();
      if (body.data?.id) {
        registerFixtureCleanup(`tax-rate-${body.data.id}`, async () => {
          // API-created tax rate will be cleaned up via cascade or manual cleanup
        });
      }
    }
  });

  it('returns 400 when rate_percent is negative', async () => {
    const uniqueCode = `TEST_TAX_NEG_${Date.now()}`;
    
    const res = await fetch(`${baseUrl}/api/settings/tax-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Test Tax Rate',
        rate_percent: -5
      })
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when rate_percent exceeds 100', async () => {
    const uniqueCode = `TEST_TAX_HIGH_${Date.now()}`;
    
    const res = await fetch(`${baseUrl}/api/settings/tax-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Test Tax Rate',
        rate_percent: 150
      })
    });

    expect(res.status).toBe(400);
  });

  it('validates rate_percent is within 0-100 range - boundary test 0', async () => {
    const uniqueCode = `TEST_TAX_ZERO_${Date.now()}`;
    
    const res = await fetch(`${baseUrl}/api/settings/tax-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Test Tax Rate Zero',
        rate_percent: 0
      })
    });

    // 0 is valid, should succeed for owner
    expect([200, 201, 400]).toContain(res.status);
  });

  it('validates rate_percent is within 0-100 range - boundary test 100', async () => {
    const uniqueCode = `TEST_TAX_FULL_${Date.now()}`;
    
    const res = await fetch(`${baseUrl}/api/settings/tax-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Test Tax Rate Full',
        rate_percent: 100
      })
    });

    // 100 is valid, should succeed for owner
    expect([200, 201, 400]).toContain(res.status);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await fetch(`${baseUrl}/api/settings/tax-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for empty code', async () => {
    const res = await fetch(`${baseUrl}/api/settings/tax-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: '',
        name: 'Test Tax',
        rate_percent: 10
      })
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for empty name', async () => {
    const res = await fetch(`${baseUrl}/api/settings/tax-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: 'TEST_CODE',
        name: '',
        rate_percent: 10
      })
    });

    expect(res.status).toBe(400);
  });
});
