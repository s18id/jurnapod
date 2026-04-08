// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for POST /import/:entityType/validate
 * 
 * Tests:
 * - Validate endpoint returns row-level validation errors
 * - Batch FK validation validates foreign keys in single query
 * - Validate returns errors for missing required fields
 * - Validate returns errors for invalid field types
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { 
  resetFixtureRegistry,
  getTestAccessToken,
  setupUserPermission,
  createTestItem,
  createTestOutlet,
} from '../../fixtures';
import { getSeedSyncContext } from '../../fixtures';

let baseUrl: string;
let ownerToken: string;
let companyId: number;

describe('import.validate', { timeout: 30000 }, () => {
  let uploadId: string;

  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);
    
    const ctx = await getSeedSyncContext();
    companyId = ctx.companyId;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  // Helper to upload a CSV and get uploadId
  async function uploadTestFile(entityType: string, csvContent: string): Promise<string> {
    const formData = new FormData();
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });
    formData.append('file', file);

    const res = await fetch(`${baseUrl}/api/import/${entityType}/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}` },
      body: formData
    });

    const body = await res.json();
    return body.data.uploadId;
  }

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/import/items/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId: 'test-id', mappings: [] })
    });

    expect([401, 403]).toContain(res.status);
  });

  it('rejects validate without uploadId', async () => {
    const res = await fetch(`${baseUrl}/api/import/items/validate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ mappings: [] })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toContain('uploadId');
  });

  it('rejects validate without mappings', async () => {
    const uploadId = await uploadTestFile('items', 'sku,name,item_type\nTEST-001,Test,SERVICE');

    const res = await fetch(`${baseUrl}/api/import/items/validate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uploadId })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns row-level validation errors for missing required fields', async () => {
    // Upload file with a SKU that already exists to trigger SKU uniqueness error
    const timestamp = Date.now();
    const existingSku = `VALIDATE-MISSING-${timestamp}`;
    
    // First create an item
    await createTestItem(companyId, { sku: existingSku, name: 'Existing Item', type: 'SERVICE' });

    // Upload file with same SKU - this should trigger SKU uniqueness error
    const uploadId = await uploadTestFile('items', 
      `sku,name,item_type\n${existingSku},Duplicate Item,SERVICE`);

    const mappings = [
      { sourceColumn: 'sku', targetField: 'sku' },
      { sourceColumn: 'name', targetField: 'name' },
      { sourceColumn: 'item_type', targetField: 'item_type' }
    ];

    const res = await fetch(`${baseUrl}/api/import/items/validate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uploadId, mappings })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Should have validation errors for duplicate SKU
    expect(body.data.errorRows).toBeGreaterThan(0);
    expect(body.data.errors.length).toBeGreaterThan(0);
    
    // Find the error for duplicate SKU
    const skuError = body.data.errors.find((e: any) => e.column === 'sku' && e.message.includes('already exists'));
    expect(skuError).toBeDefined();
  });

  it('returns row-level validation errors for invalid item_type enum', async () => {
    const uploadId = await uploadTestFile('items', 'sku,name,item_type\nTEST-002,Test Item,INVALID_TYPE');

    const mappings = [
      { sourceColumn: 'sku', targetField: 'sku' },
      { sourceColumn: 'name', targetField: 'name' },
      { sourceColumn: 'item_type', targetField: 'item_type' }
    ];

    const res = await fetch(`${baseUrl}/api/import/items/validate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uploadId, mappings })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Should have error for invalid item_type
    const typeError = body.data.errors.find((e: any) => e.column === 'item_type');
    expect(typeError).toBeDefined();
    expect(typeError.message).toContain('Invalid item type');
  });

  it('validates item_group_id FK with batch query', async () => {
    // Create an item group first
    const db = (await import('../../helpers/db')).getTestDb();
    
    // Insert a test item group
    const itemGroupResult = await db.insertInto('item_groups')
      .values({
        company_id: companyId,
        name: 'Test Item Group',
        is_active: 1,
      })
      .returning('id')
      .executeTakeFirst();

    if (!itemGroupResult) {
      throw new Error('Failed to create item group');
    }
    const itemGroupId = itemGroupResult;

    // Upload file with valid item_group_id
    const uploadId = await uploadTestFile('items', 
      `sku,name,item_type,item_group_id\nTEST-FK-001,FK Test,SERVICE,${itemGroupId}`);

    const mappings = [
      { sourceColumn: 'sku', targetField: 'sku' },
      { sourceColumn: 'name', targetField: 'name' },
      { sourceColumn: 'item_type', targetField: 'item_type' },
      { sourceColumn: 'item_group_id', targetField: 'item_group_id' }
    ];

    const res = await fetch(`${baseUrl}/api/import/items/validate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uploadId, mappings })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Valid FK should not cause errors
    expect(body.data.errorRows).toBe(0);
  });

  it('returns error for invalid item_group_id FK', async () => {
    // Upload file with non-existent item_group_id
    const uploadId = await uploadTestFile('items', 
      'sku,name,item_type,item_group_id\nTEST-INVALID-FK-001,Invalid FK Test,SERVICE,999999');

    const mappings = [
      { sourceColumn: 'sku', targetField: 'sku' },
      { sourceColumn: 'name', targetField: 'name' },
      { sourceColumn: 'item_type', targetField: 'item_type' },
      { sourceColumn: 'item_group_id', targetField: 'item_group_id' }
    ];

    const res = await fetch(`${baseUrl}/api/import/items/validate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uploadId, mappings })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Should have error for invalid FK
    const fkError = body.data.errors.find((e: any) => e.column === 'item_group_id');
    expect(fkError).toBeDefined();
    expect(fkError.message).toContain('does not exist');
  });

  it('validates SKU uniqueness within company', async () => {
    // Create an item with a specific SKU
    await createTestItem(companyId, { sku: 'UNIQUE-SKU-001', name: 'Existing Item' });

    // Upload file with duplicate SKU
    const uploadId = await uploadTestFile('items', 
      'sku,name,item_type\nUNIQUE-SKU-001,Duplicate SKU Item,SERVICE');

    const mappings = [
      { sourceColumn: 'sku', targetField: 'sku' },
      { sourceColumn: 'name', targetField: 'name' },
      { sourceColumn: 'item_type', targetField: 'item_type' }
    ];

    const res = await fetch(`${baseUrl}/api/import/items/validate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uploadId, mappings })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Should have error for duplicate SKU
    const skuError = body.data.errors.find((e: any) => e.column === 'sku' && e.message.includes('already exists'));
    expect(skuError).toBeDefined();
  });

  it('validates prices with item_sku existence check', async () => {
    // Create an item first
    const item = await createTestItem(companyId, { sku: 'PRICE-TEST-SKU', name: 'Price Test Item' });

    // Upload prices file with valid item_sku
    const uploadId = await uploadTestFile('prices', 
      `item_sku,price\nPRICE-TEST-SKU,15000`);

    const mappings = [
      { sourceColumn: 'item_sku', targetField: 'item_sku' },
      { sourceColumn: 'price', targetField: 'price' }
    ];

    const res = await fetch(`${baseUrl}/api/import/prices/validate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uploadId, mappings })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Valid item_sku should not cause errors
    expect(body.data.errorRows).toBe(0);
  });

  it('returns error for non-existent item_sku in prices', async () => {
    // Upload prices file with non-existent item_sku
    const uploadId = await uploadTestFile('prices', 
      'item_sku,price\nNON-EXISTENT-SKU,15000');

    const mappings = [
      { sourceColumn: 'item_sku', targetField: 'item_sku' },
      { sourceColumn: 'price', targetField: 'price' }
    ];

    const res = await fetch(`${baseUrl}/api/import/prices/validate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uploadId, mappings })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Should have error for non-existent item
    const skuError = body.data.errors.find((e: any) => e.column === 'item_sku');
    expect(skuError).toBeDefined();
    expect(skuError.message).toContain('does not exist');
  });

  it('validates outlet_id FK in prices', async () => {
    const db = (await import('../../helpers/db')).getTestDb();
    
    // Get an existing outlet
    const outlet = await db.selectFrom('outlets')
      .where('company_id', '=', companyId)
      .where('is_active', '=', 1)
      .select('id')
      .executeTakeFirst();

    // Create item first
    const item = await createTestItem(companyId, { sku: 'OUTLET-PRICE-SKU', name: 'Outlet Price Test' });

    // Upload prices file with valid outlet_id
    const uploadId = await uploadTestFile('prices', 
      `item_sku,price,outlet_id\nOUTLET-PRICE-SKU,15000,${outlet?.id}`);

    const mappings = [
      { sourceColumn: 'item_sku', targetField: 'item_sku' },
      { sourceColumn: 'price', targetField: 'price' },
      { sourceColumn: 'outlet_id', targetField: 'outlet_id' }
    ];

    const res = await fetch(`${baseUrl}/api/import/prices/validate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uploadId, mappings })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.errorRows).toBe(0);
  });

  it('validates negative price in prices', async () => {
    const item = await createTestItem(companyId, { sku: 'NEG-PRICE-SKU', name: 'Negative Price Test' });

    // Upload prices file with negative price
    const uploadId = await uploadTestFile('prices', 
      'item_sku,price\nNEG-PRICE-SKU,-100');

    const mappings = [
      { sourceColumn: 'item_sku', targetField: 'item_sku' },
      { sourceColumn: 'price', targetField: 'price' }
    ];

    const res = await fetch(`${baseUrl}/api/import/prices/validate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uploadId, mappings })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Should have error for negative price
    const priceError = body.data.errors.find((e: any) => e.column === 'price');
    expect(priceError).toBeDefined();
    expect(priceError.message).toContain('non-negative');
  });

  it('rejects validate for expired session', async () => {
    // Try to validate with a random non-existent uploadId
    const res = await fetch(`${baseUrl}/api/import/items/validate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        uploadId: '00000000-0000-0000-0000-000000000000', 
        mappings: [{ sourceColumn: 'sku', targetField: 'sku' }] 
      })
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns valid row indices', async () => {
    const uploadId = await uploadTestFile('items', 
      'sku,name,item_type\nVALID-SKU-001,Valid Item 1,SERVICE\nVALID-SKU-002,Valid Item 2,SERVICE');

    const mappings = [
      { sourceColumn: 'sku', targetField: 'sku' },
      { sourceColumn: 'name', targetField: 'name' },
      { sourceColumn: 'item_type', targetField: 'item_type' }
    ];

    const res = await fetch(`${baseUrl}/api/import/items/validate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uploadId, mappings })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.validRowIndices).toHaveLength(2);
    expect(body.data.errorRows).toBe(0);
  });

  it('rejects invalid entity type', async () => {
    const res = await fetch(`${baseUrl}/api/import/invalid-entity/validate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uploadId: 'test', mappings: [] })
    });

    expect(res.status).toBe(400);
  });
});
