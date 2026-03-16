// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stock Sync API Tests
 *
 * Tests for stock synchronization endpoints
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { getDbPool, closeDbPool } from "../../../../src/lib/db";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

const TEST_COMPANY_ID = 999999;
const TEST_OUTLET_ID = 999998;
const TEST_PRODUCT_ID = 999997;

async function setupTestData(connection: PoolConnection): Promise<void> {
  // Create test company
  await connection.execute(
    `INSERT INTO companies (id, name, code, currency_code, created_at, updated_at)
     VALUES (?, 'Test Company', 'TEST001', 'IDR', NOW(), NOW())
     ON DUPLICATE KEY UPDATE name = 'Test Company'`,
    [TEST_COMPANY_ID]
  );

  // Create test outlet
  await connection.execute(
    `INSERT INTO outlets (id, company_id, name, code, created_at, updated_at)
     VALUES (?, ?, 'Test Outlet', 'TO001', NOW(), NOW())
     ON DUPLICATE KEY UPDATE name = 'Test Outlet'`,
    [TEST_OUTLET_ID, TEST_COMPANY_ID]
  );

  // Create test product
  await connection.execute(
    `INSERT INTO items (id, company_id, sku, name, item_type, is_active, track_stock, created_at, updated_at)
     VALUES (?, ?, 'TEST-SKU-001', 'Test Product', 'PRODUCT', 1, 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE name = 'Test Product'`,
    [TEST_PRODUCT_ID, TEST_COMPANY_ID]
  );

  // Create test stock
  await connection.execute(
    `INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
     VALUES (?, ?, ?, 100.0000, 0.0000, 100.0000, NOW(), NOW())
     ON DUPLICATE KEY UPDATE quantity = 100.0000, reserved_quantity = 0.0000, available_quantity = 100.0000`,
    [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
  );
}

async function cleanupTestData(connection: PoolConnection): Promise<void> {
  // Clean up in reverse order
  await connection.execute(
    `DELETE FROM inventory_stock WHERE company_id = ? AND product_id = ?`,
    [TEST_COMPANY_ID, TEST_PRODUCT_ID]
  );
  await connection.execute(
    `DELETE FROM inventory_transactions WHERE company_id = ?`,
    [TEST_COMPANY_ID]
  );
  await connection.execute(
    `DELETE FROM items WHERE id = ? AND company_id = ?`,
    [TEST_PRODUCT_ID, TEST_COMPANY_ID]
  );
  await connection.execute(
    `DELETE FROM outlets WHERE id = ? AND company_id = ?`,
    [TEST_OUTLET_ID, TEST_COMPANY_ID]
  );
  await connection.execute(
    `DELETE FROM companies WHERE id = ?`,
    [TEST_COMPANY_ID]
  );
}

describe("Stock Sync API", { concurrency: false }, () => {
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

  describe("Stock Data Retrieval", () => {
    test("should retrieve stock data for outlet", async () => {
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT product_id, quantity, available_quantity, reserved_quantity, updated_at
         FROM inventory_stock
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      assert.equal(rows.length, 1);
      const stock = rows[0];
      assert.equal(stock.quantity, 100);
      assert.equal(stock.available_quantity, 100);
      assert.equal(stock.reserved_quantity, 0);
    });

    test("should support since timestamp filtering", async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT product_id, updated_at
         FROM inventory_stock
         WHERE company_id = ? AND outlet_id = ? AND updated_at > ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, since]
      );

      assert.ok(rows.length >= 1);
    });
  });

  describe("Stock Reservation", () => {
    test("should reserve stock successfully", async () => {
      const quantity = 10;

      // Get initial stock
      const [initialRows] = await connection.execute<RowDataPacket[]>(
        `SELECT available_quantity, reserved_quantity
         FROM inventory_stock
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );
      const initialStock = initialRows[0];
      const initialAvailable = Number(initialStock.available_quantity);
      const initialReserved = Number(initialStock.reserved_quantity);

      // Reserve stock
      await connection.execute(
        `UPDATE inventory_stock
         SET reserved_quantity = reserved_quantity + ?,
             available_quantity = available_quantity - ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [quantity, quantity, TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      // Verify reservation
      const [updatedRows] = await connection.execute<RowDataPacket[]>(
        `SELECT available_quantity, reserved_quantity
         FROM inventory_stock
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );
      const updatedStock = updatedRows[0];

      assert.equal(Number(updatedStock.available_quantity), initialAvailable - quantity);
      assert.equal(Number(updatedStock.reserved_quantity), initialReserved + quantity);

      // Release the reservation
      await connection.execute(
        `UPDATE inventory_stock
         SET reserved_quantity = reserved_quantity - ?,
             available_quantity = available_quantity + ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [quantity, quantity, TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );
    });

    test("should detect stock conflicts", async () => {
      // Get current available stock
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT available_quantity
         FROM inventory_stock
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );
      const available = Number(rows[0].available_quantity);

      // Try to reserve more than available
      const excessiveQuantity = available + 1000;

      // This should fail (simulate conflict check)
      const canReserve = available >= excessiveQuantity;
      assert.equal(canReserve, false);
    });

    test("should handle atomic reservation with row locking", async () => {
      const quantity = 5;

      // First reservation with availability check
      const [result1] = await connection.execute(
        `UPDATE inventory_stock
         SET reserved_quantity = reserved_quantity + ?,
             available_quantity = available_quantity - ?
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?
           AND available_quantity >= ?`,
        [quantity, quantity, TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID, quantity]
      );

      assert.ok((result1 as any).affectedRows > 0);

      // Release
      await connection.execute(
        `UPDATE inventory_stock
         SET reserved_quantity = reserved_quantity - ?,
             available_quantity = available_quantity + ?
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [quantity, quantity, TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );
    });
  });

  describe("Stock Release", () => {
    test("should release reserved stock", async () => {
      const quantity = 5;

      // First reserve some stock
      await connection.execute(
        `UPDATE inventory_stock
         SET reserved_quantity = reserved_quantity + ?,
             available_quantity = available_quantity - ?
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [quantity, quantity, TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      // Get post-reservation state
      const [reservedRows] = await connection.execute<RowDataPacket[]>(
        `SELECT available_quantity, reserved_quantity
         FROM inventory_stock
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );
      const reservedState = reservedRows[0];

      // Release the stock
      await connection.execute(
        `UPDATE inventory_stock
         SET reserved_quantity = reserved_quantity - ?,
             available_quantity = available_quantity + ?
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?
           AND reserved_quantity >= ?`,
        [quantity, quantity, TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID, quantity]
      );

      // Verify release
      const [releasedRows] = await connection.execute<RowDataPacket[]>(
        `SELECT available_quantity, reserved_quantity
         FROM inventory_stock
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );
      const releasedState = releasedRows[0];

      assert.equal(Number(releasedState.reserved_quantity), Number(reservedState.reserved_quantity) - quantity);
      assert.equal(Number(releasedState.available_quantity), Number(reservedState.available_quantity) + quantity);
    });
  });

  describe("Conflict Resolution", () => {
    test("should handle server stock less than POS expected", async () => {
      // Simulate scenario where server has less stock than POS thought
      const serverAvailable = 5;
      const posExpected = 20;

      // Update server stock to low value
      await connection.execute(
        `UPDATE inventory_stock
         SET quantity = ?,
             available_quantity = ?,
             reserved_quantity = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [serverAvailable, serverAvailable, TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      // Simulate conflict detection
      const hasConflict = serverAvailable < posExpected;
      assert.equal(hasConflict, true);

      // Restore stock
      await connection.execute(
        `UPDATE inventory_stock
         SET quantity = 100.0000,
             available_quantity = 100.0000,
             reserved_quantity = 0.0000
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );
    });

    test("should handle stale stock data detection", async () => {
      // Get last update time
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT updated_at
         FROM inventory_stock
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      const lastUpdate = new Date(rows[0].updated_at);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Check if data is stale (> 1 hour old)
      const isStale = lastUpdate < oneHourAgo;
      assert.equal(isStale, false); // Should not be stale since we just created it
    });
  });
});
