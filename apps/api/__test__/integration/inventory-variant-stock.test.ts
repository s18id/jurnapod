// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Variant Stock Tests
 * 
 * Tests for variant stock tracking functionality.
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import {test, describe, beforeAll, afterAll} from 'vitest';
import { getDb, closeDbPool } from "../../src/lib/db.js";
import { sql } from "kysely";
import {
  checkVariantStockAvailability,
  reserveVariantStock,
  releaseVariantStock,
  deductVariantStock,
  getAggregatedItemStock
} from "../../src/lib/inventory/variant-stock.js";
import { createCompanyBasic } from "../../src/lib/companies.js";
import { createOutletBasic } from "../../src/lib/outlets.js";
import { createItem } from "../../src/lib/items/index.js";

describe("Variant Stock Operations", () => {
  beforeAll(async () => {
    const db = getDb();
    
    // Ensure variant_id column exists in inventory_stock
    try {
      const colsResult = await sql`SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_stock' AND COLUMN_NAME = 'variant_id'`.execute(db);
      
      if (colsResult.rows.length === 0) {
        await sql`ALTER TABLE inventory_stock ADD COLUMN variant_id BIGINT UNSIGNED NULL AFTER product_id`.execute(db);
      }
    } catch (e) {
      // Column might already exist, ignore error
    }
  });

  afterAll(async () => {
    await closeDbPool();
  });

  test("checkVariantStockAvailability - returns available when stock sufficient", async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    
    // Create company and outlet dynamically
    const company = await createCompanyBasic({
      code: `TEST-VS1-${runId}`,
      name: `Test Variant Stock 1 ${runId}`
    });
    const outlet = await createOutletBasic({
      company_id: company.id,
      code: `OUTLET-${runId}`,
      name: `Outlet ${runId}`
    });

    let itemId = 0;
    let variantId = 0;
    
    try {
      // Create test item
      const item = await createItem(company.id, {
        name: `Test VS 1 ${runId}`,
        type: 'PRODUCT',
        track_stock: true,
        is_active: true
      });
      itemId = item.id;

      // Create variant with 100 stock
      const variantResult = await sql`INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
       VALUES (${company.id}, ${itemId}, ${`TEST-VS-${runId}-1`}, 'Small', 100, 1)`.execute(db);
      variantId = Number(variantResult.insertId);

      // Check stock
      const result = await checkVariantStockAvailability(company.id, outlet.id, variantId, 10);

      assert.strictEqual(result.variant_id, variantId);
      assert.strictEqual(result.available, true);
      assert.strictEqual(result.requested_quantity, 10);
      assert.strictEqual(result.available_quantity, 100);
    } finally {
      await sql`DELETE FROM item_variant_combinations WHERE variant_id = ${variantId}`.execute(db);
      await sql`DELETE FROM item_variants WHERE id = ${variantId}`.execute(db);
      await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      await sql`DELETE FROM outlets WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM companies WHERE id = ${company.id}`.execute(db);
    }
  });

  test("checkVariantStockAvailability - returns unavailable when stock insufficient", async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    
    // Create company and outlet dynamically
    const company = await createCompanyBasic({
      code: `TEST-VS2-${runId}`,
      name: `Test Variant Stock 2 ${runId}`
    });
    const outlet = await createOutletBasic({
      company_id: company.id,
      code: `OUTLET-${runId}`,
      name: `Outlet ${runId}`
    });

    let itemId = 0;
    let variantId = 0;
    
    try {
      const item = await createItem(company.id, {
        name: `Test VS 2 ${runId}`,
        type: 'PRODUCT',
        track_stock: true,
        is_active: true
      });
      itemId = item.id;

      // Create variant with 5 stock
      const variantResult = await sql`INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
       VALUES (${company.id}, ${itemId}, ${`TEST-VS-${runId}-2`}, 'Medium', 5, 1)`.execute(db);
      variantId = Number(variantResult.insertId);

      // Request 10, only 5 available
      const result = await checkVariantStockAvailability(company.id, outlet.id, variantId, 10);

      assert.strictEqual(result.variant_id, variantId);
      assert.strictEqual(result.available, false);
      assert.strictEqual(result.requested_quantity, 10);
      assert.strictEqual(result.available_quantity, 5);
    } finally {
      await sql`DELETE FROM item_variant_combinations WHERE variant_id = ${variantId}`.execute(db);
      await sql`DELETE FROM item_variants WHERE id = ${variantId}`.execute(db);
      await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      await sql`DELETE FROM outlets WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM companies WHERE id = ${company.id}`.execute(db);
    }
  });

  test("checkVariantStockAvailability - returns false for non-existent variant", async () => {
    // Create company and outlet dynamically for this edge case test
    const runId = Date.now().toString(36);
    const company = await createCompanyBasic({
      code: `TEST-VS3-${runId}`,
      name: `Test Variant Stock 3 ${runId}`
    });
    const outlet = await createOutletBasic({
      company_id: company.id,
      code: `OUTLET-${runId}`,
      name: `Outlet ${runId}`
    });

    const result = await checkVariantStockAvailability(company.id, outlet.id, 999999, 1);

    assert.strictEqual(result.available, false);
    assert.strictEqual(result.available_quantity, 0);

    // Cleanup
    const db = getDb();
    await sql`DELETE FROM outlets WHERE company_id = ${company.id}`.execute(db);
    await sql`DELETE FROM companies WHERE id = ${company.id}`.execute(db);
  });

  test("checkVariantStockAvailability - uses inventory_stock when available", async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    
    // Create company and outlet dynamically
    const company = await createCompanyBasic({
      code: `TEST-VS4-${runId}`,
      name: `Test Variant Stock 4 ${runId}`
    });
    const outlet = await createOutletBasic({
      company_id: company.id,
      code: `OUTLET-${runId}`,
      name: `Outlet ${runId}`
    });

    let itemId = 0;
    let variantId = 0;
    
    try {
      const item = await createItem(company.id, {
        name: `Test VS 3 ${runId}`,
        type: 'PRODUCT',
        track_stock: true,
        is_active: true
      });
      itemId = item.id;

      // Create variant with stock_quantity = 50
      const variantResult = await sql`INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
       VALUES (${company.id}, ${itemId}, ${`TEST-VS-${runId}-3`}, 'Large', 50, 1)`.execute(db);
      variantId = Number(variantResult.insertId);

      // Add inventory_stock record with 30 (different from variant's 50)
      await sql`INSERT INTO inventory_stock (company_id, outlet_id, product_id, variant_id, quantity, reserved_quantity, available_quantity)
       VALUES (${company.id}, ${outlet.id}, ${itemId}, ${variantId}, 30, 0, 30)`.execute(db);

      // Should use inventory_stock value (30), not item_variants (50)
      const result = await checkVariantStockAvailability(company.id, outlet.id, variantId, 10);

      assert.strictEqual(result.available, true);
      assert.strictEqual(result.available_quantity, 30);

      // Clean up inventory_stock first
      await sql`DELETE FROM inventory_stock WHERE variant_id = ${variantId}`.execute(db);
    } finally {
      await sql`DELETE FROM item_variant_combinations WHERE variant_id = ${variantId}`.execute(db);
      await sql`DELETE FROM item_variants WHERE id = ${variantId}`.execute(db);
      await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      await sql`DELETE FROM outlets WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM companies WHERE id = ${company.id}`.execute(db);
    }
  });

  test("reserveVariantStock - reserves stock successfully", async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    const refId = `TEST-RES-4-${runId}`;
    
    // Create company and outlet dynamically
    const company = await createCompanyBasic({
      code: `TEST-VS5-${runId}`,
      name: `Test Variant Stock 5 ${runId}`
    });
    const outlet = await createOutletBasic({
      company_id: company.id,
      code: `OUTLET-${runId}`,
      name: `Outlet ${runId}`
    });

    let itemId = 0;
    let variantId = 0;
    
    try {
      // Create test item
      const item = await createItem(company.id, {
        name: `Test VS 4 ${runId}`,
        type: 'PRODUCT',
        track_stock: true,
        is_active: true
      });
      itemId = item.id;

      // Create variant with 100 stock
      const variantResult = await sql`INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
       VALUES (${company.id}, ${itemId}, ${`TEST-VS-${runId}-4`}, 'XL', 100, 1)`.execute(db);
      variantId = Number(variantResult.insertId);

      // Reserve 10 stock
      const result = await reserveVariantStock(
        company.id,
        outlet.id,
        [{ variant_id: variantId, quantity: 10 }],
        refId
      );

      assert.strictEqual(result.success, true, "Reservation should succeed");
      assert.strictEqual(result.conflicts, undefined, "Should have no conflicts");

      // Verify inventory_stock record was created with correct reservation
      const stockResult = await sql`SELECT quantity, reserved_quantity, available_quantity 
       FROM inventory_stock 
       WHERE company_id = ${company.id} AND outlet_id = ${outlet.id} AND variant_id = ${variantId}`.execute(db);
      assert.strictEqual(stockResult.rows.length, 1, "Should have inventory_stock record");
      const stockRow = stockResult.rows[0] as { quantity: number; reserved_quantity: number; available_quantity: number };
      assert.strictEqual(Number(stockRow.quantity), 100, "Quantity should be 100");
      assert.strictEqual(Number(stockRow.reserved_quantity), 10, "Reserved should be 10");
      assert.strictEqual(Number(stockRow.available_quantity), 90, "Available should be 90");

      // Verify transaction was recorded
      const txResult = await sql`SELECT transaction_type, quantity_delta FROM inventory_transactions 
       WHERE reference_id = ${refId} AND variant_id = ${variantId}`.execute(db);
      assert.strictEqual(txResult.rows.length, 1, "Should have 1 transaction record");
      const txRow = txResult.rows[0] as { transaction_type: number; quantity_delta: number };
      assert.strictEqual(Number(txRow.transaction_type), 3, "Should be RESERVATION (type 3)");
      assert.strictEqual(Number(txRow.quantity_delta), 10, "Quantity delta should be 10");
    } finally {
      // Clean up in correct order
      await sql`DELETE FROM inventory_transactions WHERE reference_id = ${refId}`.execute(db);
      await sql`DELETE FROM inventory_stock WHERE variant_id = ${variantId}`.execute(db);
      await sql`DELETE FROM item_variant_combinations WHERE variant_id = ${variantId}`.execute(db);
      await sql`DELETE FROM item_variants WHERE id = ${variantId}`.execute(db);
      await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      await sql`DELETE FROM outlets WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM companies WHERE id = ${company.id}`.execute(db);
    }
  });

  test("reserveVariantStock - fails when insufficient stock", async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    
    // Create company and outlet dynamically
    const company = await createCompanyBasic({
      code: `TEST-VS6-${runId}`,
      name: `Test Variant Stock 6 ${runId}`
    });
    const outlet = await createOutletBasic({
      company_id: company.id,
      code: `OUTLET-${runId}`,
      name: `Outlet ${runId}`
    });

    let itemId = 0;
    let variantId = 0;
    
    try {
      const item = await createItem(company.id, {
        name: `Test VS 5 ${runId}`,
        type: 'PRODUCT',
        track_stock: true,
        is_active: true
      });
      itemId = item.id;

      // Create variant with 5 stock
      const variantResult = await sql`INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
       VALUES (${company.id}, ${itemId}, ${`TEST-VS-${runId}-5`}, 'XXL', 5, 1)`.execute(db);
      variantId = Number(variantResult.insertId);

      // Try to reserve 10 (more than available)
      const result = await reserveVariantStock(
        company.id,
        outlet.id,
        [{ variant_id: variantId, quantity: 10 }],
        `TEST-RES-5-${runId}`
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.conflicts?.length, 1);
      assert.strictEqual(result.conflicts?.[0].variant_id, variantId);
      assert.strictEqual(result.conflicts?.[0].requested, 10);
      assert.strictEqual(result.conflicts?.[0].available, 5);
    } finally {
      await sql`DELETE FROM item_variant_combinations WHERE variant_id = ${variantId}`.execute(db);
      await sql`DELETE FROM item_variants WHERE id = ${variantId}`.execute(db);
      await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      await sql`DELETE FROM outlets WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM companies WHERE id = ${company.id}`.execute(db);
    }
  });

  test("deductVariantStock - throws when insufficient stock", async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    
    // Create company and outlet dynamically
    const company = await createCompanyBasic({
      code: `TEST-VS7-${runId}`,
      name: `Test Variant Stock 7 ${runId}`
    });
    const outlet = await createOutletBasic({
      company_id: company.id,
      code: `OUTLET-${runId}`,
      name: `Outlet ${runId}`
    });

    let itemId = 0;
    let variantId = 0;
    
    try {
      const item = await createItem(company.id, {
        name: `Test VS 7 ${runId}`,
        type: 'PRODUCT',
        track_stock: true,
        is_active: true
      });
      itemId = item.id;

      // Create variant with 3 stock
      const variantResult = await sql`INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
       VALUES (${company.id}, ${itemId}, ${`TEST-VS-${runId}-7`}, 'Medium', 3, 1)`.execute(db);
      variantId = Number(variantResult.insertId);

      // Try to deduct 10 (more than available)
      try {
        await deductVariantStock(
          company.id,
          outlet.id,
          [{ variant_id: variantId, quantity: 10 }],
          `TEST-SALE-7-${runId}`
        );
        throw new Error("Should have thrown");
      } catch (error: unknown) {
        const err = error as Error;
        assert.strictEqual(err.message.includes("Insufficient stock"), true);
      }
    } finally {
      await sql`DELETE FROM item_variant_combinations WHERE variant_id = ${variantId}`.execute(db);
      await sql`DELETE FROM item_variants WHERE id = ${variantId}`.execute(db);
      await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      await sql`DELETE FROM outlets WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM companies WHERE id = ${company.id}`.execute(db);
    }
  });

  test("deductVariantStock - deducts stock on sale completion", async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    const refId = `TEST-SALE-6-${runId}`;
    
    // Create company and outlet dynamically
    const company = await createCompanyBasic({
      code: `TEST-VS8-${runId}`,
      name: `Test Variant Stock 8 ${runId}`
    });
    const outlet = await createOutletBasic({
      company_id: company.id,
      code: `OUTLET-${runId}`,
      name: `Outlet ${runId}`
    });

    let itemId = 0;
    let variantId = 0;
    
    try {
      // Create test item
      const item = await createItem(company.id, {
        name: `Test VS 6 ${runId}`,
        type: 'PRODUCT',
        track_stock: true,
        is_active: true
      });
      itemId = item.id;

      // Create variant with 50 stock
      const variantResult = await sql`INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
       VALUES (${company.id}, ${itemId}, ${`TEST-VS-${runId}-6`}, 'Small', 50, 1)`.execute(db);
      variantId = Number(variantResult.insertId);

      // Deduct 5 stock
      const result = await deductVariantStock(
        company.id,
        outlet.id,
        [{ variant_id: variantId, quantity: 5 }],
        refId
      );

      assert.strictEqual(result, true, "Deduction should succeed");

      // Verify stock was deducted
      const variantResult2 = await sql`SELECT stock_quantity FROM item_variants WHERE id = ${variantId}`.execute(db);
      const variantRow = variantResult2.rows[0] as { stock_quantity: number };
      assert.strictEqual(Number(variantRow.stock_quantity), 45, "Stock should be 45 after deducting 5");

      // Verify transaction was recorded
      const txResult = await sql`SELECT transaction_type, quantity_delta FROM inventory_transactions 
       WHERE reference_id = ${refId} AND variant_id = ${variantId}`.execute(db);
      assert.strictEqual(txResult.rows.length, 1, "Should have 1 transaction record");
      const txRow = txResult.rows[0] as { transaction_type: number; quantity_delta: number };
      assert.strictEqual(Number(txRow.transaction_type), 1, "Should be SALE (type 1)");
      assert.strictEqual(Number(txRow.quantity_delta), -5, "Quantity delta should be -5");
    } finally {
      // Clean up in correct order
      await sql`DELETE FROM inventory_transactions WHERE reference_id = ${refId}`.execute(db);
      await sql`DELETE FROM inventory_stock WHERE variant_id = ${variantId}`.execute(db);
      await sql`DELETE FROM item_variant_combinations WHERE variant_id = ${variantId}`.execute(db);
      await sql`DELETE FROM item_variants WHERE id = ${variantId}`.execute(db);
      await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      await sql`DELETE FROM outlets WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM companies WHERE id = ${company.id}`.execute(db);
    }
  });

  test("releaseVariantStock - releases reserved stock", async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    const refId = `TEST-REL-9-${runId}`;
    
    // Create company and outlet dynamically
    const company = await createCompanyBasic({
      code: `TEST-VS9-${runId}`,
      name: `Test Variant Stock 9 ${runId}`
    });
    const outlet = await createOutletBasic({
      company_id: company.id,
      code: `OUTLET-${runId}`,
      name: `Outlet ${runId}`
    });

    let itemId = 0;
    let variantId = 0;
    
    try {
      // Create test item
      const item = await createItem(company.id, {
        name: `Test VS 9 ${runId}`,
        type: 'PRODUCT',
        track_stock: true,
        is_active: true
      });
      itemId = item.id;

      // Create variant with 100 stock
      const variantResult = await sql`INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
       VALUES (${company.id}, ${itemId}, ${`TEST-VS-${runId}-9`}, 'Medium', 100, 1)`.execute(db);
      variantId = Number(variantResult.insertId);

      // Reserve 20 stock first
      await reserveVariantStock(
        company.id,
        outlet.id,
        [{ variant_id: variantId, quantity: 20 }],
        refId
      );

      // Verify reservation in inventory_stock
      const afterReserveResult = await sql`SELECT reserved_quantity, available_quantity 
       FROM inventory_stock 
       WHERE company_id = ${company.id} AND outlet_id = ${outlet.id} AND variant_id = ${variantId}`.execute(db);
      const afterReserveRow = afterReserveResult.rows[0] as { reserved_quantity: number; available_quantity: number };
      assert.strictEqual(Number(afterReserveRow.reserved_quantity), 20, "Reserved should be 20");
      assert.strictEqual(Number(afterReserveRow.available_quantity), 80, "Available should be 80");

      // Release the reserved stock
      const releaseResult = await releaseVariantStock(
        company.id,
        outlet.id,
        [{ variant_id: variantId, quantity: 20 }],
        refId
      );

      assert.strictEqual(releaseResult, true, "Release should succeed");

      // Verify reservation was released
      const afterReleaseResult = await sql`SELECT reserved_quantity, available_quantity 
       FROM inventory_stock 
       WHERE company_id = ${company.id} AND outlet_id = ${outlet.id} AND variant_id = ${variantId}`.execute(db);
      const afterReleaseRow = afterReleaseResult.rows[0] as { reserved_quantity: number; available_quantity: number };
      assert.strictEqual(Number(afterReleaseRow.reserved_quantity), 0, "Reserved should be 0");
      assert.strictEqual(Number(afterReleaseRow.available_quantity), 100, "Available should be restored to 100");

      // Verify transactions were recorded
      const txResult = await sql`SELECT transaction_type, quantity_delta FROM inventory_transactions 
       WHERE reference_id = ${refId} AND variant_id = ${variantId} 
       ORDER BY id`.execute(db);
      assert.strictEqual(txResult.rows.length, 2, "Should have 2 transaction records");
      const txRow0 = txResult.rows[0] as { transaction_type: number; quantity_delta: number };
      const txRow1 = txResult.rows[1] as { transaction_type: number; quantity_delta: number };
      assert.strictEqual(Number(txRow0.transaction_type), 3, "First should be RESERVATION (type 3)");
      assert.strictEqual(Number(txRow0.quantity_delta), 20, "Reservation delta should be 20");
      assert.strictEqual(Number(txRow1.transaction_type), 4, "Second should be RELEASE (type 4)");
      assert.strictEqual(Number(txRow1.quantity_delta), -20, "Release delta should be -20");
    } finally {
      // Clean up in correct order
      await sql`DELETE FROM inventory_transactions WHERE reference_id = ${refId}`.execute(db);
      await sql`DELETE FROM inventory_stock WHERE variant_id = ${variantId}`.execute(db);
      await sql`DELETE FROM item_variant_combinations WHERE variant_id = ${variantId}`.execute(db);
      await sql`DELETE FROM item_variants WHERE id = ${variantId}`.execute(db);
      await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      await sql`DELETE FROM outlets WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM companies WHERE id = ${company.id}`.execute(db);
    }
  });

  test("getAggregatedItemStock - calculates total from variants and base", async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    
    // Create company and outlet dynamically
    const company = await createCompanyBasic({
      code: `TEST-VS10-${runId}`,
      name: `Test Variant Stock 10 ${runId}`
    });
    const outlet = await createOutletBasic({
      company_id: company.id,
      code: `OUTLET-${runId}`,
      name: `Outlet ${runId}`
    });

    let itemId = 0;
    let v1Id = 0;
    let v2Id = 0;
    
    try {
      const item = await createItem(company.id, {
        name: `Test VS 8 ${runId}`,
        type: 'PRODUCT',
        track_stock: true,
        is_active: true
      });
      itemId = item.id;

      // Create base stock (no variant)
      await sql`INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity)
       VALUES (${company.id}, ${outlet.id}, ${itemId}, 20, 0, 20)`.execute(db);

      // Create variants with stock
      const v1Result = await sql`INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
       VALUES (${company.id}, ${itemId}, ${`TEST-VS-${runId}-8A`}, 'Small', 30, 1)`.execute(db);
      v1Id = Number(v1Result.insertId);

      const v2Result = await sql`INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
       VALUES (${company.id}, ${itemId}, ${`TEST-VS-${runId}-8B`}, 'Large', 40, 1)`.execute(db);
      v2Id = Number(v2Result.insertId);

      // Get aggregated stock
      const result = await getAggregatedItemStock(company.id, outlet.id, itemId);

      assert.strictEqual(result.item_id, itemId);
      assert.strictEqual(result.total_quantity, 90); // 20 + 30 + 40
      assert.strictEqual(result.total_available, 90);
      assert.strictEqual(result.variants.length, 2);

      // Clean up inventory_stock
      await sql`DELETE FROM inventory_stock WHERE product_id = ${itemId} AND variant_id IS NULL`.execute(db);
    } finally {
      await sql`DELETE FROM item_variant_combinations WHERE variant_id IN (${v1Id}, ${v2Id})`.execute(db);
      await sql`DELETE FROM item_variants WHERE id IN (${v1Id}, ${v2Id})`.execute(db);
      await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      await sql`DELETE FROM outlets WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM companies WHERE id = ${company.id}`.execute(db);
    }
  });
});

