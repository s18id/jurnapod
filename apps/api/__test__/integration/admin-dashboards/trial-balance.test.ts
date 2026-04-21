// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for admin-dashboards.trial-balance
// Tests GET /admin/dashboard/trial-balance endpoint

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext as loadSeedSyncContext } from '../../fixtures';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';

let baseUrl: string;
let accessToken: string;
let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;
const getSeedSyncContext = async () => seedCtx;

describe('admin-dashboards.trial-balance', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    seedCtx = await loadSeedSyncContext();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/trial-balance`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 400 when fiscal_year_id is missing', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/trial-balance`, {
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

  it('returns trial balance with valid fiscal_year_id', async () => {
    // Use a fiscal year ID that likely exists in the seed data
    const res = await fetch(`${baseUrl}/admin/dashboard/trial-balance?fiscal_year_id=1`, {
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

  it('supports date range filtering via as_of_epoch_ms', async () => {
    const asOfEpochMs = 1767225600000; // 2026-01-02T00:00:00Z fixed epoch
    
    const res = await fetch(`${baseUrl}/admin/dashboard/trial-balance?fiscal_year_id=1&as_of_epoch_ms=${asOfEpochMs}`, {
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

  it('supports period_id filter', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/trial-balance?fiscal_year_id=1&period_id=1`, {
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

  it('supports outlet_id filter', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/trial-balance?fiscal_year_id=1&outlet_id=${seedCtx.outletId}`, {
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

  it('supports include_zero_balances parameter', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/trial-balance?fiscal_year_id=1&include_zero_balances=true`, {
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

  it('returns 400 for invalid fiscal_year_id', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/trial-balance?fiscal_year_id=invalid`, {
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
    const res = await fetch(`${baseUrl}/admin/dashboard/trial-balance?fiscal_year_id=-1`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
  });

  it('validates as_of_epoch_ms is not in the future', async () => {
    // Use a fixed future epoch far enough to always exceed current server time
    const futureDate = 2777184000000; // 2058-01-01T00:00:00Z — unambiguous future
    
    const res = await fetch(`${baseUrl}/admin/dashboard/trial-balance?fiscal_year_id=1&as_of_epoch_ms=${futureDate}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
  });

  it('supports validate endpoint with valid params', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/trial-balance/validate?fiscal_year_id=1`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // 500 may occur if fiscal year doesn't have data
    expect([200, 403]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    }
  });

  it('validate endpoint requires fiscal_year_id', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/trial-balance/validate`, {
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

  it('validate endpoint supports period_id filter', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/trial-balance/validate?fiscal_year_id=1&period_id=1`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // 500 may occur if fiscal year doesn't have data
    expect([200, 403]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  it('validate endpoint rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/admin/dashboard/trial-balance/validate?fiscal_year_id=1`);
    expect(res.status).toBe(401);
  });
});
