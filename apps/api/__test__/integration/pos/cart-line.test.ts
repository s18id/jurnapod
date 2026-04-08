// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for POST /api/pos/cart/line
// Tests adding/updating cart lines with variant support

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { getTestDb, closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  createTestItem,
  createTestVariant,
  createTestPrice,
  registerFixtureCleanup
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('pos.cart-line', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth token', async () => {
    const res = await fetch(`${baseUrl}/api/pos/cart/line`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: 1, qty: 1 })
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await fetch(`${baseUrl}/api/pos/cart/line`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: 'invalid json'
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 for missing item_id', async () => {
    const res = await fetch(`${baseUrl}/api/pos/cart/line`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ qty: 1 })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid item_id format', async () => {
    const res = await fetch(`${baseUrl}/api/pos/cart/line`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ item_id: 'invalid', qty: 1 })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('resolves effective price using variant price resolver', async () => {
    const ctx = await getSeedSyncContext();
    const db = getTestDb();

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `CART-LINE-PRICE-${Date.now()}`,
      name: 'Cart Line Price Test',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create default price
    await createTestPrice(ctx.companyId, item.id, {
      price: 10000,
      isActive: true
    });
    registerFixtureCleanup(`price-${item.id}`, async () => {
      await db.deleteFrom('item_prices').where('item_id', '=', item.id).execute();
    });

    // Add item to cart without variant
    const res = await fetch(`${baseUrl}/api/pos/cart/line`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.id,
        qty: 2
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.item_id).toBe(item.id);
    expect(body.data.unit_price).toBe(10000);
    expect(body.data.line_total).toBe(20000);
    expect(body.data.is_valid).toBe(true);
  });

  it('resolves variant-specific price when variant_id provided', async () => {
    const ctx = await getSeedSyncContext();
    const db = getTestDb();

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `CART-LINE-VAR-${Date.now()}`,
      name: 'Cart Line Variant Test',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create a variant
    const variant = await createTestVariant(item.id, {
      attributeName: 'Size',
      attributeValues: ['Large']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    // Create default price
    await createTestPrice(ctx.companyId, item.id, {
      price: 10000,
      isActive: true
    });

    // Create variant-specific price (higher)
    await createTestPrice(ctx.companyId, item.id, {
      variantId: variant.id,
      price: 15000,
      isActive: true
    });
    registerFixtureCleanup(`prices-${item.id}`, async () => {
      await db.deleteFrom('item_prices').where('item_id', '=', item.id).execute();
    });

    // Add item to cart with variant
    const res = await fetch(`${baseUrl}/api/pos/cart/line`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.id,
        variant_id: variant.id,
        qty: 1
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.item_id).toBe(item.id);
    expect(body.data.variant_id).toBe(variant.id);
    expect(body.data.unit_price).toBe(15000); // Variant price takes precedence
    expect(body.data.is_variant_specific).toBe(true);
    expect(body.data.variant_name_snapshot).toBe(variant.variant_name);
  });

  it('validates variant belongs to item', async () => {
    const ctx = await getSeedSyncContext();
    const db = getTestDb();

    // Create two test items
    const item1 = await createTestItem(ctx.companyId, {
      sku: `CART-LINE-ITEM1-${Date.now()}`,
      name: 'Cart Line Item 1',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item1.id}`, async () => {});

    const item2 = await createTestItem(ctx.companyId, {
      sku: `CART-LINE-ITEM2-${Date.now()}`,
      name: 'Cart Line Item 2',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item2-${item2.id}`, async () => {});

    // Create variant for item1
    const variant = await createTestVariant(item1.id, {
      attributeName: 'Size',
      attributeValues: ['Medium']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    // Try to add item2 to cart with variant from item1
    const res = await fetch(`${baseUrl}/api/pos/cart/line`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item2.id,
        variant_id: variant.id,
        qty: 1
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toContain('does not belong to');
  });

  it('returns 404 for non-existent variant', async () => {
    const ctx = await getSeedSyncContext();

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `CART-LINE-NO-VAR-${Date.now()}`,
      name: 'Cart Line No Variant',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/pos/cart/line`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.id,
        variant_id: 999999999,
        qty: 1
      })
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for inactive variant', async () => {
    const ctx = await getSeedSyncContext();
    const db = getTestDb();

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `CART-LINE-INACTIVE-${Date.now()}`,
      name: 'Cart Line Inactive Variant',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create variant
    const variant = await createTestVariant(item.id, {
      attributeName: 'Status',
      attributeValues: ['WillBeInactive']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    // Mark variant as inactive
    await db.updateTable('item_variants')
      .set({ is_active: 0 })
      .where('id', '=', variant.id)
      .execute();

    const res = await fetch(`${baseUrl}/api/pos/cart/line`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.id,
        variant_id: variant.id,
        qty: 1
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toContain('not active');
  });

  it('applies discount amount correctly', async () => {
    const ctx = await getSeedSyncContext();
    const db = getTestDb();

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `CART-LINE-DISC-${Date.now()}`,
      name: 'Cart Line Discount Test',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create price
    await createTestPrice(ctx.companyId, item.id, {
      price: 10000,
      isActive: true
    });
    registerFixtureCleanup(`price-${item.id}`, async () => {
      await db.deleteFrom('item_prices').where('item_id', '=', item.id).execute();
    });

    const res = await fetch(`${baseUrl}/api/pos/cart/line`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.id,
        qty: 2,
        discount_amount: 500
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.unit_price).toBe(10000);
    expect(body.data.qty).toBe(2);
    expect(body.data.discount_amount).toBe(500);
    // line_total = (10000 * 2) - 500 = 19500
    expect(body.data.line_total).toBe(19500);
  });

  it('returns correct cart line structure', async () => {
    const ctx = await getSeedSyncContext();
    const db = getTestDb();

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `CART-LINE-STRUCT-${Date.now()}`,
      name: 'Cart Line Structure Test',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create price
    await createTestPrice(ctx.companyId, item.id, {
      price: 10000,
      isActive: true
    });
    registerFixtureCleanup(`price-${item.id}`, async () => {
      await db.deleteFrom('item_prices').where('item_id', '=', item.id).execute();
    });

    const res = await fetch(`${baseUrl}/api/pos/cart/line`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.id,
        qty: 1
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('item_id');
    expect(body.data).toHaveProperty('variant_id');
    expect(body.data).toHaveProperty('qty');
    expect(body.data).toHaveProperty('unit_price');
    expect(body.data).toHaveProperty('price_id');
    expect(body.data).toHaveProperty('is_variant_specific');
    expect(body.data).toHaveProperty('source');
    expect(body.data).toHaveProperty('discount_amount');
    expect(body.data).toHaveProperty('line_total');
    expect(body.data).toHaveProperty('sku_snapshot');
    expect(body.data).toHaveProperty('variant_name_snapshot');
    expect(body.data).toHaveProperty('barcode');
    expect(body.data).toHaveProperty('stock_quantity');
    expect(body.data).toHaveProperty('is_valid');
  });
});
