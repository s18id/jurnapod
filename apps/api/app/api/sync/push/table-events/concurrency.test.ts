// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Story 12.6 Scope J: Concurrency Race Tests for Table Sync Operations
 *
 * These tests verify AC4 - Dual-cashier race behavior:
 * - First cashier wins when both push with same expected version
 * - Second cashier receives CONFLICT and can retry
 * - Batch event races are handled atomically
 * - Idempotency survives concurrent duplicate submissions
 * - Transaction safety under high concurrency
 * - Read-write race consistency
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
} from "../../../../../tests/integration/integration-harness.mjs";
import { closeDbPool } from "../../../../../src/lib/db";
import { TableEventType } from "@jurnapod/shared";

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

/**
 * Helper: Create a test table with initial occupancy state via API
 */
async function createTestTable(
  companyId: number,
  outletId: number,
  userId: number,
  runId: string,
  suffix: string,
  initialStatus: number = 1, // AVAILABLE
  authHeaders?: Record<string, string>
): Promise<number> {
  // Use API if authHeaders provided, otherwise fall back to SQL (for backward compatibility)
  if (authHeaders) {
    const tableCode = `T-${runId}-${suffix}`;
    const createResponse = await requestJson(`/api/outlets/${outletId}/tables`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        code: tableCode,
        name: `Test Table ${suffix} ${runId}`,
        capacity: 4,
        outlet_id: outletId,
      }),
    });

    if (createResponse.response.status !== 201) {
      throw new Error(`Table creation failed: ${JSON.stringify(createResponse.payload)}`);
    }
    const tableId = Number(createResponse.payload.data.id);

    // Ensure occupancy record exists with initial state
    await getDb().execute(
      `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, version, created_by)
       VALUES (?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE status_id = ?, version = 1`,
      [companyId, outletId, tableId, initialStatus, userId, initialStatus]
    );

    return tableId;
  } else {
    // Fallback to SQL for backward compatibility (should not be used)
    const [tableResult] = await getDb().execute<ResultSetHeader>(
      `INSERT INTO outlet_tables (company_id, outlet_id, code, name, capacity, status)
       VALUES (?, ?, ?, ?, ?, 'AVAILABLE')`,
      [companyId, outletId, `T-${runId}-${suffix}`, `Test Table ${suffix} ${runId}`, 4]
    );
    const tableId = Number(tableResult.insertId);

    // Ensure occupancy record exists with initial state
    await getDb().execute(
      `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, version, created_by)
       VALUES (?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE status_id = ?, version = 1`,
      [companyId, outletId, tableId, initialStatus, userId, initialStatus]
    );

    return tableId;
  }
}

/**
 * Helper: Create a service session for a table
 */
async function createServiceSession(
  companyId: number,
  outletId: number,
  tableId: number
): Promise<number> {
  const [sessionResult] = await getDb().execute<ResultSetHeader>(
    `INSERT INTO table_service_sessions (company_id, outlet_id, table_id, status_id, started_at, guest_count, created_at, updated_at, created_by)
     VALUES (?, ?, ?, 1, NOW(), 2, NOW(), NOW(), 'test')`,
    [companyId, outletId, tableId]
  );
  return Number(sessionResult.insertId);
}

/**
 * Helper: Get current table occupancy state
 */
async function getTableOccupancy(
  companyId: number,
  outletId: number,
  tableId: number
): Promise<{ status_id: number; version: number; service_session_id: number | null } | null> {
  const [rows] = await getDb().execute<RowDataPacket[]>(
    `SELECT status_id, version, service_session_id
     FROM table_occupancy
     WHERE company_id = ? AND outlet_id = ? AND table_id = ?`,
    [companyId, outletId, tableId]
  );
  return rows.length > 0 ? rows[0] as { status_id: number; version: number; service_session_id: number | null } : null;
}

/**
 * Helper: Count events for a table
 */
