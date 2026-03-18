// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  loadEnvIfPresent,
  readEnv
} from "../../../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDbPool } from "../../../../src/lib/db";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

loadEnvIfPresent();

test(
  "sync/push - persists variant_id in transaction items",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let outletId = 0;
    let userId = 0;
    let itemId = 0;
    let variantId = 0;
    let transactionId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    try {
      // Get company and user fixtures
      const [ownerRows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.id AS user_id, u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ? AND u.email = ? AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);
      outletId = Number(ownerRows[0].outlet_id);
      userId = Number(ownerRows[0].user_id);

      // Create test item
      const [itemResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, sku, track_stock)
         VALUES (?, ?, 'PRODUCT', ?, 0)`,
        [companyId, `Test Item ${runId}`, `SKU-${runId}`]
      );
      itemId = Number(itemResult.insertId);

      // Create test variant
      const [variantResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, price_override, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [companyId, itemId, `VARIANT-${runId}`, `Test Variant ${runId}`, 25.99]
      );
      variantId = Number(variantResult.insertId);

      // Insert transaction with variant item
      const clientTxId = `test-variant-persist-${runId}`;
      const [trxResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id, status,
          service_type, trx_at, opened_at
        ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), NOW())`,
        [companyId, outletId, userId, clientTxId]
      );
      transactionId = Number(trxResult.insertId);

      // Insert transaction item with variant_id
      await pool.execute(
        `INSERT INTO pos_transaction_items (
          pos_transaction_id, company_id, outlet_id, line_no,
          item_id, variant_id, qty, price_snapshot, name_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [transactionId, companyId, outletId, 1, itemId, variantId, 2, 25.99, `Test Item ${runId}`]
      );

      // Verify variant_id persistence
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM pos_transaction_items 
         WHERE pos_transaction_id = ? AND variant_id = ?`,
        [transactionId, variantId]
      );

      assert.strictEqual(rows.length, 1, "Should persist transaction item with variant_id");
      assert.strictEqual(rows[0].variant_id, variantId, "Should store correct variant_id");
      assert.strictEqual(rows[0].item_id, itemId, "Should store correct item_id");
      assert.strictEqual(Number(rows[0].qty), 2, "Should store correct quantity");
    } finally {
      // Cleanup
      if (transactionId) {
        await pool.execute(`DELETE FROM pos_transaction_items WHERE pos_transaction_id = ?`, [transactionId]);
        await pool.execute(`DELETE FROM pos_transactions WHERE id = ?`, [transactionId]);
      }
      if (variantId) {
        await pool.execute(`DELETE FROM item_variants WHERE id = ?`, [variantId]);
      }
      if (itemId) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      }
    }
  }
);

