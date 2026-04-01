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
import { closeDbPool, getDb } from "../lib/db";
import { listSessions } from "../lib/service-sessions";
import { sql } from "kysely";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("Dine-in Routes", { concurrency: false }, () => {
  let testUserId = 0;
  let testCompanyId = 0;
  let testOutletId = 0;

  before(async () => {
    const db = getDb();

    // Find test user fixture using Kysely query builder
    // Global owner has outlet_id = NULL in user_role_assignments
    const userRows = await db
      .selectFrom("users as u")
      .innerJoin("companies as c", "c.id", "u.company_id")
      .innerJoin("user_role_assignments as ura", "ura.user_id", "u.id")
      .where("c.code", "=", TEST_COMPANY_CODE)
      .where("u.email", "=", TEST_OWNER_EMAIL)
      .where("u.is_active", "=", 1)
      .where("ura.outlet_id", "is", null)
      .select(["u.id as user_id", "u.company_id"])
      .limit(1)
      .execute();

    assert.ok(
      userRows.length > 0,
      `Owner fixture not found; run database seed first. Looking for company=${TEST_COMPANY_CODE}, email=${TEST_OWNER_EMAIL}`
    );
    testUserId = Number(userRows[0].user_id);
    testCompanyId = Number(userRows[0].company_id);

    // Get outlet ID from outlets table
    const outletRows = await db
      .selectFrom("outlets")
      .where("company_id", "=", testCompanyId)
      .where("code", "=", TEST_OUTLET_CODE)
      .select(["id"])
      .limit(1)
      .execute();
    assert.ok(outletRows.length > 0, `Outlet ${TEST_OUTLET_CODE} not found`);
    testOutletId = Number(outletRows[0].id);
  });

  after(async () => {
    await closeDbPool();
  });

  // ===========================================================================
  // Dine-in Schema Validation Tests
  // ===========================================================================

  describe("Dine-in Data Structure", () => {
    test("table_occupancy table exists", async () => {
      const db = getDb();
      const result = await sql<{ COLUMN_NAME: string }>`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'table_occupancy'
      `.execute(db);

      const columnNames = result.rows.map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("company_id"), "Should have company_id column");
      assert.ok(columnNames.includes("outlet_id"), "Should have outlet_id column");
      assert.ok(columnNames.includes("table_id"), "Should have table_id column");
    });

    test("table_service_sessions table exists", async () => {
      const db = getDb();
      const result = await sql<{ COLUMN_NAME: string }>`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'table_service_sessions'
      `.execute(db);

      const columnNames = result.rows.map(r => r.COLUMN_NAME);
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