async function countTableEvents(
  companyId: number,
  outletId: number,
  tableId: number
): Promise<number> {
  const [rows] = await getDb().execute<RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM table_events
     WHERE company_id = ? AND outlet_id = ? AND table_id = ?`,
    [companyId, outletId, tableId]
  );
  return Number(rows[0].count);
}

/**
 * Helper: Count events by client_tx_id
 */
async function countEventsByClientTxId(
  companyId: number,
  outletId: number,
  clientTxId: string
): Promise<number> {
  const [rows] = await getDb().execute<RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM table_events
     WHERE company_id = ? AND outlet_id = ? AND client_tx_id = ?`,
    [companyId, outletId, clientTxId]
  );
  return Number(rows[0].count);
}

test(
  "Concurrent Push - Table Events Race Tests",
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

      // Use numeric outlet_id directly
      // The route's parseOutletIdFromBody handles both number and string
      const outletUuid = outletId;

      // ============================================================================
      // Test Group 1: Dual-Cashier Race - First Wins (AC4)
      // ============================================================================

      await test("first cashier wins when both push with same expected version", async () => {
        // Setup: Create table at version 1, status AVAILABLE
        const tableId = await createTestTable(companyId, outletId, userId, runId, "RACE1", 1, authHeaders);
        createdTableIds.push(tableId);

        const clientTxIdA = `race-a-${runId}`;
        const clientTxIdB = `race-b-${runId}`;

        // Both cashiers read table (version 1) and send SEAT event with expected_version=1
        const eventA = {
          client_tx_id: clientTxIdA,
          table_id: tableId.toString(),
          expected_table_version: 1,
          event_type: TableEventType.TABLE_OPENED,
          payload: { guest_count: 2, guest_name: "Cashier A" },
          recorded_at: new Date().toISOString()
        };

        const eventB = {
          client_tx_id: clientTxIdB,
          table_id: tableId.toString(),
          expected_table_version: 1,
          event_type: TableEventType.TABLE_OPENED,
          payload: { guest_count: 2, guest_name: "Cashier B" },
          recorded_at: new Date().toISOString()
        };

        // Fire both requests in parallel
        const requestA = requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: [eventA]
          })
        });

        const requestB = requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: [eventB]
          })
        });

        const [resultA, resultB] = await Promise.all([requestA, requestB]);

        // Verify one succeeded (200 OK), one conflicted (409 CONFLICT)
        const statusA = resultA.response.status === 200
          ? resultA.payload.data?.results?.[0]?.status
          : resultA.payload.details?.[0]?.status;
        const statusB = resultB.response.status === 200
          ? resultB.payload.data?.results?.[0]?.status
          : resultB.payload.details?.[0]?.status;

        const statuses = [statusA, statusB];
        assert.ok(statuses.includes("OK"), "One request should return OK");
        assert.ok(
          statuses.some((s) => s === "CONFLICT" || s === "ERROR" || s === "DUPLICATE"),
          "Competing request should be non-OK"
        );

        // Verify final state
        const occupancy = await getTableOccupancy(companyId, outletId, tableId);
        assert.ok(occupancy, "Occupancy record should exist");
        assert.strictEqual(occupancy.version, 2, "Table version should be incremented exactly once to 2");
        assert.strictEqual(occupancy.status_id, 2, "Table should be OCCUPIED (status 2)");
        assert.ok(occupancy.service_session_id, "Service session should exist");

        // Verify at least one event was recorded
        const eventCount = await countTableEvents(companyId, outletId, tableId);
        assert.ok(eventCount >= 1, "At least one event should be recorded");
      });

      await test("second cashier can retry after receiving conflict", async () => {
        // Setup: Create table at version 1, status AVAILABLE
        const tableId = await createTestTable(companyId, outletId, userId, runId, "RACE2", 1, authHeaders);
        createdTableIds.push(tableId);

        const clientTxIdA = `retry-a-${runId}`;
        const clientTxIdB = `retry-b-${runId}`;

        // First cashier seats the table
        const eventA = {
          client_tx_id: clientTxIdA,
          table_id: tableId.toString(),
          expected_table_version: 1,
          event_type: TableEventType.TABLE_OPENED,
          payload: { guest_count: 2, guest_name: "Cashier A" },
          recorded_at: new Date().toISOString()
        };

        const resultA = await requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: [eventA]
          })
        });

        assert.strictEqual(resultA.response.status, 200, "First request should succeed");
        assert.strictEqual(resultA.payload.data?.results?.[0]?.status, "OK", "First request should return OK");

        // Second cashier tries with expected_version=1 (old version)
        const eventB = {
          client_tx_id: clientTxIdB,
          table_id: tableId.toString(),
          expected_table_version: 1,
          event_type: TableEventType.TABLE_OPENED,
          payload: { guest_count: 2, guest_name: "Cashier B" },
          recorded_at: new Date().toISOString()
        };

        const resultB = await requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: [eventB]
          })
        });

        // Should receive CONFLICT with current_version=2 (409 status code)
        assert.strictEqual(resultB.response.status, 409, "Request should return 409");
        assert.ok(resultB.payload.error, "Should have error in payload");
        assert.strictEqual(resultB.payload.error.code, "CONFLICT", "Error code should be CONFLICT");
        assert.ok(resultB.payload.details, "Should have details in payload");
        assert.strictEqual(resultB.payload.details[0].status, "CONFLICT", "Should return CONFLICT");
        assert.strictEqual(resultB.payload.details[0].table_version, 2, "Should return current version 2");
        assert.ok(resultB.payload.details[0].conflict_payload, "Should include conflict payload");
        assert.strictEqual(
          resultB.payload.details[0].conflict_payload.current_version,
          2,
          "Conflict payload should show version 2"
        );

        // Second cashier retries with correct version (but table is now occupied)
        const clientTxIdBRetry = `retry-b-retry-${runId}`;
        const eventBRetry = {
          client_tx_id: clientTxIdBRetry,
          table_id: tableId.toString(),
          expected_table_version: 2,
          event_type: TableEventType.TABLE_OPENED,
          payload: { guest_count: 2, guest_name: "Cashier B Retry" },
          recorded_at: new Date().toISOString()
        };

        const resultBRetry = await requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: [eventBRetry]
          })
        });

        // Should receive ERROR because table is already occupied
        assert.strictEqual(resultBRetry.response.status, 200, "Retry request should return 200");
        assert.strictEqual(resultBRetry.payload.data?.results?.[0]?.status, "ERROR", "Should return ERROR for already-occupied table");
      });

      // ============================================================================
      // Test Group 2: Multi-Event Batch Race
      // ============================================================================

      await test("concurrent batches should be processed atomically per event", async () => {
        // Setup: Create two tables at version 1
        const tableId1 = await createTestTable(companyId, outletId, userId, runId, "BATCH1A", 1, authHeaders);
        const tableId2 = await createTestTable(companyId, outletId, userId, runId, "BATCH1B", 1, authHeaders);
        createdTableIds.push(tableId1, tableId2);

        // Cashier A pushes batch: [Table1-SEAT, Table2-HOLD]
        const batchA = [
          {
            client_tx_id: `batch-a-1-${runId}`,
            table_id: tableId1.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2 },
            recorded_at: new Date().toISOString()
          },
          {
            client_tx_id: `batch-a-2-${runId}`,
            table_id: tableId2.toString(),
            expected_table_version: 1,
            event_type: TableEventType.RESERVATION_CREATED,
            payload: { reserved_until: new Date(Date.now() + 3600000).toISOString() },
            recorded_at: new Date().toISOString()
          }
        ];

        // Cashier B pushes batch: [Table1-RELEASE, Table2-SEAT]
        const batchB = [
          {
            client_tx_id: `batch-b-1-${runId}`,
            table_id: tableId1.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_CLOSED,
            payload: {},
            recorded_at: new Date().toISOString()
          },
          {
            client_tx_id: `batch-b-2-${runId}`,
            table_id: tableId2.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 4 },
            recorded_at: new Date().toISOString()
          }
        ];

        // Fire both batches simultaneously
        const requestA = requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: batchA
          })
        });

        const requestB = requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: batchB
          })
        });

        const [resultA, resultB] = await Promise.all([requestA, requestB]);

        assert.ok([200, 409].includes(resultA.response.status), "Batch A should return 200 or 409");
        assert.ok([200, 409].includes(resultB.response.status), "Batch B should return 200 or 409");

        const batchAResults = resultA.response.status === 200
          ? resultA.payload.data?.results
          : resultA.payload.details;
        const batchBResults = resultB.response.status === 200
          ? resultB.payload.data?.results
          : resultB.payload.details;

        assert.ok(Array.isArray(batchAResults) && batchAResults.length > 0, "Batch A should include results");
        assert.ok(Array.isArray(batchBResults) && batchBResults.length > 0, "Batch B should include results");

        // Verify final states are consistent (not mixed)
        const occupancy1 = await getTableOccupancy(companyId, outletId, tableId1);
        const occupancy2 = await getTableOccupancy(companyId, outletId, tableId2);

        assert.ok(occupancy1, "Table 1 occupancy should exist");
        assert.ok(occupancy2, "Table 2 occupancy should exist");

        // Both tables should be in valid states (not partially updated)
        // Table 1: Either OCCUPIED (if batch A won) or AVAILABLE (if batch B won but couldn't release)
        // Actually if batch B won, it would try to close an available table which is an error
        // So table 1 should be OCCUPIED if batch A won, or stay AVAILABLE if batch B won first event failed
        assert.ok(
          occupancy1.status_id === 1 || occupancy1.status_id === 2,
          `Table 1 should be in valid state (AVAILABLE=1 or OCCUPIED=2), got ${occupancy1.status_id}`
        );

        // Table 2: Either RESERVED (if batch A won) or OCCUPIED (if batch B won)
        assert.ok(
          occupancy2.status_id === 2 || occupancy2.status_id === 3,
          `Table 2 should be in valid state (OCCUPIED=2 or RESERVED=3), got ${occupancy2.status_id}`
        );

        // Version should be incremented appropriately
        assert.strictEqual(occupancy1.version, 2, "Table 1 version should be 2");
        assert.strictEqual(occupancy2.version, 2, "Table 2 version should be 2");
      });

      await test("idempotency survives concurrent duplicate submissions", async () => {
        // Setup: Create table at version 1
        const tableId = await createTestTable(companyId, outletId, userId, runId, "IDEM", 1, authHeaders);
        createdTableIds.push(tableId);

        const clientTxId = `idempotent-${runId}`;

        // Same event with same client_tx_id submitted 5 times simultaneously
        const event = {
          client_tx_id: clientTxId,
          table_id: tableId.toString(),
          expected_table_version: 1,
          event_type: TableEventType.TABLE_OPENED,
          payload: { guest_count: 2 },
          recorded_at: new Date().toISOString()
        };

        // Fire 5 identical requests simultaneously
        const requests = Array(5).fill(null).map(() =>
          requestJson("/api/sync/push/table-events", {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              outlet_id: outletUuid,
              events: [event]
            })
          })
        );

        const results = await Promise.all(requests);

        // All requests should return 200 (duplicates still return 200, only conflicts return 409)
        results.forEach((result, index) => {
          assert.strictEqual(result.response.status, 200, `Request ${index} should return 200`);
        });

        // Count OK and DUPLICATE responses
        const statuses = results.map(r => r.payload.data?.results?.[0]?.status);
        const okCount = statuses.filter(s => s === "OK").length;
        const duplicateCount = statuses.filter(s => s === "DUPLICATE").length;

        // One should return OK, rest should return DUPLICATE
        assert.strictEqual(okCount, 1, "Exactly one request should return OK");
        assert.strictEqual(duplicateCount, 4, "Four requests should return DUPLICATE");

        // Verify database has exactly 1 event record
        const eventCount = await countEventsByClientTxId(companyId, outletId, clientTxId);
        assert.strictEqual(eventCount, 1, "Database should have exactly 1 event record");

        // Verify table mutated exactly once
        const occupancy = await getTableOccupancy(companyId, outletId, tableId);
        assert.strictEqual(occupancy?.version, 2, "Table version should be 2 (incremented once)");
        assert.strictEqual(occupancy?.status_id, 2, "Table should be OCCUPIED");
      });

      // ============================================================================
      // Test Group 3: Transaction Safety
      // ============================================================================

      await test("no partial commits on concurrent modification", async () => {
        // Setup: Create table with OCCUPIED state and active session
        const tableId = await createTestTable(companyId, outletId, userId, runId, "TRANS", 1, authHeaders);
        createdTableIds.push(tableId);

        const sessionId = await createServiceSession(companyId, outletId, tableId);
        createdSessionIds.push(sessionId);

        // Set occupancy to OCCUPIED with session
        await getDb().execute(
          `UPDATE table_occupancy
           SET status_id = 2, service_session_id = ?, version = 1, guest_count = 2
           WHERE company_id = ? AND outlet_id = ? AND table_id = ?`,
          [sessionId, companyId, outletId, tableId]
        );

        const clientTxIdA = `trans-a-${runId}`;
        const clientTxIdB = `trans-b-${runId}`;

        // Cashier A tries to close table
        const eventA = {
          client_tx_id: clientTxIdA,
          table_id: tableId.toString(),
          expected_table_version: 1,
          event_type: TableEventType.TABLE_CLOSED,
          payload: {},
          recorded_at: new Date().toISOString()
        };

        // Cashier B tries to change guest count
        const eventB = {
          client_tx_id: clientTxIdB,
          table_id: tableId.toString(),
          expected_table_version: 1,
          event_type: TableEventType.GUEST_COUNT_CHANGED,
          payload: { guest_count: 4 },
          recorded_at: new Date().toISOString()
        };

        // Fire both requests simultaneously
        const requestA = requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: [eventA]
          })
        });

        const requestB = requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: [eventB]
          })
        });

        const [resultA, resultB] = await Promise.all([requestA, requestB]);

        // Extract status from appropriate payload location based on response code
        const statusA = resultA.response.status === 200
          ? resultA.payload.data?.results?.[0]?.status
          : resultA.payload.details?.[0]?.status;
        const statusB = resultB.response.status === 200
          ? resultB.payload.data?.results?.[0]?.status
          : resultB.payload.details?.[0]?.status;

        // One should return 200 OK, one should return 409 CONFLICT
        const responseCodes = [resultA.response.status, resultB.response.status];
        assert.ok(responseCodes.includes(200), "One request should return 200");
        assert.ok(responseCodes.includes(409), "One request should return 409");

        // One should succeed, one should conflict
        const statuses = [statusA, statusB];
        assert.ok(statuses.includes("OK"), "One request should return OK");
        assert.ok(statuses.includes("CONFLICT"), "One request should return CONFLICT");

        // Verify no partial commits - check session status
        const [sessionRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT status_id FROM table_service_sessions
           WHERE id = ? AND company_id = ? AND outlet_id = ?`,
          [sessionId, companyId, outletId]
        );

        assert.strictEqual(sessionRows.length, 1, "Session should exist");
        // Session should be either ACTIVE (1) or CLOSED (3), not in some intermediate state
        assert.ok(
          sessionRows[0].status_id === 1 || sessionRows[0].status_id === 3,
          `Session should be ACTIVE(1) or CLOSED(3), got ${sessionRows[0].status_id}`
        );

        // Verify occupancy is in consistent state
        const occupancy = await getTableOccupancy(companyId, outletId, tableId);
        assert.ok(occupancy, "Occupancy should exist");
        assert.strictEqual(occupancy.version, 2, "Version should be exactly 2");
      });

      await test("database integrity under high concurrency", async () => {
        // Setup: Create table at version 1
        const tableId = await createTestTable(companyId, outletId, userId, runId, "HIGH", 1, authHeaders);
        createdTableIds.push(tableId);

        // Create 10 parallel requests to same table with same expected_version
        const requests = Array(10).fill(null).map((_, index) => {
          const event = {
            client_tx_id: `high-${index}-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2, index },
            recorded_at: new Date().toISOString()
          };

          return requestJson("/api/sync/push/table-events", {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              outlet_id: outletUuid,
              events: [event]
            })
          });
        });

        const results = await Promise.all(requests);

        // Count per-item statuses from response payloads
        let okCount = 0;
        let nonOkCount = 0;

        results.forEach((result, index) => {
          if (result.response.status === 200) {
            const status = result.payload.data?.results?.[0]?.status;
            if (status === "OK") {
              okCount++;
            } else {
              nonOkCount++;
            }
          } else if (result.response.status === 409) {
            assert.ok(result.payload.error, `Request ${index} with 409 should have error`);
            assert.strictEqual(result.payload.error.code, "CONFLICT");
            const status = result.payload.details?.[0]?.status;
            assert.strictEqual(status, "CONFLICT", `Request ${index} with 409 should have CONFLICT status`);
            nonOkCount++;
          } else {
            assert.fail(`Request ${index} returned unexpected status ${result.response.status}`);
          }
        });

        assert.strictEqual(okCount, 1, "Exactly one request should mutate table state");
        assert.strictEqual(nonOkCount, 9, "All other requests should be non-OK");

        // Verify final state
        const occupancy = await getTableOccupancy(companyId, outletId, tableId);
        assert.ok(occupancy, "Occupancy should exist");
        assert.strictEqual(occupancy.version, 2, "Table version should be exactly 2 (initial + 1)");
        assert.strictEqual(occupancy.status_id, 2, "Table should be OCCUPIED");

        // Verify at least one event was recorded
        const eventCount = await countTableEvents(companyId, outletId, tableId);
        assert.ok(eventCount >= 1, "At least one event should be recorded");

        // Verify no constraint violations by checking all events have unique client_tx_id
        const [allEvents] = await getDb().execute<RowDataPacket[]>(
          `SELECT client_tx_id FROM table_events
           WHERE company_id = ? AND outlet_id = ? AND table_id = ?`,
          [companyId, outletId, tableId]
        );
        const uniqueClientTxIds = new Set(allEvents.map(e => e.client_tx_id));
        assert.strictEqual(uniqueClientTxIds.size, allEvents.length, "All events should have unique client_tx_id");
      });

      // ============================================================================
      // Test Group 4: Read-Write Race
      // ============================================================================

      await test("pull should see consistent snapshot during concurrent push", async () => {
        // Setup: Create table at version 1
        const tableId = await createTestTable(companyId, outletId, userId, runId, "PULL", 1, authHeaders);
        createdTableIds.push(tableId);

        // Start a pull request
        const pullPromise = requestJson(`/api/sync/pull/table-state?outlet_id=${outletUuid}&limit=100`, {
          method: "GET",
          headers: authHeaders
        });

        // While pull is being processed, push a change
        const pushEvent = {
          client_tx_id: `pull-push-${runId}`,
          table_id: tableId.toString(),
          expected_table_version: 1,
          event_type: TableEventType.TABLE_OPENED,
          payload: { guest_count: 2 },
          recorded_at: new Date().toISOString()
        };

        const pushPromise = requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: [pushEvent]
          })
        });

        const [pullResult, pushResult] = await Promise.all([pullPromise, pushPromise]);

        // Both should succeed
        assert.strictEqual(pullResult.response.status, 200, "Pull should return 200");
        assert.strictEqual(pushResult.response.status, 200, "Push should return 200");

        // Verify push succeeded
        assert.strictEqual(pushResult.payload.data?.results?.[0]?.status, "OK", "Push should return OK");

        // Pull should return consistent data
        assert.ok(Array.isArray(pullResult.payload.data?.tables), "Pull should return tables array");
        assert.ok(Array.isArray(pullResult.payload.data?.events), "Pull should return events array");

        // Find our table in the pull results
        const tableSnapshot = pullResult.payload.data?.tables?.find(
          (t: { table_id: number }) => t.table_id === tableId
        );

        if (tableSnapshot) {
          // Table snapshot should have valid version
          assert.ok(
            tableSnapshot.version === 1 || tableSnapshot.version === 2,
            `Table version in pull should be either 1 (pre-push) or 2 (post-push), got ${tableSnapshot.version}`
          );

          // Status should be consistent with version
          if (tableSnapshot.version === 1) {
            assert.strictEqual(tableSnapshot.status, 1, "Version 1 should have AVAILABLE status");
          } else {
            assert.strictEqual(tableSnapshot.status, 2, "Version 2 should have OCCUPIED status");
          }
        }
      });

      await test("cursor-based pull is stable under concurrent writes", async () => {
        // Setup: Create table and add some initial events
        const tableId = await createTestTable(companyId, outletId, userId, runId, "CURSOR", 1, authHeaders);
        createdTableIds.push(tableId);

        // First, create a few events by doing some operations
        const event1 = {
          client_tx_id: `cursor-1-${runId}`,
          table_id: tableId.toString(),
          expected_table_version: 1,
          event_type: TableEventType.TABLE_OPENED,
          payload: { guest_count: 2 },
          recorded_at: new Date().toISOString()
        };

        const result1 = await requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: [event1]
          })
        });

        assert.strictEqual(result1.payload.data?.results?.[0]?.status, "OK");

        // Pull page 1
        const page1Result = await requestJson(`/api/sync/pull/table-state?outlet_id=${outletUuid}&limit=10`, {
          method: "GET",
          headers: authHeaders
        });

        assert.strictEqual(page1Result.response.status, 200);
        const page1Events = page1Result.payload.data?.events || [];
        const nextCursor = page1Result.payload.data?.next_cursor;

        // While processing page 1, create new events
        const event2 = {
          client_tx_id: `cursor-2-${runId}`,
          table_id: tableId.toString(),
          expected_table_version: 2,
          event_type: TableEventType.GUEST_COUNT_CHANGED,
          payload: { guest_count: 4 },
          recorded_at: new Date().toISOString()
        };

        const concurrentPush = await requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: [event2]
          })
        });

        assert.strictEqual(concurrentPush.payload.data?.results?.[0]?.status, "OK");

        // Pull page 2 with next_cursor
        const page2Result = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletUuid}&cursor=${nextCursor}&limit=10`,
          {
            method: "GET",
            headers: authHeaders
          }
        );

        assert.strictEqual(page2Result.response.status, 200);
        const page2Events = page2Result.payload.data?.events || [];

        // Verify no duplicates between pages
        const page1Ids = new Set(page1Events.map((e: { id: string }) => e.id));
        const page2Ids = new Set(page2Events.map((e: { id: string }) => e.id));

        for (const id of page2Ids) {
          assert.ok(!page1Ids.has(id), `Event ${id} should not appear in both pages`);
        }

        // Total unique events should be consistent
        const allEventIds = new Set([...page1Ids, ...page2Ids]);
        assert.ok(allEventIds.size >= 1, "Should have at least 1 unique event");
      });

    } finally {
      // Cleanup: Remove created sessions first (due to foreign key constraints)
      for (const sessionId of createdSessionIds) {
        try {
          await getDb().execute(
            `DELETE FROM table_service_sessions WHERE id = ? AND company_id = ?`,
            [sessionId, companyId]
          );
        } catch {
          // Ignore cleanup errors
        }
      }

      // Cleanup: Remove created tables and their occupancy records
      for (const tableId of createdTableIds) {
        try {
          // Delete events first
          await getDb().execute(
            `DELETE FROM table_events WHERE table_id = ? AND company_id = ?`,
            [tableId, companyId]
          );
          // Delete occupancy
          await getDb().execute(
            `DELETE FROM table_occupancy WHERE table_id = ? AND company_id = ?`,
            [tableId, companyId]
          );
          // Delete table
          await getDb().execute(
            `DELETE FROM outlet_tables WHERE id = ? AND company_id = ?`,
            [tableId, companyId]
          );
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
);

// Close database pool after all tests
test.after(async () => {
  await closeDbPool();
});