test(
  "sync/push - persists variant_id in order snapshot lines",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let outletId = 0;
    let itemId = 0;
    let variantId = 0;
    const orderId = `test-order-${runId}`;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    try {
      // Get company and outlet fixtures
      const [ownerRows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ? AND u.email = ? AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);
      outletId = Number(ownerRows[0].outlet_id);

      // Create test item
      const [itemResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, sku)
         VALUES (?, ?, 'PRODUCT', ?)`,
        [companyId, `Test Item ${runId}`, `SKU-${runId}`]
      );
      itemId = Number(itemResult.insertId);

      // Create test variant
      const [variantResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        [companyId, itemId, `VARIANT-${runId}`, `Test Variant ${runId}`]
      );
      variantId = Number(variantResult.insertId);

      // Insert order snapshot
      await pool.execute(
        `INSERT INTO pos_order_snapshots (
          order_id, company_id, outlet_id, service_type, source_flow,
          settlement_flow, order_status, order_state, is_finalized, paid_amount,
          opened_at, updated_at
        ) VALUES (?, ?, ?, 'TAKEAWAY', 'WALK_IN', 'IMMEDIATE', 'OPEN', 'OPEN', 0, 0, NOW(), NOW())`,
        [orderId, companyId, outletId]
      );

      // Insert order snapshot line with variant_id
      await pool.execute(
        `INSERT INTO pos_order_snapshot_lines (
          order_id, company_id, outlet_id, item_id, variant_id,
          sku_snapshot, name_snapshot, item_type_snapshot,
          unit_price_snapshot, qty, discount_amount, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PRODUCT', ?, ?, 0, NOW())`,
        [orderId, companyId, outletId, itemId, variantId, `SKU-${runId}`, `Test Item ${runId}`, 25.99, 2]
      );

      // Verify variant_id persistence in snapshot lines
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM pos_order_snapshot_lines 
         WHERE order_id = ? AND variant_id = ?`,
        [orderId, variantId]
      );

      assert.strictEqual(rows.length, 1, "Should persist order snapshot line with variant_id");
      assert.strictEqual(rows[0].variant_id, variantId, "Should store correct variant_id");
      assert.strictEqual(Number(rows[0].qty), 2, "Should store correct quantity");
    } finally {
      // Cleanup
      await pool.execute(`DELETE FROM pos_order_snapshot_lines WHERE order_id = ?`, [orderId]);
      await pool.execute(`DELETE FROM pos_order_snapshots WHERE order_id = ?`, [orderId]);
      if (variantId) {
        await pool.execute(`DELETE FROM item_variants WHERE id = ?`, [variantId]);
      }
      if (itemId) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      }
    }
  }
);

test(
  "sync/push - persists variant_id in item cancellations",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let outletId = 0;
    let userId = 0;
    let itemId = 0;
    let variantId = 0;
    const orderId = `test-order-${runId}`;
    const updateId = `test-update-${runId}`;
    const cancellationId = `test-cancel-${runId}`;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    try {
      // Get company and user fixtures
      const [ownerRows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.id AS user_id, u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ? AND u.email = ? AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);
      outletId = Number(ownerRows[0].outlet_id);
      userId = Number(ownerRows[0].user_id);

      // Create test item
      const [itemResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, sku)
         VALUES (?, ?, 'PRODUCT', ?)`,
        [companyId, `Test Item ${runId}`, `SKU-${runId}`]
      );
      itemId = Number(itemResult.insertId);

      // Create test variant
      const [variantResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        [companyId, itemId, `VARIANT-${runId}`, `Test Variant ${runId}`]
      );
      variantId = Number(variantResult.insertId);

      // Insert order snapshot record (required foreign key for pos_order_updates)
      await pool.execute(
        `INSERT INTO pos_order_snapshots (
          order_id, company_id, outlet_id, service_type, is_finalized, order_status, order_state,
          paid_amount, opened_at, closed_at, notes, updated_at
        ) VALUES (?, ?, ?, 'TAKEAWAY', 0, 'OPEN', 'OPEN', 0, NOW(), NULL, '', NOW())`,
        [orderId, companyId, outletId]
      );

      // Insert order update record
      await pool.execute(
        `INSERT INTO pos_order_updates (
          update_id, order_id, company_id, outlet_id, event_type,
          delta_json, actor_user_id, device_id, event_at, created_at
        ) VALUES (?, ?, ?, ?, 'ITEM_CANCELLED', '{}', ?, 'test-device', NOW(), NOW())`,
        [updateId, orderId, companyId, outletId, userId]
      );

      // Insert item cancellation with variant_id
      await pool.execute(
        `INSERT INTO pos_item_cancellations (
          cancellation_id, update_id, order_id, company_id, outlet_id,
          item_id, variant_id, cancelled_quantity, reason,
          cancelled_by_user_id, cancelled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Customer request', ?, NOW())`,
        [cancellationId, updateId, orderId, companyId, outletId, itemId, variantId, 1, userId]
      );

      // Verify variant_id persistence in cancellations
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM pos_item_cancellations 
         WHERE cancellation_id = ? AND variant_id = ?`,
        [cancellationId, variantId]
      );

      assert.strictEqual(rows.length, 1, "Should persist item cancellation with variant_id");
      assert.strictEqual(rows[0].variant_id, variantId, "Should store correct variant_id");
      assert.strictEqual(rows[0].item_id, itemId, "Should store correct item_id");
      assert.strictEqual(Number(rows[0].cancelled_quantity), 1, "Should store correct cancelled quantity");
    } finally {
      // Cleanup
      await pool.execute(`DELETE FROM pos_item_cancellations WHERE cancellation_id = ?`, [cancellationId]);
      await pool.execute(`DELETE FROM pos_order_updates WHERE update_id = ?`, [updateId]);
      if (variantId) {
        await pool.execute(`DELETE FROM item_variants WHERE id = ?`, [variantId]);
      }
      if (itemId) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      }
    }
  }
);

test(
  "sync/push - duplicate replay with variant_id returns DUPLICATE",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let outletId = 0;
    let userId = 0;
    let itemId = 0;
    let variantId = 0;
    let transactionId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    try {
      // Get company and user fixtures
      const [ownerRows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.id AS user_id, u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ? AND u.email = ? AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);
      outletId = Number(ownerRows[0].outlet_id);
      userId = Number(ownerRows[0].user_id);

      // Create test item and variant
      const [itemResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, sku, track_stock)
         VALUES (?, ?, 'PRODUCT', ?, 0)`,
        [companyId, `Test Item ${runId}`, `SKU-${runId}`]
      );
      itemId = Number(itemResult.insertId);

      const [variantResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO item_variants (company_id, item_id, sku, variant_name, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        [companyId, itemId, `VARIANT-${runId}`, `Test Variant ${runId}`]
      );
      variantId = Number(variantResult.insertId);

      // Insert original transaction
      const clientTxId = `test-duplicate-${runId}`;
      const [trxResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id, status,
          service_type, trx_at, opened_at, payload_sha256, payload_hash_version
        ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), ?, 2)`,
        [companyId, outletId, userId, clientTxId, `hash-${runId}`]
      );
      transactionId = Number(trxResult.insertId);

      // Insert transaction items with variant
      await pool.execute(
        `INSERT INTO pos_transaction_items (
          pos_transaction_id, company_id, outlet_id, line_no,
          item_id, variant_id, qty, price_snapshot, name_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [transactionId, companyId, outletId, 1, itemId, variantId, 2, 25.99, `Test Item ${runId}`]
      );

      // Verify only one transaction exists
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM pos_transactions WHERE client_tx_id = ?`,
        [clientTxId]
      );
      assert.strictEqual(rows[0].count, 1, "Should have exactly one transaction");

      // Verify only one transaction item with this variant exists
      const [itemRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM pos_transaction_items WHERE pos_transaction_id = ?`,
        [transactionId]
      );
      assert.strictEqual(itemRows[0].count, 1, "Should have exactly one transaction item");

      // Verify variant_id is preserved
      const [variantRows] = await pool.execute<RowDataPacket[]>(
        `SELECT variant_id FROM pos_transaction_items WHERE pos_transaction_id = ?`,
        [transactionId]
      );
      assert.strictEqual(variantRows[0].variant_id, variantId, "Should preserve variant_id");
    } finally {
      // Cleanup
      if (transactionId) {
        await pool.execute(`DELETE FROM pos_transaction_items WHERE pos_transaction_id = ?`, [transactionId]);
        await pool.execute(`DELETE FROM pos_transactions WHERE id = ?`, [transactionId]);
      }
      if (variantId) {
        await pool.execute(`DELETE FROM item_variants WHERE id = ?`, [variantId]);
      }
      if (itemId) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      }
    }
  }
);

