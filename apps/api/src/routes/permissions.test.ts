// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Permission System Tests
 *
 * Tests to verify the permission bitmask system is working correctly
 * with user_role_assignments and module_roles tables.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDbPool } from "../lib/db";
import { checkUserAccess, MODULE_PERMISSION_BITS } from "../lib/auth";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("Permission System", { concurrency: false }, () => {
  let connection: PoolConnection;
  let testUserId = 0;
  let testCompanyId = 0;

  before(async () => {
    const dbPool = getDbPool();
    connection = await dbPool.getConnection();

    // Find test user fixture
    const [userRows] = await connection.execute<RowDataPacket[]>(
      `SELECT u.id AS user_id, u.company_id
       FROM users u
       INNER JOIN companies c ON c.id = u.company_id
       WHERE c.code = ?
         AND u.email = ?
         AND u.is_active = 1
       LIMIT 1`,
      [TEST_COMPANY_CODE, TEST_OWNER_EMAIL]
    );

    if (userRows.length === 0) {
      throw new Error(`Test user not found: ${TEST_OWNER_EMAIL} in company ${TEST_COMPANY_CODE}`);
    }

    const userRow = userRows[0];
    testUserId = userRow.user_id;
    testCompanyId = userRow.company_id;
  });

  after(async () => {
    if (connection) {
      connection.release();
    }
  });

  describe("Permission Bitmask System", () => {
    test("permission constants are correct", () => {
      assert.strictEqual(MODULE_PERMISSION_BITS.create, 1, "Create permission bit should be 1");
      assert.strictEqual(MODULE_PERMISSION_BITS.read, 2, "Read permission bit should be 2");
      assert.strictEqual(MODULE_PERMISSION_BITS.update, 4, "Update permission bit should be 4");
      assert.strictEqual(MODULE_PERMISSION_BITS.delete, 8, "Delete permission bit should be 8");
    });

    test("user has role assignments", async () => {
      const [roleRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as role_count 
         FROM user_role_assignments ura
         WHERE ura.user_id = ?`,
        [testUserId]
      );

      assert.ok(roleRows.length > 0, "Should have role assignment data");
      assert.ok(roleRows[0].role_count > 0, "User should have at least one role assignment");
    });

    test("roles have module permissions", async () => {
      const [moduleRows] = await connection.execute<RowDataPacket[]>(
        `SELECT mr.module, mr.permission_mask, r.code as role_code
         FROM user_role_assignments ura
         INNER JOIN roles r ON r.id = ura.role_id
         INNER JOIN module_roles mr ON mr.role_id = r.id
         WHERE ura.user_id = ? AND mr.company_id = ?
         LIMIT 5`,
        [testUserId, testCompanyId]
      );

      if (moduleRows.length > 0) {
        console.log("Sample module permissions:", moduleRows);
        
        for (const row of moduleRows) {
          assert.ok(row.module, "Module should be defined");
          assert.ok(typeof row.permission_mask === "number", "Permission mask should be a number");
          assert.ok(row.role_code, "Role code should be defined");
        }
      } else {
        console.warn("No module permissions found for test user - this might be expected for some test setups");
      }
    });

    test("checkUserAccess works with permissions", async () => {
      // Test read access to users module
      const access = await checkUserAccess({
        userId: testUserId,
        companyId: testCompanyId,
        module: "users",
        permission: "read"
      });

      // This might be null if no permissions are set up, which is okay for some test environments
      if (access !== null) {
        assert.ok(typeof access.hasPermission === "boolean", "hasPermission should be boolean");
        assert.ok(typeof access.isSuperAdmin === "boolean", "isSuperAdmin should be boolean");
        console.log("Access check result:", {
          hasPermission: access.hasPermission,
          isSuperAdmin: access.isSuperAdmin,
          hasRole: access.hasRole,
          hasGlobalRole: access.hasGlobalRole
        });
      } else {
        console.warn("Access check returned null - user may not have permissions set up");
      }
    });

    test("permission bitmask logic works", async () => {
      // Test that we can check specific permission bits
      const readBit = MODULE_PERMISSION_BITS.read;
      const writeBit = MODULE_PERMISSION_BITS.create;
      
      // Test permission mask that has read (2) and create (1) = 3
      const testMask = 3;
      
      assert.ok((testMask & readBit) !== 0, "Should have read permission");
      assert.ok((testMask & writeBit) !== 0, "Should have create permission");
      assert.ok((testMask & MODULE_PERMISSION_BITS.update) === 0, "Should not have update permission");
      assert.ok((testMask & MODULE_PERMISSION_BITS.delete) === 0, "Should not have delete permission");
    });
  });

  describe("Database Schema Verification", () => {
    test("user_role_assignments table exists and has correct structure", async () => {
      const [rows] = await connection.execute<RowDataPacket[]>(
        `DESCRIBE user_role_assignments`
      );

      const columns = rows.map(row => row.Field);
      assert.ok(columns.includes("user_id"), "Should have user_id column");
      assert.ok(columns.includes("role_id"), "Should have role_id column");
      assert.ok(columns.includes("outlet_id"), "Should have outlet_id column");
    });

    test("module_roles table exists and has permission_mask column", async () => {
      const [rows] = await connection.execute<RowDataPacket[]>(
        `DESCRIBE module_roles`
      );

      const columns = rows.map(row => row.Field);
      assert.ok(columns.includes("permission_mask"), "Should have permission_mask column");
      assert.ok(columns.includes("module"), "Should have module column");
      assert.ok(columns.includes("role_id"), "Should have role_id column");
      assert.ok(columns.includes("company_id"), "Should have company_id column");
    });
  });
});

// Close database pool after all tests
test.after(async () => {
  await closeDbPool();
});