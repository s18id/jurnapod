// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Order Routes Tests
 *
 * Tests for /sales/orders endpoints:
 * - List orders with filtering
 * - Create new orders
 * - Company scoping enforcement
 * - Order state management
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDbPool } from "../../lib/db";
import { createOrder, listOrders, type SalesOrderDetail } from "../../lib/sales";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("Sales Order Routes", { concurrency: false }, () => {
  let connection: PoolConnection;
  let testUserId = 0;
  let testCompanyId = 0;
  let testOutletId = 0;
  let testOrderId = 0;

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
    // Cleanup: delete test order if created
    if (testOrderId > 0) {
      try {
        await connection.execute(
          `DELETE FROM sales_orders WHERE id = ? AND company_id = ?`,
          [testOrderId, testCompanyId]
        );
      } catch (error) {
        console.error("Cleanup failed for test order:", error);
      }
    }
    connection.release();
    await closeDbPool();
  });

  // ===========================================================================
  // Order Schema Validation Tests
  // ===========================================================================

  describe("Order Data Structure", () => {
    test("sales_orders table exists with required columns", async () => {
      const [columns] = await connection.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_orders'`
      );

      const columnNames = (columns as Array<{ COLUMN_NAME: string }>).map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("id"), "Should have id column");
      assert.ok(columnNames.includes("company_id"), "Should have company_id column");
      assert.ok(columnNames.includes("outlet_id"), "Should have outlet_id column");
      assert.ok(columnNames.includes("order_no"), "Should have order_no column");
      assert.ok(columnNames.includes("status"), "Should have status column");
    });

    test("sales_order_lines table exists with required columns", async () => {
      const [columns] = await connection.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_order_lines'`
      );

      const columnNames = (columns as Array<{ COLUMN_NAME: string }>).map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("id"), "Should have id column");
      assert.ok(columnNames.includes("order_id"), "Should have order_id column");
      assert.ok(columnNames.includes("description"), "Should have description column");
      assert.ok(columnNames.includes("qty"), "Should have qty column");
    });
  });

  // ===========================================================================
  // List Orders Tests
  // ===========================================================================

  describe("List Orders", () => {
    test("returns orders for company", async () => {
      const result = await listOrders(testCompanyId, {
        outletIds: [testOutletId],
        limit: 10
      });

      assert.ok(typeof result.total === "number", "Should return total count");
      assert.ok(Array.isArray(result.orders), "Should return orders array");
    });

    test("filters by status", async () => {
      const result = await listOrders(testCompanyId, {
        outletIds: [testOutletId],
        status: "DRAFT",
        limit: 10
      });

      assert.ok(typeof result.total === "number", "Should return total count");
      for (const order of result.orders) {
        assert.equal(order.status, "DRAFT", "All orders should have DRAFT status");
      }
    });

    test("enforces company scoping - cannot see other company orders", async () => {
      // Query with a different company ID should return empty
      const result = await listOrders(999999, {
        outletIds: [],
        limit: 10
      });

      assert.equal(result.total, 0, "Should return 0 for non-existent company");
      assert.equal(result.orders.length, 0, "Should return empty array");
    });
  });

  // ===========================================================================
  // Create Order Tests
  // ===========================================================================

  describe("Create Order", () => {
    test("creates order with minimal data", async () => {
      const order = await createOrder(testCompanyId, {
        outlet_id: testOutletId,
        order_date: new Date().toISOString().slice(0, 10),
        lines: [
          {
            description: "Test Order Item",
            qty: 1,
            unit_price: 50000
          }
        ]
      }, { userId: testUserId });

      assert.ok(order.id > 0, "Should have valid id");
      assert.equal(order.company_id, testCompanyId, "Should have correct company_id");
      assert.equal(order.outlet_id, testOutletId, "Should have correct outlet_id");
      assert.equal(order.status, "DRAFT", "Should have DRAFT status");
      assert.ok(order.lines.length > 0, "Should have lines");
      assert.equal(order.lines[0].description, "Test Order Item", "Should have correct line description");

      // Store for cleanup
      testOrderId = order.id;
    });

    test("creates order with client_ref for idempotency", async () => {
      const clientRef = crypto.randomUUID();
      
      const order1 = await createOrder(testCompanyId, {
        outlet_id: testOutletId,
        order_date: new Date().toISOString().slice(0, 10),
        client_ref: clientRef,
        lines: [
          {
            description: "Idempotent Order",
            qty: 1,
            unit_price: 25000
          }
        ]
      }, { userId: testUserId });

      // Creating again with same client_ref should return the same order
      const order2 = await createOrder(testCompanyId, {
        outlet_id: testOutletId,
        order_date: new Date().toISOString().slice(0, 10),
        client_ref: clientRef,
        lines: [
          {
            description: "Different Description",
            qty: 1,
            unit_price: 99999
          }
        ]
      }, { userId: testUserId });

      assert.equal(order1.id, order2.id, "Should return same order for same client_ref");
    });

    test("calculates subtotal correctly", async () => {
      const order = await createOrder(testCompanyId, {
        outlet_id: testOutletId,
        order_date: new Date().toISOString().slice(0, 10),
        lines: [
          {
            description: "Item 1",
            qty: 2,
            unit_price: 30000
          },
          {
            description: "Item 2",
            qty: 3,
            unit_price: 20000
          }
        ]
      }, { userId: testUserId });

      // 2 * 30000 + 3 * 20000 = 60000 + 60000 = 120000
      assert.equal(order.subtotal, 120000, "Subtotal should be 120000");
      assert.equal(order.lines.length, 2, "Should have 2 lines");

      // Store for cleanup
      testOrderId = order.id;
    });

    test("respects line_type for SERVICE items", async () => {
      const order = await createOrder(testCompanyId, {
        outlet_id: testOutletId,
        order_date: new Date().toISOString().slice(0, 10),
        lines: [
          {
            line_type: "SERVICE",
            description: "Consulting Service",
            qty: 1,
            unit_price: 250000
          }
        ]
      }, { userId: testUserId });

      assert.equal(order.lines[0].line_type, "SERVICE", "Line type should be SERVICE");
      assert.equal(order.lines[0].item_id, null, "Service should have null item_id");

      // Store for cleanup
      testOrderId = order.id;
    });
  });

  // ===========================================================================
  // Company Scoping Tests
  // ===========================================================================

  describe("Company Scoping Enforcement", () => {
    test("order is scoped to company", async () => {
      const order = await createOrder(testCompanyId, {
        outlet_id: testOutletId,
        order_date: new Date().toISOString().slice(0, 10),
        lines: [
          {
            description: "Scope Test",
            qty: 1,
            unit_price: 10000
          }
        ]
      }, { userId: testUserId });

      assert.equal(order.company_id, testCompanyId, "Order should be scoped to company");

      // Store for cleanup
      testOrderId = order.id;
    });

    test("cannot create order for non-existent outlet", async () => {
      try {
        await createOrder(testCompanyId, {
          outlet_id: 999999,
          order_date: new Date().toISOString().slice(0, 10),
          lines: [
            {
              description: "Invalid Outlet",
              qty: 1,
              unit_price: 10000
            }
          ]
        }, { userId: testUserId });
        
        assert.fail("Should have thrown an error");
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        assert.ok(
          errorMessage.includes("Outlet not found") || 
          errorMessage.includes("DatabaseReferenceError"),
          "Should throw reference error for invalid outlet"
        );
      }
    });
  });
});
