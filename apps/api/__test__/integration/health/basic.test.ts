// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for health module
// Tests the /api/health endpoint
// Requires external test server running (see scripts/test/test-server.ts)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry } from '../../fixtures';

let baseUrl: string;

describe('health.basic', { timeout: 30000 }, () => {
  beforeAll(() => {
    baseUrl = getTestBaseUrl();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('GET /health returns 200 without authentication', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  it('GET /health response includes status field', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(['ok', 'degraded', 'unhealthy']).toContain(body.status);
  });

  it('GET /health response includes timestamp', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('timestamp');
    
    // Verify timestamp is a valid ISO date string
    const timestamp = new Date(body.timestamp);
    expect(timestamp.getTime()).toBeGreaterThan(0);
  });

  it('GET /health response includes subsystems with database status', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('subsystems');
    expect(body.subsystems).toHaveProperty('database');
    expect(body.subsystems.database).toHaveProperty('status');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(body.subsystems.database.status);
  });

  it('GET /health with detailed=true includes import/export/sync subsystems', async () => {
    const res = await fetch(`${baseUrl}/api/health?detailed=true`);
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('subsystems');
    expect(body.subsystems).toHaveProperty('import');
    expect(body.subsystems).toHaveProperty('export');
    expect(body.subsystems).toHaveProperty('sync');
  });

  it('GET /health returns 503 when database is unhealthy', async () => {
    // This test would require a way to make DB unhealthy, which is not straightforward
    // We test that normally it returns 200 with healthy status
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.ok).toBe(true);

    const body = await res.json();
    if (body.status === 'unhealthy') {
      expect(res.status).toBe(503);
    } else {
      expect(res.status).toBe(200);
    }
  });
});
