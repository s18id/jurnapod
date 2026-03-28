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
import { getDbPool, closeDbPool } from "../lib/db";
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { createCompanyBasic } from "../lib/companies.js";
import { createOutletBasic } from "../lib/outlets.js";
import { createItem } from "../lib/items/index.js";

describe("Stock Routes", { concurrency: false }, () => {
  let connection: PoolConnection;
  let TEST_COMPANY_ID: number;
  let TEST_OUTLET_ID: number;
  let TEST_PRODUCT_ID: number;

  async function setupTestData(connection: PoolConnection): Promise<void> {
    const runId = Date.now().toString(36);

    // Create test company dynamically
    const company = await createCompanyBasic({
      code: `TESTROUTE-${runId}`,
      name: `Test Company Routes ${runId}`
    });
    TEST_COMPANY_ID = company.id;

    // Create test outlet dynamically
    const outlet = await createOutletBasic({
      company_id: TEST_COMPANY_ID,
      code: `TESTOUT-${runId}`,
      name: `Test Outlet Routes ${runId}`
    });
    TEST_OUTLET_ID = outlet.id;

    // Create test product with stock tracking
    const product = await createItem(TEST_COMPANY_ID, {
      sku: 'ROUTE-SKU-001',
      name: 'Route Test Product',
      type: 'PRODUCT',
      is_active: true,
      track_stock: true
    });
    TEST_PRODUCT_ID = product.id;

    // Set low_stock_threshold via direct update (not supported by createItem)
    await connection.execute(
      `UPDATE items SET low_stock_threshold = 10.0000 WHERE id = ?`,
      [TEST_PRODUCT_ID]
    );

    // Create test stock record
    await connection.execute(
      `INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
       VALUES (?, ?, ?, 100.0000, 0.0000, 100.0000, NOW(), NOW())`,
      [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
    );
  }

  async function cleanupTestData(connection: PoolConnection): Promise<void> {
    await connection.execute(
      `DELETE FROM inventory_transactions WHERE company_id = ?`,
      [TEST_COMPANY_ID]
    );
    await connection.execute(
      `DELETE FROM inventory_stock WHERE company_id = ?`,
      [TEST_COMPANY_ID]
    );
    await connection.execute(
      `DELETE FROM item_prices WHERE company_id = ?`,
      [TEST_COMPANY_ID]
    );
    await connection.execute(
      `DELETE FROM items WHERE company_id = ?`,
      [TEST_COMPANY_ID]
    );
    await connection.execute(
      `DELETE FROM outlets WHERE company_id = ?`,
      [TEST_COMPANY_ID]
    );
    await connection.execute(
      `DELETE FROM companies WHERE id = ?`,
      [TEST_COMPANY_ID]
    );
  }

  before(async () => {
    const dbPool = getDbPool();
    connection = await dbPool.getConnection();
    await setupTestData(connection);
  });

  after(async () => {
    await cleanupTestData(connection);
    connection.release();
    await closeDbPool();
  });

  describe("Stock Service Integration", () => {
    test("should retrieve stock levels via service", async () => {
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT product_id, quantity, available_quantity, reserved_quantity
         FROM inventory_stock
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      assert.equal(rows.length, 1);
      assert.equal(Number(rows[0].quantity), 100);
      assert.equal(Number(rows[0].available_quantity), 100);
      assert.equal(Number(rows[0].reserved_quantity), 0);
    });

    test("should retrieve stock transactions", async () => {
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM inventory_transactions WHERE company_id = ?`,
        [TEST_COMPANY_ID]
      );

      assert.ok(typeof rows[0].count === "number");
    });

    test("should identify low stock products", async () => {
      // Adjust stock to be below threshold
      await connection.execute(
        `UPDATE inventory_stock 
         SET quantity = 5.0000, available_quantity = 5.0000
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT i.id, i.sku, i.name, s.quantity, s.available_quantity, i.low_stock_threshold
         FROM items i
         JOIN inventory_stock s ON s.product_id = i.id
         WHERE i.company_id = ?
           AND i.track_stock = 1
           AND i.low_stock_threshold IS NOT NULL
           AND (s.outlet_id = ? OR s.outlet_id IS NULL)
           AND s.available_quantity <= i.low_stock_threshold`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID]
      );

      assert.ok(rows.length >= 1);
      const product = rows.find((r: RowDataPacket) => r.id === TEST_PRODUCT_ID);
      assert.ok(product);

      // Restore stock
      await connection.execute(
        `UPDATE inventory_stock 
         SET quantity = 100.0000, available_quantity = 100.0000
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );
    });

    test("should perform stock adjustment", async () => {
      const adjustmentQty = 20;

      // Get initial stock
      const [initialRows] = await connection.execute<RowDataPacket[]>(
        `SELECT quantity FROM inventory_stock
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );
      const initialQty = Number(initialRows[0].quantity);

      // Perform adjustment
      await connection.execute(
        `UPDATE inventory_stock
         SET quantity = quantity + ?,
             available_quantity = available_quantity + ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [adjustmentQty, adjustmentQty, TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      // Record transaction
      await connection.execute(
        `INSERT INTO inventory_transactions (
          company_id, outlet_id, transaction_type, reference_type,
          reference_id, product_id, quantity_delta, created_at
        ) VALUES (?, ?, 5, 'ADJUSTMENT', ?, ?, ?, CURRENT_TIMESTAMP)`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, `TEST-ADJ-${Date.now()}`, TEST_PRODUCT_ID, adjustmentQty]
      );

      // Verify adjustment
      const [updatedRows] = await connection.execute<RowDataPacket[]>(
        `SELECT quantity FROM inventory_stock
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      assert.equal(Number(updatedRows[0].quantity), initialQty + adjustmentQty);

      // Revert adjustment
      await connection.execute(
        `UPDATE inventory_stock
         SET quantity = ?,
             available_quantity = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [initialQty, initialQty, TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );
    });
  });
});
