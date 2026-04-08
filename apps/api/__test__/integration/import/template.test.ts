// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for GET /import/:entityType/template
 * 
 * Tests:
 * - Template endpoint returns CSV template for items entity type
 * - Template endpoint returns CSV template for prices entity type
 * - Rejects invalid entity type
 * - Rejects request without auth
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { 
  resetFixtureRegistry,
  getTestAccessToken,
} from '../../fixtures';

let baseUrl: string;
let ownerToken: string;

describe('import.template', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/import/items/template`, {
      method: 'GET'
    });

    expect([401, 403]).toContain(res.status);
  });

  it('returns CSV template for items entity type', async () => {
    const res = await fetch(`${baseUrl}/api/import/items/template`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });

    expect(res.status).toBe(200);
    
    // Check content type is CSV
    expect(res.headers.get('content-type')).toContain('text/csv');
    
    // Check content disposition has filename
    const contentDisposition = res.headers.get('content-disposition');
    expect(contentDisposition).toContain('jurnapod-items-template.csv');
    
    // Get the CSV content
    const csvContent = await res.text();
    const lines = csvContent.trim().split('\n');
    
    // Should have header row and sample data row
    expect(lines.length).toBeGreaterThanOrEqual(2);
    
    // Parse header row
    const headers = lines[0].split(',');
    
    // Check required fields are present
    expect(headers).toContain('sku');
    expect(headers).toContain('name');
    expect(headers).toContain('item_type');
    
    // Check optional fields are present
    expect(headers).toContain('barcode');
    expect(headers).toContain('item_group_id');
    expect(headers).toContain('cogs_account_id');
    expect(headers).toContain('inventory_asset_account_id');
    expect(headers).toContain('is_active');
  });

  it('returns CSV template for prices entity type', async () => {
    const res = await fetch(`${baseUrl}/api/import/prices/template`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });

    expect(res.status).toBe(200);
    
    // Check content type is CSV
    expect(res.headers.get('content-type')).toContain('text/csv');
    
    // Check content disposition has filename
    const contentDisposition = res.headers.get('content-disposition');
    expect(contentDisposition).toContain('jurnapod-prices-template.csv');
    
    // Get the CSV content
    const csvContent = await res.text();
    const lines = csvContent.trim().split('\n');
    
    // Should have header row and sample data row
    expect(lines.length).toBeGreaterThanOrEqual(2);
    
    // Parse header row
    const headers = lines[0].split(',');
    
    // Check required fields are present
    expect(headers).toContain('item_sku');
    expect(headers).toContain('price');
    
    // Check optional fields are present
    expect(headers).toContain('item_name');
    expect(headers).toContain('outlet_id');
    expect(headers).toContain('is_active');
  });

  it('rejects invalid entity type', async () => {
    const res = await fetch(`${baseUrl}/api/import/invalid-entity/template`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toContain('Invalid entity type');
  });

  it('returns valid CSV that can be parsed', async () => {
    const res = await fetch(`${baseUrl}/api/import/items/template`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });

    expect(res.status).toBe(200);
    
    const csvContent = await res.text();
    
    // Should be valid CSV with proper structure
    const lines = csvContent.trim().split('\n');
    expect(lines.length).toBe(2); // Header + sample
    
    // Each line should have the same number of columns
    const headerCount = lines[0].split(',').length;
    const dataCount = lines[1].split(',').length;
    expect(headerCount).toBe(dataCount);
  });

  it('template has correct Content-Length header', async () => {
    const res = await fetch(`${baseUrl}/api/import/items/template`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });

    expect(res.status).toBe(200);
    
    const contentLength = res.headers.get('content-length');
    expect(contentLength).toBeDefined();
    
    const csvContent = await res.text();
    expect(Number(contentLength)).toBe(Buffer.byteLength(csvContent));
  });

  it('prices template has correct fields for price creation', async () => {
    const res = await fetch(`${baseUrl}/api/import/prices/template`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });

    expect(res.status).toBe(200);
    
    const csvContent = await res.text();
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(',');
    
    // item_sku is required for linking to existing items
    expect(headers).toContain('item_sku');
    
    // price is required
    expect(headers).toContain('price');
    
    // is_active defaults should be present
    expect(headers).toContain('is_active');
  });
});
