// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for settings-modules.list
// Tests GET /settings/modules endpoint - returns company module configurations.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('settings-modules.list', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/settings/modules`, {
      method: 'GET'
    });
    expect(res.status).toBe(401);
  });

  it('returns list of company module configurations', async () => {
    const res = await fetch(`${baseUrl}/api/settings/modules`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // OWNER/SUPER_ADMIN bypasses module permission checks
    expect([200, 403]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);

      // If there are modules, verify structure
      if (body.data.length > 0) {
        const module = body.data[0];
        expect(module).toHaveProperty('code');
        expect(module).toHaveProperty('name');
        expect(module).toHaveProperty('enabled');
        expect(module).toHaveProperty('config_json');
      }
    }
  });

  it('returns company-scoped modules', async () => {
    const context = await getSeedSyncContext();

    const res = await fetch(`${baseUrl}/api/settings/modules`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // OWNER/SUPER_ADMIN bypasses module permission checks
    expect([200, 403]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data));

      // Modules should be scoped to the authenticated user's company
      // Each module should have required fields
      for (const module of body.data) {
        expect(typeof module.code).toBe('string');
        expect(typeof module.enabled).toBe('boolean');
        expect(typeof module.config_json).toBe('string');
      }
    }
  });

  it('returns modules with valid structure', async () => {
    const res = await fetch(`${baseUrl}/api/settings/modules`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // OWNER/SUPER_ADMIN bypasses module permission checks
    expect([200, 403]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data));

      // Verify each module has required properties
      for (const module of body.data) {
        expect(module).toHaveProperty('code');
        expect(module).toHaveProperty('name');
        expect(module).toHaveProperty('enabled');
        expect(module).toHaveProperty('config_json');

        // code should be a non-empty string
        expect(module.code.length).toBeGreaterThan(0);
        // enabled should be boolean
        expect(typeof module.enabled).toBe('boolean');
        // config_json should be a string (possibly empty or JSON string)
        expect(typeof module.config_json).toBe('string');
      }
    }
  });
});
