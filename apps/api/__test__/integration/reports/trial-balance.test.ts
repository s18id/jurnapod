// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for reports.trial-balance
// Tests GET /reports/trial-balance endpoint

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext } from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let seedContext: { companyId: number; outletId: number };

describe('reports.trial-balance', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/reports/trial-balance`);
    expect(res.status).toBe(401);
  });

  it('returns trial balance with valid auth', async () => {
    const res = await fetch(`${baseUrl}/api/reports/trial-balance?date_from=2024-01-01&date_to=2024-12-31`, {
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
    expect(body.data.totals).toBeDefined();
    expect(body.data.rows).toBeDefined();
    expect(typeof body.data.totals.total_debit).toBe('number');
    expect(typeof body.data.totals.total_credit).toBe('number');
    expect(typeof body.data.totals.balance).toBe('number');
  });

  it('returns trial balance with date range filter', async () => {
    const dateFrom = '2024-01-01';
    const dateTo = '2024-12-31';

    const res = await fetch(`${baseUrl}/api/reports/trial-balance?date_from=${dateFrom}&date_to=${dateTo}`, {
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

  it('returns trial balance with outlet filter', async () => {
    const res = await fetch(`${baseUrl}/api/reports/trial-balance?date_from=2024-01-01&date_to=2024-12-31&outlet_id=${seedContext.outletId}`, {
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

  it('returns trial balance with as_of date', async () => {
    const res = await fetch(`${baseUrl}/api/reports/trial-balance?date_from=2024-01-01&date_to=2024-12-31&as_of=2024-06-15T00:00:00Z`, {
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

  it('calculates totals correctly from rows', async () => {
    const res = await fetch(`${baseUrl}/api/reports/trial-balance?date_from=2024-01-01&date_to=2024-12-31`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const rows = body.data.rows as Array<{ total_debit: number; total_credit: number; balance: number }>;
    const computedTotals = rows.reduce(
      (acc: { total_debit: number; total_credit: number; balance: number }, row: { total_debit: number; total_credit: number; balance: number }) => ({
        total_debit: acc.total_debit + row.total_debit,
        total_credit: acc.total_credit + row.total_credit,
        balance: acc.balance + row.balance
      }),
      { total_debit: 0, total_credit: 0, balance: 0 }
    );

    expect(body.data.totals.total_debit).toBe(computedTotals.total_debit);
    expect(body.data.totals.total_credit).toBe(computedTotals.total_credit);
  });
});
