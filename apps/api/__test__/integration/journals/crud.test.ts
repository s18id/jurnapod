// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// /**
//  * Integration tests for journals.crud
//  * 
//  * Tests journal CRUD operations via HTTP.
//  * Uses the shared test server via RWLock pattern.
//  */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken } from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('journals.crud', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('healthcheck returns ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.ok).toBe(true);
  });

  it('journals endpoint rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/journals`, {
      method: 'GET'
    });
    
    // Should be 401 without auth
    expect(res.status).toBe(401);
  });

  it('journals endpoint returns list with auth', async () => {
    const res = await fetch(`${baseUrl}/api/journals`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Response data should be defined (structure may vary)
    expect(body.data).toBeDefined();
  });

  it('journals endpoint with date filters works', async () => {
    const res = await fetch(`${baseUrl}/api/journals?start_date=2024-01-01&end_date=2024-12-31`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });
});
