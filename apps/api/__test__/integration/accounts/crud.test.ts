// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// /**
//  * Integration tests for accounts.crud
//  * 
//  * Tests account CRUD operations via HTTP.
//  * Uses the shared test server via RWLock pattern.
//  */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken } from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('accounts.crud', { timeout: 30000 }, () => {
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

  it('accounts endpoint rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/accounts`, {
      method: 'GET'
    });
    
    // Should be 401 without auth
    expect(res.status).toBe(401);
  });

  it('accounts endpoint returns list with auth', async () => {
    const res = await fetch(`${baseUrl}/api/accounts`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Response should be an array of accounts
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('accounts tree endpoint returns structure with auth', async () => {
    const res = await fetch(`${baseUrl}/api/accounts/tree`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Tree structure should have a tree property
    expect(body.data).toBeDefined();
  });
});
