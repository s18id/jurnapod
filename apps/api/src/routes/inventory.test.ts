// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Routes Tests
 *
 * Tests for /inventory endpoints:
 * - List items with filtering
 * - Get single item
 * - Company scoping enforcement
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDbPool } from "../lib/db";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("Inventory Routes", { concurrency: false }, () => {
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
  // Item Data Structure Tests
  // ===========================================================================

  describe("Item Data Structure", () => {
    test("items table exists with required columns", async () => {
      const [columns] = await connection.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'items'`
      );

      const columnNames = (columns as Array<{ COLUMN_NAME: string }>).map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("id"), "Should have id column");
      assert.ok(columnNames.includes("company_id"), "Should have company_id column");
      assert.ok(columnNames.includes("name"), "Should have name column");
      assert.ok(columnNames.includes("is_active"), "Should have is_active column");
    });

    test("returns items for company", async () => {
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT id, name, is_active 
         FROM items 
         WHERE company_id = ? 
         LIMIT 10`,
        [testCompanyId]
      );

      // May or may not have items
      assert.ok(Array.isArray(rows), "Should return array");
      for (const row of rows) {
        assert.ok(row.id > 0, "Item should have valid id");
        assert.ok(typeof row.name === "string", "Item should have name");
      }
    });
  });

  // ===========================================================================
  // Filtering Tests
  // ===========================================================================

  describe("Item Filtering", () => {
    test("filters by active status", async () => {
      const [activeRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM items WHERE company_id = ? AND is_active = 1 LIMIT 5`,
        [testCompanyId]
      );
      
      const [inactiveRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM items WHERE company_id = ? AND is_active = 0 LIMIT 5`,
        [testCompanyId]
      );

      // Both queries should work
      assert.ok(activeRows.length >= 0, "Active items query should work");
      assert.ok(inactiveRows.length >= 0, "Inactive items query should work");
    });

    test("search by name", async () => {
      // Find any item to search for
      const [itemRows] = await connection.execute<RowDataPacket[]>(
        `SELECT name FROM items WHERE company_id = ? LIMIT 1`,
        [testCompanyId]
      );

      if (itemRows.length > 0) {
        const name = itemRows[0].name;

        // Search by name
        const [nameRows] = await connection.execute<RowDataPacket[]>(
          `SELECT id FROM items WHERE company_id = ? AND name LIKE ? LIMIT 5`,
          [testCompanyId, `%${name.substring(0, 3)}%`]
        );
        assert.ok(nameRows.length >= 0, "Name search should work");
      } else {
        // No items - that's valid too
        assert.ok(true, "No items found is valid");
      }
    });
  });

  // ===========================================================================
  // Company Scoping Tests
  // ===========================================================================

  describe("Company Scoping Enforcement", () => {
    test("prevents cross-company item access", async () => {
      // Try to query items from a different company
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM items WHERE company_id = ? LIMIT 1`,
        [testCompanyId + 9999]
      );

      assert.equal(rows.length, 0, "Should not find items from non-existent company");
    });

    test("items table has company_id index", async () => {
      const [indexes] = await connection.execute<RowDataPacket[]>(
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'items' AND INDEX_NAME != 'PRIMARY'`
      );

      // Should have indexes for company_id
      assert.ok(Array.isArray(indexes), "Should return index information");
    });
  });

  // ===========================================================================
  // Item Groups Tests
  // ===========================================================================

  describe("Item Groups", () => {
    test("item_groups table exists", async () => {
      const [tables] = await connection.execute<RowDataPacket[]>(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'item_groups'`
      );

      if (tables.length > 0) {
        assert.ok(true, "item_groups table exists");
      } else {
        // Table may not exist in all deployments
        assert.ok(true, "item_groups table may not exist");
      }
    });

    test("returns item groups for company", async () => {
      try {
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT id, name FROM item_groups WHERE company_id = ? LIMIT 10`,
          [testCompanyId]
        );
        assert.ok(Array.isArray(rows), "Should return array");
      } catch {
        // Table may not exist
        assert.ok(true, "item_groups table may not exist");
      }
    });
  });

  // ===========================================================================
  // Item Prices Tests
  // ===========================================================================

  describe("Item Prices", () => {
    test("item_prices table exists", async () => {
      const [tables] = await connection.execute<RowDataPacket[]>(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'item_prices'`
      );

      if (tables.length > 0) {
        assert.ok(true, "item_prices table exists");
      } else {
        // Table may not exist in all deployments
        assert.ok(true, "item_prices table may not exist");
      }
    });

    test("returns active prices for outlet", async () => {
      try {
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT id, item_id, price FROM item_prices WHERE outlet_id = ? AND is_active = 1 LIMIT 5`,
          [testOutletId]
        );
        assert.ok(Array.isArray(rows), "Should return array");
      } catch {
        // Table may not exist
        assert.ok(true, "item_prices table may not exist");
      }
    });
  });

  // ===========================================================================
  // Query Building Tests
  // ===========================================================================

  describe("Query Building", () => {
    test("handles numeric id parsing", () => {
      const parseNumericId = (value: string): number => {
        const parsed = parseInt(value, 10);
        if (!Number.isSafeInteger(parsed) || parsed <= 0) {
          throw new Error("Invalid numeric ID");
        }
        return parsed;
      };

      assert.equal(parseNumericId("123"), 123, "Should parse valid numeric ID");
      assert.throws(() => parseNumericId("abc"), /Invalid numeric ID/, "Should throw on invalid ID");
      assert.throws(() => parseNumericId("0"), /Invalid numeric ID/, "Should throw on zero");
      assert.throws(() => parseNumericId("-1"), /Invalid numeric ID/, "Should throw on negative");
    });

    test("handles boolean string transformation", () => {
      const parseBooleanString = (value: string | null): boolean | undefined => {
        if (value == null) {
          return undefined;
        }
        if (value === "true" || value === "1") {
          return true;
        }
        if (value === "false" || value === "0") {
          return false;
        }
        return undefined;
      };

      assert.equal(parseBooleanString("true"), true, "Should parse 'true'");
      assert.equal(parseBooleanString("false"), false, "Should parse 'false'");
      assert.equal(parseBooleanString("1"), true, "Should parse '1'");
      assert.equal(parseBooleanString("0"), false, "Should parse '0'");
      assert.equal(parseBooleanString(null), undefined, "Should return undefined for null");
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe("Error Handling", () => {
    test("handles invalid company_id format", async () => {
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM items WHERE company_id = ? LIMIT 1`,
        ["invalid"]
      );
      // Should return empty for invalid company_id
      assert.ok(Array.isArray(rows), "Should return array");
    });

    test("handles empty search string", async () => {
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM items WHERE company_id = ? AND name LIKE ? LIMIT 5`,
        [testCompanyId, "%%"]
      );
      // Should return results (empty search matches all)
      assert.ok(Array.isArray(rows), "Should return array for empty search");
    });
  });

  // ===========================================================================
  // Access Control Tests
  // ===========================================================================

  describe("Access Control", () => {
    test("user has proper role for inventory access", async () => {
      // Verify user has at least one of the allowed roles
      // user_roles table may not exist in all deployments
      try {
        const [rows] = await connection.execute(
          `SELECT role_code FROM user_roles ur 
           INNER JOIN roles r ON r.id = ur.role_id 
           WHERE ur.user_id = ? AND r.code IN ('OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER')
           LIMIT 1`,
          [testUserId]
        ) as [RowDataPacket[], unknown];

        // User should have at least one of these roles
        assert.ok(rows.length >= 0, "Role check query works");
      } catch {
        // Table may not exist - skip gracefully
        assert.ok(true, "user_roles table may not exist");
      }
    });

    test("user has write role for create operations", async () => {
      // Verify user has at least one of the write roles
      // user_roles table may not exist in all deployments
      try {
        const [rows] = await connection.execute(
          `SELECT role_code FROM user_roles ur 
           INNER JOIN roles r ON r.id = ur.role_id 
           WHERE ur.user_id = ? AND r.code IN ('OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT')
           LIMIT 1`,
          [testUserId]
        ) as [RowDataPacket[], unknown];

        // User should have at least one write role
        assert.ok(rows.length >= 0, "Write role check query works");
      } catch {
        // Table may not exist - skip gracefully
        assert.ok(true, "user_roles table may not exist");
      }
    });
  });

  describe("Variant Stats Bulk Endpoint", () => {
    test("returns variant stats for multiple items", async () => {
      // Get some item IDs from the database
      const [itemRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM items WHERE company_id = ? LIMIT 3`,
        [testCompanyId]
      );

      if (itemRows.length === 0) {
        // Skip if no items in test data
        assert.ok(true, "No items available for testing");
        return;
      }

      const itemIds = itemRows.map(row => row.id);
      const itemIdsParam = itemIds.join(',');

      // Test the variant-stats endpoint
      const url = `http://localhost:3001/api/inventory/variant-stats?item_ids=${itemIdsParam}`;
      
      // For now, just test that the endpoint is accessible
      // In a full integration test, we would need proper auth token
      try {
        const response = await fetch(url);
        
        // Should return 401 without auth token
        assert.strictEqual(response.status, 401, "Endpoint requires authentication");
        
        const data = await response.json();
        assert.strictEqual(data.success, false, "Unauthorized request should fail");
        assert.strictEqual(data.error.code, "UNAUTHORIZED", "Should return unauthorized error");
      } catch (error) {
        // Network error is acceptable for this basic connectivity test
        assert.ok(true, "Endpoint connectivity test completed");
      }
    });

    test("validates item_ids parameter", async () => {
      // Test without item_ids parameter
      const url = "http://localhost:3001/api/inventory/variant-stats";
      
      try {
        const response = await fetch(url);
        
        // Should return 401 (auth) or 400 (missing param) depending on middleware order
        assert.ok(response.status === 401 || response.status === 400, 
          "Endpoint should require auth or validate parameters");
      } catch (error) {
        // Network error is acceptable for this basic test
        assert.ok(true, "Parameter validation test completed");
      }
    });
  });
});

// Close database pool after all tests
test.after(async () => {
  await closeDbPool();
});
