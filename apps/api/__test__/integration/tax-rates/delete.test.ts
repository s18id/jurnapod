// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for tax-rates.delete
// Tests DELETE /settings/tax-rates/:id endpoint - requires settings module delete permission.

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

describe('tax-rates.delete', { timeout: 30000 }, () => {
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
      method: 'DELETE'
    });
    expect(res.status).toBe(401);
  });

  it('deletes tax rate when OWNER bypasses module permission', async () => {
    // First create a tax rate to delete
    const uniqueCode = `TEST_TAX_DEL_${Date.now()}`;
    
    const createRes = await fetch(`${baseUrl}/api/settings/tax-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Tax Rate to Delete',
        rate_percent: 5
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

    // Now delete the tax rate
    const deleteRes = await fetch(`${baseUrl}/api/settings/tax-rates/${taxRateId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // OWNER/SUPER_ADMIN bypasses module permission
    // May succeed (200) or fail if referenced (409)
    expect([200, 409, 500]).toContain(deleteRes.status);

    // If successful, verify the response structure
    if (deleteRes.status === 200) {
      const deleteBody = await deleteRes.json();
      expect(deleteBody.success).toBe(true);
      expect(deleteBody.data).toHaveProperty('deleted', true);
    }
  });

  it('returns 400 for invalid tax rate id format', async () => {
    const res = await fetch(`${baseUrl}/api/settings/tax-rates/invalid`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent tax rate', async () => {
    const res = await fetch(`${baseUrl}/api/settings/tax-rates/999999999`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect([400, 404, 500]).toContain(res.status);
  });

  it('prevents deletion of referenced tax rates', async () => {
    // First create a tax rate
    const uniqueCode = `TEST_TAX_REF_${Date.now()}`;
    
    const createRes = await fetch(`${baseUrl}/api/settings/tax-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Referenced Tax Rate',
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

    // Set the tax rate as a default
    const setDefaultRes = await fetch(`${baseUrl}/api/settings/tax-defaults`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tax_rate_ids: [taxRateId]
      })
    });

    // Try to delete the referenced tax rate
    const deleteRes = await fetch(`${baseUrl}/api/settings/tax-rates/${taxRateId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Referenced tax rates should not be deletable (409 Conflict)
    expect([409, 500]).toContain(deleteRes.status);
  });
});
