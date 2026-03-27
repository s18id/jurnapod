// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Variant Stock Tests
 * 
 * Tests for variant stock tracking functionality.
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { getDbPool, closeDbPool } from "../../lib/db.js";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import {
  checkVariantStockAvailability,
  reserveVariantStock,
  releaseVariantStock,
  deductVariantStock,
  getAggregatedItemStock
} from "./variant-stock.js";

const TEST_COMPANY_ID = 1;
const TEST_OUTLET_ID = 1;

describe("Variant Stock Operations", () => {
  let pool: ReturnType<typeof getDbPool>;

  before(async () => {
    pool = getDbPool();
    
    // Ensure variant_id column exists in inventory_stock
    const conn = await pool.getConnection();
    try {
      const [cols] = await conn.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_stock' AND COLUMN_NAME = 'variant_id'`
      );
      
      if (cols.length === 0) {
        await conn.execute(
          `ALTER TABLE inventory_stock ADD COLUMN variant_id BIGINT UNSIGNED NULL AFTER product_id`
        );
      }
    } catch (e) {
      // Column might already exist, ignore error
    } finally {
      conn.release();
    }
  });

  after(async () => {
    await closeDbPool();
  });

  test("checkVariantStockAvailability - returns available when stock sufficient", async () => {
    const conn = await pool.getConnection();
    const runId = Date.now().toString(36);
    
    let itemId = 0;
    let variantId = 0;
    
    try {
      // Create test item
      const [itemResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, track_stock, is_active) 
         VALUES (?, ?, 'PRODUCT', 1, 1)`,
        [TEST_COMPANY_ID, `Test VS 1 ${runId}`]
      );
      itemId = Number(itemResult.insertId);

      // Create variant with 100 stock
      const [variantResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
         VALUES (?, ?, ?, ?, 100, 1)`,
        [TEST_COMPANY_ID, itemId, `TEST-VS-${runId}-1`, 'Small']
      );
      variantId = Number(variantResult.insertId);

      // Check stock
      const result = await checkVariantStockAvailability(TEST_COMPANY_ID, TEST_OUTLET_ID, variantId, 10);

      assert.strictEqual(result.variant_id, variantId);
      assert.strictEqual(result.available, true);
      assert.strictEqual(result.requested_quantity, 10);
      assert.strictEqual(result.available_quantity, 100);
    } finally {
      await conn.execute(`DELETE FROM item_variant_combinations WHERE variant_id = ?`, [variantId]);
      await conn.execute(`DELETE FROM item_variants WHERE id = ?`, [variantId]);
      await conn.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      conn.release();
    }
  });

  test("checkVariantStockAvailability - returns unavailable when stock insufficient", async () => {
    const conn = await pool.getConnection();
    const runId = Date.now().toString(36);
    
    let itemId = 0;
    let variantId = 0;
    
    try {
      const [itemResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, track_stock, is_active) 
         VALUES (?, ?, 'PRODUCT', 1, 1)`,
        [TEST_COMPANY_ID, `Test VS 2 ${runId}`]
      );
      itemId = Number(itemResult.insertId);

      // Create variant with 5 stock
      const [variantResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
         VALUES (?, ?, ?, ?, 5, 1)`,
        [TEST_COMPANY_ID, itemId, `TEST-VS-${runId}-2`, 'Medium']
      );
      variantId = Number(variantResult.insertId);

      // Request 10, only 5 available
      const result = await checkVariantStockAvailability(TEST_COMPANY_ID, TEST_OUTLET_ID, variantId, 10);

      assert.strictEqual(result.variant_id, variantId);
      assert.strictEqual(result.available, false);
      assert.strictEqual(result.requested_quantity, 10);
      assert.strictEqual(result.available_quantity, 5);
    } finally {
      await conn.execute(`DELETE FROM item_variant_combinations WHERE variant_id = ?`, [variantId]);
      await conn.execute(`DELETE FROM item_variants WHERE id = ?`, [variantId]);
      await conn.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      conn.release();
    }
  });

  test("checkVariantStockAvailability - returns false for non-existent variant", async () => {
    const result = await checkVariantStockAvailability(TEST_COMPANY_ID, TEST_OUTLET_ID, 999999, 1);

    assert.strictEqual(result.available, false);
    assert.strictEqual(result.available_quantity, 0);
  });

  test("checkVariantStockAvailability - uses inventory_stock when available", async () => {
    const conn = await pool.getConnection();
    const runId = Date.now().toString(36);
    
    let itemId = 0;
    let variantId = 0;
    
    try {
      const [itemResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, track_stock, is_active) 
         VALUES (?, ?, 'PRODUCT', 1, 1)`,
        [TEST_COMPANY_ID, `Test VS 3 ${runId}`]
      );
      itemId = Number(itemResult.insertId);

      // Create variant with stock_quantity = 50
      const [variantResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
         VALUES (?, ?, ?, ?, 50, 1)`,
        [TEST_COMPANY_ID, itemId, `TEST-VS-${runId}-3`, 'Large']
      );
      variantId = Number(variantResult.insertId);

      // Add inventory_stock record with 30 (different from variant's 50)
      await conn.execute(
        `INSERT INTO inventory_stock (company_id, outlet_id, product_id, variant_id, quantity, reserved_quantity, available_quantity)
         VALUES (?, ?, ?, ?, 30, 0, 30)`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, itemId, variantId]
      );

      // Should use inventory_stock value (30), not item_variants (50)
      const result = await checkVariantStockAvailability(TEST_COMPANY_ID, TEST_OUTLET_ID, variantId, 10);

      assert.strictEqual(result.available, true);
      assert.strictEqual(result.available_quantity, 30);

      // Clean up inventory_stock first
      await conn.execute(`DELETE FROM inventory_stock WHERE variant_id = ?`, [variantId]);
    } finally {
      await conn.execute(`DELETE FROM item_variant_combinations WHERE variant_id = ?`, [variantId]);
      await conn.execute(`DELETE FROM item_variants WHERE id = ?`, [variantId]);
      await conn.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      conn.release();
    }
  });

  test("reserveVariantStock - reserves stock successfully", async () => {
    const conn = await pool.getConnection();
    const runId = Date.now().toString(36);
    const refId = `TEST-RES-4-${runId}`;
    
    let itemId = 0;
    let variantId = 0;
    
    try {
      // Create test item
      const [itemResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, track_stock, is_active) 
         VALUES (?, ?, 'PRODUCT', 1, 1)`,
        [TEST_COMPANY_ID, `Test VS 4 ${runId}`]
      );
      itemId = Number(itemResult.insertId);

      // Create variant with 100 stock
      const [variantResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
         VALUES (?, ?, ?, ?, 100, 1)`,
        [TEST_COMPANY_ID, itemId, `TEST-VS-${runId}-4`, 'XL']
      );
      variantId = Number(variantResult.insertId);

      // Reserve 10 stock
      const result = await reserveVariantStock(
        TEST_COMPANY_ID,
        TEST_OUTLET_ID,
        [{ variant_id: variantId, quantity: 10 }],
        refId,
        conn
      );

      assert.strictEqual(result.success, true, "Reservation should succeed");
      assert.strictEqual(result.conflicts, undefined, "Should have no conflicts");

      // Verify inventory_stock record was created with correct reservation
      const [stockRows] = await conn.execute<RowDataPacket[]>(
        `SELECT quantity, reserved_quantity, available_quantity 
         FROM inventory_stock 
         WHERE company_id = ? AND outlet_id = ? AND variant_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, variantId]
      );
      assert.strictEqual(stockRows.length, 1, "Should have inventory_stock record");
      assert.strictEqual(Number(stockRows[0].quantity), 100, "Quantity should be 100");
      assert.strictEqual(Number(stockRows[0].reserved_quantity), 10, "Reserved should be 10");
      assert.strictEqual(Number(stockRows[0].available_quantity), 90, "Available should be 90");

      // Verify transaction was recorded
      const [txRows] = await conn.execute<RowDataPacket[]>(
        `SELECT transaction_type, quantity_delta FROM inventory_transactions 
         WHERE reference_id = ? AND variant_id = ?`,
        [refId, variantId]
      );
      assert.strictEqual(txRows.length, 1, "Should have 1 transaction record");
      assert.strictEqual(Number(txRows[0].transaction_type), 3, "Should be RESERVATION (type 3)");
      assert.strictEqual(Number(txRows[0].quantity_delta), 10, "Quantity delta should be 10");
    } finally {
      // Clean up in correct order
      await conn.execute(`DELETE FROM inventory_transactions WHERE reference_id = ?`, [refId]);
      await conn.execute(`DELETE FROM inventory_stock WHERE product_id = ?`, [itemId]);
      await conn.execute(`DELETE FROM item_variant_combinations WHERE variant_id = ?`, [variantId]);
      await conn.execute(`DELETE FROM item_variants WHERE id = ?`, [variantId]);
      await conn.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      conn.release();
    }
  });

  test("reserveVariantStock - fails when insufficient stock", async () => {
    const conn = await pool.getConnection();
    const runId = Date.now().toString(36);
    
    let itemId = 0;
    let variantId = 0;
    
    try {
      const [itemResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, track_stock, is_active) 
         VALUES (?, ?, 'PRODUCT', 1, 1)`,
        [TEST_COMPANY_ID, `Test VS 5 ${runId}`]
      );
      itemId = Number(itemResult.insertId);

      // Create variant with 5 stock
      const [variantResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
         VALUES (?, ?, ?, ?, 5, 1)`,
        [TEST_COMPANY_ID, itemId, `TEST-VS-${runId}-5`, 'XXL']
      );
      variantId = Number(variantResult.insertId);

      // Try to reserve 10 (more than available)
      const result = await reserveVariantStock(
        TEST_COMPANY_ID,
        TEST_OUTLET_ID,
        [{ variant_id: variantId, quantity: 10 }],
        `TEST-RES-5-${runId}`,
        conn
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.conflicts?.length, 1);
      assert.strictEqual(result.conflicts?.[0].variant_id, variantId);
      assert.strictEqual(result.conflicts?.[0].requested, 10);
      assert.strictEqual(result.conflicts?.[0].available, 5);
    } finally {
      await conn.execute(`DELETE FROM item_variant_combinations WHERE variant_id = ?`, [variantId]);
      await conn.execute(`DELETE FROM item_variants WHERE id = ?`, [variantId]);
      await conn.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      conn.release();
    }
  });

  test("deductVariantStock - throws when insufficient stock", async () => {
    const conn = await pool.getConnection();
    const runId = Date.now().toString(36);
    
    let itemId = 0;
    let variantId = 0;
    
    try {
      const [itemResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, track_stock, is_active) 
         VALUES (?, ?, 'PRODUCT', 1, 1)`,
        [TEST_COMPANY_ID, `Test VS 7 ${runId}`]
      );
      itemId = Number(itemResult.insertId);

      // Create variant with 3 stock
      const [variantResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
         VALUES (?, ?, ?, ?, 3, 1)`,
        [TEST_COMPANY_ID, itemId, `TEST-VS-${runId}-7`, 'Medium']
      );
      variantId = Number(variantResult.insertId);

      // Try to deduct 10 (more than available)
      try {
        await deductVariantStock(
          TEST_COMPANY_ID,
          TEST_OUTLET_ID,
          [{ variant_id: variantId, quantity: 10 }],
          `TEST-SALE-7-${runId}`,
          conn
        );
        throw new Error("Should have thrown");
      } catch (error: unknown) {
        const err = error as Error;
        assert.strictEqual(err.message.includes("Insufficient stock"), true);
      }
    } finally {
      await conn.execute(`DELETE FROM item_variant_combinations WHERE variant_id = ?`, [variantId]);
      await conn.execute(`DELETE FROM item_variants WHERE id = ?`, [variantId]);
      await conn.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      conn.release();
    }
  });

  test("deductVariantStock - deducts stock on sale completion", async () => {
    const conn = await pool.getConnection();
    const runId = Date.now().toString(36);
    const refId = `TEST-SALE-6-${runId}`;
    
    let itemId = 0;
    let variantId = 0;
    
    try {
      // Create test item
      const [itemResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, track_stock, is_active) 
         VALUES (?, ?, 'PRODUCT', 1, 1)`,
        [TEST_COMPANY_ID, `Test VS 6 ${runId}`]
      );
      itemId = Number(itemResult.insertId);

      // Create variant with 50 stock
      const [variantResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
         VALUES (?, ?, ?, ?, 50, 1)`,
        [TEST_COMPANY_ID, itemId, `TEST-VS-${runId}-6`, 'Small']
      );
      variantId = Number(variantResult.insertId);

      // Deduct 5 stock
      const result = await deductVariantStock(
        TEST_COMPANY_ID,
        TEST_OUTLET_ID,
        [{ variant_id: variantId, quantity: 5 }],
        refId,
        conn
      );

      assert.strictEqual(result, true, "Deduction should succeed");

      // Verify stock was deducted
      const [variantRows] = await conn.execute<RowDataPacket[]>(
        `SELECT stock_quantity FROM item_variants WHERE id = ?`,
        [variantId]
      );
      assert.strictEqual(Number(variantRows[0].stock_quantity), 45, "Stock should be 45 after deducting 5");

      // Verify transaction was recorded
      const [txRows] = await conn.execute<RowDataPacket[]>(
        `SELECT transaction_type, quantity_delta FROM inventory_transactions 
         WHERE reference_id = ? AND variant_id = ?`,
        [refId, variantId]
      );
      assert.strictEqual(txRows.length, 1, "Should have 1 transaction record");
      assert.strictEqual(Number(txRows[0].transaction_type), 1, "Should be SALE (type 1)");
      assert.strictEqual(Number(txRows[0].quantity_delta), -5, "Quantity delta should be -5");
    } finally {
      // Clean up in correct order
      await conn.execute(`DELETE FROM inventory_transactions WHERE reference_id = ?`, [refId]);
      await conn.execute(`DELETE FROM inventory_stock WHERE product_id = ?`, [itemId]);
      await conn.execute(`DELETE FROM item_variant_combinations WHERE variant_id = ?`, [variantId]);
      await conn.execute(`DELETE FROM item_variants WHERE id = ?`, [variantId]);
      await conn.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      conn.release();
    }
  });

  test("releaseVariantStock - releases reserved stock", async () => {
    const conn = await pool.getConnection();
    const runId = Date.now().toString(36);
    const refId = `TEST-REL-9-${runId}`;
    
    let itemId = 0;
    let variantId = 0;
    
    try {
      // Create test item
      const [itemResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, track_stock, is_active) 
         VALUES (?, ?, 'PRODUCT', 1, 1)`,
        [TEST_COMPANY_ID, `Test VS 9 ${runId}`]
      );
      itemId = Number(itemResult.insertId);

      // Create variant with 100 stock
      const [variantResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
         VALUES (?, ?, ?, ?, 100, 1)`,
        [TEST_COMPANY_ID, itemId, `TEST-VS-${runId}-9`, 'Medium']
      );
      variantId = Number(variantResult.insertId);

      // Reserve 20 stock first
      await reserveVariantStock(
        TEST_COMPANY_ID,
        TEST_OUTLET_ID,
        [{ variant_id: variantId, quantity: 20 }],
        refId,
        conn
      );

      // Verify reservation in inventory_stock
      const [afterReserve] = await conn.execute<RowDataPacket[]>(
        `SELECT reserved_quantity, available_quantity 
         FROM inventory_stock 
         WHERE company_id = ? AND outlet_id = ? AND variant_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, variantId]
      );
      assert.strictEqual(Number(afterReserve[0].reserved_quantity), 20, "Reserved should be 20");
      assert.strictEqual(Number(afterReserve[0].available_quantity), 80, "Available should be 80");

      // Release the reserved stock
      const releaseResult = await releaseVariantStock(
        TEST_COMPANY_ID,
        TEST_OUTLET_ID,
        [{ variant_id: variantId, quantity: 20 }],
        refId,
        conn
      );

      assert.strictEqual(releaseResult, true, "Release should succeed");

      // Verify reservation was released
      const [afterRelease] = await conn.execute<RowDataPacket[]>(
        `SELECT reserved_quantity, available_quantity 
         FROM inventory_stock 
         WHERE company_id = ? AND outlet_id = ? AND variant_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, variantId]
      );
      assert.strictEqual(Number(afterRelease[0].reserved_quantity), 0, "Reserved should be 0");
      assert.strictEqual(Number(afterRelease[0].available_quantity), 100, "Available should be restored to 100");

      // Verify transactions were recorded
      const [txRows] = await conn.execute<RowDataPacket[]>(
        `SELECT transaction_type, quantity_delta FROM inventory_transactions 
         WHERE reference_id = ? AND variant_id = ? 
         ORDER BY id`,
        [refId, variantId]
      );
      assert.strictEqual(txRows.length, 2, "Should have 2 transaction records");
      assert.strictEqual(Number(txRows[0].transaction_type), 3, "First should be RESERVATION (type 3)");
      assert.strictEqual(Number(txRows[0].quantity_delta), 20, "Reservation delta should be 20");
      assert.strictEqual(Number(txRows[1].transaction_type), 4, "Second should be RELEASE (type 4)");
      assert.strictEqual(Number(txRows[1].quantity_delta), -20, "Release delta should be -20");
    } finally {
      // Clean up in correct order
      await conn.execute(`DELETE FROM inventory_transactions WHERE reference_id = ?`, [refId]);
      await conn.execute(`DELETE FROM inventory_stock WHERE product_id = ?`, [itemId]);
      await conn.execute(`DELETE FROM item_variant_combinations WHERE variant_id = ?`, [variantId]);
      await conn.execute(`DELETE FROM item_variants WHERE id = ?`, [variantId]);
      await conn.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      conn.release();
    }
  });

  test("getAggregatedItemStock - calculates total from variants and base", async () => {
    const conn = await pool.getConnection();
    const runId = Date.now().toString(36);
    
    let itemId = 0;
    let v1Id = 0;
    let v2Id = 0;
    
    try {
      const [itemResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, track_stock, is_active) 
         VALUES (?, ?, 'PRODUCT', 1, 1)`,
        [TEST_COMPANY_ID, `Test VS 8 ${runId}`]
      );
      itemId = Number(itemResult.insertId);

      // Create base stock (no variant)
      await conn.execute(
        `INSERT INTO inventory_stock (company_id, outlet_id, product_id, quantity, reserved_quantity, available_quantity)
         VALUES (?, ?, ?, 20, 0, 20)`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, itemId]
      );

      // Create variants with stock
      const [v1Result] = await conn.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
         VALUES (?, ?, ?, 'Small', 30, 1)`,
        [TEST_COMPANY_ID, itemId, `TEST-VS-${runId}-8A`]
      );
      v1Id = Number(v1Result.insertId);

      const [v2Result] = await conn.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
         VALUES (?, ?, ?, 'Large', 40, 1)`,
        [TEST_COMPANY_ID, itemId, `TEST-VS-${runId}-8B`]
      );
      v2Id = Number(v2Result.insertId);

      // Get aggregated stock
      const result = await getAggregatedItemStock(TEST_COMPANY_ID, TEST_OUTLET_ID, itemId);

      assert.strictEqual(result.item_id, itemId);
      assert.strictEqual(result.total_quantity, 90); // 20 + 30 + 40
      assert.strictEqual(result.total_available, 90);
      assert.strictEqual(result.variants.length, 2);

      // Clean up inventory_stock
      await conn.execute(`DELETE FROM inventory_stock WHERE product_id = ? AND variant_id IS NULL`, [itemId]);
    } finally {
      await conn.execute(`DELETE FROM item_variant_combinations WHERE variant_id IN (?, ?)`, [v1Id, v2Id]);
      await conn.execute(`DELETE FROM item_variants WHERE id IN (?, ?)`, [v1Id, v2Id]);
      await conn.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      conn.release();
    }
  });
});

