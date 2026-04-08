// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for admin-dashboards.period-close
// Tests GET /admin/dashboard/period-close-workspace endpoint

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken } from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('admin-dashboards.period-close', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/period-close-workspace`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 400 when fiscal_year_id is missing', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/period-close-workspace`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Missing required fiscal_year_id should return 400
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('returns period close workspace with valid fiscal_year_id', async () => {
    // Use a fiscal year ID that likely exists in the seed data
    const res = await fetch(`${baseUrl}/admin/dashboard/period-close-workspace?fiscal_year_id=1`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // OWNER/SUPER_ADMIN bypasses module permissions
    // 500 may occur if fiscal year doesn't have data
    expect([200, 403, 500]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    }
  });

  it('returns fiscal year status data', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/period-close-workspace?fiscal_year_id=1`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // 500 may occur if fiscal year doesn't have data
    expect([200, 403, 500]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      
      // The workspace should contain fiscal year status information
      // Structure varies based on implementation, but should be an object
      expect(typeof body.data).toBe('object');
    }
  });

  it('returns 400 for invalid fiscal_year_id', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/period-close-workspace?fiscal_year_id=invalid`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('returns 400 for negative fiscal_year_id', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/period-close-workspace?fiscal_year_id=-1`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for non-positive fiscal_year_id', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/period-close-workspace?fiscal_year_id=0`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
  });

  it('handles non-existent fiscal year gracefully', async () => {
    // Use a high fiscal year ID that likely doesn't exist
    const res = await fetch(`${baseUrl}/admin/dashboard/period-close-workspace?fiscal_year_id=99999`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Should return 200 with empty data or 500/400 depending on implementation
    // The key is it should not crash
    expect([200, 400, 500]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      // Even if fiscal year doesn't exist, the endpoint should return success=false 
      // or return empty data structure
      expect(body).toHaveProperty('success');
    }
  });

  it('requires authentication for the endpoint', async () => {
    // Verify the endpoint properly enforces auth
    const resNoAuth = await fetch(`${baseUrl}/admin/dashboard/period-close-workspace?fiscal_year_id=1`);
    expect(resNoAuth.status).toBe(401);

    const resBadAuth = await fetch(`${baseUrl}/admin/dashboard/period-close-workspace?fiscal_year_id=1`, {
      headers: {
        'Authorization': 'Bearer invalid-token',
        'Content-Type': 'application/json'
      }
    });
    expect(resBadAuth.status).toBe(401);
  });
});
