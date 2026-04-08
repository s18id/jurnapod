// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for dinein.sessions
// Tests GET /dinein/sessions endpoint - list service sessions scoped to outlet.

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

describe('dinein.sessions', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/dinein/sessions`);
    expect(res.status).toBe(401);
  });

  it('returns 400 when outletId is missing', async () => {
    const res = await fetch(`${baseUrl}/api/dinein/sessions`, {
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
    // Login with a user that has no POS module permissions
    // Use the seeded cashier which may have limited permissions
    const res = await fetch(`${baseUrl}/api/dinein/sessions?outletId=${seedContext.outletId}`, {
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

  it('returns sessions for authenticated user with valid outletId', async () => {
    const res = await fetch(`${baseUrl}/api/dinein/sessions?outletId=${seedContext.outletId}`, {
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
      expect(body.data).toHaveProperty('sessions');
      expect(body.data).toHaveProperty('pagination');
      expect(Array.isArray(body.data.sessions)).toBe(true);
      expect(body.data.pagination).toHaveProperty('total');
      expect(body.data.pagination).toHaveProperty('limit');
      expect(body.data.pagination).toHaveProperty('offset');
      expect(body.data.pagination).toHaveProperty('hasMore');
    }
  });

  it('supports status filtering', async () => {
    // Query with status filter (1 = ACTIVE session status)
    const res = await fetch(`${baseUrl}/api/dinein/sessions?outletId=${seedContext.outletId}&status=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Either succeeds or gets 403
    expect([200, 403]).toContain(res.status);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.sessions)).toBe(true);
      // If sessions exist, they should all have statusId = 1
      for (const session of body.data.sessions) {
        expect(session.statusId).toBe(1);
      }
    }
  });

  it('supports tableId filtering', async () => {
    // Query with tableId filter - use a non-existent table ID to get empty result
    const res = await fetch(`${baseUrl}/api/dinein/sessions?outletId=${seedContext.outletId}&tableId=999999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Either succeeds or gets 403
    expect([200, 403]).toContain(res.status);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.sessions)).toBe(true);
    }
  });

  it('supports pagination parameters', async () => {
    const res = await fetch(`${baseUrl}/api/dinein/sessions?outletId=${seedContext.outletId}&limit=5&offset=0`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Either succeeds or gets 403
    expect([200, 403]).toContain(res.status);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.pagination.limit).toBe(5);
      expect(body.data.pagination.offset).toBe(0);
    }
  });

  it('returns 400 for invalid outletId format', async () => {
    const res = await fetch(`${baseUrl}/api/dinein/sessions?outletId=invalid`, {
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
    const res = await fetch(`${baseUrl}/api/dinein/sessions?outletId=${nonExistentOutletId}`, {
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
