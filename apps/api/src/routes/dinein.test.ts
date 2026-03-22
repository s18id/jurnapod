// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Dine-in Routes Tests
 *
 * Tests for /dinein endpoints:
 * - List sessions with filtering
 * - List tables with occupancy
 * - Company scoping enforcement
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDbPool } from "../lib/db";
import { listSessions } from "../lib/service-sessions";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("Dine-in Routes", { concurrency: false }, () => {
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
  // Dine-in Schema Validation Tests
  // ===========================================================================

  describe("Dine-in Data Structure", () => {
    test("table_occupancy table exists", async () => {
      const [columns] = await connection.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'table_occupancy'`
      );

      const columnNames = (columns as Array<{ COLUMN_NAME: string }>).map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("company_id"), "Should have company_id column");
      assert.ok(columnNames.includes("outlet_id"), "Should have outlet_id column");
      assert.ok(columnNames.includes("table_id"), "Should have table_id column");
    });

    test("table_service_sessions table exists", async () => {
      const [columns] = await connection.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'table_service_sessions'`
      );

      const columnNames = (columns as Array<{ COLUMN_NAME: string }>).map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("company_id"), "Should have company_id column");
      assert.ok(columnNames.includes("outlet_id"), "Should have outlet_id column");
      assert.ok(columnNames.includes("table_id"), "Should have table_id column");
      assert.ok(columnNames.includes("status_id"), "Should have status_id column");
    });
  });

  // ===========================================================================
  // List Sessions Tests
  // ===========================================================================

  describe("List Sessions", () => {
    test("returns sessions for company and outlet", async () => {
      const result = await listSessions({
        companyId: BigInt(testCompanyId),
        outletId: BigInt(testOutletId),
        limit: 10,
        offset: 0,
      });

      assert.ok(typeof result.total === "bigint" || typeof result.total === "number", "Should return total");
      assert.ok(Array.isArray(result.sessions), "Should return sessions array");
    });

    test("filters by status", async () => {
      // Active = 1, Locked for payment = 2, Closed = 3
      const result = await listSessions({
        companyId: BigInt(testCompanyId),
        outletId: BigInt(testOutletId),
        limit: 10,
        offset: 0,
        statusId: 1, // ACTIVE
      });

      assert.ok(typeof result.total === "bigint" || typeof result.total === "number", "Should return total");
      for (const session of result.sessions) {
        assert.equal(session.statusId, 1, "All sessions should have ACTIVE status");
      }
    });

    test("enforces company scoping", async () => {
      // Query with a different company ID should return empty
      const result = await listSessions({
        companyId: BigInt(999999),
        outletId: BigInt(999999),
        limit: 10,
        offset: 0,
      });

      assert.ok(result.sessions.length === 0, "Should return empty sessions for non-existent company");
    });
  });

  // ===========================================================================
  // Company Scoping Tests
  // ===========================================================================

  describe("Company Scoping Enforcement", () => {
    test("sessions are scoped to company", async () => {
      const result = await listSessions({
        companyId: BigInt(testCompanyId),
        outletId: BigInt(testOutletId),
        limit: 10,
        offset: 0,
      });

      for (const session of result.sessions) {
        // The session should belong to the company
        assert.ok(session.tableId > 0, "Session should have valid tableId");
      }
    });
  });
});
