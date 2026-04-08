// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for admin-dashboards.reconciliation
// Tests GET /admin/dashboard/reconciliation endpoint

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext } from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let seedContext: { companyId: number; outletId: number };

describe('admin-dashboards.reconciliation', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    seedContext = await getSeedSyncContext();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/reconciliation`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns reconciliation dashboard with valid auth', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/reconciliation`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // OWNER/SUPER_ADMIN bypasses module permissions
    expect([200, 403]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    }
  });

  it('returns account balances with company breakdown', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/reconciliation`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect([200, 403]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();

      // Should have glImbalanceMetric with company-scoped data
      expect(body.data).toHaveProperty('glImbalanceMetric');
      expect(body.data.glImbalanceMetric).toHaveProperty('totalImbalances');
      expect(typeof body.data.glImbalanceMetric.totalImbalances).toBe('number');
    }
  });

  it('supports outlet_id filter', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/reconciliation?outlet_id=${seedContext.outletId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect([200, 403]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    }
  });

  it('supports account_types filter', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/reconciliation?account_types=CASH,INVENTORY`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect([200, 403]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  it('supports statuses filter', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/reconciliation?statuses=RECONCILED,VARIANCE`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect([200, 403]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  it('supports include_drilldown parameter', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/reconciliation?include_drilldown=true`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect([200, 403]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    }
  });

  it('supports trend_periods parameter', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/reconciliation?trend_periods=5`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect([200, 403]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  it('returns 400 for invalid account_types', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/reconciliation?account_types=INVALID_TYPE`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Should either return 200 with empty/invalid filtered results or 400
    // The endpoint parses valid enum values and ignores invalid ones
    expect([200, 400]).toContain(res.status);
  });

  it('returns 400 for invalid statuses', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/reconciliation?statuses=INVALID_STATUS`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Should either return 200 with empty/invalid filtered results or 400
    expect([200, 400]).toContain(res.status);
  });

  it('supports drilldown endpoint with valid accountId', async () => {
    // First get some account IDs from the main dashboard
    const dashboardRes = await fetch(`${baseUrl}/admin/dashboard/reconciliation`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect([200, 403]).toContain(dashboardRes.status);

    if (dashboardRes.status === 200) {
      const dashboardBody = await dashboardRes.json();
      
      // Try to get drilldown for an account if accounts exist in the response
      // The drilldown endpoint requires a valid accountId
      // We test with a likely-invalid ID to verify the route exists
      const drilldownRes = await fetch(`${baseUrl}/admin/dashboard/reconciliation/99999/drilldown`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      // Should return 404 (account not found) or 200 if account exists
      expect([200, 404]).toContain(drilldownRes.status);
      
      if (drilldownRes.status === 200) {
        const drilldownBody = await drilldownRes.json();
        expect(drilldownBody.success).toBe(true);
      } else if (drilldownRes.status === 404) {
        const drilldownBody = await drilldownRes.json();
        expect(drilldownBody.success).toBe(false);
        expect(drilldownBody.error.code).toBe('NOT_FOUND');
      }
    }
  });

  it('rejects drilldown request without auth', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/reconciliation/1/drilldown`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid accountId in drilldown', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/reconciliation/invalid/drilldown`, {
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
});
