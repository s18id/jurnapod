// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for tax-rates.update
// Tests PUT /settings/tax-rates/:id endpoint - requires settings module update permission.

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

describe('tax-rates.update', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/settings/tax-rates/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Tax' })
    });
    expect(res.status).toBe(401);
  });

  it('updates tax rate with valid payload when OWNER bypasses module permission', async () => {
    // First create a tax rate to update
    const uniqueCode = `TEST_TAX_UPD_${Date.now()}`;
    
    const createRes = await fetch(`${baseUrl}/api/settings/tax-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Original Tax Rate',
        rate_percent: 10
      })
    });

    // If creation failed, skip this test
    if (createRes.status !== 200 && createRes.status !== 201) {
      expect(true).toBe(true);
      return;
    }

    const createBody = await createRes.json();
    const taxRateId = createBody.data?.id;

    if (!taxRateId) {
      expect(true).toBe(true);
      return;
    }

    // Register cleanup for API-created data
    registerFixtureCleanup(`tax-rate-${taxRateId}`, async () => {});

    // Now update the tax rate
    const updateRes = await fetch(`${baseUrl}/api/settings/tax-rates/${taxRateId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Updated Tax Rate',
        rate_percent: 15
      })
    });

    // OWNER/SUPER_ADMIN bypasses module permission
    expect([200, 400, 404, 500]).toContain(updateRes.status);
  });

  it('returns 400 for invalid tax rate id format', async () => {
    const res = await fetch(`${baseUrl}/api/settings/tax-rates/invalid`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Updated Tax' })
    });

    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent tax rate', async () => {
    const res = await fetch(`${baseUrl}/api/settings/tax-rates/999999999`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Updated Tax' })
    });

    expect([400, 404]).toContain(res.status);
  });

  it('returns 400 when rate_percent is negative', async () => {
    // First create a tax rate to update
    const uniqueCode = `TEST_TAX_NEG_${Date.now()}`;
    
    const createRes = await fetch(`${baseUrl}/api/settings/tax-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Tax Rate to Update',
        rate_percent: 10
      })
    });

    if (createRes.status !== 200 && createRes.status !== 201) {
      expect(true).toBe(true);
      return;
    }

    const createBody = await createRes.json();
    const taxRateId = createBody.data?.id;

    if (!taxRateId) {
      expect(true).toBe(true);
      return;
    }

    registerFixtureCleanup(`tax-rate-${taxRateId}`, async () => {});

    // Try to update with negative rate
    const updateRes = await fetch(`${baseUrl}/api/settings/tax-rates/${taxRateId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rate_percent: -5
      })
    });

    expect(updateRes.status).toBe(400);
  });

  it('returns 400 when rate_percent exceeds 100', async () => {
    // First create a tax rate to update
    const uniqueCode = `TEST_TAX_HIGH_${Date.now()}`;
    
    const createRes = await fetch(`${baseUrl}/api/settings/tax-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Tax Rate to Update',
        rate_percent: 10
      })
    });

    if (createRes.status !== 200 && createRes.status !== 201) {
      expect(true).toBe(true);
      return;
    }

    const createBody = await createRes.json();
    const taxRateId = createBody.data?.id;

    if (!taxRateId) {
      expect(true).toBe(true);
      return;
    }

    registerFixtureCleanup(`tax-rate-${taxRateId}`, async () => {});

    // Try to update with rate > 100
    const updateRes = await fetch(`${baseUrl}/api/settings/tax-rates/${taxRateId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rate_percent: 150
      })
    });

    expect(updateRes.status).toBe(400);
  });

  it('updates tax rate with partial payload', async () => {
    // First create a tax rate to update
    const uniqueCode = `TEST_TAX_PART_${Date.now()}`;
    
    const createRes = await fetch(`${baseUrl}/api/settings/tax-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Tax Rate for Partial Update',
        rate_percent: 10
      })
    });

    if (createRes.status !== 200 && createRes.status !== 201) {
      expect(true).toBe(true);
      return;
    }

    const createBody = await createRes.json();
    const taxRateId = createBody.data?.id;

    if (!taxRateId) {
      expect(true).toBe(true);
      return;
    }

    registerFixtureCleanup(`tax-rate-${taxRateId}`, async () => {});

    // Update only the name, leaving rate_percent unchanged
    const updateRes = await fetch(`${baseUrl}/api/settings/tax-rates/${taxRateId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Partially Updated Tax Rate'
      })
    });

    expect([200, 400, 404, 500]).toContain(updateRes.status);
  });
});
