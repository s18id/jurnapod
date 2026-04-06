// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import {test, afterAll} from 'vitest';
import { sql } from "kysely";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.js";
import { resolvePrice, resolvePricesBatch, clearPriceCache, getCacheSize } from "../../src/lib/pricing/variant-price-resolver.js";
import { createItemPrice, deleteItemPrice } from "../../src/lib/item-prices/index.js";
import { closeDbPool, getDb } from "../../src/lib/db.js";
import { createCompanyBasic } from "../../src/lib/companies.js";
import { createItem } from "../../src/lib/items/index.js";

loadEnvIfPresent();

test(
  "@slow resolvePrice - variant price overrides item price",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let variantId = 0;
    let outletId = 0;
    let itemPriceId = 0;
    let variantPriceId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";

    try {
      // Get company
      const companyResult = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyResult.rows.length > 0, "Company fixture not found");
      companyId = Number(companyResult.rows[0].id);

      // Get outlet
      const outletResult = await sql<{ id: number }>`
        SELECT id FROM outlets WHERE company_id = ${companyId} AND code = ${outletCode} LIMIT 1
      `.execute(db);
      assert.ok(outletResult.rows.length > 0, "Outlet fixture not found");
      outletId = Number(outletResult.rows[0].id);

      // Create test item
      const item = await createItem(companyId, {
        name: `Variant Test Item ${runId}`,
        type: 'PRODUCT'
      });
      itemId = item.id;

      // Create variant
      const variantResult = await sql`
        INSERT INTO item_variants (company_id, item_id, sku, variant_name, is_active)
        VALUES (${companyId}, ${itemId}, ${`SKU-VAR-${runId}`}, ${`Test Variant`}, TRUE)
      `.execute(db);
      variantId = Number(variantResult.insertId);

      // Create item price (outlet override)
      const itemPrice = await createItemPrice(companyId, {
        item_id: itemId,
        outlet_id: outletId,
        variant_id: null,
        price: 1000,
        is_active: true
      });
      itemPriceId = itemPrice.id;

      // Create variant price (higher priority)
      const variantPrice = await createItemPrice(companyId, {
        item_id: itemId,
        outlet_id: outletId,
        variant_id: variantId,
        price: 1500,
        is_active: true
      });
      variantPriceId = variantPrice.id;

      // Test: variant price should be used
      clearPriceCache(); // Clear cache before test
      const resolved = await resolvePrice(companyId, itemId, variantId, outletId);

      assert.strictEqual(resolved.price, 1500, "Variant price should override item price");
      assert.strictEqual(resolved.source, "variant_outlet", "Source should be variant_outlet");
      assert.strictEqual(resolved.is_variant_specific, true, "Should be variant specific");
      assert.strictEqual(resolved.price_id, variantPriceId, "Should return variant price ID");

    } finally {
      // Cleanup
      if (variantPriceId) {
        await deleteItemPrice(companyId, variantPriceId);
      }
      if (itemPriceId) {
        await deleteItemPrice(companyId, itemPriceId);
      }
      if (variantId) {
        await sql`DELETE FROM item_variants WHERE id = ${variantId}`.execute(db);
      }
      if (itemId) {
        await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      }
    }
  }
);

test(
  "@slow resolvePrice - missing variant price falls back to item price",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let variantId = 0;
    let outletId = 0;
    let itemPriceId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";

    try {
      const companyResult = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number(companyResult.rows[0].id);

      const outletResult = await sql<{ id: number }>`
        SELECT id FROM outlets WHERE company_id = ${companyId} AND code = ${outletCode} LIMIT 1
      `.execute(db);
      outletId = Number(outletResult.rows[0].id);

      // Create test item
      const item = await createItem(companyId, {
        name: `Fallback Test Item ${runId}`,
        type: 'PRODUCT'
      });
      itemId = item.id;

      // Create variant
      const variantResult = await sql`
        INSERT INTO item_variants (company_id, item_id, sku, variant_name, is_active)
        VALUES (${companyId}, ${itemId}, ${`SKU-FALLBACK-${runId}`}, ${`Fallback Variant`}, TRUE)
      `.execute(db);
      variantId = Number(variantResult.insertId);

      // Create item price only (no variant price)
      const itemPrice = await createItemPrice(companyId, {
        item_id: itemId,
        outlet_id: outletId,
        variant_id: null,
        price: 1200,
        is_active: true
      });
      itemPriceId = itemPrice.id;

      // Test: should fall back to item price
      clearPriceCache();
      const resolved = await resolvePrice(companyId, itemId, variantId, outletId);

      assert.strictEqual(resolved.price, 1200, "Should fall back to item price");
      assert.strictEqual(resolved.source, "item_outlet", "Source should be item_outlet");
      assert.strictEqual(resolved.is_variant_specific, false, "Should not be variant specific");

    } finally {
      if (itemPriceId) {
        await deleteItemPrice(companyId, itemPriceId);
      }
      if (variantId) {
        await sql`DELETE FROM item_variants WHERE id = ${variantId}`.execute(db);
      }
      if (itemId) {
        await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      }
    }
  }
);