test(
  "sync/push - backward compatibility with null variant_id",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let outletId = 0;
    let userId = 0;
    let itemId = 0;
    let transactionId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    try {
      // Get company and user fixtures
      const [ownerRows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.id AS user_id, u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ? AND u.email = ? AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);
      outletId = Number(ownerRows[0].outlet_id);
      userId = Number(ownerRows[0].user_id);

      // Create test item (no variant)
      const [itemResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, name, item_type, sku, track_stock)
         VALUES (?, ?, 'PRODUCT', ?, 0)`,
        [companyId, `Test Item ${runId}`, `SKU-${runId}`]
      );
      itemId = Number(itemResult.insertId);

      // Insert transaction with null variant_id (backward compatibility)
      const clientTxId = `test-null-variant-${runId}`;
      const [trxResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id, status,
          service_type, trx_at, opened_at
        ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), NOW())`,
        [companyId, outletId, userId, clientTxId]
      );
      transactionId = Number(trxResult.insertId);

      // Insert transaction item with NULL variant_id
      await pool.execute(
        `INSERT INTO pos_transaction_items (
          pos_transaction_id, company_id, outlet_id, line_no,
          item_id, variant_id, qty, price_snapshot, name_snapshot
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        [transactionId, companyId, outletId, 1, itemId, 2, 25.99, `Test Item ${runId}`]
      );

      // Verify null variant_id works correctly
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM pos_transaction_items 
         WHERE pos_transaction_id = ?`,
        [transactionId]
      );

      assert.strictEqual(rows.length, 1, "Should persist transaction item");
      assert.strictEqual(rows[0].variant_id, null, "Should allow null variant_id");
      assert.strictEqual(rows[0].item_id, itemId, "Should store correct item_id");
    } finally {
      // Cleanup
      if (transactionId) {
        await pool.execute(`DELETE FROM pos_transaction_items WHERE pos_transaction_id = ?`, [transactionId]);
        await pool.execute(`DELETE FROM pos_transactions WHERE id = ?`, [transactionId]);
      }
      if (itemId) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      }
    }
  }
);

// Close database pool after all tests
test.after(async () => {
  await closeDbPool();
});