// POS Cart Integration
describe("POS Cart Variant Stock Integration", () => {
  afterAll(async () => {
    await closeDbPool();
  });

  test("POS cart line - rejects insufficient variant stock", async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    
    // Create company and outlet dynamically
    const company = await createCompanyBasic({
      code: `TEST-POS1-${runId}`,
      name: `Test POS ${runId}`
    });
    const outlet = await createOutletBasic({
      company_id: company.id,
      code: `OUTLET-${runId}`,
      name: `Outlet ${runId}`
    });

    let itemId = 0;
    let variantId = 0;
    
    try {
      const item = await createItem(company.id, {
        name: `Test POS ${runId}`,
        type: 'PRODUCT',
        track_stock: true,
        is_active: true
      });
      itemId = item.id;

      // Create variant with 2 stock
      const variantResult = await sql`INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
       VALUES (${company.id}, ${itemId}, ${`TEST-PC-${runId}`}, 'Small', 2, 1)`.execute(db);
      variantId = Number(variantResult.insertId);

      // Try to add 5 to cart (more than available)
      const stockCheck = await checkVariantStockAvailability(
        company.id,
        outlet.id,
        variantId,
        5
      );

      assert.strictEqual(stockCheck.available, false);
      assert.strictEqual(stockCheck.available_quantity, 2);
    } finally {
      await sql`DELETE FROM item_variant_combinations WHERE variant_id = ${variantId}`.execute(db);
      await sql`DELETE FROM item_variants WHERE id = ${variantId}`.execute(db);
      await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      await sql`DELETE FROM outlets WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM companies WHERE id = ${company.id}`.execute(db);
    }
  });
});

