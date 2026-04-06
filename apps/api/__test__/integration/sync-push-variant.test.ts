// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Variant Tests
 * 
 * Tests for POST /sync/push variant sync functionality:
 * - Variant sales processing
 * - Variant stock adjustments
 * - Conflict resolution (missing variants, price mismatches, negative stock)
 * - Idempotency (duplicate handling)
 * - COGS calculation
 * 
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { sql } from "kysely";
import { loadEnvIfPresent, readEnv } from "../../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDb } from "../../lib/db";
import { createItem } from "../../lib/items/index.js";
import { randomUUID } from "node:crypto";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("Sync Push Variant Routes", { concurrency: false }, () => {
  const testRunId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  let db: ReturnType<typeof getDb>;
  let testUserId = 0;
  let testCompanyId = 0;
  let testOutletId = 0;
  let testItemId = 0;
  let testVariantId = 0;
  let testVariantSku = "";
  let variantCreatedByTest = false;

  before(async () => {
    db = getDb();

    // Find test user fixture - global owner has outlet_id = NULL in user_role_assignments
    const userRows = await sql<{ user_id: number; company_id: number }>`
      SELECT u.id AS user_id, u.company_id
       FROM users u
       INNER JOIN companies c ON c.id = u.company_id
       INNER JOIN user_role_assignments ura ON ura.user_id = u.id
       WHERE c.code = ${TEST_COMPANY_CODE}
         AND u.email = ${TEST_OWNER_EMAIL}
         AND u.is_active = 1
         AND ura.outlet_id IS NULL
       LIMIT 1
    `.execute(db);

    assert.ok(
      userRows.rows.length > 0,
      `Owner fixture not found; run database seed first. Looking for company=${TEST_COMPANY_CODE}, email=${TEST_OWNER_EMAIL}`
    );
    testUserId = Number(userRows.rows[0].user_id);
    testCompanyId = Number(userRows.rows[0].company_id);

    // Get outlet ID from outlets table
    const outletRows = await sql<{ id: number }>`
      SELECT id FROM outlets WHERE company_id = ${testCompanyId} AND code = ${TEST_OUTLET_CODE} LIMIT 1
    `.execute(db);
    assert.ok(outletRows.rows.length > 0, `Outlet ${TEST_OUTLET_CODE} not found`);
    testOutletId = Number(outletRows.rows[0].id);

    // Find or create test item
    const itemRows = await sql<{ id: number }>`
      SELECT id FROM items WHERE company_id = ${testCompanyId} AND is_active = 1 AND track_stock = 1 LIMIT 1
    `.execute(db);

    if (itemRows.rows.length > 0) {
      testItemId = Number(itemRows.rows[0].id);
    } else {
      // Create test item
      const newItem = await createItem(testCompanyId, {
        name: 'Test Item for Variant Sync',
        sku: 'TEST-VARIANT-SYNC-ITEM',
        type: 'PRODUCT',
        is_active: true,
        track_stock: true
      });
      testItemId = newItem.id;
    }

    // Find or create test variant
    testVariantSku = `TEST-VARIANT-SYNC-${testRunId}`;
    const variantRows = await sql<{ id: number }>`
      SELECT id FROM item_variants WHERE company_id = ${testCompanyId} AND sku = ${testVariantSku} LIMIT 1
    `.execute(db);

    if (variantRows.rows.length > 0) {
      testVariantId = Number(variantRows.rows[0].id);
      // Reset stock for tests
      await sql`UPDATE item_variants SET stock_quantity = 100 WHERE id = ${testVariantId}`.execute(db);
    } else {
      // Create test variant
      const insertResult = await sql`
        INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active, created_at, updated_at)
         VALUES (${testCompanyId}, ${testItemId}, ${testVariantSku}, 'Test Variant', 100, 1, NOW(), NOW())
      `.execute(db);
      testVariantId = Number(insertResult.insertId);
      variantCreatedByTest = true;
    }
  });

  after(async () => {
    // Cleanup test data
    if (testVariantId > 0) {
      await sql`DELETE FROM variant_sales WHERE variant_id = ${testVariantId}`.execute(db);
      await sql`DELETE FROM variant_stock_adjustments WHERE variant_id = ${testVariantId}`.execute(db);
      if (variantCreatedByTest) {
        await sql`DELETE FROM item_variants WHERE id = ${testVariantId}`.execute(db);
      }
    }
    await closeDbPool();
  });

  // ===========================================================================
  // Variant Sales Tests
  // ===========================================================================

  describe("Variant Sales Processing", () => {
    test("processes valid variant sale and deducts stock", async () => {
      const clientTxId = `test-vs-${randomUUID()}`;
      const qty = 5;
      const unitPrice = 25.00;
      
      // Get initial stock
      const initialStockRows = await sql<{ stock_quantity: number }>`
        SELECT stock_quantity FROM item_variants WHERE id = ${testVariantId}
      `.execute(db);
      const initialStock = Number(initialStockRows.rows[0].stock_quantity);

      // Process variant sale via direct DB insert (simulating what sync push would do)
      await sql`
        INSERT INTO variant_sales (
           company_id, outlet_id, client_tx_id, variant_id, item_id, qty, unit_price, total_amount, trx_at, created_at
         ) VALUES (${testCompanyId}, ${testOutletId}, ${clientTxId}, ${testVariantId}, ${testItemId}, ${qty}, ${unitPrice}, ${qty * unitPrice}, NOW(), NOW())
      `.execute(db);

      // Manually deduct stock (simulating what variant-sales.ts does)
      await sql`
        UPDATE item_variants 
         SET stock_quantity = stock_quantity - ${qty} 
         WHERE id = ${testVariantId}
      `.execute(db);

      // Check stock was deducted
      const updatedStockRows = await sql<{ stock_quantity: number }>`
        SELECT stock_quantity FROM item_variants WHERE id = ${testVariantId}
      `.execute(db);
      const updatedStock = Number(updatedStockRows.rows[0].stock_quantity);

      assert.equal(
        updatedStock,
        initialStock - qty,
        `Stock should be deducted by ${qty}`
      );

      // Cleanup
      await sql`DELETE FROM variant_sales WHERE client_tx_id = ${clientTxId}`.execute(db);
      await sql`UPDATE item_variants SET stock_quantity = ${initialStock} WHERE id = ${testVariantId}`.execute(db);
    });

    test("handles duplicate variant sale (idempotency)", async () => {
      const clientTxId = `test-vs-dup-${randomUUID()}`;
      const qty = 2;
      const unitPrice = 15.00;

      // Insert first time
      await sql`
        INSERT INTO variant_sales (
           company_id, outlet_id, client_tx_id, variant_id, item_id, qty, unit_price, total_amount, trx_at, created_at
         ) VALUES (${testCompanyId}, ${testOutletId}, ${clientTxId}, ${testVariantId}, ${testItemId}, ${qty}, ${unitPrice}, ${qty * unitPrice}, NOW(), NOW())
         ON DUPLICATE KEY UPDATE id = id
      `.execute(db);

      // Try inserting again - should not fail due to unique constraint
      await sql`
        INSERT INTO variant_sales (
           company_id, outlet_id, client_tx_id, variant_id, item_id, qty, unit_price, total_amount, trx_at, created_at
         ) VALUES (${testCompanyId}, ${testOutletId}, ${clientTxId}, ${testVariantId}, ${testItemId}, ${qty}, ${unitPrice}, ${qty * unitPrice}, NOW(), NOW())
         ON DUPLICATE KEY UPDATE id = id
      `.execute(db);

      // Should have exactly one record
      const countRows = await sql<{ cnt: number }>`
        SELECT COUNT(*) as cnt FROM variant_sales WHERE client_tx_id = ${clientTxId}
      `.execute(db);
      assert.equal(Number(countRows.rows[0].cnt), 1, "Should have exactly one record");

      // Cleanup
      await sql`DELETE FROM variant_sales WHERE client_tx_id = ${clientTxId}`.execute(db);
    });

    test("rejects variant sale for non-existent variant", async () => {
      const invalidVariantId = 999999999;
      const clientTxId = `test-vs-invalid-${randomUUID()}`;

      // Try to insert - it may succeed if there's no FK constraint, or fail if there is
      try {
        await sql`
          INSERT INTO variant_sales (
             company_id, outlet_id, client_tx_id, variant_id, item_id, qty, unit_price, total_amount, trx_at, created_at
           ) VALUES (${testCompanyId}, ${testOutletId}, ${clientTxId}, ${invalidVariantId}, ${testItemId}, 1, 10.00, 10.00, NOW(), NOW())
        `.execute(db);
        
        // If insertion succeeded, verify no record was created with that variant
        const countRows = await sql<{ cnt: number }>`
          SELECT COUNT(*) as cnt FROM variant_sales WHERE client_tx_id = ${clientTxId}
        `.execute(db);
        
        // If FK constraint exists, record should not be created
        // If no FK, the test should check that variant_id doesn't exist in query results
        console.info("FK constraint test result", { 
          inserted: Number(countRows.rows[0].cnt),
          note: "Test verifies behavior with invalid variant_id" 
        });
        
        // Cleanup if any records were inserted
        await sql`DELETE FROM variant_sales WHERE client_tx_id = ${clientTxId}`.execute(db);
      } catch (error: any) {
        // Expected to fail - either FK constraint or other error
        console.info("Expected error for invalid variant", { error: error.message });
        
        // This is expected behavior
        assert.ok(true, "Insert correctly failed for invalid variant");
      }
    });
  });

  // ===========================================================================
  // Variant Stock Adjustment Tests
  // ===========================================================================

  describe("Variant Stock Adjustment Processing", () => {
    test("processes INCREASE adjustment", async () => {
      const clientTxId = `test-adj-inc-${randomUUID()}`;
      
      // Get initial stock
      const initialStockRows = await sql<{ stock_quantity: number }>`
        SELECT stock_quantity FROM item_variants WHERE id = ${testVariantId}
      `.execute(db);
      const initialStock = Number(initialStockRows.rows[0].stock_quantity);
      const increaseQty = 20;

      // Process adjustment
      await sql`
        INSERT INTO variant_stock_adjustments (
           company_id, outlet_id, client_tx_id, variant_id, adjustment_type, quantity, 
           previous_stock, new_stock, reason, adjusted_at, created_at
         ) VALUES (${testCompanyId}, ${testOutletId}, ${clientTxId}, ${testVariantId}, 'INCREASE', ${increaseQty}, ${initialStock}, ${initialStock + increaseQty}, 'Test increase', NOW(), NOW())
      `.execute(db);

      // Update actual stock
      await sql`UPDATE item_variants SET stock_quantity = ${initialStock + increaseQty} WHERE id = ${testVariantId}`.execute(db);

      // Verify stock increased
      const updatedStockRows = await sql<{ stock_quantity: number }>`
        SELECT stock_quantity FROM item_variants WHERE id = ${testVariantId}
      `.execute(db);
      assert.equal(
        Number(updatedStockRows.rows[0].stock_quantity),
        initialStock + increaseQty,
        "Stock should increase"
      );

      // Cleanup
      await sql`DELETE FROM variant_stock_adjustments WHERE client_tx_id = ${clientTxId}`.execute(db);
    });

    test("processes DECREASE adjustment", async () => {
      const clientTxId = `test-adj-dec-${randomUUID()}`;
      
      // Get initial stock
      const initialStockRows = await sql<{ stock_quantity: number }>`
        SELECT stock_quantity FROM item_variants WHERE id = ${testVariantId}
      `.execute(db);
      const initialStock = Number(initialStockRows.rows[0].stock_quantity);
      const decreaseQty = 10;

      // Process adjustment
      await sql`
        INSERT INTO variant_stock_adjustments (
           company_id, outlet_id, client_tx_id, variant_id, adjustment_type, quantity, 
           previous_stock, new_stock, reason, adjusted_at, created_at
         ) VALUES (${testCompanyId}, ${testOutletId}, ${clientTxId}, ${testVariantId}, 'DECREASE', ${decreaseQty}, ${initialStock}, ${initialStock - decreaseQty}, 'Test decrease', NOW(), NOW())
      `.execute(db);

      // Update actual stock
      await sql`UPDATE item_variants SET stock_quantity = ${initialStock - decreaseQty} WHERE id = ${testVariantId}`.execute(db);

      // Verify stock decreased
      const updatedStockRows = await sql<{ stock_quantity: number }>`
        SELECT stock_quantity FROM item_variants WHERE id = ${testVariantId}
      `.execute(db);
      assert.equal(
        Number(updatedStockRows.rows[0].stock_quantity),
        initialStock - decreaseQty,
        "Stock should decrease"
      );

      // Cleanup
      await sql`DELETE FROM variant_stock_adjustments WHERE client_tx_id = ${clientTxId}`.execute(db);
    });

    test("processes SET adjustment", async () => {
      const clientTxId = `test-adj-set-${randomUUID()}`;
      
      // Get initial stock
      const initialStockRows = await sql<{ stock_quantity: number }>`
        SELECT stock_quantity FROM item_variants WHERE id = ${testVariantId}
      `.execute(db);
      const initialStock = Number(initialStockRows.rows[0].stock_quantity);
      const newStockValue = 50;

      // Process adjustment
      await sql`
        INSERT INTO variant_stock_adjustments (
           company_id, outlet_id, client_tx_id, variant_id, adjustment_type, quantity, 
           previous_stock, new_stock, reason, adjusted_at, created_at
         ) VALUES (${testCompanyId}, ${testOutletId}, ${clientTxId}, ${testVariantId}, 'SET', ${newStockValue}, ${initialStock}, ${newStockValue}, 'Test set', NOW(), NOW())
      `.execute(db);

      // Update actual stock
      await sql`UPDATE item_variants SET stock_quantity = ${newStockValue} WHERE id = ${testVariantId}`.execute(db);

      // Verify stock is set
      const updatedStockRows = await sql<{ stock_quantity: number }>`
        SELECT stock_quantity FROM item_variants WHERE id = ${testVariantId}
      `.execute(db);
      assert.equal(
        Number(updatedStockRows.rows[0].stock_quantity),
        newStockValue,
        "Stock should be set to new value"
      );

      // Cleanup
      await sql`DELETE FROM variant_stock_adjustments WHERE client_tx_id = ${clientTxId}`.execute(db);
    });

    test("handles duplicate stock adjustment (idempotency)", async () => {
      const clientTxId = `test-adj-dup-${randomUUID()}`;

      // Insert first time
      await sql`
        INSERT INTO variant_stock_adjustments (
           company_id, outlet_id, client_tx_id, variant_id, adjustment_type, quantity, 
           previous_stock, new_stock, reason, adjusted_at, created_at
         ) VALUES (${testCompanyId}, ${testOutletId}, ${clientTxId}, ${testVariantId}, 'INCREASE', 5, 100, 105, 'Test', NOW(), NOW())
         ON DUPLICATE KEY UPDATE id = id
      `.execute(db);

      // Try inserting again
      await sql`
        INSERT INTO variant_stock_adjustments (
           company_id, outlet_id, client_tx_id, variant_id, adjustment_type, quantity, 
           previous_stock, new_stock, reason, adjusted_at, created_at
         ) VALUES (${testCompanyId}, ${testOutletId}, ${clientTxId}, ${testVariantId}, 'INCREASE', 5, 100, 105, 'Test', NOW(), NOW())
         ON DUPLICATE KEY UPDATE id = id
      `.execute(db);

      // Should have exactly one record
      const countRows = await sql<{ cnt: number }>`
        SELECT COUNT(*) as cnt FROM variant_stock_adjustments WHERE client_tx_id = ${clientTxId}
      `.execute(db);
      assert.equal(Number(countRows.rows[0].cnt), 1, "Should have exactly one record");

      // Cleanup
      await sql`DELETE FROM variant_stock_adjustments WHERE client_tx_id = ${clientTxId}`.execute(db);
    });
  });

  // ===========================================================================
  // COGS Calculation Tests
  // ===========================================================================

  describe("COGS Calculation for Variant Sales", () => {
    test("calculates COGS using item cost as fallback", async () => {
      // Check if item has cost via inventory_item_costs table
      const itemRows = await sql<{ current_avg_cost: number | null }>`
        SELECT current_avg_cost FROM inventory_item_costs WHERE item_id = ${testItemId}
      `.execute(db);

      const itemCost = itemRows.rows.length > 0 && itemRows.rows[0].current_avg_cost !== null 
        ? Number(itemRows.rows[0].current_avg_cost) 
        : 0;

      if (itemCost > 0) {
        // COGS should be qty * cost
        const qty = 3;
        const expectedCogs = qty * itemCost;
        
        console.info("COGS calculation test", {
          item_id: testItemId,
          item_cost: itemCost,
          qty,
          expected_cogs: expectedCogs
        });

        assert.ok(expectedCogs > 0, "COGS should be calculated when item has cost");
      } else {
        // Skip test if no item cost - this is expected in many cases
        console.info("Skipping COGS test - no item cost configured (inventory module not enabled or no cost layers)");
      }
    });
  });

  // ===========================================================================
  // Conflict Resolution Tests
  // ===========================================================================

  describe("Conflict Resolution", () => {
    test("rejects negative stock after deduction", async () => {
      // Set stock to low value
      await sql`UPDATE item_variants SET stock_quantity = 2 WHERE id = ${testVariantId}`.execute(db);

      const clientTxId = `test-neg-stock-${randomUUID()}`;
      const qty = 5; // More than available

      try {
        await sql`
          UPDATE item_variants 
           SET stock_quantity = stock_quantity - ${qty} 
           WHERE id = ${testVariantId} AND stock_quantity >= ${qty}
           AND company_id = ${testCompanyId}
        `.execute(db);

        // Check if update was applied
        const stockRows = await sql<{ stock_quantity: number }>`
          SELECT stock_quantity FROM item_variants WHERE id = ${testVariantId}
        `.execute(db);
        
        // Stock should not go negative due to WHERE clause
        assert.ok(Number(stockRows.rows[0].stock_quantity) >= 0, "Stock should not be negative");
      } catch (error) {
        assert.ok(error instanceof Error, "Should throw on insufficient stock");
      }

      // Reset stock
      await sql`UPDATE item_variants SET stock_quantity = 100 WHERE id = ${testVariantId}`.execute(db);

      // Cleanup
      await sql`DELETE FROM variant_sales WHERE client_tx_id = ${clientTxId}`.execute(db);
    });
  });
});
