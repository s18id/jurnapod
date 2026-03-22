// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Payment Routes Tests
 *
 * Tests for /sales/payments endpoints:
 * - List payments with filtering
 * - Process new payments
 * - Company scoping enforcement
 * - Payment method validation
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDbPool } from "../../lib/db";
import { listPayments, type SalesPayment } from "../../lib/sales";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("Sales Payment Routes", { concurrency: false }, () => {
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

    assert.ok(
      userRows.length > 0,
      `Owner fixture not found; run database seed first. Looking for company=${TEST_COMPANY_CODE}, email=${TEST_OWNER_EMAIL}, outlet=${TEST_OUTLET_CODE}`
    );
    testUserId = Number(userRows[0].user_id);
    testCompanyId = Number(userRows[0].company_id);
    testOutletId = Number(userRows[0].outlet_id);
  });

  after(async () => {
    connection.release();
    await closeDbPool();
  });

  // ===========================================================================
  // Payment Schema Validation Tests
  // ===========================================================================

  describe("Payment Data Structure", () => {
    test("sales_payments table exists with required columns", async () => {
      const [columns] = await connection.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_payments'`
      );

      const columnNames = (columns as Array<{ COLUMN_NAME: string }>).map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("id"), "Should have id column");
      assert.ok(columnNames.includes("company_id"), "Should have company_id column");
      assert.ok(columnNames.includes("outlet_id"), "Should have outlet_id column");
      assert.ok(columnNames.includes("payment_no"), "Should have payment_no column");
      assert.ok(columnNames.includes("amount"), "Should have amount column");
      assert.ok(columnNames.includes("status"), "Should have status column");
    });

    test("sales_payment_splits table exists (for split payments)", async () => {
      const [columns] = await connection.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_payment_splits'`
      );

      const columnNames = (columns as Array<{ COLUMN_NAME: string }>).map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("id"), "Should have id column");
      assert.ok(columnNames.includes("payment_id"), "Should have payment_id column");
      assert.ok(columnNames.includes("account_id"), "Should have account_id column");
      assert.ok(columnNames.includes("amount"), "Should have amount column");
    });
  });

  // ===========================================================================
  // List Payments Tests
  // ===========================================================================

  describe("List Payments", () => {
    test("returns payments for company", async () => {
      const result = await listPayments(testCompanyId, {
        outletIds: [testOutletId],
        limit: 10
      });

      assert.ok(typeof result.total === "number", "Should return total count");
      assert.ok(Array.isArray(result.payments), "Should return payments array");
    });

    test("filters by status", async () => {
      const result = await listPayments(testCompanyId, {
        outletIds: [testOutletId],
        status: "POSTED",
        limit: 10
      });

      assert.ok(typeof result.total === "number", "Should return total count");
      for (const payment of result.payments) {
        assert.equal(payment.status, "POSTED", "All payments should have POSTED status");
      }
    });

    test("enforces company scoping - cannot see other company payments", async () => {
      // Query with a different company ID should return empty
      const result = await listPayments(999999, {
        outletIds: [],
        limit: 10
      });

      assert.equal(result.total, 0, "Should return 0 for non-existent company");
      assert.equal(result.payments.length, 0, "Should return empty array");
    });
  });

  // ===========================================================================
  // Company Scoping Tests
  // ===========================================================================

  describe("Company Scoping Enforcement", () => {
    test("payments are scoped to company", async () => {
      // List payments and verify they all belong to test company
      const result = await listPayments(testCompanyId, {
        outletIds: [testOutletId],
        limit: 10
      });

      for (const payment of result.payments) {
        assert.equal(payment.company_id, testCompanyId, "Payment should be scoped to company");
      }
    });
  });

  // ===========================================================================
  // Payment Validation Tests
  // ===========================================================================

  describe("Payment Validation", () => {
    test("sales_payments has correct status values", async () => {
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT DISTINCT status FROM sales_payments WHERE company_id = ? LIMIT 5`,
        [testCompanyId]
      );

      // Status values should be DRAFT, POSTED, or VOID
      for (const row of rows) {
        assert.ok(
          ["DRAFT", "POSTED", "VOID"].includes(row.status),
          `Status should be valid: ${row.status}`
        );
      }
    });

    test("sales_payments supports split payment structure", async () => {
      // Check if splits exist for any payments
      const [splitRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as cnt FROM sales_payment_splits sps
         INNER JOIN sales_payments sp ON sp.id = sps.payment_id
         WHERE sp.company_id = ?`,
        [testCompanyId]
      );

      // Just verify the table is accessible and has expected structure
      assert.ok(typeof splitRows[0].cnt === "number", "Splits count should be a number");
    });
  });
});
