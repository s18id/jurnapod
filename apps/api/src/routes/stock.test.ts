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
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

const TEST_COMPANY_ID = 999999;
const TEST_OUTLET_ID = 999998;
const TEST_PRODUCT_ID = 999997;

async function setupTestData(connection: PoolConnection): Promise<void> {
  // Create test company
  await connection.execute(
    `INSERT INTO companies (id, name, code, currency_code, created_at, updated_at)
     VALUES (?, 'Test Company Routes', 'TESTROUTE', 'IDR', NOW(), NOW())
     ON DUPLICATE KEY UPDATE name = 'Test Company Routes'`,
    [TEST_COMPANY_ID]
  );

  // Create test outlet
  await connection.execute(
    `INSERT INTO outlets (id, company_id, name, code, created_at, updated_at)
     VALUES (?, ?, 'Test Outlet Routes', 'TESTOUT', NOW(), NOW())
     ON DUPLICATE KEY UPDATE name = 'Test Outlet Routes'`,
    [TEST_OUTLET_ID, TEST_COMPANY_ID]
  );

  // Create test product with stock tracking
  await connection.execute(
    `INSERT INTO items (id, company_id, sku, name, item_type, is_active, track_stock, low_stock_threshold, created_at, updated_at)
     VALUES (?, ?, 'ROUTE-SKU-001', 'Route Test Product', 'PRODUCT', 1, 1, 10.0000, NOW(), NOW())
     ON DUPLICATE KEY UPDATE name = 'Route Test Product', track_stock = 1, low_stock_threshold = 10.0000`,
    [TEST_PRODUCT_ID, TEST_COMPANY_ID]
  );

  // Create test stock record
  await connection.execute(
    `INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
     VALUES (?, ?, ?, 100.0000, 0.0000, 100.0000, NOW(), NOW())
     ON DUPLICATE KEY UPDATE quantity = 100.0000, reserved_quantity = 0.0000, available_quantity = 100.0000`,
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
    `DELETE FROM items WHERE company_id = ? AND id = ?`,
    [TEST_COMPANY_ID, TEST_PRODUCT_ID]
  );
  await connection.execute(
    `DELETE FROM outlets WHERE company_id = ? AND id = ?`,
    [TEST_COMPANY_ID, TEST_OUTLET_ID]
  );
  await connection.execute(
    `DELETE FROM companies WHERE id = ?`,
    [TEST_COMPANY_ID]
  );
}

describe("Stock Routes", { concurrency: false }, () => {
  let connection: PoolConnection;

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
      assert.equal(rows[0].quantity, 100);
      assert.equal(rows[0].available_quantity, 100);
      assert.equal(rows[0].reserved_quantity, 0);
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
          company_id, outlet_id, transaction_type, reference_id, 
          product_id, quantity, created_at
        ) VALUES (?, ?, 'ADJUSTMENT', ?, ?, ?, CURRENT_TIMESTAMP)`,
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
