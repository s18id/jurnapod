// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for dine-in tables API
 *
 * NOTE ON FIXTURE SETUP: Per integration test policy (docs/project-context.md),
 * business entities should be created via API endpoints. However, this story (12.3)
 * implements table occupancy management, not table CRUD. The required setup APIs
 * (POST /tables, POST /sessions) are implemented in later stories (12.4, 12.5).
 * Therefore, direct SQL writes are necessary for:
 * - Creating test outlet_tables (no endpoint in this story)
 * - Creating test table_service_sessions (Story 12.5)
 * - Setting initial table_occupancy states
 *
 * This exception is limited to fixture setup. All mutations under test use the
 * actual API endpoints. Cleanup uses direct SQL due to lack of DELETE endpoints.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import type { Pool } from "mysql2/promise";
import {
  createIntegrationTestContext,
  loginOwner,
  readEnv,
  TEST_TIMEOUT_MS
} from "../../../../tests/integration/integration-harness.mjs";
import { closeDbPool } from "../../../../src/lib/db";

const testContext = createIntegrationTestContext();
let baseUrl = "";
let db: Pool | null = null;

function getDb(): Pool {
  if (!db) {
    throw new Error("Database pool not initialized");
  }
  return db;
}

test.before(async () => {
  await testContext.start();
  baseUrl = testContext.baseUrl;
  db = testContext.db;
});

test.after(async () => {
  await testContext.stop();
});