// Concurrency Tests
describe("Variant Stock Concurrency", () => {
  afterAll(async () => {
    await closeDbPool();
  });

  test("reserveVariantStock - prevents concurrent double reservation", async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    
    // Create company and outlet dynamically
    const company = await createCompanyBasic({
      code: `TEST-CON1-${runId}`,
      name: `Test Concurrent ${runId}`
    });
    const outlet = await createOutletBasic({
      company_id: company.id,
      code: `OUTLET-${runId}`,
      name: `Outlet ${runId}`
    });

    let itemId = 0;
    let variantId = 0;
    const refIds: string[] = [];
    
    try {
      // Create test item
      const item = await createItem(company.id, {
        name: `Test CONCUR ${runId}`,
        type: 'PRODUCT',
        track_stock: true,
        is_active: true
      });
      itemId = item.id;

      // Create variant with 10 stock
      const variantResult = await sql`INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
       VALUES (${company.id}, ${itemId}, ${`TEST-CON-${runId}`}, 'Large', 10, 1)`.execute(db);
      variantId = Number(variantResult.insertId);

      // Create 3 reference IDs for concurrent reservations
      for (let i = 0; i < 3; i++) {
        refIds.push(`TEST-CON-${runId}-${i}`);
      }

      // Start 3 concurrent reservations of 5 each (only 2 should succeed = 10 total)
      // We need to run them truly concurrently using Promise.all
      const results = await Promise.all([
        reserveVariantStock(
          company.id,
          outlet.id,
          [{ variant_id: variantId, quantity: 5 }],
          refIds[0]
        ),
        reserveVariantStock(
          company.id,
          outlet.id,
          [{ variant_id: variantId, quantity: 5 }],
          refIds[1]
        ),
        reserveVariantStock(
          company.id,
          outlet.id,
          [{ variant_id: variantId, quantity: 5 }],
          refIds[2]
        )
      ]);

      // Count successes and failures
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      // Exactly 2 should succeed and 1 should fail (due to only 10 stock)
      assert.strictEqual(successCount, 2, `Expected 2 successes, got ${successCount}`);
      assert.strictEqual(failureCount, 1, `Expected 1 failure, got ${failureCount}`);

      // Verify the conflict details
      const failedResult = results.find(r => !r.success);
      assert.ok(failedResult?.conflicts, "Failed result should have conflicts");
      assert.strictEqual(failedResult?.conflicts?.[0].variant_id, variantId);
      assert.strictEqual(failedResult?.conflicts?.[0].requested, 5);
      assert.strictEqual(failedResult?.conflicts?.[0].available, 0, "Should show 0 available after 2 reservations");

      // Verify final stock state
      const stockResult = await sql`SELECT quantity, reserved_quantity, available_quantity 
       FROM inventory_stock 
       WHERE company_id = ${company.id} AND outlet_id = ${outlet.id} AND variant_id = ${variantId}`.execute(db);
      assert.strictEqual(stockResult.rows.length, 1, "Should have inventory_stock record");
      const stockRow = stockResult.rows[0] as { quantity: number; reserved_quantity: number; available_quantity: number };
      assert.strictEqual(Number(stockRow.quantity), 10, "Quantity should be 10");
      assert.strictEqual(Number(stockRow.reserved_quantity), 10, "Reserved should be 10");
      assert.strictEqual(Number(stockRow.available_quantity), 0, "Available should be 0");

      // Verify 2 reservation transactions were recorded
      const txResult = await sql`SELECT reference_id, transaction_type, quantity_delta 
       FROM inventory_transactions 
       WHERE variant_id = ${variantId} AND transaction_type = 3
       ORDER BY id`.execute(db);
      assert.strictEqual(txResult.rows.length, 2, "Should have exactly 2 reservation transactions");
    } finally {
      // Clean up in correct order
      for (const refId of refIds) {
        await sql`DELETE FROM inventory_transactions WHERE reference_id = ${refId}`.execute(db);
      }
      await sql`DELETE FROM inventory_stock WHERE variant_id = ${variantId}`.execute(db);
      await sql`DELETE FROM item_variant_combinations WHERE variant_id = ${variantId}`.execute(db);
      await sql`DELETE FROM item_variants WHERE id = ${variantId}`.execute(db);
      await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      await sql`DELETE FROM outlets WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM companies WHERE id = ${company.id}`.execute(db);
    }
  });
});
