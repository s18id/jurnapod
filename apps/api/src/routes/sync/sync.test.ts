// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Routes Tests
 *
 * Tests for sync API routes (health and check-duplicate) with DB pool cleanup.
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDbPool } from "../../lib/db";
import { buildLoginThrottleKeys } from "../../lib/auth-throttle";
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("Sync Routes", { concurrency: false }, () => {
  let connection: PoolConnection;
  let testUserId = 0;
  let testCompanyId = 0;
  let testOutletId = 0;

  before(async () => {
    const dbPool = getDbPool();
    connection = await dbPool.getConnection();

    // Find test user fixture
    const [userRows] = await connection.execute<RowDataPacket[]>(
      `SELECT u.id AS user_id, u.company_id, o.id AS outlet_id
       FROM users u
       INNER JOIN companies c ON c.id = u.company_id
       INNER JOIN user_outlets uo ON uo.user_id = u.id
       INNER JOIN outlets o ON o.id = uo.outlet_id
       WHERE c.code = ?
         AND u.email = ?
         AND u.is_active = 1
         AND o.code = ?
       LIMIT 1`,
      [TEST_COMPANY_CODE, TEST_OWNER_EMAIL, TEST_OUTLET_CODE]
    );

    assert.ok(userRows.length > 0, `Owner fixture not found; run database seed first. Looking for company=${TEST_COMPANY_CODE}, email=${TEST_OWNER_EMAIL}, outlet=${TEST_OUTLET_CODE}`);
    testUserId = Number(userRows[0].user_id);
    testCompanyId = Number(userRows[0].company_id);
    testOutletId = Number(userRows[0].outlet_id);
  });

  after(async () => {
    connection.release();
    await closeDbPool();
  });

  describe("Auth Throttle Functions (used by sync)", () => {
    test("buildLoginThrottleKeys generates correct key structure for sync scenarios", () => {
      const keys = buildLoginThrottleKeys({
        companyCode: TEST_COMPANY_CODE,
        email: TEST_OWNER_EMAIL,
        ipAddress: "192.168.1.100"
      });

      assert.equal(keys.length, 2);
      assert.equal(keys[0].scope, "primary");
      assert.equal(keys[1].scope, "ip");
      assert.ok(keys[0].hash.length > 0);
      assert.ok(keys[1].hash.length > 0);
    });

    test("buildLoginThrottleKeys handles null ipAddress", () => {
      const keys = buildLoginThrottleKeys({
        companyCode: TEST_COMPANY_CODE,
        email: TEST_OWNER_EMAIL,
        ipAddress: null
      });

      assert.equal(keys.length, 2);
      assert.ok(keys[1].raw.includes("unknown"));
    });
  });

  describe("Check-Duplicate Route Logic", () => {
    test("check-duplicate query returns nothing for non-existent transaction", async () => {
      const nonExistentClientTxId = crypto.randomUUID();

      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT id, created_at
         FROM pos_transactions
         WHERE company_id = ? AND client_tx_id = ?
         LIMIT 1`,
        [testCompanyId, nonExistentClientTxId]
      );

      assert.equal(rows.length, 0, "Should not find non-existent transaction");
    });

    test("check-duplicate query finds existing transaction by client_tx_id", async () => {
      const clientTxId = crypto.randomUUID();

      // Create a test transaction
      const [insertResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id,
          status, service_type, trx_at, opened_at,
          discount_percent, discount_fixed, discount_code
        ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)`,
        [testCompanyId, testOutletId, testUserId, clientTxId]
      );

      const transactionId = Number(insertResult.insertId);

      try {
        // Verify duplicate check finds it
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT id, created_at
           FROM pos_transactions
           WHERE company_id = ? AND client_tx_id = ?
           LIMIT 1`,
          [testCompanyId, clientTxId]
        );

        assert.equal(rows.length, 1, "Should find the transaction");
        assert.equal(rows[0].id, transactionId);
        assert.ok(rows[0].created_at);
      } finally {
        // Cleanup
        await connection.execute(`DELETE FROM pos_transactions WHERE id = ?`, [transactionId]);
      }
    });

    test("check-duplicate is scoped to company (tenant isolation)", async () => {
      const clientTxId = crypto.randomUUID();

      // Create a transaction
      const [insertResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id,
          status, service_type, trx_at, opened_at,
          discount_percent, discount_fixed, discount_code
        ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)`,
        [testCompanyId, testOutletId, testUserId, clientTxId]
      );

      const transactionId = Number(insertResult.insertId);

      try {
        // Query with different company_id should not find it
        const [wrongCompanyRows] = await connection.execute<RowDataPacket[]>(
          `SELECT id, created_at
           FROM pos_transactions
           WHERE company_id = ? AND client_tx_id = ?
           LIMIT 1`,
          [testCompanyId + 99999, clientTxId] // Different company
        );

        assert.equal(wrongCompanyRows.length, 0, "Should not find transaction from different company");

        // Query with correct company_id should find it
        const [correctRows] = await connection.execute<RowDataPacket[]>(
          `SELECT id, created_at
           FROM pos_transactions
           WHERE company_id = ? AND client_tx_id = ?
           LIMIT 1`,
          [testCompanyId, clientTxId]
        );

        assert.equal(correctRows.length, 1, "Should find transaction with correct company_id");
      } finally {
        // Cleanup
        await connection.execute(`DELETE FROM pos_transactions WHERE id = ?`, [transactionId]);
      }
    });

    test("unique constraint enforces company_id + client_tx_id uniqueness", async () => {
      const clientTxId = crypto.randomUUID();

      // Create first transaction
      const [insertResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id,
          status, service_type, trx_at, opened_at,
          discount_percent, discount_fixed, discount_code
        ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)`,
        [testCompanyId, testOutletId, testUserId, clientTxId]
      );

      const transactionId = Number(insertResult.insertId);

      try {
        // Attempt to insert duplicate should fail
        await assert.rejects(
          async () => {
            await connection.execute(
              `INSERT INTO pos_transactions (
                company_id, outlet_id, cashier_user_id, client_tx_id,
                status, service_type, trx_at, opened_at,
                discount_percent, discount_fixed, discount_code
              ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)`,
              [testCompanyId, testOutletId, testUserId, clientTxId]
            );
          },
          (error: unknown) => {
            const mysqlError = error as { code?: string; errno?: number };
            return mysqlError.code === "ER_DUP_ENTRY" || mysqlError.errno === 1062;
          }
        );
      } finally {
        // Cleanup
        await connection.execute(`DELETE FROM pos_transactions WHERE id = ?`, [transactionId]);
      }
    });

    test("same client_tx_id allowed for different companies", async () => {
      const clientTxId = crypto.randomUUID();

      // Create first transaction for current company
      const [insertResult1] = await connection.execute<ResultSetHeader>(
        `INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id,
          status, service_type, trx_at, opened_at,
          discount_percent, discount_fixed, discount_code
        ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)`,
        [testCompanyId, testOutletId, testUserId, clientTxId]
      );

      const transactionId1 = Number(insertResult1.insertId);

      try {
        // Verify the unique constraint includes company_id and client_tx_id
        const [constraintRows] = await connection.execute<RowDataPacket[]>(
          `SELECT COLUMN_NAME, SEQ_IN_INDEX
           FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'pos_transactions'
             AND INDEX_NAME LIKE '%client_tx%'
           ORDER BY SEQ_IN_INDEX`
        );

        assert.ok(constraintRows.length >= 2, "Should have at least 2 columns in unique index");
        type ConstraintRow = { COLUMN_NAME: string; SEQ_IN_INDEX: number };
        const columnNames = (constraintRows as ConstraintRow[]).map((r) => r.COLUMN_NAME);
        assert.ok(columnNames.includes("company_id"), "Unique index should include company_id");
        assert.ok(columnNames.includes("client_tx_id"), "Unique index should include client_tx_id");
      } finally {
        // Cleanup
        await connection.execute(`DELETE FROM pos_transactions WHERE id = ?`, [transactionId1]);
      }
    });
  });

  describe("Sync Module Health Check", () => {
    test("checkSyncModuleHealth function exists and returns expected structure", async () => {
      const { checkSyncModuleHealth } = await import("../../lib/sync-modules");

      const health = await checkSyncModuleHealth();

      assert.ok(typeof health.healthy === "boolean", "Should return healthy boolean");
      assert.ok(typeof health.modules === "object", "Should return modules object");
      assert.ok("batchProcessor" in health, "Should return batchProcessor status");
    });
  });
});

// Standard DB pool cleanup - runs after all tests in this file
test.after(async () => {
  await closeDbPool();
});
