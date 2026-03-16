// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stock Service Tests
 *
 * Tests for stock service operations with DB transaction support.
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { getDbPool, closeDbPool } from "../lib/db.js";
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import {
  checkAvailability,
  hasSufficientStock,
  getStockConflicts,
  deductStock,
  restoreStock,
  adjustStock,
  reserveStock,
  releaseStock,
  getStockLevels,
  getStockTransactions,
  getLowStockAlerts,
  getProductStock,
  type StockItem
} from "../services/stock.js";

const TEST_COMPANY_ID = 999999;
const TEST_OUTLET_ID = 999998;
const TEST_PRODUCT_ID = 999997;
const TEST_PRODUCT_ID_2 = 999996;

async function setupTestData(connection: PoolConnection): Promise<void> {
  // Create test company
  await connection.execute(
    `INSERT INTO companies (id, name, code, currency_code, created_at, updated_at)
     VALUES (?, 'Test Company Stock', 'TESTSTK', 'IDR', NOW(), NOW())
     ON DUPLICATE KEY UPDATE name = 'Test Company Stock'`,
    [TEST_COMPANY_ID]
  );

  // Create test outlet
  await connection.execute(
    `INSERT INTO outlets (id, company_id, name, code, created_at, updated_at)
     VALUES (?, ?, 'Test Outlet Stock', 'TESTOUT', NOW(), NOW())
     ON DUPLICATE KEY UPDATE name = 'Test Outlet Stock'`,
    [TEST_OUTLET_ID, TEST_COMPANY_ID]
  );

  // Create test products with stock tracking
  await connection.execute(
    `INSERT INTO items (id, company_id, sku, name, item_type, is_active, track_stock, low_stock_threshold, created_at, updated_at)
     VALUES (?, ?, 'TEST-SKU-001', 'Test Product 1', 'PRODUCT', 1, 1, 10.0000, NOW(), NOW())
     ON DUPLICATE KEY UPDATE name = 'Test Product 1', track_stock = 1, low_stock_threshold = 10.0000`,
    [TEST_PRODUCT_ID, TEST_COMPANY_ID]
  );

  await connection.execute(
    `INSERT INTO items (id, company_id, sku, name, item_type, is_active, track_stock, low_stock_threshold, created_at, updated_at)
     VALUES (?, ?, 'TEST-SKU-002', 'Test Product 2', 'PRODUCT', 1, 1, 5.0000, NOW(), NOW())
     ON DUPLICATE KEY UPDATE name = 'Test Product 2', track_stock = 1, low_stock_threshold = 5.0000`,
    [TEST_PRODUCT_ID_2, TEST_COMPANY_ID]
  );

  // Create test stock records
  await connection.execute(
    `INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
     VALUES (?, ?, ?, 100.0000, 0.0000, 100.0000, NOW(), NOW())
     ON DUPLICATE KEY UPDATE quantity = 100.0000, reserved_quantity = 0.0000, available_quantity = 100.0000`,
    [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
  );

  await connection.execute(
    `INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
     VALUES (?, ?, ?, 50.0000, 0.0000, 50.0000, NOW(), NOW())
     ON DUPLICATE KEY UPDATE quantity = 50.0000, reserved_quantity = 0.0000, available_quantity = 50.0000`,
    [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID_2]
  );
}

async function cleanupTestData(connection: PoolConnection): Promise<void> {
  // Clean up in reverse order
  await connection.execute(
    `DELETE FROM inventory_transactions WHERE company_id = ?`,
    [TEST_COMPANY_ID]
  );
  await connection.execute(
    `DELETE FROM inventory_stock WHERE company_id = ?`,
    [TEST_COMPANY_ID]
  );
  await connection.execute(
    `DELETE FROM items WHERE company_id = ? AND id IN (?, ?)`,
    [TEST_COMPANY_ID, TEST_PRODUCT_ID, TEST_PRODUCT_ID_2]
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

describe("Stock Service", { concurrency: false }, () => {
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

  describe("checkAvailability", () => {
    test("should return available=true when stock is sufficient", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 50 }
      ];

      const results = await checkAvailability(TEST_COMPANY_ID, TEST_OUTLET_ID, items, connection);

      assert.equal(results.length, 1);
      assert.equal(results[0].available, true);
      assert.equal(results[0].available_quantity, 100);
    });

    test("should return available=false when stock is insufficient", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 150 }
      ];

      const results = await checkAvailability(TEST_COMPANY_ID, TEST_OUTLET_ID, items, connection);

      assert.equal(results.length, 1);
      assert.equal(results[0].available, false);
      assert.equal(results[0].available_quantity, 100);
    });

    test("should check multiple items", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 50 },
        { product_id: TEST_PRODUCT_ID_2, quantity: 30 }
      ];

      const results = await checkAvailability(TEST_COMPANY_ID, TEST_OUTLET_ID, items, connection);

      assert.equal(results.length, 2);
      assert.equal(results[0].available, true);
      assert.equal(results[1].available, true);
    });
  });

  describe("hasSufficientStock", () => {
    test("should return true when all items have sufficient stock", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 50 },
        { product_id: TEST_PRODUCT_ID_2, quantity: 30 }
      ];

      const result = await hasSufficientStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, connection);

      assert.equal(result, true);
    });

    test("should return false when any item has insufficient stock", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 50 },
        { product_id: TEST_PRODUCT_ID_2, quantity: 100 } // Only 50 available
      ];

      const result = await hasSufficientStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, connection);

      assert.equal(result, false);
    });
  });

  describe("getStockConflicts", () => {
    test("should return empty array when all items have stock", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 50 }
      ];

      const conflicts = await getStockConflicts(TEST_COMPANY_ID, TEST_OUTLET_ID, items, connection);

      assert.equal(conflicts.length, 0);
    });

    test("should return conflicts for insufficient stock", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 200 }
      ];

      const conflicts = await getStockConflicts(TEST_COMPANY_ID, TEST_OUTLET_ID, items, connection);

      assert.equal(conflicts.length, 1);
      assert.equal(conflicts[0].product_id, TEST_PRODUCT_ID);
      assert.equal(conflicts[0].requested, 200);
      assert.equal(conflicts[0].available, 100);
    });
  });

  describe("reserveStock and releaseStock", () => {
    test("should reserve stock successfully", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 20 }
      ];
      const referenceId = `test-reserve-${Date.now()}`;

      const result = await reserveStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, connection);

      assert.equal(result.success, true);
      assert.equal(result.reserved, true);

      // Verify stock was reserved
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT available_quantity, reserved_quantity FROM inventory_stock 
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      assert.equal(Number(rows[0].available_quantity), 80);
      assert.equal(Number(rows[0].reserved_quantity), 20);

      // Release the reservation
      await releaseStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, connection);

      // Verify stock was released
      const [rowsAfter] = await connection.execute<RowDataPacket[]>(
        `SELECT available_quantity, reserved_quantity FROM inventory_stock 
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      assert.equal(Number(rowsAfter[0].available_quantity), 100);
      assert.equal(Number(rowsAfter[0].reserved_quantity), 0);
    });

    test("should fail reservation when stock is insufficient", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 500 }
      ];
      const referenceId = `test-reserve-fail-${Date.now()}`;

      const result = await reserveStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, connection);

      assert.equal(result.success, false);
      assert.ok(result.conflicts);
      assert.equal(result.conflicts!.length, 1);
    });
  });

  describe("deductStock", () => {
    test("should deduct stock successfully", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 10 }
      ];
      const referenceId = `test-deduct-${Date.now()}`;

      const result = await deductStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, connection);

      assert.equal(result, true);

      // Verify stock was deducted
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT quantity, available_quantity FROM inventory_stock 
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      assert.equal(Number(rows[0].quantity), 90);
      assert.equal(Number(rows[0].available_quantity), 90);

      // Restore the stock
      await restoreStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, connection);
    });

    test("should fail when trying to deduct more than available", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 1000 }
      ];
      const referenceId = `test-deduct-fail-${Date.now()}`;

      const result = await deductStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, connection);

      assert.equal(result, false);
    });
  });

  describe("restoreStock", () => {
    test("should restore stock successfully", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 5 }
      ];
      const referenceId = `test-restore-${Date.now()}`;

      const result = await restoreStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, connection);

      assert.equal(result, true);

      // Verify stock was restored
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT quantity, available_quantity FROM inventory_stock 
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      assert.equal(Number(rows[0].quantity), 105);
      assert.equal(Number(rows[0].available_quantity), 105);

      // Deduct back
      await deductStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, `deduct-${referenceId}`, 1, connection);
    });
  });

  describe("adjustStock", () => {
    test("should adjust stock positively", async () => {
      const result = await adjustStock({
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        product_id: TEST_PRODUCT_ID,
        adjustment_quantity: 10,
        reason: "Test adjustment positive",
        reference_id: `test-adjust-pos-${Date.now()}`,
        user_id: 1
      }, connection);

      assert.equal(result, true);

      // Verify adjustment
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT quantity, available_quantity FROM inventory_stock 
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      assert.equal(Number(rows[0].quantity), 110);
    });

    test("should adjust stock negatively", async () => {
      const result = await adjustStock({
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        product_id: TEST_PRODUCT_ID,
        adjustment_quantity: -10,
        reason: "Test adjustment negative",
        reference_id: `test-adjust-neg-${Date.now()}`,
        user_id: 1
      }, connection);

      assert.equal(result, true);

      // Verify stock is back to 100
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT quantity, available_quantity FROM inventory_stock 
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      assert.equal(Number(rows[0].quantity), 100);
    });

    test("should fail when adjustment would make quantity negative", async () => {
      const result = await adjustStock({
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        product_id: TEST_PRODUCT_ID,
        adjustment_quantity: -200,
        reason: "Test adjustment too negative",
        reference_id: `test-adjust-fail-${Date.now()}`,
        user_id: 1
      }, connection);

      assert.equal(result, false);
    });
  });

  describe("getStockLevels", () => {
    test("should get stock levels for outlet", async () => {
      const levels = await getStockLevels(TEST_COMPANY_ID, TEST_OUTLET_ID, undefined, connection);

      assert.ok(levels.length >= 2);
      
      const product1 = levels.find(l => l.product_id === TEST_PRODUCT_ID);
      assert.ok(product1);
      assert.equal(product1.quantity, 100);
    });

    test("should filter by product IDs", async () => {
      const levels = await getStockLevels(
        TEST_COMPANY_ID, 
        TEST_OUTLET_ID, 
        [TEST_PRODUCT_ID], 
        connection
      );

      assert.equal(levels.length, 1);
      assert.equal(levels[0].product_id, TEST_PRODUCT_ID);
    });
  });

  describe("getStockTransactions", () => {
    test("should get transaction history", async () => {
      const { transactions, total } = await getStockTransactions(
        TEST_COMPANY_ID,
        TEST_OUTLET_ID,
        { limit: 10 },
        connection
      );

      assert.ok(Array.isArray(transactions));
      assert.ok(typeof total === "number");
    });

    test("should filter by transaction type", async () => {
      const { transactions } = await getStockTransactions(
        TEST_COMPANY_ID,
        TEST_OUTLET_ID,
        { transaction_type: "ADJUSTMENT", limit: 10 },
        connection
      );

      // Should include our test adjustments
      const testTransactions = transactions.filter(t => 
        t.reference_id?.includes("test-adjust")
      );
      assert.ok(testTransactions.length >= 2);
    });
  });

  describe("getLowStockAlerts", () => {
    test("should return products below threshold", async () => {
      // First adjust product 2 to be below threshold (5)
      await adjustStock({
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        product_id: TEST_PRODUCT_ID_2,
        adjustment_quantity: -50, // Will make it 0
        reason: "Test low stock alert",
        reference_id: `test-low-stock-${Date.now()}`,
        user_id: 1
      }, connection);

      const alerts = await getLowStockAlerts(TEST_COMPANY_ID, TEST_OUTLET_ID, connection);

      const product2Alert = alerts.find(a => a.product_id === TEST_PRODUCT_ID_2);
      assert.ok(product2Alert);
      assert.equal(product2Alert.available_quantity, 0);

      // Restore stock
      await adjustStock({
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        product_id: TEST_PRODUCT_ID_2,
        adjustment_quantity: 50,
        reason: "Restore from test",
        reference_id: `test-restore-${Date.now()}`,
        user_id: 1
      }, connection);
    });
  });

  describe("getProductStock", () => {
    test("should get stock for single product", async () => {
      const stock = await getProductStock(TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID, connection);

      assert.ok(stock);
      assert.equal(stock.product_id, TEST_PRODUCT_ID);
      assert.equal(stock.quantity, 100);
    });

    test("should return null for non-existent product", async () => {
      const stock = await getProductStock(TEST_COMPANY_ID, TEST_OUTLET_ID, 999999999, connection);

      assert.equal(stock, null);
    });
  });
});