// POS Cart Integration
describe("POS Cart Variant Stock Integration", () => {
  let pool: ReturnType<typeof getDbPool>;

  before(async () => {
    pool = getDbPool();
  });

  after(async () => {
    await closeDbPool();
  });

  test("POS cart line - rejects insufficient variant stock", async () => {
    const conn = await pool.getConnection();
    const runId = Date.now().toString(36);
    
    let itemId = 0;
    let variantId = 0;
    
    try {
      const [itemResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, track_stock, is_active) 
         VALUES (?, ?, 'PRODUCT', 1, 1)`,
        [TEST_COMPANY_ID, `Test POS ${runId}`]
      );
      itemId = Number(itemResult.insertId);

      // Create variant with 2 stock
      const [variantResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
         VALUES (?, ?, ?, 'Small', 2, 1)`,
        [TEST_COMPANY_ID, itemId, `TEST-PC-${runId}`]
      );
      variantId = Number(variantResult.insertId);

      // Try to add 5 to cart (more than available)
      const stockCheck = await checkVariantStockAvailability(
        TEST_COMPANY_ID,
        TEST_OUTLET_ID,
        variantId,
        5
      );

      assert.strictEqual(stockCheck.available, false);
      assert.strictEqual(stockCheck.available_quantity, 2);
    } finally {
      await conn.execute(`DELETE FROM item_variant_combinations WHERE variant_id = ?`, [variantId]);
      await conn.execute(`DELETE FROM item_variants WHERE id = ?`, [variantId]);
      await conn.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      conn.release();
    }
  });
});

