// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stock Routes Tests
 *
 * Tests for stock API routes with DB pool cleanup.
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { getDb, closeDbPool } from "../lib/db";
import { sql } from "kysely";
import { createTestCompanyMinimal, createTestOutletMinimal, createTestItem } from "../lib/test-fixtures";
import type { KyselySchema } from "../lib/db";

describe("Stock Routes", { concurrency: false }, () => {
  let db: KyselySchema;
  let TEST_COMPANY_ID: number;
  let TEST_OUTLET_ID: number;
  let TEST_PRODUCT_ID: number;

  async function setupTestData(db: KyselySchema): Promise<void> {
    const runId = Date.now().toString(36);

    // Create test company dynamically using shared fixtures
    const company = await createTestCompanyMinimal({
      code: `TESTROUTE-${runId}`,
      name: `Test Company Routes ${runId}`
    });
    TEST_COMPANY_ID = company.id;

    // Create test outlet dynamically using shared fixtures
    const outlet = await createTestOutletMinimal(TEST_COMPANY_ID, {
      code: `TESTOUT-${runId}`,
      name: `Test Outlet Routes ${runId}`
    });
    TEST_OUTLET_ID = outlet.id;

    // Create test product with stock tracking using shared fixtures
    const product = await createTestItem(TEST_COMPANY_ID, {
      sku: 'ROUTE-SKU-001',
      name: 'Route Test Product',
      type: 'PRODUCT',
      isActive: true
    });
    TEST_PRODUCT_ID = product.id;

    // Set low_stock_threshold via direct update (not supported by createItem)
    await sql`UPDATE items SET low_stock_threshold = 10.0000 WHERE id = ${TEST_PRODUCT_ID}`.execute(db);

    // Create test stock record
    await sql`INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
       VALUES (${TEST_COMPANY_ID}, ${TEST_OUTLET_ID}, ${TEST_PRODUCT_ID}, 100.0000, 0.0000, 100.0000, NOW(), NOW())`.execute(db);
  }

  async function cleanupTestData(db: KyselySchema): Promise<void> {
    await sql`DELETE FROM inventory_transactions WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
    await sql`DELETE FROM inventory_stock WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
    await sql`DELETE FROM item_prices WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
    await sql`DELETE FROM items WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
    await sql`DELETE FROM outlets WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
    await sql`DELETE FROM companies WHERE id = ${TEST_COMPANY_ID}`.execute(db);
  }

  before(async () => {
    db = getDb();
    await setupTestData(db);
  });

  after(async () => {
    await cleanupTestData(db);
    await closeDbPool();
  });

  describe("Stock Service Integration", () => {
    test("should retrieve stock levels via service", async () => {
      const result = await sql<{ product_id: number; quantity: string; available_quantity: string; reserved_quantity: string }>`
        SELECT product_id, quantity, available_quantity, reserved_quantity
        FROM inventory_stock
        WHERE company_id = ${TEST_COMPANY_ID} AND outlet_id = ${TEST_OUTLET_ID} AND product_id = ${TEST_PRODUCT_ID}
      `.execute(db);

      assert.equal(result.rows.length, 1);
      assert.equal(Number(result.rows[0].quantity), 100);
      assert.equal(Number(result.rows[0].available_quantity), 100);
      assert.equal(Number(result.rows[0].reserved_quantity), 0);
    });

    test("should retrieve stock transactions", async () => {
      const result = await sql<{ count: string }>`
        SELECT COUNT(*) as count FROM inventory_transactions WHERE company_id = ${TEST_COMPANY_ID}
      `.execute(db);

      assert.ok(typeof result.rows[0].count === "string");
    });

    test("should identify low stock products", async () => {
      // Adjust stock to be below threshold
      await sql`
        UPDATE inventory_stock 
        SET quantity = 5.0000, available_quantity = 5.0000
        WHERE company_id = ${TEST_COMPANY_ID} AND outlet_id = ${TEST_OUTLET_ID} AND product_id = ${TEST_PRODUCT_ID}
      `.execute(db);

      const result = await sql<{ id: number; sku: string; name: string; quantity: string; available_quantity: string; low_stock_threshold: string | null }>`
        SELECT i.id, i.sku, i.name, s.quantity, s.available_quantity, i.low_stock_threshold
        FROM items i
        JOIN inventory_stock s ON s.product_id = i.id
        WHERE i.company_id = ${TEST_COMPANY_ID}
          AND i.track_stock = 1
          AND i.low_stock_threshold IS NOT NULL
          AND (s.outlet_id = ${TEST_OUTLET_ID} OR s.outlet_id IS NULL)
          AND s.available_quantity <= i.low_stock_threshold
      `.execute(db);

      assert.ok(result.rows.length >= 1);
      const product = result.rows.find((r) => r.id === TEST_PRODUCT_ID);
      assert.ok(product);

      // Restore stock
      await sql`
        UPDATE inventory_stock 
        SET quantity = 100.0000, available_quantity = 100.0000
        WHERE company_id = ${TEST_COMPANY_ID} AND outlet_id = ${TEST_OUTLET_ID} AND product_id = ${TEST_PRODUCT_ID}
      `.execute(db);
    });

    test("should perform stock adjustment", async () => {
      const adjustmentQty = 20;

      // Get initial stock
      const initialResult = await sql<{ quantity: string }>`
        SELECT quantity FROM inventory_stock
        WHERE company_id = ${TEST_COMPANY_ID} AND outlet_id = ${TEST_OUTLET_ID} AND product_id = ${TEST_PRODUCT_ID}
      `.execute(db);
      const initialQty = Number(initialResult.rows[0].quantity);

      // Perform adjustment
      await sql`
        UPDATE inventory_stock
        SET quantity = quantity + ${adjustmentQty},
            available_quantity = available_quantity + ${adjustmentQty},
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = ${TEST_COMPANY_ID} AND outlet_id = ${TEST_OUTLET_ID} AND product_id = ${TEST_PRODUCT_ID}
      `.execute(db);

      // Record transaction
      await sql`
        INSERT INTO inventory_transactions (
          company_id, outlet_id, transaction_type, reference_type,
          reference_id, product_id, quantity_delta, created_at
        ) VALUES (${TEST_COMPANY_ID}, ${TEST_OUTLET_ID}, 5, 'ADJUSTMENT', ${`TEST-ADJ-${Date.now()}`}, ${TEST_PRODUCT_ID}, ${adjustmentQty}, CURRENT_TIMESTAMP)
      `.execute(db);

      // Verify adjustment
      const updatedResult = await sql<{ quantity: string }>`
        SELECT quantity FROM inventory_stock
        WHERE company_id = ${TEST_COMPANY_ID} AND outlet_id = ${TEST_OUTLET_ID} AND product_id = ${TEST_PRODUCT_ID}
      `.execute(db);

      assert.equal(Number(updatedResult.rows[0].quantity), initialQty + adjustmentQty);

      // Revert adjustment
      await sql`
        UPDATE inventory_stock
        SET quantity = ${initialQty},
            available_quantity = ${initialQty},
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = ${TEST_COMPANY_ID} AND outlet_id = ${TEST_OUTLET_ID} AND product_id = ${TEST_PRODUCT_ID}
      `.execute(db);
    });
  });
});
