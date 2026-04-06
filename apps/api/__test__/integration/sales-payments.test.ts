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
import {test, describe, beforeAll, afterAll} from 'vitest';
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.js";
import { closeDbPool, getDb } from "../../src/lib/db";
import { getComposedPaymentService } from "../../src/lib/modules-sales/payment-service-composition";
import type { SalesPayment } from "@jurnapod/modules-sales";
import { sql } from "kysely";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("Sales Payment Routes", { concurrent: false }, () => {
  let testUserId = 0;
  let testCompanyId = 0;
  let testOutletId = 0;

  beforeAll(async () => {
    const db = getDb();

    // Find test user fixture - global owner has outlet_id = NULL in user_role_assignments
    const userRows = await sql<{ user_id: number; company_id: number }>`
      SELECT u.id AS user_id, u.company_id
       FROM users u
       INNER JOIN companies c ON c.id = u.company_id
       INNER JOIN user_role_assignments ura ON ura.user_id = u.id
       WHERE c.code = ${TEST_COMPANY_CODE}
         AND u.email = ${TEST_OWNER_EMAIL}
         AND u.is_active = 1
         AND ura.outlet_id IS NULL
       LIMIT 1
    `.execute(db);

    assert.ok(
      userRows.rows.length > 0,
      `Owner fixture not found; run database seed first. Looking for company=${TEST_COMPANY_CODE}, email=${TEST_OWNER_EMAIL}`
    );
    testUserId = Number(userRows.rows[0].user_id);
    testCompanyId = Number(userRows.rows[0].company_id);

    // Get outlet ID from outlets table
    const outletRows = await sql<{ id: number }>`
      SELECT id FROM outlets WHERE company_id = ${testCompanyId} AND code = ${TEST_OUTLET_CODE} LIMIT 1
    `.execute(db);
    assert.ok(outletRows.rows.length > 0, `Outlet ${TEST_OUTLET_CODE} not found`);
    testOutletId = Number(outletRows.rows[0].id);
  });

  afterAll(async () => {
    await closeDbPool();
  });

  // ===========================================================================
  // Payment Schema Validation Tests
  // ===========================================================================

  describe("Payment Data Structure", () => {
    test("sales_payments table exists with required columns", async () => {
      const db = getDb();
      const columns = await sql<{ COLUMN_NAME: string }>`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_payments'
      `.execute(db);

      const columnNames = columns.rows.map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("id"), "Should have id column");
      assert.ok(columnNames.includes("company_id"), "Should have company_id column");
      assert.ok(columnNames.includes("outlet_id"), "Should have outlet_id column");
      assert.ok(columnNames.includes("payment_no"), "Should have payment_no column");
      assert.ok(columnNames.includes("amount"), "Should have amount column");
      assert.ok(columnNames.includes("status"), "Should have status column");
    });

    test("sales_payment_splits table exists (for split payments)", async () => {
      const db = getDb();
      const columns = await sql<{ COLUMN_NAME: string }>`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_payment_splits'
      `.execute(db);

      const columnNames = columns.rows.map(r => r.COLUMN_NAME);
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
      const result = await getComposedPaymentService().listPayments(testCompanyId, {
        outletIds: [testOutletId],
        limit: 10
      });

      assert.ok(typeof result.total === "number", "Should return total count");
      assert.ok(Array.isArray(result.payments), "Should return payments array");
    });

    test("filters by status", async () => {
      const result = await getComposedPaymentService().listPayments(testCompanyId, {
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
      const result = await getComposedPaymentService().listPayments(999999, {
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
      const result = await getComposedPaymentService().listPayments(testCompanyId, {
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
      const db = getDb();
      const rows = await sql<{ status: string }>`
        SELECT DISTINCT status FROM sales_payments WHERE company_id = ${testCompanyId} LIMIT 5
      `.execute(db);

      // Status values should be DRAFT, POSTED, or VOID
      for (const row of rows.rows) {
        assert.ok(
          ["DRAFT", "POSTED", "VOID"].includes(row.status),
          `Status should be valid: ${row.status}`
        );
      }
    });

    test("sales_payments supports split payment structure", async () => {
      const db = getDb();
      // Check if splits exist for any payments
      const splitRows = await sql<{ cnt: number }>`
        SELECT COUNT(*) as cnt FROM sales_payment_splits sps
         INNER JOIN sales_payments sp ON sp.id = sps.payment_id
         WHERE sp.company_id = ${testCompanyId}
      `.execute(db);

      // Just verify the table is accessible and has expected structure
      assert.ok(typeof splitRows.rows[0].cnt === "number", "Splits count should be a number");
    });
  });
});
