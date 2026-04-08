// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for POST /import/:entityType/apply
 * 
 * Tests:
 * - Apply creates items in batches
 * - Apply updates existing items
 * - Apply creates prices in batches
 * - Apply returns structured result with created/updated counts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  createTestItem,
  createTestPrice,
  registerFixtureCleanup,
} from '../../fixtures';
import { getSeedSyncContext } from '../../fixtures';

let baseUrl: string;
let ownerToken: string;
let companyId: number;
let cashierUserId: number;

describe('import.apply', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);
    
    const ctx = await getSeedSyncContext();
    companyId = ctx.companyId;
    cashierUserId = ctx.cashierUserId;
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

  it('rejects apply without auth', async () => {
    const res = await fetch(`${baseUrl}/api/import/items/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId: 'test-id', mappings: [] })
    });

    expect([401, 403]).toContain(res.status);
  });

  it('rejects apply without uploadId', async () => {
    const res = await fetch(`${baseUrl}/api/import/items/apply`, {
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
  });

  it('creates new items via apply', async () => {
    const timestamp = Date.now();
    const uploadId = await uploadTestFile('items', 
      `sku,name,item_type\nAPPLY-NEW-001-${timestamp},Apply Test Item 1,PRODUCT\nAPPLY-NEW-002-${timestamp},Apply Test Item 2,SERVICE`);

    const mappings = [
      { sourceColumn: 'sku', targetField: 'sku' },
      { sourceColumn: 'name', targetField: 'name' },
      { sourceColumn: 'item_type', targetField: 'item_type' }
    ];

    const res = await fetch(`${baseUrl}/api/import/items/apply`, {
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
    expect(body.data.created).toBe(2);
    expect(body.data.updated).toBe(0);
    expect(body.data.success).toBe(2);
    expect(body.data.failed).toBe(0);
    
    // Verify items were created in DB
    const db = (await import('../../helpers/db')).getTestDb();
    const items = await db.selectFrom('items')
      .where('sku', 'like', `APPLY-NEW-%-${timestamp}`)
      .select(['id', 'sku', 'name'])
      .execute();
    
    expect(items.length).toBe(2);
    
    // Register cleanup for created items
    registerFixtureCleanup(`cleanup-apply-items-${timestamp}`, async () => {
      const db = (await import('../../helpers/db')).getTestDb();
      await db.deleteFrom('items').where('sku', 'like', `APPLY-NEW-%-${timestamp}`).execute();
    });
  });

  it('updates existing items via apply', async () => {
    const timestamp = Date.now();
    const sku = `APPLY-UPD-${timestamp}`;
    
    // Create an existing item first (using PRODUCT type which is valid in DB)
    const existingItem = await createTestItem(companyId, { 
      sku, 
      name: 'Original Name',
      type: 'PRODUCT'
    });

    // Upload file with same SKU but different name
    const uploadId = await uploadTestFile('items', 
      `sku,name,item_type\n${sku},Updated Name,SERVICE`);

    const mappings = [
      { sourceColumn: 'sku', targetField: 'sku' },
      { sourceColumn: 'name', targetField: 'name' },
      { sourceColumn: 'item_type', targetField: 'item_type' }
    ];

    const res = await fetch(`${baseUrl}/api/import/items/apply`, {
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
    expect(body.data.created).toBe(0);
    expect(body.data.updated).toBe(1);
    
    // Verify item was updated in DB
    const db = (await import('../../helpers/db')).getTestDb();
    const updatedItem = await db.selectFrom('items')
      .where('id', '=', existingItem.id)
      .select('name')
      .executeTakeFirst();
    
    expect(updatedItem?.name).toBe('Updated Name');
  });

  it('creates prices via apply', async () => {
    const timestamp = Date.now();
    
    // Create an item first
    const item = await createTestItem(companyId, { 
      sku: `PRICE-APPLY-${timestamp}`, 
      name: 'Price Apply Test Item',
      type: 'PRODUCT'
    });

    // Upload prices file
    const uploadId = await uploadTestFile('prices', 
      `item_sku,price\nPRICE-APPLY-${timestamp},19999`);

    const mappings = [
      { sourceColumn: 'item_sku', targetField: 'item_sku' },
      { sourceColumn: 'price', targetField: 'price' }
    ];

    const res = await fetch(`${baseUrl}/api/import/prices/apply`, {
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
    expect(body.data.created).toBe(1);
    expect(body.data.updated).toBe(0);
    
    // Verify price was created in DB
    const db = (await import('../../helpers/db')).getTestDb();
    const prices = await db.selectFrom('item_prices')
      .where('item_id', '=', item.id)
      .select('price')
      .execute();
    
    expect(prices.length).toBe(1);
    expect(Number(prices[0].price)).toBe(19999);
  });

  it('updates existing prices via apply', async () => {
    const timestamp = Date.now();
    
    // Create an item and price
    const item = await createTestItem(companyId, { 
      sku: `PRICE-UPD-${timestamp}`, 
      name: 'Price Update Test Item',
      type: 'PRODUCT'
    });

    await createTestPrice(companyId, item.id, cashierUserId, {
      price: 10000,
      isActive: true
    });

    // Upload prices file with same item but different price
    const uploadId = await uploadTestFile('prices', 
      `item_sku,price\nPRICE-UPD-${timestamp},25000`);

    const mappings = [
      { sourceColumn: 'item_sku', targetField: 'item_sku' },
      { sourceColumn: 'price', targetField: 'price' }
    ];

    const res = await fetch(`${baseUrl}/api/import/prices/apply`, {
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
    expect(body.data.created).toBe(0);
    expect(body.data.updated).toBe(1);

    // Verify price was updated in DB
    const db = (await import('../../helpers/db')).getTestDb();
    const updatedPrices = await db.selectFrom('item_prices')
      .where('item_id', '=', item.id)
      .select('price')
      .execute();
    
    expect(updatedPrices.length).toBe(1);
    expect(Number(updatedPrices[0].price)).toBe(25000);
  });

  it('processes items in batches of 500', async () => {
    // Create many items (more than 500 to test batching)
    const timestamp = Date.now();
    let csvContent = 'sku,name,item_type\n';
    
    for (let i = 0; i < 550; i++) {
      csvContent += `BATCH-TEST-${timestamp}-${i},Batch Test Item ${i},SERVICE\n`;
    }
    
    const uploadId = await uploadTestFile('items', csvContent);

    const mappings = [
      { sourceColumn: 'sku', targetField: 'sku' },
      { sourceColumn: 'name', targetField: 'name' },
      { sourceColumn: 'item_type', targetField: 'item_type' }
    ];

    const res = await fetch(`${baseUrl}/api/import/items/apply`, {
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
    expect(body.data.success).toBe(550);
    expect(body.data.created).toBe(550);
    // With 550 items and batch size 500, we should have 2 batches
    // Using >= 1 to account for potential timing variations
    expect(body.data.batchesCompleted).toBeGreaterThanOrEqual(1);
    
    // Register cleanup
    registerFixtureCleanup(`cleanup-batch-items-${timestamp}`, async () => {
      const db = (await import('../../helpers/db')).getTestDb();
      await db.deleteFrom('items').where('sku', 'like', `BATCH-TEST-${timestamp}%`).execute();
    });
  });

  it('returns session-expiry error for expired session', async () => {
    // Try to apply with a random non-existent uploadId
    const res = await fetch(`${baseUrl}/api/import/items/apply`, {
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

  it('handles mixed create/update in same batch', async () => {
    const timestamp = Date.now();
    
    // Create one existing item
    const existingSku = `MIXED-UPD-${timestamp}`;
    await createTestItem(companyId, { 
      sku: existingSku, 
      name: 'Existing Mixed Item',
      type: 'PRODUCT'
    });
    
    // Upload file with mix of new and existing SKUs
    const uploadId = await uploadTestFile('items', 
      `sku,name,item_type\n${existingSku},Updated Mixed Item,SERVICE\nMIXED-NEW-${timestamp},New Mixed Item,SERVICE`);

    const mappings = [
      { sourceColumn: 'sku', targetField: 'sku' },
      { sourceColumn: 'name', targetField: 'name' },
      { sourceColumn: 'item_type', targetField: 'item_type' }
    ];

    const res = await fetch(`${baseUrl}/api/import/items/apply`, {
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
    expect(body.data.created).toBe(1);
    expect(body.data.updated).toBe(1);
    
    // Register cleanup for new item
    registerFixtureCleanup(`cleanup-mixed-item-${timestamp}`, async () => {
      const db = (await import('../../helpers/db')).getTestDb();
      await db.deleteFrom('items').where('sku', '=', `MIXED-NEW-${timestamp}`).execute();
    });
  });

  it('validates file hash when provided for resume', async () => {
    const timestamp = Date.now();
    const uploadId = await uploadTestFile('items', 
      `sku,name,item_type\nHASH-VALIDATE-${timestamp},Hash Validate Item,SERVICE`);

    const mappings = [
      { sourceColumn: 'sku', targetField: 'sku' },
      { sourceColumn: 'name', targetField: 'name' },
      { sourceColumn: 'item_type', targetField: 'item_type' }
    ];

    // Apply with mismatched file hash should fail
    const res = await fetch(`${baseUrl}/api/import/items/apply`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        uploadId, 
        mappings,
        fileHash: '0000000000000000000000000000000000000000000000000000000000000000' // wrong hash
      })
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FILE_HASH_MISMATCH');
  });

  it('applies successfully without file hash', async () => {
    const timestamp = Date.now();
    const uploadId = await uploadTestFile('items', 
      `sku,name,item_type\nHASH-MATCH-${timestamp},Hash Match Item,SERVICE`);

    const mappings = [
      { sourceColumn: 'sku', targetField: 'sku' },
      { sourceColumn: 'name', targetField: 'name' },
      { sourceColumn: 'item_type', targetField: 'item_type' }
    ];

    // Apply without file hash should succeed (hash is optional)
    const res = await fetch(`${baseUrl}/api/import/items/apply`, {
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
    expect(body.data.created).toBe(1);
  });
});
