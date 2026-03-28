// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stock Service Tests
 *
 * Tests for stock service operations with DB transaction support.
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after, afterEach } from "node:test";
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
import { createCompanyBasic } from "../lib/companies.js";
import { createOutletBasic } from "../lib/outlets.js";

describe("Stock Service", { concurrency: false }, () => {
  let connection: PoolConnection;
  let TEST_COMPANY_ID: number;
  let TEST_OUTLET_ID: number;
  let TEST_PRODUCT_ID: number;
  let TEST_PRODUCT_ID_2: number;

  async function setupTestData(connection: PoolConnection): Promise<void> {
    const runId = Date.now().toString(36);

    // Create test company dynamically
    const company = await createCompanyBasic({
      code: `TESTSTK-${runId}`,
      name: `Test Company Stock ${runId}`
    });
    TEST_COMPANY_ID = company.id;

    // Create test outlet dynamically
    const outlet = await createOutletBasic({
      company_id: TEST_COMPANY_ID,
      code: `TESTOUT-${runId}`,
      name: `Test Outlet Stock ${runId}`
    });
    TEST_OUTLET_ID = outlet.id;

    // Create test products with stock tracking
    const [product1Result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO items (company_id, sku, name, item_type, is_active, track_stock, low_stock_threshold, created_at, updated_at)
       VALUES (?, 'TEST-SKU-001', 'Test Product 1', 'PRODUCT', 1, 1, 10.0000, NOW(), NOW())`,
      [TEST_COMPANY_ID]
    );
    TEST_PRODUCT_ID = Number(product1Result.insertId);

    const [product2Result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO items (company_id, sku, name, item_type, is_active, track_stock, low_stock_threshold, created_at, updated_at)
       VALUES (?, 'TEST-SKU-002', 'Test Product 2', 'PRODUCT', 1, 1, 5.0000, NOW(), NOW())`,
      [TEST_COMPANY_ID]
    );
    TEST_PRODUCT_ID_2 = Number(product2Result.insertId);

    // Create test stock records
    await connection.execute(
      `INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
       VALUES (?, ?, ?, 100.0000, 0.0000, 100.0000, NOW(), NOW())`,
      [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
    );

    await connection.execute(
      `INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
       VALUES (?, ?, ?, 50.0000, 0.0000, 50.0000, NOW(), NOW())`,
      [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID_2]
    );

    // Create test item prices for cost resolution
    await connection.execute(
      `INSERT INTO item_prices (company_id, item_id, price, created_at, updated_at)
       VALUES (?, ?, 10.00, NOW(), NOW())`,
      [TEST_COMPANY_ID, TEST_PRODUCT_ID]
    );
    await connection.execute(
      `INSERT INTO item_prices (company_id, item_id, price, created_at, updated_at)
       VALUES (?, ?, 20.00, NOW(), NOW())`,
      [TEST_COMPANY_ID, TEST_PRODUCT_ID_2]
    );
  }

  async function cleanupTestData(connection: PoolConnection): Promise<void> {
    // Clean up in reverse order (cost tracking tables first)
    await connection.execute(
      `DELETE FROM cost_layer_consumption WHERE company_id = ?`,
      [TEST_COMPANY_ID]
    );
    await connection.execute(
      `DELETE FROM inventory_cost_layers WHERE company_id = ?`,
      [TEST_COMPANY_ID]
    );
    await connection.execute(
      `DELETE FROM inventory_item_costs WHERE company_id = ?`,
      [TEST_COMPANY_ID]
    );
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

  // Reset stock to baseline after each test to ensure isolation
  afterEach(async () => {
    // Clean up cost tracking data from the test
    await connection.execute(
      `DELETE FROM cost_layer_consumption WHERE company_id = ?`,
      [TEST_COMPANY_ID]
    );
    await connection.execute(
      `DELETE FROM inventory_cost_layers WHERE company_id = ?`,
      [TEST_COMPANY_ID]
    );
    await connection.execute(
      `DELETE FROM inventory_item_costs WHERE company_id = ?`,
      [TEST_COMPANY_ID]
    );

    // Reset stock quantities to baseline
    await connection.execute(
      `UPDATE inventory_stock
       SET quantity = 100.0000, reserved_quantity = 0.0000, available_quantity = 100.0000
       WHERE company_id = ? AND product_id = ?`,
      [TEST_COMPANY_ID, TEST_PRODUCT_ID]
    );
    await connection.execute(
      `UPDATE inventory_stock
       SET quantity = 50.0000, reserved_quantity = 0.0000, available_quantity = 50.0000
       WHERE company_id = ? AND product_id = ?`,
      [TEST_COMPANY_ID, TEST_PRODUCT_ID_2]
    );

    // Clean up transactions (keep only setup transactions)
    await connection.execute(
      `DELETE FROM inventory_transactions
       WHERE company_id = ?
       AND reference_type NOT IN ('SETUP', 'INITIAL')`,
      [TEST_COMPANY_ID]
    );
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

  describe("deductStockWithCost (C1/C2 outbound costing)", () => {
    test("should deduct stock and return cost details", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 10 }
      ];
      const referenceId = `test-deduct-cost-${Date.now()}`;

      // Set up cost basis for the product (create inbound cost layer first)
      const { createCostLayer } = await import("../lib/cost-tracking.js");
      const [inboundTx] = await connection.execute<ResultSetHeader>(
        `INSERT INTO inventory_transactions 
         (company_id, outlet_id, product_id, transaction_type, quantity_delta, reference_type, reference_id, created_at)
         VALUES (?, ?, ?, 6, 100.0000, 'RECEIPT', ?, NOW())`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID, `setup-receipt-${Date.now()}`]
      );
      await createCostLayer(
        {
          companyId: TEST_COMPANY_ID,
          itemId: TEST_PRODUCT_ID,
          transactionId: inboundTx.insertId,
          unitCost: 15.00,
          quantity: 100,
        },
        connection
      );

      // Import the function
      const { deductStockWithCost } = await import("../services/stock.js");
      const result = await deductStockWithCost(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, connection);

      assert.equal(result.length, 1);
      assert.equal(result[0].itemId, TEST_PRODUCT_ID);
      assert.equal(result[0].quantity, 10);
      assert.ok(result[0].transactionId > 0);
      assert.ok(result[0].unitCost >= 0);
      assert.ok(result[0].totalCost >= 0);

      // Verify inventory transaction was recorded
      const [txRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id, quantity_delta FROM inventory_transactions 
         WHERE reference_id = ?`,
        [referenceId]
      );
      assert.equal(txRows.length, 1);
      assert.equal(Number(txRows[0].quantity_delta), -10);

      // Verify cost consumption occurred (cost_layer_consumption for FIFO/LIFO)
      const [consumptionRows] = await connection.execute<RowDataPacket[]>(
        `SELECT * FROM cost_layer_consumption 
         WHERE transaction_id = ?`,
        [result[0].transactionId]
      );
      // Note: Consumption records exist for FIFO/LIFO; for AVG they update inventory_item_costs summary

      // Verify stock was deducted
      const [stockRows] = await connection.execute<RowDataPacket[]>(
        `SELECT quantity FROM inventory_stock 
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );
      assert.equal(Number(stockRows[0].quantity), 90);

      // Restore the stock
      await restoreStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, connection);
    });

    test("should throw on insufficient inventory (fail-closed)", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 10000 }
      ];
      const referenceId = `test-deduct-cost-fail-${Date.now()}`;

      const { deductStockWithCost } = await import("../services/stock.js");

      await assert.rejects(
        async () => {
          await deductStockWithCost(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, connection);
        },
        /Insufficient stock/
      );

      // Verify no inventory transaction was created (transaction rolled back)
      const [txRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM inventory_transactions 
         WHERE reference_id = ?`,
        [referenceId]
      );
      assert.equal(Number(txRows[0].count), 0);
    });

    test("should throw on stock not found (fail-closed)", async () => {
      const items: StockItem[] = [
        { product_id: 999999991, quantity: 1 }
      ];
      const referenceId = `test-deduct-cost-notfound-${Date.now()}`;

      const { deductStockWithCost } = await import("../services/stock.js");

      await assert.rejects(
        async () => {
          await deductStockWithCost(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, connection);
        },
        /Stock not found/
      );
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

    test("should create cost layer for inbound refund", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 3 }
      ];
      const referenceId = `test-restore-cost-${Date.now()}`;

      // First ensure product has a price for cost resolution
      await connection.execute(
        `INSERT INTO item_prices (company_id, item_id, price, created_at, updated_at)
         VALUES (?, ?, 15.00, NOW(), NOW())
         ON DUPLICATE KEY UPDATE price = 15.00`,
        [TEST_COMPANY_ID, TEST_PRODUCT_ID]
      );

      const result = await restoreStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, connection);

      assert.equal(result, true);

      // Verify cost layer was created
      const [layerRows] = await connection.execute<RowDataPacket[]>(
        `SELECT original_qty, unit_cost, remaining_qty 
         FROM inventory_cost_layers 
         WHERE company_id = ? AND item_id = ?
         ORDER BY id DESC LIMIT 1`,
        [TEST_COMPANY_ID, TEST_PRODUCT_ID]
      );

      assert.ok(layerRows.length > 0, "Cost layer should be created");
      assert.equal(Number(layerRows[0].original_qty), 3);
      assert.equal(Number(layerRows[0].remaining_qty), 3);
      assert.ok(Number(layerRows[0].unit_cost) > 0, "Unit cost should be resolved");

      // Cleanup: deduct the restored stock
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

      // Verify stock is 90 (100 - 10)
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT quantity, available_quantity FROM inventory_stock 
         WHERE company_id = ? AND outlet_id = ? AND product_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID]
      );

      assert.equal(Number(rows[0].quantity), 90);
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

    test("should create cost layer for positive adjustment", async () => {
      // Ensure product has a price for cost resolution
      await connection.execute(
        `INSERT INTO item_prices (company_id, item_id, price, created_at, updated_at)
         VALUES (?, ?, 20.00, NOW(), NOW())
         ON DUPLICATE KEY UPDATE price = 20.00`,
        [TEST_COMPANY_ID, TEST_PRODUCT_ID]
      );

      // Clear any existing cost layers for this product
      await connection.execute(
        `DELETE FROM inventory_cost_layers WHERE company_id = ? AND item_id = ?`,
        [TEST_COMPANY_ID, TEST_PRODUCT_ID]
      );

      const result = await adjustStock({
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        product_id: TEST_PRODUCT_ID,
        adjustment_quantity: 5,
        reason: "Test positive adjustment cost layer",
        reference_id: `test-adjust-cost-pos-${Date.now()}`,
        user_id: 1
      }, connection);

      assert.equal(result, true);

      // Verify cost layer was created
      const [layerRows] = await connection.execute<RowDataPacket[]>(
        `SELECT original_qty, unit_cost, remaining_qty 
         FROM inventory_cost_layers 
         WHERE company_id = ? AND item_id = ?`,
        [TEST_COMPANY_ID, TEST_PRODUCT_ID]
      );

      assert.ok(layerRows.length > 0, "Cost layer should be created for positive adjustment");
      assert.equal(Number(layerRows[0].original_qty), 5);
      assert.equal(Number(layerRows[0].remaining_qty), 5);
    });

    test("should NOT create cost layer for negative adjustment", async () => {
      // First create a cost layer by doing a positive adjustment
      await connection.execute(
        `INSERT INTO item_prices (company_id, item_id, price, created_at, updated_at)
         VALUES (?, ?, 25.00, NOW(), NOW())
         ON DUPLICATE KEY UPDATE price = 25.00`,
        [TEST_COMPANY_ID, TEST_PRODUCT_ID_2]
      );

      await adjustStock({
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        product_id: TEST_PRODUCT_ID_2,
        adjustment_quantity: 10,
        reason: "Setup for negative test",
        reference_id: `test-adjust-setup-${Date.now()}`,
        user_id: 1
      }, connection);

      // Count layers before negative adjustment
      const [beforeRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM inventory_cost_layers 
         WHERE company_id = ? AND item_id = ?`,
        [TEST_COMPANY_ID, TEST_PRODUCT_ID_2]
      );
      const countBefore = Number(beforeRows[0].count);

      // Perform negative adjustment
      await adjustStock({
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        product_id: TEST_PRODUCT_ID_2,
        adjustment_quantity: -5,
        reason: "Test negative adjustment no cost layer",
        reference_id: `test-adjust-cost-neg-${Date.now()}`,
        user_id: 1
      }, connection);

      // Count layers after negative adjustment
      const [afterRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM inventory_cost_layers 
         WHERE company_id = ? AND item_id = ?`,
        [TEST_COMPANY_ID, TEST_PRODUCT_ID_2]
      );
      const countAfter = Number(afterRows[0].count);

      assert.equal(countAfter, countBefore, "Negative adjustment should NOT create cost layer");
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
      // Create test transactions directly in DB for this test
      const testRefId1 = `test-filter-${Date.now()}-1`;
      const testRefId2 = `test-filter-${Date.now()}-2`;
      
      // Insert test adjustment transactions (type 5 = ADJUST)
      await connection.execute(
        `INSERT INTO inventory_transactions 
         (company_id, outlet_id, product_id, transaction_type, quantity_delta, reference_type, reference_id, created_by, created_at)
         VALUES (?, ?, ?, 5, 10.0000, 'TEST_FILTER', ?, 1, NOW()),
                (?, ?, ?, 5, 20.0000, 'TEST_FILTER', ?, 1, NOW())`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID, testRefId1,
         TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID, testRefId2]
      );

      const { transactions } = await getStockTransactions(
        TEST_COMPANY_ID,
        TEST_OUTLET_ID,
        { transaction_type: 5, limit: 10 },
        connection
      );

      // Should include our test filter transactions
      const testTransactions = transactions.filter(t => 
        t.reference_id?.includes("test-filter")
      );
      assert.ok(testTransactions.length >= 2);
      
      // Cleanup test transactions
      await connection.execute(
        `DELETE FROM inventory_transactions WHERE reference_type = 'TEST_FILTER'`,
      );
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