async function requestJson(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

test(
  "Dine-in tables API - concurrent modification conflict tests",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  async () => {
    const runId = Date.now().toString(36);
    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
    const ownerPassword = readEnv("JP_OWNER_PASSWORD", null) ?? "password123";

    let companyId = 0;
    let outletId = 0;
    let userId = 0;
    let token = "";
    const createdTableIds: number[] = [];
    const createdSessionIds: number[] = [];

    try {
      // Get company and user fixtures
      const [ownerRows] = await getDb().execute<RowDataPacket[]>(
        `SELECT u.id AS user_id, u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ? AND u.email = ? AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(ownerRows.length > 0, "Owner fixture not found; run database seed first");
      companyId = Number(ownerRows[0].company_id);
      outletId = Number(ownerRows[0].outlet_id);
      userId = Number(ownerRows[0].user_id);

      // Login to get access token
      token = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);
      const authHeaders = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      };

      // ============================================
      // Test A: Concurrent hold attempts on same table
      // ============================================
      await test("concurrent hold attempts - one succeeds, one returns 409 with currentState", async () => {
        // FIXTURE SETUP: Creating test table via direct SQL because POST /tables
        // endpoint is not implemented in this story (Story 12.4). Per policy exception.
        const [tableResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO outlet_tables (company_id, outlet_id, code, name, capacity, status)
           VALUES (?, ?, ?, ?, ?, 'AVAILABLE')`,
          [companyId, outletId, `T-${runId}-A`, `Test Table A ${runId}`, 4]
        );
        const tableId = Number(tableResult.insertId);
        createdTableIds.push(tableId);

        // Ensure occupancy record exists with AVAILABLE status and version 1
        await getDb().execute(
          `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, version, created_by)
           VALUES (?, ?, ?, 1, 1, ?)
           ON DUPLICATE KEY UPDATE status_id = 1, version = 1`,
          [companyId, outletId, tableId, userId]
        );

        const heldUntil = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now

        // Send two hold requests simultaneously
        const request1 = requestJson(`/api/dinein/tables/${tableId}/hold?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            heldUntil,
            expectedVersion: 1
          })
        });

        const request2 = requestJson(`/api/dinein/tables/${tableId}/hold?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            heldUntil,
            expectedVersion: 1
          })
        });

        const [response1, response2] = await Promise.all([request1, request2]);

        // One should succeed (200), one should fail with 409
        const successResponse = response1.response.status === 200 ? response1 : response2;
        const conflictResponse = response1.response.status === 409 ? response1 : response2;

        assert.ok(
          (response1.response.status === 200 && response2.response.status === 409) ||
          (response1.response.status === 409 && response2.response.status === 200),
          `Expected one 200 and one 409 response, got ${response1.response.status} and ${response2.response.status}`
        );

        // Verify successful response
        assert.strictEqual(successResponse.response.status, 200, "Success response should be 200");
        assert.strictEqual(successResponse.payload.data.occupancy.statusId, 3, "Should be RESERVED status (3)");
        assert.strictEqual(successResponse.payload.data.occupancy.version, 2, "Version should be incremented to 2");

        // Verify conflict response
        assert.strictEqual(conflictResponse.response.status, 409, "Conflict response should be 409");
        assert.strictEqual(conflictResponse.payload.error, "CONFLICT", "Error code should be CONFLICT");
        assert.ok(conflictResponse.payload.currentState, "Conflict response should include currentState");
        assert.strictEqual(conflictResponse.payload.currentState.statusId, 3, "currentState should show RESERVED status");
        assert.strictEqual(conflictResponse.payload.currentState.version, 2, "currentState should show version 2");
      });

      // ============================================
      // Test B: Concurrent release attempts
      // ============================================
      await test("concurrent release attempts - one succeeds, one returns 409 with currentState", async () => {
        // FIXTURE SETUP: Creating test table via direct SQL because POST /tables
        // endpoint is not implemented in this story (Story 12.4). Per policy exception.
        const [tableResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO outlet_tables (company_id, outlet_id, code, name, capacity, status)
           VALUES (?, ?, ?, ?, ?, 'AVAILABLE')`,
          [companyId, outletId, `T-${runId}-B`, `Test Table B ${runId}`, 4]
        );
        const tableId = Number(tableResult.insertId);
        createdTableIds.push(tableId);

        // FIXTURE SETUP: Creating service session via direct SQL because session
        // creation endpoint is Story 12.5. Required for OCCUPIED state testing.
        const [sessionResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO table_service_sessions (company_id, outlet_id, table_id, status_id, started_at, guest_count, created_at, updated_at, created_by)
           VALUES (?, ?, ?, 1, NOW(), 2, NOW(), NOW(), 'test')`,
          [companyId, outletId, tableId]
        );
        const sessionId = Number(sessionResult.insertId);
        createdSessionIds.push(sessionId);

        // Set occupancy to OCCUPIED with version 1
        await getDb().execute(
          `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, version, service_session_id, guest_count, created_by)
           VALUES (?, ?, ?, 2, 1, ?, 2, ?)
           ON DUPLICATE KEY UPDATE status_id = 2, version = 1, service_session_id = VALUES(service_session_id), guest_count = 2`,
          [companyId, outletId, tableId, sessionId, userId]
        );

        // Send two release requests simultaneously
        const request1 = requestJson(`/api/dinein/tables/${tableId}/release?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            expectedVersion: 1
          })
        });

        const request2 = requestJson(`/api/dinein/tables/${tableId}/release?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            expectedVersion: 1
          })
        });

        const [response1, response2] = await Promise.all([request1, request2]);

        // One should succeed (200), one should fail with 409
        const successResponse = response1.response.status === 200 ? response1 : response2;
        const conflictResponse = response1.response.status === 409 ? response1 : response2;

        assert.ok(
          (response1.response.status === 200 && response2.response.status === 409) ||
          (response1.response.status === 409 && response2.response.status === 200),
          `Expected one 200 and one 409 response, got ${response1.response.status} and ${response2.response.status}`
        );

        // Verify successful response
        assert.strictEqual(successResponse.response.status, 200, "Success response should be 200");
        assert.strictEqual(successResponse.payload.data.occupancy.statusId, 1, "Should be AVAILABLE status (1)");
        assert.strictEqual(successResponse.payload.data.occupancy.version, 2, "Version should be incremented to 2");

        // Verify conflict response
        assert.strictEqual(conflictResponse.response.status, 409, "Conflict response should be 409");
        assert.strictEqual(conflictResponse.payload.error, "CONFLICT", "Error code should be CONFLICT");
        assert.ok(conflictResponse.payload.currentState, "Conflict response should include currentState");
        assert.strictEqual(conflictResponse.payload.currentState.statusId, 1, "currentState should show AVAILABLE status");
        assert.strictEqual(conflictResponse.payload.currentState.version, 2, "currentState should show version 2");
      });

      // ============================================
      // Test C: 404 for non-existent table
      // ============================================
      await test("POST /hold with non-existent table returns 404 NOT_FOUND", async () => {
        const nonExistentTableId = 99999999;
        const heldUntil = new Date(Date.now() + 3600000).toISOString();

        const { response, payload } = await requestJson(`/api/dinein/tables/${nonExistentTableId}/hold?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            heldUntil,
            expectedVersion: 1
          })
        });

        assert.strictEqual(response.status, 404, "Should return 404 for non-existent table");
        assert.strictEqual(payload.error?.code, "NOT_FOUND", "Error code should be NOT_FOUND");
      });

      // ============================================
      // Test D: expectedVersion via header
      // ============================================
      await test("POST /hold with X-Expected-Version header succeeds", async () => {
        // FIXTURE SETUP: Creating test table via direct SQL because POST /tables
        // endpoint is not implemented in this story (Story 12.4). Per policy exception.
        const [tableResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO outlet_tables (company_id, outlet_id, code, name, capacity, status)
           VALUES (?, ?, ?, ?, ?, 'AVAILABLE')`,
          [companyId, outletId, `T-${runId}-D`, `Test Table D ${runId}`, 4]
        );
        const tableId = Number(tableResult.insertId);
        createdTableIds.push(tableId);

        // Ensure occupancy record exists with AVAILABLE status and version 1
        await getDb().execute(
          `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, version, created_by)
           VALUES (?, ?, ?, 1, 1, ?)
           ON DUPLICATE KEY UPDATE status_id = 1, version = 1`,
          [companyId, outletId, tableId, userId]
        );

        const heldUntil = new Date(Date.now() + 3600000).toISOString();

        // Send request with X-Expected-Version header instead of body
        const { response, payload } = await requestJson(`/api/dinein/tables/${tableId}/hold?outletId=${outletId}`, {
          method: "POST",
          headers: {
            ...authHeaders,
            "X-Expected-Version": "1"
          },
          body: JSON.stringify({
            heldUntil
            // Note: no expectedVersion in body
          })
        });

        assert.strictEqual(response.status, 200, "Should succeed with header version");
        assert.strictEqual(payload.data.occupancy.statusId, 3, "Should be RESERVED status");
        assert.strictEqual(payload.data.occupancy.version, 2, "Version should be incremented");
      });

      // ============================================
      // Test E: Missing expectedVersion returns 400
      // ============================================
      await test("POST /hold without expectedVersion returns 400 MISSING_VERSION", async () => {
        // FIXTURE SETUP: Creating test table via direct SQL because POST /tables
        // endpoint is not implemented in this story (Story 12.4). Per policy exception.
        const [tableResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO outlet_tables (company_id, outlet_id, code, name, capacity, status)
           VALUES (?, ?, ?, ?, ?, 'AVAILABLE')`,
          [companyId, outletId, `T-${runId}-E`, `Test Table E ${runId}`, 4]
        );
        const tableId = Number(tableResult.insertId);
        createdTableIds.push(tableId);

        // Ensure occupancy record exists
        await getDb().execute(
          `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, version, created_by)
           VALUES (?, ?, ?, 1, 1, ?)
           ON DUPLICATE KEY UPDATE status_id = 1, version = 1`,
          [companyId, outletId, tableId, userId]
        );

        const heldUntil = new Date(Date.now() + 3600000).toISOString();

        // Send request without expectedVersion in body or header
        const { response, payload } = await requestJson(`/api/dinein/tables/${tableId}/hold?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            heldUntil
            // Note: no expectedVersion
          })
        });

        assert.strictEqual(response.status, 400, "Should return 400 for missing expectedVersion");
        assert.strictEqual(payload.error?.code, "MISSING_VERSION", "Error code should be MISSING_VERSION");
      });

      // ============================================
      // Test F: Release with X-Expected-Version header only (no body)
      // ============================================
      await test("POST /release with X-Expected-Version header and empty body succeeds", async () => {
        // FIXTURE SETUP: Create test table with OCCUPIED status and active session
        const [tableResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO outlet_tables (company_id, outlet_id, code, name, capacity, status)
           VALUES (?, ?, ?, ?, ?, 'AVAILABLE')`,
          [companyId, outletId, `T-${runId}-REL`, `Test Table REL ${runId}`, 4]
        );
        const tableId = Number(tableResult.insertId);
        createdTableIds.push(tableId);

        // Create service session
        const [sessionResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO table_service_sessions (company_id, outlet_id, table_id, status_id, started_at, guest_count, created_at, updated_at, created_by)
            VALUES (?, ?, ?, 1, NOW(), 2, NOW(), NOW(), 'test')`,
          [companyId, outletId, tableId]
        );
        const sessionId = Number(sessionResult.insertId);
        createdSessionIds.push(sessionId);

        // Set occupancy to OCCUPIED with version 1
        await getDb().execute(
          `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, version, service_session_id, guest_count, created_by)
           VALUES (?, ?, ?, 2, 1, ?, 2, ?)
           ON DUPLICATE KEY UPDATE status_id = 2, version = 1, service_session_id = VALUES(service_session_id), guest_count = 2`,
          [companyId, outletId, tableId, sessionId, userId]
        );

        // Send release request with only X-Expected-Version header (no body)
        const { response, payload } = await requestJson(`/api/dinein/tables/${tableId}/release?outletId=${outletId}`, {
          method: "POST",
          headers: {
            ...authHeaders,
            "X-Expected-Version": "1"
          },
          body: "" // Empty body
        });

        assert.strictEqual(response.status, 200, "Should succeed with header version and empty body");
        assert.strictEqual(payload.data.occupancy.statusId, 1, "Should be AVAILABLE status after release");
        assert.strictEqual(payload.data.occupancy.version, 2, "Version should be incremented");
      });

      // ============================================
      // Story 12.3 HIGH Priority Regression Tests
      // ============================================

      // Test 1: Occupied table seat → 409 with currentState
      await test("POST /seat on occupied table returns 409 NOT_AVAILABLE with currentState", async () => {
        // FIXTURE SETUP: Creating test table via direct SQL because POST /tables
        // endpoint is not implemented in this story (Story 12.4). Per policy exception.
        const [tableResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO outlet_tables (company_id, outlet_id, code, name, capacity, status)
           VALUES (?, ?, ?, ?, ?, 'AVAILABLE')`,
          [companyId, outletId, `T-${runId}-OCC`, `Test Table OCC ${runId}`, 4]
        );
        const tableId = Number(tableResult.insertId);
        createdTableIds.push(tableId);

        // FIXTURE SETUP: Creating service session via direct SQL because session
        // creation endpoint is Story 12.5. Required for OCCUPIED state testing.
        const [sessionResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO table_service_sessions (company_id, outlet_id, table_id, status_id, started_at, guest_count, created_at, updated_at, created_by)
            VALUES (?, ?, ?, 1, NOW(), 2, NOW(), NOW(), 'test')`,
          [companyId, outletId, tableId]
        );
        const sessionId = Number(sessionResult.insertId);
        createdSessionIds.push(sessionId);

        // Set occupancy to OCCUPIED (status_id = 2) with version 1
        await getDb().execute(
          `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, version, service_session_id, guest_count, created_by)
           VALUES (?, ?, ?, 2, 1, ?, 2, ?)
           ON DUPLICATE KEY UPDATE status_id = 2, version = 1, service_session_id = VALUES(service_session_id), guest_count = 2`,
          [companyId, outletId, tableId, sessionId, userId]
        );

        // Attempt to seat guests at occupied table
        const { response, payload } = await requestJson(`/api/dinein/tables/${tableId}/seat?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            guestCount: 2,
            expectedVersion: 1
          })
        });

        // Verify 409 response with NOT_AVAILABLE error
        assert.strictEqual(response.status, 409, "Should return 409 for occupied table");
        assert.strictEqual(payload.error, "NOT_AVAILABLE", "Error should be NOT_AVAILABLE");
        assert.ok(payload.currentState, "Response should include currentState");
        assert.strictEqual(payload.currentState.statusId, 2, "currentState should show OCCUPIED status (2)");
        assert.strictEqual(payload.currentState.version, 1, "currentState should show version 1");
      });

      // Test 2: Invalid tableId → 400
      await test("POST /seat with non-numeric tableId returns 400 INVALID_REQUEST", async () => {
        const invalidTableId = "not-a-number";

        const { response, payload } = await requestJson(`/api/dinein/tables/${invalidTableId}/seat?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            guestCount: 2
          })
        });

        assert.strictEqual(response.status, 400, "Should return 400 for non-numeric tableId");
        assert.strictEqual(payload.error?.code, "INVALID_REQUEST", "Error code should be INVALID_REQUEST");
      });

      // Test 3: Invalid outletId → 400
      await test("POST /seat with non-numeric outletId returns 400 INVALID_REQUEST", async () => {
        // FIXTURE SETUP: Creating test table via direct SQL because POST /tables
        // endpoint is not implemented in this story (Story 12.4). Per policy exception.
        const [tableResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO outlet_tables (company_id, outlet_id, code, name, capacity, status)
           VALUES (?, ?, ?, ?, ?, 'AVAILABLE')`,
          [companyId, outletId, `T-${runId}-OID`, `Test Table OID ${runId}`, 4]
        );
        const tableId = Number(tableResult.insertId);
        createdTableIds.push(tableId);

        const invalidOutletId = "not-a-number";

        const { response, payload } = await requestJson(`/api/dinein/tables/${tableId}/seat?outletId=${invalidOutletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            guestCount: 2
          })
        });

        assert.strictEqual(response.status, 400, "Should return 400 for non-numeric outletId");
        assert.ok(
          payload.error?.code === "INVALID_REQUEST" || payload.error?.code === "MISSING_OUTLET_ID",
          `Error code should be INVALID_REQUEST or MISSING_OUTLET_ID, got ${payload.error?.code}`
        );
      });

      // Test 4: Board query works
      await test("GET /board returns tables array", async () => {
        // FIXTURE SETUP: Creating test table via direct SQL because POST /tables
        // endpoint is not implemented in this story (Story 12.4). Per policy exception.
        const [tableResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO outlet_tables (company_id, outlet_id, code, name, capacity, status)
           VALUES (?, ?, ?, ?, ?, 'AVAILABLE')`,
          [companyId, outletId, `T-${runId}-BRD`, `Test Table BRD ${runId}`, 4]
        );
        const tableId = Number(tableResult.insertId);
        createdTableIds.push(tableId);

        // Set occupancy to AVAILABLE
        await getDb().execute(
          `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, version, created_by)
           VALUES (?, ?, ?, 1, 1, ?)
           ON DUPLICATE KEY UPDATE status_id = 1, version = 1`,
          [companyId, outletId, tableId, userId]
        );

        const { response, payload } = await requestJson(`/api/dinein/tables/board?outletId=${outletId}`, {
          method: "GET",
          headers: authHeaders
        });

        assert.strictEqual(response.status, 200, "Should return 200 for board query");
        assert.ok(Array.isArray(payload.data?.tables), "Response should include tables array");
        assert.ok(payload.data.tables.length > 0, "Tables array should not be empty");

        // Verify the created table is in the response
        const foundTable = payload.data.tables.find((t: { tableId: string }) => t.tableId === tableId.toString());
        assert.ok(foundTable, "Created table should be in the board response");
      });

    } finally {
      // CLEANUP: Direct SQL deletion is used because:
      // 1. No DELETE /tables or DELETE /sessions APIs exist (same exception as setup)
      // 2. Must respect foreign key constraints (sessions → occupancy → tables)
      // 3. Per-run identifiers ensure isolation even if cleanup fails
      // 4. All deletes are scoped by company_id for tenant safety
      // See integration test policy: docs/project-context.md

      // Cleanup: Remove created sessions first (due to foreign key constraints)
      for (const sessionId of createdSessionIds) {
        try {
          await getDb().execute(
            `DELETE FROM table_service_sessions WHERE id = ? AND company_id = ?`,
            [sessionId, companyId]
          );
        } catch {
          // Ignore cleanup errors - test isolation via per-run identifiers
        }
      }

      // Cleanup: Remove created tables and their occupancy records
      for (const tableId of createdTableIds) {
        try {
          // Delete occupancy first (child table)
          await getDb().execute(
            `DELETE FROM table_occupancy WHERE table_id = ? AND company_id = ?`,
            [tableId, companyId]
          );
          // Delete table (parent table)
          await getDb().execute(
            `DELETE FROM outlet_tables WHERE id = ? AND company_id = ?`,
            [tableId, companyId]
          );
        } catch {
          // Ignore cleanup errors - test isolation via per-run identifiers
        }
      }
    }
  }
);

// Close database pool after all tests
test.after(async () => {
  await closeDbPool();
});
