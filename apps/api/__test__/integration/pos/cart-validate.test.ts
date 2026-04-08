// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for POST /api/pos/cart/validate
// Tests cart line validation including price resolution and stock checking

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
import { sql } from 'kysely';

let baseUrl: string;
let accessToken: string;
let authTestItemId: number;

describe('pos.cart-validate', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    // Query a valid item ID for auth/validation tests (ID used only when auth passes)
    const ctx = await getSeedSyncContext();
    const db = getTestDb();
    const itemResult = await sql`
      SELECT id FROM items WHERE company_id = ${ctx.companyId} LIMIT 1
    `.execute(db);
    authTestItemId = Number((itemResult.rows[0] as { id: number }).id);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth token', async () => {
    const res = await fetch(`${baseUrl}/api/pos/cart/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: authTestItemId, qty: 1 })
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await fetch(`${baseUrl}/api/pos/cart/validate`, {
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

  it('returns 400 for missing required fields', async () => {
    const res = await fetch(`${baseUrl}/api/pos/cart/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('validates cart line without variant', async () => {
    const ctx = await getSeedSyncContext();
    const db = getTestDb();

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `VALIDATE-BASIC-${Date.now()}`,
      name: 'Validate Basic Test',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create price
    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, {
      price: 10000,
      isActive: true
    });
    registerFixtureCleanup(`price-${item.id}`, async () => {
      await db.deleteFrom('item_prices').where('item_id', '=', item.id).execute();
    });

    const res = await fetch(`${baseUrl}/api/pos/cart/validate`, {
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
    expect(body.data.valid).toBe(true);
    expect(body.data.item_id).toBe(item.id);
    expect(body.data.unit_price).toBe(10000);
    expect(body.data.stock_available).toBeNull(); // No outlet provided
    expect(body.data.stock_sufficient).toBeNull();
  });

  it('checks stock availability when outlet_id provided', async () => {
    const ctx = await getSeedSyncContext();
    const db = getTestDb();

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `VALIDATE-STOCK-${Date.now()}`,
      name: 'Validate Stock Test',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create a variant
    const variant = await createTestVariant(item.id, {
      attributeName: 'Size',
      attributeValues: ['Small']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    // Create price
    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, {
      variantId: variant.id,
      price: 15000,
      isActive: true
    });
    registerFixtureCleanup(`price-${item.id}`, async () => {
      await db.deleteFrom('item_prices').where('item_id', '=', item.id).execute();
    });

    // Set variant stock quantity to 10
    await db.updateTable('item_variants')
      .set({ stock_quantity: 10 })
      .where('id', '=', variant.id)
      .execute();

    // Validate with stock check
    const res = await fetch(`${baseUrl}/api/pos/cart/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.id,
        variant_id: variant.id,
        qty: 5,
        outlet_id: ctx.outletId
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.valid).toBe(true);
    expect(body.data.item_id).toBe(item.id);
    expect(body.data.variant_id).toBe(variant.id);
    expect(body.data.stock_available).toBe(10);
    expect(body.data.stock_sufficient).toBe(true);
  });

  it('returns insufficient stock when requested qty exceeds available', async () => {
    const ctx = await getSeedSyncContext();
    const db = getTestDb();

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `VALIDATE-LOW-${Date.now()}`,
      name: 'Validate Low Stock Test',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create a variant
    const variant = await createTestVariant(item.id, {
      attributeName: 'Size',
      attributeValues: ['Medium']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    // Create price
    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, {
      variantId: variant.id,
      price: 20000,
      isActive: true
    });
    registerFixtureCleanup(`price-${item.id}`, async () => {
      await db.deleteFrom('item_prices').where('item_id', '=', item.id).execute();
    });

    // Set variant stock quantity to 3
    await db.updateTable('item_variants')
      .set({ stock_quantity: 3 })
      .where('id', '=', variant.id)
      .execute();

    // Try to validate with qty > available
    const res = await fetch(`${baseUrl}/api/pos/cart/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.id,
        variant_id: variant.id,
        qty: 10,
        outlet_id: ctx.outletId
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.valid).toBe(false);
    expect(body.data.stock_available).toBe(3);
    expect(body.data.stock_sufficient).toBe(false);
  });

  it('validates variant belongs to item', async () => {
    const ctx = await getSeedSyncContext();
    const db = getTestDb();

    // Create two test items
    const item1 = await createTestItem(ctx.companyId, {
      sku: `VALIDATE-ITEM1-${Date.now()}`,
      name: 'Validate Item 1',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item1.id}`, async () => {});

    const item2 = await createTestItem(ctx.companyId, {
      sku: `VALIDATE-ITEM2-${Date.now()}`,
      name: 'Validate Item 2',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item2-${item2.id}`, async () => {});

    // Create variant for item1
    const variant = await createTestVariant(item1.id, {
      attributeName: 'Type',
      attributeValues: ['Test']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    // Try to validate item2 with variant from item1
    const res = await fetch(`${baseUrl}/api/pos/cart/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item2.id,
        variant_id: variant.id,
        qty: 1,
        outlet_id: ctx.outletId
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
      sku: `VALIDATE-NO-VAR-${Date.now()}`,
      name: 'Validate No Variant',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    const res = await fetch(`${baseUrl}/api/pos/cart/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.id,
        variant_id: 999999999,
        qty: 1,
        outlet_id: ctx.outletId
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
      sku: `VALIDATE-INACTIVE-${Date.now()}`,
      name: 'Validate Inactive Variant',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create variant
    const variant = await createTestVariant(item.id, {
      attributeName: 'State',
      attributeValues: ['WillBeInactive']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    // Mark variant as inactive
    await db.updateTable('item_variants')
      .set({ is_active: 0 })
      .where('id', '=', variant.id)
      .execute();

    const res = await fetch(`${baseUrl}/api/pos/cart/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.id,
        variant_id: variant.id,
        qty: 1,
        outlet_id: ctx.outletId
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toContain('not active');
  });

  it('returns stock_available from inventory_stock table', async () => {
    const ctx = await getSeedSyncContext();
    const db = getTestDb();

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `VALIDATE-INVSTOCK-${Date.now()}`,
      name: 'Validate Inv Stock Test',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create a variant
    const variant = await createTestVariant(item.id, {
      attributeName: 'Pack',
      attributeValues: ['Bundle']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    // Create price
    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, {
      variantId: variant.id,
      price: 25000,
      isActive: true
    });
    registerFixtureCleanup(`price-${item.id}`, async () => {
      await db.deleteFrom('item_prices').where('item_id', '=', item.id).execute();
    });

    // Set variant base stock
    await db.updateTable('item_variants')
      .set({ stock_quantity: 5 })
      .where('id', '=', variant.id)
      .execute();

    // Create inventory_stock record with higher availability
    await sql`
      INSERT INTO inventory_stock (company_id, outlet_id, product_id, variant_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
      VALUES (${ctx.companyId}, ${ctx.outletId}, ${item.id}, ${variant.id}, 20, 0, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `.execute(db);

    registerFixtureCleanup(`inv-stock-${variant.id}`, async () => {
      await sql`DELETE FROM inventory_stock WHERE variant_id = ${variant.id} AND outlet_id = ${ctx.outletId}`.execute(db);
    });

    // Validate cart line
    const res = await fetch(`${baseUrl}/api/pos/cart/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.id,
        variant_id: variant.id,
        qty: 10,
        outlet_id: ctx.outletId
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.valid).toBe(true);
    // Should use inventory_stock.available_quantity (20) instead of item_variants.stock_quantity (5)
    expect(body.data.stock_available).toBe(20);
    expect(body.data.stock_sufficient).toBe(true);
  });

  it('returns correct validation response structure', async () => {
    const ctx = await getSeedSyncContext();
    const db = getTestDb();

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `VALIDATE-STRUCT-${Date.now()}`,
      name: 'Validate Structure Test',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create price
    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, {
      price: 10000,
      isActive: true
    });
    registerFixtureCleanup(`price-${item.id}`, async () => {
      await db.deleteFrom('item_prices').where('item_id', '=', item.id).execute();
    });

    const res = await fetch(`${baseUrl}/api/pos/cart/validate`, {
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
    expect(body.data).toHaveProperty('valid');
    expect(body.data).toHaveProperty('item_id');
    expect(body.data).toHaveProperty('variant_id');
    expect(body.data).toHaveProperty('unit_price');
    expect(body.data).toHaveProperty('is_variant_specific');
    expect(body.data).toHaveProperty('source');
    expect(body.data).toHaveProperty('stock_available');
    expect(body.data).toHaveProperty('stock_sufficient');
  });

  it('resolves outlet-specific pricing in validation', async () => {
    const ctx = await getSeedSyncContext();
    const db = getTestDb();

    // Create a test item
    const item = await createTestItem(ctx.companyId, {
      sku: `VALIDATE-OUTLET-${Date.now()}`,
      name: 'Validate Outlet Pricing Test',
      type: 'PRODUCT'
    });
    registerFixtureCleanup(`item-${item.id}`, async () => {});

    // Create a variant
    const variant = await createTestVariant(item.id, {
      attributeName: 'Grade',
      attributeValues: ['Premium']
    });
    registerFixtureCleanup(`variant-${variant.id}`, async () => {});

    // Set variant stock quantity (needed for stock check when outlet_id is provided)
    await db.updateTable('item_variants')
      .set({ stock_quantity: 100 })
      .where('id', '=', variant.id)
      .execute();

    // Create default price
    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, {
      variantId: variant.id,
      price: 10000,
      isActive: true
    });

    // Create outlet-specific price
    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, {
      outletId: ctx.outletId,
      variantId: variant.id,
      price: 18000,
      isActive: true
    });
    registerFixtureCleanup(`prices-${item.id}`, async () => {
      await db.deleteFrom('item_prices').where('item_id', '=', item.id).execute();
    });

    // Validate with outlet_id
    const res = await fetch(`${baseUrl}/api/pos/cart/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item_id: item.id,
        variant_id: variant.id,
        qty: 1,
        outlet_id: ctx.outletId
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.valid).toBe(true);
    // Should use outlet-specific price
    expect(body.data.unit_price).toBe(18000);
    expect(body.data.is_variant_specific).toBe(true);
    expect(body.data.source).toBe('variant_outlet');
  });
});
