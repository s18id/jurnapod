// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for settings.config-update
// Tests PATCH /settings/config endpoint - updates outlet settings with validation

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext,
  registerFixtureCleanup
} from '../../fixtures';
import { SETTINGS_REGISTRY, SETTINGS_KEYS } from '@jurnapod/shared';

// Use keys that are in SETTINGS_KEYS (not all keys in SETTINGS_REGISTRY are in SETTINGS_KEYS)
const TEST_BOOLEAN_KEY = 'accounting.allow_multiple_open_fiscal_years';
const TEST_INT_KEY = 'inventory.warn_on_negative';
const TEST_ENUM_KEY = 'inventory.costing_method';

let baseUrl: string;
let accessToken: string;

describe('settings.config-update', { timeout: 30000 }, () => {
  let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;
  const getSeedSyncContext = async () => seedCtx;

  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    seedCtx = await loadSeedSyncContext();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outlet_id: 1,
        settings: [{ key: TEST_BOOLEAN_KEY, value: true }]
      })
    });
    expect(res.status).toBe(401);
  });

  it('rejects request without auth - PUT method', async () => {
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outlet_id: 1,
        settings: [{ key: TEST_BOOLEAN_KEY, value: true }]
      })
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 when outlet_id is missing', async () => {
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        settings: [{ key: TEST_BOOLEAN_KEY, value: true }]
      })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 when settings is missing', async () => {
    const ctx = await getSeedSyncContext();
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId
      })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 for invalid setting key', async () => {
    const ctx = await getSeedSyncContext();
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId,
        settings: [{ key: 'invalid.setting.key', value: true }]
      })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toContain('Invalid setting key');
  });

  it('returns 400 for invalid boolean value', async () => {
    const ctx = await getSeedSyncContext();
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId,
        settings: [{ key: TEST_BOOLEAN_KEY, value: 'not-a-boolean' }]
      })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toContain(`Invalid value for ${TEST_BOOLEAN_KEY}`);
  });

  it('returns 400 for invalid integer value - below minimum', async () => {
    const ctx = await getSeedSyncContext();
    // feature.pos.sync_interval_seconds has min of 5
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId,
        settings: [{ key: 'feature.pos.sync_interval_seconds', value: 2 }]
      })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 for invalid enum value', async () => {
    const ctx = await getSeedSyncContext();
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId,
        settings: [{ key: TEST_ENUM_KEY, value: 'INVALID' }]
      })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toContain(`Invalid value for ${TEST_ENUM_KEY}`);
  });

  it('updates boolean setting successfully', async () => {
    const ctx = await getSeedSyncContext();
    
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId,
        settings: [{ key: TEST_BOOLEAN_KEY, value: false }]
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.outlet_id).toBe(ctx.outletId);
    expect(body.data.settings).toHaveLength(1);
    expect(body.data.settings[0].key).toBe(TEST_BOOLEAN_KEY);
    expect(body.data.settings[0].value).toBe(false);
    expect(body.data.settings[0].value_type).toBe('boolean');
  });

  it('updates integer setting successfully', async () => {
    const ctx = await getSeedSyncContext();
    
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId,
        settings: [{ key: 'feature.pos.sync_interval_seconds', value: 120 }]
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.settings[0].key).toBe('feature.pos.sync_interval_seconds');
    expect(body.data.settings[0].value).toBe(120);
    expect(body.data.settings[0].value_type).toBe('number');
  });

  it('updates enum setting successfully with valid value', async () => {
    const ctx = await getSeedSyncContext();
    
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId,
        settings: [{ key: TEST_ENUM_KEY, value: 'FIFO' }]
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.settings[0].key).toBe(TEST_ENUM_KEY);
    expect(body.data.settings[0].value).toBe('FIFO');
    expect(body.data.settings[0].value_type).toBe('string');
  });

  it('updates multiple settings in single request', async () => {
    const ctx = await getSeedSyncContext();
    
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId,
        settings: [
          { key: TEST_BOOLEAN_KEY, value: true },
          { key: 'feature.pos.sync_interval_seconds', value: 30 },
          { key: 'feature.sales.tax_included_default', value: false }
        ]
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.settings).toHaveLength(3);
  });

  it('coerces string number to integer', async () => {
    const ctx = await getSeedSyncContext();
    
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId,
        settings: [{ key: 'feature.pos.sync_interval_seconds', value: '60' }]
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.settings[0].value).toBe(60);
  });

  it('coerces string boolean to boolean', async () => {
    const ctx = await getSeedSyncContext();
    
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId,
        settings: [{ key: TEST_BOOLEAN_KEY, value: 'false' }]
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.settings[0].value).toBe(false);
  });

  it('PUT method works same as PATCH', async () => {
    const ctx = await getSeedSyncContext();
    
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId,
        settings: [{ key: 'feature.inventory.allow_backorder', value: true }]
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.settings[0].key).toBe('feature.inventory.allow_backorder');
    expect(body.data.settings[0].value).toBe(true);
  });

  it('validates inventory.low_stock_threshold minimum value', async () => {
    const ctx = await getSeedSyncContext();
    
    const res = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId,
        settings: [{ key: 'inventory.low_stock_threshold', value: -1 }]
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('validates feature.reservation.default_duration_minutes range', async () => {
    const ctx = await getSeedSyncContext();
    
    // Test above max (480)
    const resAboveMax = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId,
        settings: [{ key: 'feature.reservation.default_duration_minutes', value: 500 }]
      })
    });

    expect(resAboveMax.status).toBe(400);
    
    // Test below min (15)
    const resBelowMin = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId,
        settings: [{ key: 'feature.reservation.default_duration_minutes', value: 10 }]
      })
    });

    expect(resBelowMin.status).toBe(400);
  });

  it('accepts valid inventory.costing_method values', async () => {
    const ctx = await getSeedSyncContext();
    const validMethods = ['AVG', 'FIFO', 'LIFO'];
    
    for (const method of validMethods) {
      const res = await fetch(`${baseUrl}/api/settings/config`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          outlet_id: ctx.outletId,
          settings: [{ key: TEST_ENUM_KEY, value: method }]
        })
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.settings[0].value).toBe(method);
    }
  });

  it('outlet setting can be updated and retrieved', async () => {
    const ctx = await getSeedSyncContext();
    
    // Update outlet setting to a known value
    const settingKey = TEST_BOOLEAN_KEY;
    const newValue = true;
    
    const updateRes = await fetch(`${baseUrl}/api/settings/config`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outlet_id: ctx.outletId,
        settings: [{ key: settingKey, value: newValue }]
      })
    });

    expect(updateRes.status).toBe(200);
    const updateBody = await updateRes.json();
    expect(updateBody.data.settings[0].value).toBe(newValue);
    
    // Query the setting back
    const getRes = await fetch(`${baseUrl}/api/settings/config?outlet_id=${ctx.outletId}&keys=${settingKey}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.settings[0].value).toBe(newValue);
  });
});
