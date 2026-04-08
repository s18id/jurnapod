// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for reports.receivables-ageing
// Tests GET /reports/receivables-ageing endpoint

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext } from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let seedContext: { companyId: number; outletId: number };

describe('reports.receivables-ageing', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/reports/receivables-ageing`);
    expect(res.status).toBe(401);
  });

  it('returns receivables ageing report with valid auth', async () => {
    const res = await fetch(`${baseUrl}/api/reports/receivables-ageing`, {
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
  });

  it('supports outlet filtering', async () => {
    const res = await fetch(`${baseUrl}/api/reports/receivables-ageing?outlet_id=${seedContext.outletId}`, {
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

  it('supports as_of_date filtering', async () => {
    const asOfDate = '2024-06-15';

    const res = await fetch(`${baseUrl}/api/reports/receivables-ageing?as_of_date=${asOfDate}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.filters.as_of_date).toBe(asOfDate);
  });

  it('returns invoice ageing buckets', async () => {
    const res = await fetch(`${baseUrl}/api/reports/receivables-ageing`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Should have invoices array with ageing data
    expect(body.data.invoices).toBeDefined();
    expect(Array.isArray(body.data.invoices)).toBe(true);
  });
});
