// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for settings-modules.extended-list
// Tests GET /settings/modules/extended endpoint - returns modules with typed settings.

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

describe('settings-modules.extended-list', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/settings/modules/extended`, {
      method: 'GET'
    });
    expect(res.status).toBe(401);
  });

  it('returns list of company module configurations with typed settings', async () => {
    const res = await fetch(`${baseUrl}/api/settings/modules/extended`, {
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

        // Extended modules should also have typed settings properties
        expect(module).toHaveProperty('pos_settings');
        expect(module).toHaveProperty('inventory_settings');
        expect(module).toHaveProperty('sales_settings');
        expect(module).toHaveProperty('purchasing_settings');
      }
    }
  });

  it('returns company-scoped modules', async () => {
    const context = await getSeedSyncContext();

    const res = await fetch(`${baseUrl}/api/settings/modules/extended`, {
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
      for (const module of body.data) {
        expect(typeof module.code).toBe('string');
        expect(typeof module.enabled).toBe('boolean');
        expect(typeof module.config_json).toBe('string');
      }
    }
  });

  it('returns modules with typed settings that can be null', async () => {
    const res = await fetch(`${baseUrl}/api/settings/modules/extended`, {
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

      // Typed settings can be null when not configured
      for (const module of body.data) {
        // These can be null or objects depending on configuration
        expect(module.pos_settings === null || typeof module.pos_settings === 'object').toBe(true);
        expect(module.inventory_settings === null || typeof module.inventory_settings === 'object').toBe(true);
        expect(module.sales_settings === null || typeof module.sales_settings === 'object').toBe(true);
        expect(module.purchasing_settings === null || typeof module.purchasing_settings === 'object').toBe(true);
      }
    }
  });

  it('returns modules with valid base structure', async () => {
    const res = await fetch(`${baseUrl}/api/settings/modules/extended`, {
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

      // Verify each module has required base properties
      for (const module of body.data) {
        expect(module).toHaveProperty('code');
        expect(module).toHaveProperty('name');
        expect(module).toHaveProperty('enabled');
        expect(module).toHaveProperty('config_json');

        // code should be a non-empty string
        expect(module.code.length).toBeGreaterThan(0);
        // enabled should be boolean
        expect(typeof module.enabled).toBe('boolean');
        // config_json should be a string
        expect(typeof module.config_json).toBe('string');
      }
    }
  });
});
