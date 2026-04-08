// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for reports.journals
// Tests GET /reports/journals endpoint

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext } from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let seedContext: { companyId: number; outletId: number };

describe('reports.journals', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/reports/journals`);
    expect(res.status).toBe(401);
  });

  it('returns journals list with valid auth', async () => {
    const res = await fetch(`${baseUrl}/api/reports/journals?date_from=2024-01-01&date_to=2024-12-31`, {
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
    expect(body.data.pagination).toBeDefined();
    expect(body.data.journals).toBeDefined();
  });

  it('supports pagination', async () => {
    const res = await fetch(`${baseUrl}/api/reports/journals?date_from=2024-01-01&date_to=2024-12-31&limit=20&offset=0`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.pagination.limit).toBe(20);
    expect(body.data.pagination.offset).toBe(0);
    expect(typeof body.data.pagination.total).toBe('number');
    expect(typeof body.data.pagination.hasMore).toBe('boolean');
  });

  it('supports date range filtering', async () => {
    const dateFrom = '2024-01-01';
    const dateTo = '2024-12-31';

    const res = await fetch(`${baseUrl}/api/reports/journals?date_from=${dateFrom}&date_to=${dateTo}`, {
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
    const res = await fetch(`${baseUrl}/api/reports/journals?date_from=2024-01-01&date_to=2024-12-31&outlet_id=${seedContext.outletId}`, {
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

  it('supports as_of datetime filter', async () => {
    const res = await fetch(`${baseUrl}/api/reports/journals?date_from=2024-01-01&date_to=2024-12-31&as_of=2024-06-15T00:00:00Z`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.filters.as_of).toBeTruthy();
  });
});
