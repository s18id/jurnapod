// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for GET /api/pos/items/:id/variants
// Tests variant listing with resolved prices for POS cart

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext,
  createTestItem,
  createTestVariant,
  createTestPrice,
  registerFixtureCleanup
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('pos.item-variants', { timeout: 30000 }, () => {
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

  it('rejects request without auth token', async () => {
    const res = await fetch(`${baseUrl}/api/pos/items/1/variants`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid item ID format', async () => {
    const res = await fetch(`${baseUrl}/api/pos/items/invalid/variants`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns empty variants for non-existent item', async () => {
    const res = await fetch(`${baseUrl}/api/pos/items/999999999/variants`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    // Note: getItemVariants returns empty array for non-existent items,
    // so the route returns 200 with empty variants (not 404)
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.item_id).toBe(999999999);
    expect(body.data.variants).toEqual([]);
    expect(body.data.count).toBe(0);
  });

  it('returns active variants with resolved prices', async () => {
    const ctx = await getSeedSyncContext();

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `POS-VAR-TEST-${Date.now()}`,
      name: 'POS Variant Test Item',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create a variant
    const variant = await createTestVariant(item.id, {
      attributeName: 'Size',
      attributeValues: ['Small', 'Medium', 'Large']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    // Create a price for the item (default price)
    const db = await import('../../helpers/db').then(m => m.getTestDb());
    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, {
      price: 10000,
      isActive: true
    });

    registerFixtureCleanup(`price-item-${item.id}`, async () => {
      await db.deleteFrom('item_prices').where('item_id', '=', item.id).execute();
    });

    // Get variants for the item
    const res = await fetch(`${baseUrl}/api/pos/items/${item.id}/variants`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.item_id).toBe(item.id);
    expect(Array.isArray(body.data.variants)).toBe(true);
    expect(body.data.count).toBeGreaterThan(0);

    // All returned variants should be active
    for (const v of body.data.variants) {
      expect(v.is_active).toBe(true);
      expect(v.price).toBeDefined();
      expect(typeof v.price).toBe('number');
    }
  });

  it('returns variants with outlet-specific pricing when outlet_id provided', async () => {
    const ctx = await getSeedSyncContext();

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `POS-VAR-OUTLET-${Date.now()}`,
      name: 'POS Variant Outlet Test Item',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create a variant
    const variant = await createTestVariant(item.id, {
      attributeName: 'Color',
      attributeValues: ['Red', 'Blue']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    // Create item default price
    const db = await import('../../helpers/db').then(m => m.getTestDb());
    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, {
      price: 10000,
      isActive: true
    });

    // Create outlet-specific price for the variant
    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, {
      outletId: ctx.outletId,
      variantId: variant.id,
      price: 15000,
      isActive: true
    });

    registerFixtureCleanup(`prices-${item.id}`, async () => {
      await db.deleteFrom('item_prices').where('item_id', '=', item.id).execute();
    });

    // Get variants with outlet_id query param
    const res = await fetch(`${baseUrl}/api/pos/items/${item.id}/variants?outlet_id=${ctx.outletId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.variants)).toBe(true);

    // Find our variant and check it has the outlet-specific price
    const ourVariant = body.data.variants.find((v: any) => v.id === variant.id);
    expect(ourVariant).toBeDefined();
    expect(ourVariant.price).toBe(15000);
    expect(ourVariant.is_variant_specific).toBe(true);
    expect(ourVariant.source).toBe('variant_outlet');
  });

  it('only returns active variants', async () => {
    const ctx = await getSeedSyncContext();
    const db = await import('../../helpers/db').then(m => m.getTestDb());

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `POS-VAR-ACTIVE-${Date.now()}`,
      name: 'POS Active Variants Test',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create a variant with two values in one call (so both are created together)
    const variant = await createTestVariant(item.id, {
      attributeName: 'Status',
      attributeValues: ['Active', 'Inactive']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    // Get all variants for this item to find the one we want to mark inactive
    const allVariantsResult = await db
      .selectFrom('item_variants')
      .where('item_id', '=', item.id)
      .where('company_id', '=', ctx.companyId)
      .select(['id', 'variant_name', 'is_active'])
      .execute();

    // Find the variant with 'Inactive' in the name
    const inactiveVariantRow = allVariantsResult.find((v: any) => 
      v.variant_name.includes('Inactive')
    );
    
    // Find the variant with 'Active' in the name  
    const activeVariantRow = allVariantsResult.find((v: any) => 
      v.variant_name.includes('Active')
    );

    if (!inactiveVariantRow || !activeVariantRow) {
      throw new Error('Could not find expected variants');
    }

    // Mark the 'Inactive' variant as inactive
    await db.updateTable('item_variants')
      .set({ is_active: 0 })
      .where('id', '=', inactiveVariantRow.id)
      .execute();

    // Get variants
    const res = await fetch(`${baseUrl}/api/pos/items/${item.id}/variants`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // All returned variants should be active
    for (const v of body.data.variants) {
      expect(v.is_active).toBe(true);
    }
    
    // The inactive variant should not be in the list
    const variantIds = body.data.variants.map((v: any) => v.id);
    expect(variantIds).not.toContain(inactiveVariantRow.id);
    // The active variant should be present
    expect(variantIds).toContain(activeVariantRow.id);
  });

  it('returns variant resolved prices with correct structure', async () => {
    const ctx = await getSeedSyncContext();

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `POS-VAR-STRUCT-${Date.now()}`,
      name: 'POS Variant Structure Test',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create a variant
    const variant = await createTestVariant(item.id, {
      attributeName: 'Pack',
      attributeValues: ['Single']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    // Create default price
    const db = await import('../../helpers/db').then(m => m.getTestDb());
    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, {
      price: 25000,
      isActive: true
    });

    registerFixtureCleanup(`price-${item.id}`, async () => {
      await db.deleteFrom('item_prices').where('item_id', '=', item.id).execute();
    });

    // Get variants
    const res = await fetch(`${baseUrl}/api/pos/items/${item.id}/variants`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const ourVariant = body.data.variants.find((v: any) => v.id === variant.id);
    expect(ourVariant).toBeDefined();

    // Check variant structure
    expect(ourVariant).toHaveProperty('id');
    expect(ourVariant).toHaveProperty('item_id');
    expect(ourVariant).toHaveProperty('sku');
    expect(ourVariant).toHaveProperty('variant_name');
    expect(ourVariant).toHaveProperty('price');
    expect(ourVariant).toHaveProperty('price_id');
    expect(ourVariant).toHaveProperty('is_variant_specific');
    expect(ourVariant).toHaveProperty('source');
    expect(ourVariant).toHaveProperty('stock_quantity');
    expect(ourVariant).toHaveProperty('barcode');
    expect(ourVariant).toHaveProperty('is_active');
    expect(ourVariant).toHaveProperty('attributes');
  });

  it('enforces authentication and returns 401 without valid token', async () => {
    const res = await fetch(`${baseUrl}/api/pos/items/1/variants`);
    expect(res.status).toBe(401);
  });
});
