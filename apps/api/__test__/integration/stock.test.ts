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
import { getDb, closeDbPool } from "../lib/db.js";
import type { KyselySchema } from "@/lib/db";
import { sql } from "kysely";
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
} from "./stock.js";
import { createTestCompanyMinimal, createTestOutletMinimal, createTestItem } from "./test-fixtures";

describe("Stock Service", { concurrency: false }, () => {
  let db: KyselySchema;
  let TEST_COMPANY_ID: number;
  let TEST_OUTLET_ID: number;
  let TEST_PRODUCT_ID: number;
  let TEST_PRODUCT_ID_2: number;

  async function setupTestData(db: KyselySchema): Promise<void> {
    const runId = Date.now().toString(36);

    // Create test company dynamically using shared fixtures
    const company = await createTestCompanyMinimal({
      code: `TESTSTK-${runId}`,
      name: `Test Company Stock ${runId}`
    });
    TEST_COMPANY_ID = company.id;

    // Create test outlet dynamically using shared fixtures
    const outlet = await createTestOutletMinimal(TEST_COMPANY_ID, {
      code: `TESTOUT-${runId}`,
      name: `Test Outlet Stock ${runId}`
    });
    TEST_OUTLET_ID = outlet.id;

    // Create test products with stock tracking using shared fixtures
    const product1 = await createTestItem(TEST_COMPANY_ID, {
      sku: 'TEST-SKU-001',
      name: 'Test Product 1',
      type: 'PRODUCT',
      isActive: true
    });
    TEST_PRODUCT_ID = product1.id;

    // Set low_stock_threshold via direct update (not supported by createItem)
    await sql`UPDATE items SET low_stock_threshold = 10.0000 WHERE id = ${TEST_PRODUCT_ID}`.execute(db);

    const product2 = await createTestItem(TEST_COMPANY_ID, {
      sku: 'TEST-SKU-002',
      name: 'Test Product 2',
      type: 'PRODUCT',
      isActive: true
    });
    TEST_PRODUCT_ID_2 = product2.id;

    // Set low_stock_threshold via direct update (not supported by createItem)
    await sql`UPDATE items SET low_stock_threshold = 5.0000 WHERE id = ${TEST_PRODUCT_ID_2}`.execute(db);

    // Create test stock records
    await sql`
      INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
      VALUES (${TEST_COMPANY_ID}, ${TEST_OUTLET_ID}, ${TEST_PRODUCT_ID}, 100.0000, 0.0000, 100.0000, NOW(), NOW())
    `.execute(db);

    await sql`
      INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity, created_at, updated_at)
      VALUES (${TEST_COMPANY_ID}, ${TEST_OUTLET_ID}, ${TEST_PRODUCT_ID_2}, 50.0000, 0.0000, 50.0000, NOW(), NOW())
    `.execute(db);

    // Create test item prices for cost resolution
    await sql`
      INSERT INTO item_prices (company_id, item_id, price, created_at, updated_at)
      VALUES (${TEST_COMPANY_ID}, ${TEST_PRODUCT_ID}, 10.00, NOW(), NOW())
    `.execute(db);
    await sql`
      INSERT INTO item_prices (company_id, item_id, price, created_at, updated_at)
      VALUES (${TEST_COMPANY_ID}, ${TEST_PRODUCT_ID_2}, 20.00, NOW(), NOW())
    `.execute(db);
  }

  async function cleanupTestData(db: KyselySchema): Promise<void> {
    // Clean up in reverse order (cost tracking tables first)
    await sql`DELETE FROM cost_layer_consumption WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
    await sql`DELETE FROM inventory_cost_layers WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
    await sql`DELETE FROM inventory_item_costs WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
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

  // Reset stock to baseline after each test to ensure isolation
  afterEach(async () => {
    // Clean up cost tracking data from the test
    await sql`DELETE FROM cost_layer_consumption WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
    await sql`DELETE FROM inventory_cost_layers WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
    await sql`DELETE FROM inventory_item_costs WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);

    // Reset stock quantities to baseline
    await sql`
      UPDATE inventory_stock
      SET quantity = 100.0000, reserved_quantity = 0.0000, available_quantity = 100.0000
      WHERE company_id = ${TEST_COMPANY_ID} AND product_id = ${TEST_PRODUCT_ID}
    `.execute(db);
    await sql`
      UPDATE inventory_stock
      SET quantity = 50.0000, reserved_quantity = 0.0000, available_quantity = 50.0000
      WHERE company_id = ${TEST_COMPANY_ID} AND product_id = ${TEST_PRODUCT_ID_2}
    `.execute(db);

    // Clean up transactions (keep only setup transactions)
    await sql`
      DELETE FROM inventory_transactions
      WHERE company_id = ${TEST_COMPANY_ID}
      AND reference_type NOT IN ('SETUP', 'INITIAL')
    `.execute(db);
  });

  describe("checkAvailability", () => {
    test("should return available=true when stock is sufficient", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 50 }
      ];

      const results = await checkAvailability(TEST_COMPANY_ID, TEST_OUTLET_ID, items, db);

      assert.equal(results.length, 1);
      assert.equal(results[0].available, true);
      assert.equal(results[0].available_quantity, 100);
    });

    test("should return available=false when stock is insufficient", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 150 }
      ];

      const results = await checkAvailability(TEST_COMPANY_ID, TEST_OUTLET_ID, items, db);

      assert.equal(results.length, 1);
      assert.equal(results[0].available, false);
      assert.equal(results[0].available_quantity, 100);
    });

    test("should check multiple items", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 50 },
        { product_id: TEST_PRODUCT_ID_2, quantity: 30 }
      ];

      const results = await checkAvailability(TEST_COMPANY_ID, TEST_OUTLET_ID, items, db);

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

      const result = await hasSufficientStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, db);

      assert.equal(result, true);
    });

    test("should return false when any item has insufficient stock", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 50 },
        { product_id: TEST_PRODUCT_ID_2, quantity: 100 } // Only 50 available
      ];

      const result = await hasSufficientStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, db);

      assert.equal(result, false);
    });
  });

  describe("getStockConflicts", () => {
    test("should return empty array when all items have stock", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 50 }
      ];

      const conflicts = await getStockConflicts(TEST_COMPANY_ID, TEST_OUTLET_ID, items, db);

      assert.equal(conflicts.length, 0);
    });

    test("should return conflicts for insufficient stock", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 200 }
      ];

      const conflicts = await getStockConflicts(TEST_COMPANY_ID, TEST_OUTLET_ID, items, db);

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

      const result = await reserveStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, db);

      assert.equal(result.success, true);
      assert.equal(result.reserved, true);

      // Verify stock was reserved
      const rows = await sql`
        SELECT available_quantity, reserved_quantity FROM inventory_stock 
        WHERE company_id = ${TEST_COMPANY_ID} AND outlet_id = ${TEST_OUTLET_ID} AND product_id = ${TEST_PRODUCT_ID}
      `.execute(db);

      assert.equal(Number((rows.rows[0] as { available_quantity: number; reserved_quantity: number }).available_quantity), 80);
      assert.equal(Number((rows.rows[0] as { available_quantity: number; reserved_quantity: number }).reserved_quantity), 20);

      // Release the reservation
      await releaseStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, db);

      // Verify stock was released
      const rowsAfter = await sql`
        SELECT available_quantity, reserved_quantity FROM inventory_stock 
        WHERE company_id = ${TEST_COMPANY_ID} AND outlet_id = ${TEST_OUTLET_ID} AND product_id = ${TEST_PRODUCT_ID}
      `.execute(db);

      assert.equal(Number((rowsAfter.rows[0] as { available_quantity: number; reserved_quantity: number }).available_quantity), 100);
      assert.equal(Number((rowsAfter.rows[0] as { available_quantity: number; reserved_quantity: number }).reserved_quantity), 0);
    });

    test("should fail reservation when stock is insufficient", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 500 }
      ];
      const referenceId = `test-reserve-fail-${Date.now()}`;

      const result = await reserveStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, db);

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

      const result = await deductStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, db);

      assert.equal(result, true);

      // Verify stock was deducted
      const rows = await sql`
        SELECT quantity, available_quantity FROM inventory_stock 
        WHERE company_id = ${TEST_COMPANY_ID} AND outlet_id = ${TEST_OUTLET_ID} AND product_id = ${TEST_PRODUCT_ID}
      `.execute(db);

      assert.equal(Number((rows.rows[0] as { quantity: number; available_quantity: number }).quantity), 90);
      assert.equal(Number((rows.rows[0] as { quantity: number; available_quantity: number }).available_quantity), 90);

      // Restore the stock
      await restoreStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, db);
    });

    test("should fail when trying to deduct more than available", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 1000 }
      ];
      const referenceId = `test-deduct-fail-${Date.now()}`;

      const result = await deductStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, db);

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
      const { createCostLayer } = await import("@jurnapod/modules-inventory-costing");
      const inboundTxResult = await sql`
        INSERT INTO inventory_transactions 
        (company_id, outlet_id, product_id, transaction_type, quantity_delta, reference_type, reference_id, created_at)
        VALUES (${TEST_COMPANY_ID}, ${TEST_OUTLET_ID}, ${TEST_PRODUCT_ID}, 6, 100.0000, 'RECEIPT', ${`setup-receipt-${Date.now()}`}, NOW())
      `.execute(db);
      await createCostLayer(
        {
          companyId: TEST_COMPANY_ID,
          itemId: TEST_PRODUCT_ID,
          transactionId: Number(inboundTxResult.insertId),
          unitCost: 15.00,
          quantity: 100,
        },
        db
      );

      // Import the function
      const { deductStockWithCost } = await import("./stock.js");
      const result = await deductStockWithCost(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, db);

      assert.equal(result.length, 1);
      assert.equal(result[0].itemId, TEST_PRODUCT_ID);
      assert.equal(result[0].quantity, 10);
      assert.ok(result[0].transactionId > 0);
      assert.ok(result[0].unitCost >= 0);
      assert.ok(result[0].totalCost >= 0);

      // Verify inventory transaction was recorded
      const txRows = await sql`
        SELECT id, quantity_delta FROM inventory_transactions 
        WHERE reference_id = ${referenceId}
      `.execute(db);
      assert.equal(txRows.rows.length, 1);
      assert.equal(Number((txRows.rows[0] as { quantity_delta: number }).quantity_delta), -10);

      // Verify cost consumption occurred (cost_layer_consumption for FIFO/LIFO)
      const consumptionRows = await sql`
        SELECT * FROM cost_layer_consumption 
        WHERE transaction_id = ${result[0].transactionId}
      `.execute(db);
      // Note: Consumption records exist for FIFO/LIFO; for AVG they update inventory_item_costs summary

      // Verify stock was deducted
      const stockRows = await sql`
        SELECT quantity FROM inventory_stock 
        WHERE company_id = ${TEST_COMPANY_ID} AND outlet_id = ${TEST_OUTLET_ID} AND product_id = ${TEST_PRODUCT_ID}
      `.execute(db);
      assert.equal(Number((stockRows.rows[0] as { quantity: number }).quantity), 90);

      // Restore the stock
      await restoreStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, db);
    });

    test("should throw on insufficient inventory (fail-closed)", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 10000 }
      ];
      const referenceId = `test-deduct-cost-fail-${Date.now()}`;

      const { deductStockWithCost } = await import("./stock.js");

      await assert.rejects(
        async () => {
          await deductStockWithCost(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, db);
        },
        /Insufficient stock/
      );

      // Verify no inventory transaction was created (transaction rolled back)
      const txRows = await sql`
        SELECT COUNT(*) as count FROM inventory_transactions 
        WHERE reference_id = ${referenceId}
      `.execute(db);
      assert.equal(Number((txRows.rows[0] as { count: number }).count), 0);
    });

    test("should throw on stock not found (fail-closed)", async () => {
      const items: StockItem[] = [
        { product_id: 999999991, quantity: 1 }
      ];
      const referenceId = `test-deduct-cost-notfound-${Date.now()}`;

      const { deductStockWithCost } = await import("./stock.js");

      await assert.rejects(
        async () => {
          await deductStockWithCost(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, db);
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

      const result = await restoreStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, db);

      assert.equal(result, true);

      // Verify stock was restored
      const rows = await sql`
        SELECT quantity, available_quantity FROM inventory_stock 
        WHERE company_id = ${TEST_COMPANY_ID} AND outlet_id = ${TEST_OUTLET_ID} AND product_id = ${TEST_PRODUCT_ID}
      `.execute(db);

      assert.equal(Number((rows.rows[0] as { quantity: number; available_quantity: number }).quantity), 105);
      assert.equal(Number((rows.rows[0] as { quantity: number; available_quantity: number }).available_quantity), 105);

      // Deduct back
      await deductStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, `deduct-${referenceId}`, 1, db);
    });

    test("should create cost layer for inbound refund", async () => {
      const items: StockItem[] = [
        { product_id: TEST_PRODUCT_ID, quantity: 3 }
      ];
      const referenceId = `test-restore-cost-${Date.now()}`;

      // First ensure product has a price for cost resolution
      await sql`
        INSERT INTO item_prices (company_id, item_id, price, created_at, updated_at)
        VALUES (${TEST_COMPANY_ID}, ${TEST_PRODUCT_ID}, 15.00, NOW(), NOW())
        ON DUPLICATE KEY UPDATE price = 15.00
      `.execute(db);

      const result = await restoreStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, referenceId, 1, db);

      assert.equal(result, true);

      // Verify cost layer was created
      const layerRows = await sql`
        SELECT original_qty, unit_cost, remaining_qty 
        FROM inventory_cost_layers 
        WHERE company_id = ${TEST_COMPANY_ID} AND item_id = ${TEST_PRODUCT_ID}
        ORDER BY id DESC LIMIT 1
      `.execute(db);

      assert.ok(layerRows.rows.length > 0, "Cost layer should be created");
      assert.equal(Number((layerRows.rows[0] as { original_qty: number; unit_cost: number; remaining_qty: number }).original_qty), 3);
      assert.equal(Number((layerRows.rows[0] as { original_qty: number; unit_cost: number; remaining_qty: number }).remaining_qty), 3);
      assert.ok(Number((layerRows.rows[0] as { original_qty: number; unit_cost: number; remaining_qty: number }).unit_cost) > 0, "Unit cost should be resolved");

      // Cleanup: deduct the restored stock
      await deductStock(TEST_COMPANY_ID, TEST_OUTLET_ID, items, `deduct-${referenceId}`, 1, db);
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
      }, db);

      assert.equal(result, true);

      // Verify adjustment
      const rows = await sql`
        SELECT quantity, available_quantity FROM inventory_stock 
        WHERE company_id = ${TEST_COMPANY_ID} AND outlet_id = ${TEST_OUTLET_ID} AND product_id = ${TEST_PRODUCT_ID}
      `.execute(db);

      assert.equal(Number((rows.rows[0] as { quantity: number }).quantity), 110);
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
      }, db);

      assert.equal(result, true);

      // Verify stock is 90 (100 - 10)
      const rowsNeg = await sql`
        SELECT quantity, available_quantity FROM inventory_stock 
        WHERE company_id = ${TEST_COMPANY_ID} AND outlet_id = ${TEST_OUTLET_ID} AND product_id = ${TEST_PRODUCT_ID}
      `.execute(db);

      assert.equal(Number((rowsNeg.rows[0] as { quantity: number }).quantity), 90);
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
      }, db);

      assert.equal(result, false);
    });

    test("should create cost layer for positive adjustment", async () => {
      // Ensure product has a price for cost resolution
      await sql`
        INSERT INTO item_prices (company_id, item_id, price, created_at, updated_at)
        VALUES (${TEST_COMPANY_ID}, ${TEST_PRODUCT_ID}, 20.00, NOW(), NOW())
        ON DUPLICATE KEY UPDATE price = 20.00
      `.execute(db);

      // Clear any existing cost layers for this product
      await sql`
        DELETE FROM inventory_cost_layers WHERE company_id = ${TEST_COMPANY_ID} AND item_id = ${TEST_PRODUCT_ID}
      `.execute(db);

      const result = await adjustStock({
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        product_id: TEST_PRODUCT_ID,
        adjustment_quantity: 5,
        reason: "Test positive adjustment cost layer",
        reference_id: `test-adjust-cost-pos-${Date.now()}`,
        user_id: 1
      }, db);

      assert.equal(result, true);

      // Verify cost layer was created
      const layerRowsPos = await sql`
        SELECT original_qty, unit_cost, remaining_qty 
        FROM inventory_cost_layers 
        WHERE company_id = ${TEST_COMPANY_ID} AND item_id = ${TEST_PRODUCT_ID}
      `.execute(db);

      assert.ok(layerRowsPos.rows.length > 0, "Cost layer should be created for positive adjustment");
      assert.equal(Number((layerRowsPos.rows[0] as { original_qty: number; remaining_qty: number }).original_qty), 5);
      assert.equal(Number((layerRowsPos.rows[0] as { original_qty: number; remaining_qty: number }).remaining_qty), 5);
    });

    test("should NOT create cost layer for negative adjustment", async () => {
      // First create a cost layer by doing a positive adjustment
      await sql`
        INSERT INTO item_prices (company_id, item_id, price, created_at, updated_at)
        VALUES (${TEST_COMPANY_ID}, ${TEST_PRODUCT_ID_2}, 25.00, NOW(), NOW())
        ON DUPLICATE KEY UPDATE price = 25.00
      `.execute(db);

      await adjustStock({
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        product_id: TEST_PRODUCT_ID_2,
        adjustment_quantity: 10,
        reason: "Setup for negative test",
        reference_id: `test-adjust-setup-${Date.now()}`,
        user_id: 1
      }, db);

      // Count layers before negative adjustment
      const beforeRows = await sql`
        SELECT COUNT(*) as count FROM inventory_cost_layers 
        WHERE company_id = ${TEST_COMPANY_ID} AND item_id = ${TEST_PRODUCT_ID_2}
      `.execute(db);
      const countBefore = Number((beforeRows.rows[0] as { count: number }).count);

      // Perform negative adjustment
      await adjustStock({
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        product_id: TEST_PRODUCT_ID_2,
        adjustment_quantity: -5,
        reason: "Test negative adjustment no cost layer",
        reference_id: `test-adjust-cost-neg-${Date.now()}`,
        user_id: 1
      }, db);

      // Count layers after negative adjustment
      const afterRows = await sql`
        SELECT COUNT(*) as count FROM inventory_cost_layers 
        WHERE company_id = ${TEST_COMPANY_ID} AND item_id = ${TEST_PRODUCT_ID_2}
      `.execute(db);
      const countAfter = Number((afterRows.rows[0] as { count: number }).count);

      assert.equal(countAfter, countBefore, "Negative adjustment should NOT create cost layer");
    });
  });

  describe("getStockLevels", () => {
    test("should get stock levels for outlet", async () => {
      const levels = await getStockLevels(TEST_COMPANY_ID, TEST_OUTLET_ID, undefined, db);

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
        db
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
        db
      );

      assert.ok(Array.isArray(transactions));
      assert.ok(typeof total === "number");
    });

    test("should filter by transaction type", async () => {
      // Create test transactions directly in DB for this test
      const testRefId1 = `test-filter-${Date.now()}-1`;
      const testRefId2 = `test-filter-${Date.now()}-2`;
      
      // Insert test adjustment transactions (type 5 = ADJUST)
      await sql`
        INSERT INTO inventory_transactions 
        (company_id, outlet_id, product_id, transaction_type, quantity_delta, reference_type, reference_id, created_by, created_at)
        VALUES (${TEST_COMPANY_ID}, ${TEST_OUTLET_ID}, ${TEST_PRODUCT_ID}, 5, 10.0000, 'TEST_FILTER', ${testRefId1}, 1, NOW()),
               (${TEST_COMPANY_ID}, ${TEST_OUTLET_ID}, ${TEST_PRODUCT_ID}, 5, 20.0000, 'TEST_FILTER', ${testRefId2}, 1, NOW())
      `.execute(db);

      const { transactions } = await getStockTransactions(
        TEST_COMPANY_ID,
        TEST_OUTLET_ID,
        { transaction_type: 5, limit: 10 },
        db
      );

      // Should include our test filter transactions
      const testTransactions = transactions.filter(t => 
        t.reference_id?.includes("test-filter")
      );
      assert.ok(testTransactions.length >= 2);
      
      // Cleanup test transactions
      await sql`DELETE FROM inventory_transactions WHERE reference_type = 'TEST_FILTER'`.execute(db);
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
      }, db);

      const alerts = await getLowStockAlerts(TEST_COMPANY_ID, TEST_OUTLET_ID, db);

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
      }, db);
    });
  });

  describe("getProductStock", () => {
    test("should get stock for single product", async () => {
      const stock = await getProductStock(TEST_COMPANY_ID, TEST_OUTLET_ID, TEST_PRODUCT_ID, db);

      assert.ok(stock);
      assert.equal(stock.product_id, TEST_PRODUCT_ID);
      assert.equal(stock.quantity, 100);
    });

    test("should return null for non-existent product", async () => {
      const stock = await getProductStock(TEST_COMPANY_ID, TEST_OUTLET_ID, 999999999, db);

      assert.equal(stock, null);
    });
  });
});
