// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for audit.period-transitions-list
// Tests GET /audit/period-transitions endpoint - query period transition audit logs

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let seedCtx: { companyId: number; outletId: number; cashierUserId: number };

describe('audit.period-transitions-list', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    seedCtx = await getSeedSyncContext();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without authentication', async () => {
    const res = await fetch(`${baseUrl}/api/audit/period-transitions`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects request with invalid token', async () => {
    const res = await fetch(`${baseUrl}/api/audit/period-transitions`, {
      headers: {
        'Authorization': 'Bearer invalid-token',
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid authentication and permissions', async () => {
    const res = await fetch(`${baseUrl}/api/audit/period-transitions`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(typeof body.data.total).toBe('number');
    expect(Array.isArray(body.data.transitions)).toBe(true);
    expect(typeof body.data.limit).toBe('number');
    expect(typeof body.data.offset).toBe('number');
  });

  it('returns audit data with correct response structure', async () => {
    const res = await fetch(`${baseUrl}/api/audit/period-transitions`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('total');
    expect(body.data).toHaveProperty('transitions');
    expect(body.data).toHaveProperty('limit');
    expect(body.data).toHaveProperty('offset');
  });

  it('supports pagination with limit parameter', async () => {
    const limit = 5;
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.limit).toBe(limit);
    expect(body.data.transitions.length).toBeLessThanOrEqual(limit);
  });

  it('supports pagination with offset parameter', async () => {
    const limit = 5;
    const offset = 0;

    // First request to get total
    const firstRes = await fetch(`${baseUrl}/api/audit/period-transitions?limit=${limit}&offset=${offset}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(firstRes.status).toBe(200);
    const firstBody = await firstRes.json();
    const total = firstBody.data.total;

    // If we have more than limit records, test offset
    if (total > limit) {
      const offsetRes = await fetch(`${baseUrl}/api/audit/period-transitions?limit=${limit}&offset=${limit}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(offsetRes.status).toBe(200);
      const offsetBody = await offsetRes.json();
      expect(offsetBody.data.offset).toBe(limit);
    }
  });

  it('supports filtering by fiscal_year_id', async () => {
    // Use a fiscal_year_id that likely has no data to verify filter works
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?fiscal_year_id=999999`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Should return empty results or results matching the filter
    expect(body.data).toBeDefined();
  });

  it('supports filtering by period_number', async () => {
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?period_number=1`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('supports filtering by actor_user_id', async () => {
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?actor_user_id=${seedCtx.cashierUserId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('supports filtering by action', async () => {
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?action=PERIOD_OPEN`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('rejects invalid action value', async () => {
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?action=INVALID_ACTION`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('supports date range filtering with from_date', async () => {
    const fromDate = '2020-01-01T00:00:00.000Z';
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?from_date=${encodeURIComponent(fromDate)}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('supports date range filtering with to_date', async () => {
    const toDate = '2030-12-31T23:59:59.999Z';
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?to_date=${encodeURIComponent(toDate)}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('supports combined date range filtering', async () => {
    const fromDate = '2020-01-01T00:00:00.000Z';
    const toDate = '2030-12-31T23:59:59.999Z';
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('supports multiple filters combined', async () => {
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?limit=10&action=PERIOD_OPEN`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.limit).toBe(10);
  });

  it('returns 400 for invalid limit value', async () => {
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?limit=0`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 for limit exceeding maximum', async () => {
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?limit=5000`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 for negative offset', async () => {
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?offset=-1`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 for invalid fiscal_year_id', async () => {
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?fiscal_year_id=-1`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 for invalid period_number', async () => {
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?period_number=-5`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('verifies audit entries contain expected fields when present', async () => {
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?limit=1`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // If we have any transitions, verify the structure
    if (body.data.transitions.length > 0) {
      const transition = body.data.transitions[0];
      // Common audit fields that should be present
      expect(transition).toHaveProperty('id');
      expect(transition).toHaveProperty('company_id');
      expect(transition).toHaveProperty('action');
    }
  });

  it('verifies results are scoped to authenticated company', async () => {
    // Make request with authenticated token
    const res = await fetch(`${baseUrl}/api/audit/period-transitions?limit=100`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // If we have transitions, verify they're all for the same company
    if (body.data.transitions.length > 0) {
      for (const transition of body.data.transitions) {
        expect(transition.company_id).toBe(seedCtx.companyId);
      }
    }
  });
});