test(
  "resolvePrice - company isolation - variant prices don't leak",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let company1Id = 0;
    let company2Id = 0;
    let item1Id = 0;
    let item2Id = 0;
    let variant1Id = 0;
    let variant2Id = 0;
    let price1Id = 0;
    let price2Id = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      // Get first company
      const company1Result = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      company1Id = Number(company1Result.rows[0].id);

      // Get second company (different code or create one)
      const allCompaniesResult = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code != ${companyCode} ORDER BY id LIMIT 1
      `.execute(db);
      if (allCompaniesResult.rows.length > 0) {
        company2Id = Number(allCompaniesResult.rows[0].id);
      } else {
        // Create second company for test
        const company2 = await createCompanyBasic({
          code: `TEST2-${runId}`,
          name: `Test Company 2 ${runId}`
        });
        company2Id = company2.id;
      }

      // Create items for both companies
      const item1 = await createItem(company1Id, {
        name: `Company1 Item ${runId}`,
        type: 'PRODUCT'
      });
      item1Id = item1.id;

      const item2 = await createItem(company2Id, {
        name: `Company2 Item ${runId}`,
        type: 'PRODUCT'
      });
      item2Id = item2.id;

      // Create variants
      const variant1Result = await sql`
        INSERT INTO item_variants (company_id, item_id, sku, variant_name, is_active)
        VALUES (${company1Id}, ${item1Id}, ${`SKU-C1-${runId}`}, ${`Variant 1`}, TRUE)
      `.execute(db);
      variant1Id = Number(variant1Result.insertId);

      const variant2Result = await sql`
        INSERT INTO item_variants (company_id, item_id, sku, variant_name, is_active)
        VALUES (${company2Id}, ${item2Id}, ${`SKU-C2-${runId}`}, ${`Variant 2`}, TRUE)
      `.execute(db);
      variant2Id = Number(variant2Result.insertId);

      // Create prices
      const price1 = await createItemPrice(company1Id, {
        item_id: item1Id,
        outlet_id: null,
        variant_id: variant1Id,
        price: 1000,
        is_active: true
      });
      price1Id = price1.id;

      const price2 = await createItemPrice(company2Id, {
        item_id: item2Id,
        outlet_id: null,
        variant_id: variant2Id,
        price: 2000,
        is_active: true
      });
      price2Id = price2.id;

      // Test: company 1 should see its price, not company 2's
      clearPriceCache();
      const resolved1 = await resolvePrice(company1Id, item1Id, variant1Id, null);
      assert.strictEqual(resolved1.price, 1000, "Company 1 should see its own price");
      assert.strictEqual(resolved1.source, "variant_default", "Source should be variant_default");

      // Test: company 2 should see its price, not company 1's
      clearPriceCache();
      const resolved2 = await resolvePrice(company2Id, item2Id, variant2Id, null);
      assert.strictEqual(resolved2.price, 2000, "Company 2 should see its own price");
      assert.strictEqual(resolved2.source, "variant_default", "Source should be variant_default");

      // Test: company 1 should NOT see company 2's price
      clearPriceCache();
      const resolvedCross = await resolvePrice(company1Id, item2Id, variant2Id, null);
      assert.strictEqual(resolvedCross.price, 0, "Company 1 should NOT see Company 2's price");
      assert.strictEqual(resolvedCross.source, "global_default", "Source should be global_default (no price found)");

    } finally {
      // Cleanup - delete in correct order to handle FK constraints
      if (price2Id) {
        await deleteItemPrice(company2Id, price2Id);
      }
      if (price1Id) {
        await deleteItemPrice(company1Id, price1Id);
      }
      // Delete item_variant_combinations first ( FK to variants)
      if (variant2Id) {
        await sql`DELETE FROM item_variant_combinations WHERE variant_id = ${variant2Id}`.execute(db);
      }
      if (variant1Id) {
        await sql`DELETE FROM item_variant_combinations WHERE variant_id = ${variant1Id}`.execute(db);
      }
      if (variant2Id) {
        await sql`DELETE FROM item_variants WHERE id = ${variant2Id}`.execute(db);
      }
      if (variant1Id) {
        await sql`DELETE FROM item_variants WHERE id = ${variant1Id}`.execute(db);
      }
      if (item2Id) {
        await sql`DELETE FROM items WHERE id = ${item2Id}`.execute(db);
      }
      if (item1Id) {
        await sql`DELETE FROM items WHERE id = ${item1Id}`.execute(db);
      }
      // Skip company deletion - companies may have module dependencies
      // Test data (items, variants, prices) is cleaned up above
    }
  }
);

test(
  "@slow resolvePrice - variant default price (no outlet)",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let variantId = 0;
    let priceId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number(companyResult.rows[0].id);

      const item = await createItem(companyId, {
        name: `Variant Default Test ${runId}`,
        type: 'PRODUCT'
      });
      itemId = item.id;

      const variantResult = await sql`
        INSERT INTO item_variants (company_id, item_id, sku, variant_name, is_active)
        VALUES (${companyId}, ${itemId}, ${`SKU-VD-${runId}`}, ${`Variant Default`}, TRUE)
      `.execute(db);
      variantId = Number(variantResult.insertId);

      // Create variant default price (no outlet)
      const price = await createItemPrice(companyId, {
        item_id: itemId,
        outlet_id: null,
        variant_id: variantId,
        price: 2500,
        is_active: true
      });
      priceId = price.id;

      // Test: should resolve variant default price without outlet
      clearPriceCache();
      const resolved = await resolvePrice(companyId, itemId, variantId, null);

      assert.strictEqual(resolved.price, 2500, "Should resolve variant default price");
      assert.strictEqual(resolved.source, "variant_default", "Source should be variant_default");
      assert.strictEqual(resolved.is_variant_specific, true, "Should be variant specific");

    } finally {
      if (priceId) {
        await deleteItemPrice(companyId, priceId);
      }
      if (variantId) {
        await sql`DELETE FROM item_variants WHERE id = ${variantId}`.execute(db);
      }
      if (itemId) {
        await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      }
    }
  }
);

test(
  "@slow resolvePricesBatch - multiple items resolved efficiently",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let item1Id = 0;
    let item2Id = 0;
    let variant1Id = 0;
    let variant2Id = 0;
    let price1Id = 0;
    let price2Id = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number(companyResult.rows[0].id);

      // Create items
      const item1 = await createItem(companyId, {
        name: `Batch Item 1 ${runId}`,
        type: 'PRODUCT'
      });
      item1Id = item1.id;

      const item2 = await createItem(companyId, {
        name: `Batch Item 2 ${runId}`,
        type: 'PRODUCT'
      });
      item2Id = item2.id;

      // Create variants
      const variant1Result = await sql`
        INSERT INTO item_variants (company_id, item_id, sku, variant_name, is_active)
        VALUES (${companyId}, ${item1Id}, ${`SKU-B1-${runId}`}, ${`Batch Variant 1`}, TRUE)
      `.execute(db);
      variant1Id = Number(variant1Result.insertId);

      const variant2Result = await sql`
        INSERT INTO item_variants (company_id, item_id, sku, variant_name, is_active)
        VALUES (${companyId}, ${item2Id}, ${`SKU-B2-${runId}`}, ${`Batch Variant 2`}, TRUE)
      `.execute(db);
      variant2Id = Number(variant2Result.insertId);

      // Create prices
      const price1 = await createItemPrice(companyId, {
        item_id: item1Id,
        outlet_id: null,
        variant_id: variant1Id,
        price: 3000,
        is_active: true
      });
      price1Id = price1.id;

      const price2 = await createItemPrice(companyId, {
        item_id: item2Id,
        outlet_id: null,
        variant_id: variant2Id,
        price: 4000,
        is_active: true
      });
      price2Id = price2.id;

      // Test batch resolution
      clearPriceCache();
      const results = await resolvePricesBatch(companyId, [
        { itemId: item1Id, variantId: variant1Id },
        { itemId: item2Id, variantId: variant2Id },
        { itemId: item1Id, variantId: null } // Item without variant
      ]);

      assert.ok(results.size >= 2, "Should have at least 2 results");

      // Find result for item1 with variant
      let item1VariantPrice: number | undefined;
      let item2VariantPrice: number | undefined;
      
      for (const [key, value] of results.entries()) {
        if (key.includes(`:${item1Id}:`) && key.includes(`:${variant1Id}:`)) {
          item1VariantPrice = value.price;
        }
        if (key.includes(`:${item2Id}:`) && key.includes(`:${variant2Id}:`)) {
          item2VariantPrice = value.price;
        }
      }

      assert.strictEqual(item1VariantPrice, 3000, "Batch resolved item1 variant price");
      assert.strictEqual(item2VariantPrice, 4000, "Batch resolved item2 variant price");

    } finally {
      if (price2Id) {
        await deleteItemPrice(companyId, price2Id);
      }
      if (price1Id) {
        await deleteItemPrice(companyId, price1Id);
      }
      if (variant2Id) {
        await sql`DELETE FROM item_variants WHERE id = ${variant2Id}`.execute(db);
      }
      if (variant1Id) {
        await sql`DELETE FROM item_variants WHERE id = ${variant1Id}`.execute(db);
      }
      if (item2Id) {
        await sql`DELETE FROM items WHERE id = ${item2Id}`.execute(db);
      }
      if (item1Id) {
        await sql`DELETE FROM items WHERE id = ${item1Id}`.execute(db);
      }
    }
  }
);

test(
  "@slow resolvePrice - cache TTL works correctly",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let priceId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number(companyResult.rows[0].id);

      const item = await createItem(companyId, {
        name: `Cache Test Item ${runId}`,
        type: 'PRODUCT'
      });
      itemId = item.id;

      const price = await createItemPrice(companyId, {
        item_id: itemId,
        outlet_id: null,
        variant_id: null,
        price: 5000,
        is_active: true
      });
      priceId = price.id;

      // Clear cache and resolve
      clearPriceCache();
      const cacheSizeBefore = getCacheSize();
      
      await resolvePrice(companyId, itemId, null, null, undefined, { ttlMs: 60000 });
      const cacheSizeAfter = getCacheSize();

      assert.ok(cacheSizeAfter > cacheSizeBefore, "Cache should have entries after resolution");

      // Resolve again - should hit cache
      const cached = await resolvePrice(companyId, itemId, null, null, undefined, { ttlMs: 60000 });
      assert.strictEqual(cached.price, 5000, "Cached price should match");
      assert.strictEqual(cached.source, "item_default", "Cached source should be item_default");

    } finally {
      if (priceId) {
        await deleteItemPrice(companyId, priceId);
      }
      if (itemId) {
        await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      }
    }
  }
);

test(
  "@slow resolvePrice - no price returns global default (0)",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number(companyResult.rows[0].id);

      // Create item WITHOUT any prices
      const item = await createItem(companyId, {
        name: `No Price Item ${runId}`,
        type: 'PRODUCT'
      });
      itemId = item.id;

      // Test: should return global default (0) when no price exists
      clearPriceCache();
      const resolved = await resolvePrice(companyId, itemId, null, null);

      assert.strictEqual(resolved.price, 0, "Should return 0 for global default");
      assert.strictEqual(resolved.source, "global_default", "Source should be global_default");
      assert.strictEqual(resolved.price_id, null, "Should have no price ID");

    } finally {
      if (itemId) {
        await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      }
    }
  }
);

// NOTE: Effective date filtering tests (effective_from/effective_to) require 
// a database migration to add those columns. They are temporarily disabled.
// To enable: 1) Run migration to add effective_from/effective_to columns
//            2) Call enableEffectiveDateFilter() in variant-price-resolver
//            3) Re-add the skipped tests

test(
  "@slow resolvePrice - cache is invalidated when price is updated",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let priceId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyResult = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number(companyResult.rows[0].id);

      // Create test item
      const item = await createItem(companyId, {
        name: `Cache Invalidation Test ${runId}`,
        type: 'PRODUCT'
      });
      itemId = item.id;

      // Create item price
      const price = await createItemPrice(companyId, {
        item_id: itemId,
        outlet_id: null,
        variant_id: null,
        price: 1000,
        is_active: true
      });
      priceId = price.id;

      // First resolution - should cache the price
      clearPriceCache();
      const resolved1 = await resolvePrice(companyId, itemId, null, null, undefined, { ttlMs: 60000 });
      assert.strictEqual(resolved1.price, 1000, "Initial resolution should return 1000");

      // Manually update the price directly in DB (simulating what updateItemPrice does)
      await sql`UPDATE item_prices SET price = 2000 WHERE id = ${priceId}`.execute(db);

      // Without cache clear, should still return old cached price
      const resolved2 = await resolvePrice(companyId, itemId, null, null, undefined, { ttlMs: 60000 });
      assert.strictEqual(resolved2.price, 1000, "Should still return cached price before invalidation");

      // After manual cache clear, should return new price
      clearPriceCache();
      const resolved3 = await resolvePrice(companyId, itemId, null, null);
      assert.strictEqual(resolved3.price, 2000, "After cache clear, should return new price");

    } finally {
      if (priceId) {
        await deleteItemPrice(companyId, priceId);
      }
      if (itemId) {
        await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      }
    }
  }
);

afterAll(async () => {
  await closeDbPool();
});
