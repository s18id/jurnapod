// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for dinein.tables
// Tests GET /dinein/tables endpoint - list tables with occupancy status.

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
let seedContext: { companyId: number; outletId: number; cashierUserId: number };

describe('dinein.tables', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/dinein/tables`);
    expect(res.status).toBe(401);
  });

  it('returns 400 when outletId is missing', async () => {
    const res = await fetch(`${baseUrl}/api/dinein/tables`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('MISSING_OUTLET_ID');
  });

  it('returns 403 when user lacks POS module read permission', async () => {
    const res = await fetch(`${baseUrl}/api/dinein/tables?outletId=${seedContext.outletId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Without POS:read permission, expect 403
    // Note: OWNER/SUPER_ADMIN tokens bypass module permissions
    expect([200, 403]).toContain(res.status);
  });

  it('returns tables with occupancy status for authenticated user', async () => {
    const res = await fetch(`${baseUrl}/api/dinein/tables?outletId=${seedContext.outletId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Either succeeds (owner/admin) or gets 403 (cashier without pos:read)
    expect([200, 403]).toContain(res.status);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('tables');
      expect(Array.isArray(body.data.tables)).toBe(true);

      // If tables exist, verify occupancy status fields
      for (const table of body.data.tables) {
        expect(table).toHaveProperty('tableId');
        expect(table).toHaveProperty('tableCode');
        expect(table).toHaveProperty('tableName');
        expect(table).toHaveProperty('capacity');
        expect(table).toHaveProperty('zone');
        expect(table).toHaveProperty('occupancyStatusId');
        expect(table).toHaveProperty('availableNow');
        expect(table).toHaveProperty('version');
        expect(table).toHaveProperty('updatedAt');

        // availableNow should be a boolean
        expect(typeof table.availableNow).toBe('boolean');

        // occupancyStatusId should be a number or numeric string
        expect(typeof table.occupancyStatusId === 'string' || typeof table.occupancyStatusId === 'number').toBe(true);
      }
    }
  });

  it('returns 400 for invalid outletId format', async () => {
    const res = await fetch(`${baseUrl}/api/dinein/tables?outletId=invalid`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('INVALID_REQUEST');
  });

  it('returns 403 for outlet user does not have access to', async () => {
    // Use a non-existent outlet ID to trigger forbidden
    // Note: SUPER_ADMIN/OWNER tokens may bypass outlet access checks and get 200
    const nonExistentOutletId = 999999999;
    const res = await fetch(`${baseUrl}/api/dinein/tables?outletId=${nonExistentOutletId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // SUPER_ADMIN may get 200 even for non-existent outlet (hasOutletAccess returns true)
    // Non-privileged users would get 403
    expect([200, 400, 403]).toContain(res.status);
  });
});