// Concurrency Tests
describe("Variant Stock Concurrency", () => {
  let pool: ReturnType<typeof getDbPool>;

  before(async () => {
    pool = getDbPool();
  });

  after(async () => {
    await closeDbPool();
  });

  test("reserveVariantStock - prevents concurrent double reservation", async () => {
    const conn = await pool.getConnection();
    const runId = Date.now().toString(36);
    
    let itemId = 0;
    let variantId = 0;
    const refIds: string[] = [];
    
    try {
      // Create test item
      const [itemResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, track_stock, is_active) 
         VALUES (?, ?, 'PRODUCT', 1, 1)`,
        [TEST_COMPANY_ID, `Test CONCUR ${runId}`]
      );
      itemId = Number(itemResult.insertId);

      // Create variant with 10 stock
      const [variantResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, stock_quantity, is_active) 
         VALUES (?, ?, ?, ?, 10, 1)`,
        [TEST_COMPANY_ID, itemId, `TEST-CON-${runId}`, 'Large']
      );
      variantId = Number(variantResult.insertId);

      // Create 3 reference IDs for concurrent reservations
      for (let i = 0; i < 3; i++) {
        refIds.push(`TEST-CON-${runId}-${i}`);
      }

      // Start 3 concurrent reservations of 5 each (only 2 should succeed = 10 total)
      // We need to run them truly concurrently using Promise.all
      const results = await Promise.all([
        reserveVariantStock(
          TEST_COMPANY_ID,
          TEST_OUTLET_ID,
          [{ variant_id: variantId, quantity: 5 }],
          refIds[0]
        ),
        reserveVariantStock(
          TEST_COMPANY_ID,
          TEST_OUTLET_ID,
          [{ variant_id: variantId, quantity: 5 }],
          refIds[1]
        ),
        reserveVariantStock(
          TEST_COMPANY_ID,
          TEST_OUTLET_ID,
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
      const [stockRows] = await conn.execute<RowDataPacket[]>(
        `SELECT quantity, reserved_quantity, available_quantity 
         FROM inventory_stock 
         WHERE company_id = ? AND outlet_id = ? AND variant_id = ?`,
        [TEST_COMPANY_ID, TEST_OUTLET_ID, variantId]
      );
      assert.strictEqual(stockRows.length, 1, "Should have inventory_stock record");
      assert.strictEqual(Number(stockRows[0].quantity), 10, "Quantity should be 10");
      assert.strictEqual(Number(stockRows[0].reserved_quantity), 10, "Reserved should be 10");
      assert.strictEqual(Number(stockRows[0].available_quantity), 0, "Available should be 0");

      // Verify 2 reservation transactions were recorded
      const [txRows] = await conn.execute<RowDataPacket[]>(
        `SELECT reference_id, transaction_type, quantity_delta 
         FROM inventory_transactions 
         WHERE variant_id = ? AND transaction_type = 3
         ORDER BY id`,
        [variantId]
      );
      assert.strictEqual(txRows.length, 2, "Should have exactly 2 reservation transactions");
    } finally {
      // Clean up in correct order
      for (const refId of refIds) {
        await conn.execute(`DELETE FROM inventory_transactions WHERE reference_id = ?`, [refId]);
      }
      await conn.execute(`DELETE FROM inventory_stock WHERE product_id = ?`, [itemId]);
      await conn.execute(`DELETE FROM item_variant_combinations WHERE variant_id = ?`, [variantId]);
      await conn.execute(`DELETE FROM item_variants WHERE id = ?`, [variantId]);
      await conn.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      conn.release();
    }
  });
});
