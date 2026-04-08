// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for reports.daily-sales
// Tests GET /reports/daily-sales endpoint

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext } from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let seedContext: { companyId: number; outletId: number };

describe('reports.daily-sales', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/reports/daily-sales`);
    expect(res.status).toBe(401);
  });

  it('returns daily sales summary with valid auth', async () => {
    const res = await fetch(`${baseUrl}/api/reports/daily-sales?date_from=2024-01-01&date_to=2024-12-31`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.filters).toBeDefined();
    expect(body.data.rows).toBeDefined();
    expect(Array.isArray(body.data.rows)).toBe(true);
  });

  it('supports date range filtering', async () => {
    const dateFrom = '2024-01-01';
    const dateTo = '2024-12-31';

    const res = await fetch(`${baseUrl}/api/reports/daily-sales?date_from=${dateFrom}&date_to=${dateTo}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.filters.date_from).toBe(dateFrom);
    expect(body.data.filters.date_to).toBe(dateTo);
  });

  it('supports outlet filtering', async () => {
    const res = await fetch(`${baseUrl}/api/reports/daily-sales?date_from=2024-01-01&date_to=2024-12-31&outlet_id=${seedContext.outletId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.filters.outlet_ids).toContain(seedContext.outletId);
  });

  it('supports status filtering', async () => {
    const res = await fetch(`${baseUrl}/api/reports/daily-sales?date_from=2024-01-01&date_to=2024-12-31&status=COMPLETED`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.filters.status).toBe('COMPLETED');
  });

  it('returns rows aggregated by date', async () => {
    const res = await fetch(`${baseUrl}/api/reports/daily-sales?date_from=2024-01-01&date_to=2024-12-31`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Each row should have date aggregation fields (trx_date or similar)
    const rows = body.data.rows as Array<Record<string, unknown>>;
    if (rows.length > 0) {
      expect(rows[0]).toHaveProperty('trx_date');
    }
  });
});
