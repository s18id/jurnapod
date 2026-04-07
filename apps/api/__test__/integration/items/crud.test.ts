// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// /**
//  * Integration tests for items.crud
//  * 
//  * Tests item CRUD operations via HTTP.
//  * Uses the shared test server via RWLock pattern.
//  */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { createTestCompany, createTestItem, cleanupTestFixtures, getTestAccessToken } from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('items.crud', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
  });

  it('healthcheck returns ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.ok).toBe(true);
  });

  it('creates a test company via fixtures', async () => {
    const company = await createTestCompany({
      code: 'TESTITEM',
      name: 'Test Item Company'
    });
    
    expect(company.id).toBeGreaterThan(0);
    
    // Verify company exists
    const db = getTestDb();
    const result = await db
      .selectFrom('companies')
      .where('id', '=', company.id)
      .selectAll()
      .executeTakeFirst();
    
    expect(result).toBeDefined();
  });

  it('inventory items endpoint rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'GET'
    });
    
    // Should be 401 or 403 without auth
    expect([401, 403]).toContain(res.status);
  });

  it('inventory items endpoint returns empty list with auth', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('creates an item via fixture', async () => {
    const company = await createTestCompany({
      code: 'TESTITEM2',
      name: 'Test Item Company 2'
    });
    
    const item = await createTestItem(company.id, {
      sku: 'TEST-SKU-001',
      name: 'Test Product',
      type: 'PRODUCT'
    });
    
    expect(item.id).toBeGreaterThan(0);
    expect(item.sku).toBe('TEST-SKU-001');
    expect(item.name).toBe('Test Product');
    expect(item.type).toBe('PRODUCT');
  });

  it('retrieves items via API with valid auth', async () => {
    // Query items via API - returns items for the authenticated user's company
    const res = await fetch(`${baseUrl}/api/inventory/items`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    // Just verify we get a list response - items are company-scoped
  });
});
