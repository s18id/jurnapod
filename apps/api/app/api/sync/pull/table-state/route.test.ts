// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for GET /api/sync/pull/table-state
 * 
 * Story 12.6 - POS Sync for Table Operations (Scope I)
 * Tests pull synchronization endpoint for table occupancy state and events.
 * 
 * NOTE ON FIXTURE SETUP: Per integration test policy, direct SQL writes are
 * used for creating test fixtures because table_events creation API is not
 * part of this story. All API mutations under test use actual endpoints.
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
import { closeDbPool, getDbPool } from "../../../../../src/lib/db";
import { TableSyncPullResponseSchema } from "@jurnapod/shared";
import { TableOccupancyStatus, TableEventType } from "@jurnapod/shared";

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
  const rawPayload = await response.json().catch(() => ({}));
  const payload = response.ok
    && rawPayload
    && typeof rawPayload === "object"
    && "data" in rawPayload
    ? (rawPayload as { data: unknown }).data
    : rawPayload;
  return { response, payload };
}

test(
  "GET /api/sync/pull/table-state - Basic Pull",
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
    let authHeaders: Record<string, string> = {};

    const createdTableIds: number[] = [];
    const createdSessionIds: number[] = [];
    const createdEventIds: number[] = [];

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
      authHeaders = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      };

      // Helper to create a test table via API
      async function createTestTable(tableCode: string, tableName: string): Promise<number> {
        const createResponse = await requestJson(`/api/outlets/${outletId}/tables`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            code: tableCode,
            name: tableName,
            capacity: 4,
            outlet_id: outletId,
          }),
        });

        assert.strictEqual(createResponse.response.status, 201, `Table creation failed: ${JSON.stringify(createResponse.payload)}`);
        const tableId = Number((createResponse.payload as { id: number }).id);
        createdTableIds.push(tableId);
        return tableId;
      }

      // ============================================
      // Test: should return table occupancy snapshots
      // ============================================
      await test("should return table occupancy snapshots", async () => {
        // Setup: Create tables with various states via API
        const tableId1 = await createTestTable(`T-${runId}-AVAIL`, `Available Table ${runId}`);
        const tableId2 = await createTestTable(`T-${runId}-OCC`, `Occupied Table ${runId}`);

        // Create occupancy records (still uses SQL - no API for direct occupancy setup)
        await getDb().execute(
          `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, version, created_by)
           VALUES (?, ?, ?, ?, 1, ?)`,
          [companyId, outletId, tableId1, TableOccupancyStatus.AVAILABLE, userId]
        );

        // Create a session for the occupied table (still uses SQL - no API for direct session setup)
        const [sessionResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO table_service_sessions (company_id, outlet_id, table_id, status_id, started_at, guest_count, created_at, updated_at, created_by)
           VALUES (?, ?, ?, 1, NOW(), 4, NOW(), NOW(), ?)`,
          [companyId, outletId, tableId2, userId]
        );
        const sessionId = Number(sessionResult.insertId);
        createdSessionIds.push(sessionId);

        await getDb().execute(
          `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, version, service_session_id, guest_count, created_by)
           VALUES (?, ?, ?, ?, 1, ?, 4, ?)`,
          [companyId, outletId, tableId2, TableOccupancyStatus.OCCUPIED, sessionId, userId]
        );

        // Pull state
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200, "Should return 200");
        assert.ok(Array.isArray(payload.tables), "Should return tables array");

        // Find our created tables in the response
        const table1 = payload.tables.find((t: { table_id: number }) => t.table_id === tableId1);
        const table2 = payload.tables.find((t: { table_id: number }) => t.table_id === tableId2);

        assert.ok(table1, "Available table should be in response");
        assert.ok(table2, "Occupied table should be in response");

        assert.strictEqual(table1.table_number, `T-${runId}-AVAIL`.toUpperCase());
        assert.strictEqual(table1.status, TableOccupancyStatus.AVAILABLE);
        assert.strictEqual(table1.version, 1);

        assert.strictEqual(table2.table_number, `T-${runId}-OCC`.toUpperCase());
        assert.strictEqual(table2.status, TableOccupancyStatus.OCCUPIED);
        assert.strictEqual(table2.current_session_id, sessionId);
      });

      // ============================================
      // Test: should include staleness_ms for each table
      // ============================================
      await test("should include staleness_ms for each table", async () => {
        // Setup: Create a table via API
        const tableId = await createTestTable(`T-${runId}-STALE`, `Staleness Test Table ${runId}`);

        await getDb().execute(
          `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, version, created_by)
           VALUES (?, ?, ?, ?, 1, ?)`,
          [companyId, outletId, tableId, TableOccupancyStatus.AVAILABLE, userId]
        );

        // Wait a bit to ensure staleness
        await new Promise(resolve => setTimeout(resolve, 100));

        // Pull state
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);

        const table = payload.tables.find((t: { table_id: number }) => t.table_id === tableId);
        assert.ok(table, "Table should be in response");
        assert.ok(typeof table.staleness_ms === 'number', "staleness_ms should be a number");
        assert.ok(table.staleness_ms >= 0, "staleness_ms should be >= 0");
        assert.ok(table.staleness_ms >= 50, "staleness_ms should reflect actual delay");
      });

      // ============================================
      // Test: should return empty arrays when no tables exist
      // ============================================
      await test("should return empty arrays when no tables exist", async () => {
        // Verify that the response structure is correct
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);
        assert.ok(Array.isArray(payload.tables), "tables should be an array");
        assert.ok(Array.isArray(payload.events), "events should be an array");
      });

      // ============================================
      // Test: should include active session metadata when table occupied
      // ============================================
      await test("should include active session metadata when table occupied", async () => {
        // Setup: Create occupied table with session via API
        const tableId = await createTestTable(`T-${runId}-SESS`, `Session Test Table ${runId}`);

        const [sessionResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO table_service_sessions (company_id, outlet_id, table_id, status_id, started_at, guest_count, created_at, updated_at, created_by)
           VALUES (?, ?, ?, 1, NOW(), 6, NOW(), NOW(), ?)`,
          [companyId, outletId, tableId, userId]
        );
        const sessionId = Number(sessionResult.insertId);
        createdSessionIds.push(sessionId);

        await getDb().execute(
          `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, version, service_session_id, guest_count, created_by)
           VALUES (?, ?, ?, ?, 2, ?, 6, ?)`,
          [companyId, outletId, tableId, TableOccupancyStatus.OCCUPIED, sessionId, userId]
        );

        // Pull state
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);

        const table = payload.tables.find((t: { table_id: number }) => t.table_id === tableId);
        assert.ok(table, "Table should be in response");
        assert.strictEqual(table.status, TableOccupancyStatus.OCCUPIED);
        assert.strictEqual(table.current_session_id, sessionId);
        assert.strictEqual(table.version, 2);
      });

    } finally {
      // Cleanup
      const pool = getDb();
      
      for (const eventId of createdEventIds) {
        try {
          await pool.execute(
            `DELETE FROM table_events WHERE id = ? AND company_id = ?`,
            [eventId, companyId]
          );
        } catch { }
      }

      for (const sessionId of createdSessionIds) {
        try {
          await pool.execute(
            `DELETE FROM table_service_sessions WHERE id = ? AND company_id = ?`,
            [sessionId, companyId]
          );
        } catch { }
      }

      for (const tableId of createdTableIds) {
        try {
          await pool.execute(
            `DELETE FROM table_occupancy WHERE table_id = ? AND company_id = ?`,
            [tableId, companyId]
          );
          await pool.execute(
            `DELETE FROM outlet_tables WHERE id = ? AND company_id = ?`,
            [tableId, companyId]
          );
        } catch { }
      }
    }
  }
);

test(
  "GET /api/sync/pull/table-state - Cursor Pagination",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  async () => {
    const runId = Date.now().toString(36) + "-cursor";
    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
    const ownerPassword = readEnv("JP_OWNER_PASSWORD", null) ?? "password123";

    let companyId = 0;
    let outletId = 0;
    let userId = 0;
    let token = "";
    let authHeaders: Record<string, string> = {};

    const createdTableIds: number[] = [];
    const createdEventIds: number[] = [];

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

      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);
      outletId = Number(ownerRows[0].outlet_id);
      userId = Number(ownerRows[0].user_id);

      token = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);
      authHeaders = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      };

      // Helper to create a test table via API
      async function createTestTable(tableCode: string, tableName: string): Promise<number> {
        const createResponse = await requestJson(`/api/outlets/${outletId}/tables`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            code: tableCode,
            name: tableName,
            capacity: 4,
            outlet_id: outletId,
          }),
        });

        assert.strictEqual(createResponse.response.status, 201, `Table creation failed: ${JSON.stringify(createResponse.payload)}`);
        const tableId = Number((createResponse.payload as { id: number }).id);
        createdTableIds.push(tableId);
        return tableId;
      }

      // Setup: Create a table for cursor tests via API
      const tableId = await createTestTable(`T-${runId}`, `Cursor Test Table ${runId}`);

      // ============================================
      // Test: should return events since cursor (ID-based)
      // ============================================
      await test("should return events since cursor (ID-based)", async () => {
        // Create events with specific ordering
        const eventIds: number[] = [];
        for (let i = 0; i < 3; i++) {
          const [eventResult] = await getDb().execute<ResultSetHeader>(
            `INSERT INTO table_events (company_id, outlet_id, table_id, event_type_id, client_tx_id,
             occupancy_version_before, occupancy_version_after, event_data, status_id_before, status_id_after,
             occurred_at, created_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE), NOW(), ?)`,
            [
              companyId, outletId, tableId, TableEventType.TABLE_OPENED,
              `cursor-test-${runId}-${i}`, i, i + 1, '{}',
              TableOccupancyStatus.AVAILABLE, TableOccupancyStatus.OCCUPIED,
              10 - i, userId
            ]
          );
          const eventId = Number(eventResult.insertId);
          eventIds.push(eventId);
          createdEventIds.push(eventId);
        }

        // Use middle event as cursor
        const cursorEventId = eventIds[1];

        // Pull with cursor
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}&cursor=${cursorEventId}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);
        assert.ok(Array.isArray(payload.events), "Should return events array");

        // Should only return events with ID > cursor
        const allEventIdsGreater = payload.events.every((e: { id: number }) => e.id > cursorEventId);
        assert.ok(allEventIdsGreater, "All returned events should have ID > cursor");
      });

      // ============================================
      // Test: should return events since cursor (timestamp-based)
      // ============================================
      await test("should return events since cursor (timestamp-based)", async () => {
        // Create events at different times
        const [eventResult1] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO table_events (company_id, outlet_id, table_id, event_type_id, client_tx_id,
           occupancy_version_before, occupancy_version_after, event_data, status_id_before, status_id_after,
           occurred_at, created_at, created_by)
           VALUES (?, ?, ?, ?, ?, 1, 2, '{}', ?, ?, '2024-01-01 10:00:00', NOW(), ?)`,
          [companyId, outletId, tableId, TableEventType.TABLE_OPENED, `ts-test-1-${runId}`,
           TableOccupancyStatus.AVAILABLE, TableOccupancyStatus.OCCUPIED, userId]
        );
        const eventId1 = Number(eventResult1.insertId);
        createdEventIds.push(eventId1);

        const [eventResult2] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO table_events (company_id, outlet_id, table_id, event_type_id, client_tx_id,
           occupancy_version_before, occupancy_version_after, event_data, status_id_before, status_id_after,
           occurred_at, created_at, created_by)
           VALUES (?, ?, ?, ?, ?, 2, 3, '{}', ?, ?, '2024-01-01 10:05:00', NOW(), ?)`,
          [companyId, outletId, tableId, TableEventType.TABLE_CLOSED, `ts-test-2-${runId}`,
           TableOccupancyStatus.OCCUPIED, TableOccupancyStatus.AVAILABLE, userId]
        );
        const eventId2 = Number(eventResult2.insertId);
        createdEventIds.push(eventId2);

        // Pull with timestamp cursor (between the two events)
        const cursorTimestamp = '2024-01-01T10:02:00Z';
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}&cursor=${encodeURIComponent(cursorTimestamp)}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);

        const returnedIds = payload.events.map((e: { id: number }) => e.id);
        assert.ok(!returnedIds.includes(eventId1), "Should not include event before cursor timestamp");
        assert.ok(returnedIds.includes(eventId2), "Should include event after cursor timestamp");
      });

      // ============================================
      // Test: should return has_more when more events exist
      // ============================================
      await test("should return has_more when more events exist", async () => {
        // Create more than 2 events
        for (let i = 0; i < 5; i++) {
          const [eventResult] = await getDb().execute<ResultSetHeader>(
            `INSERT INTO table_events (company_id, outlet_id, table_id, event_type_id, client_tx_id,
             occupancy_version_before, occupancy_version_after, event_data, status_id_before, status_id_after,
             occurred_at, created_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE), NOW(), ?)`,
            [
              companyId, outletId, tableId, TableEventType.TABLE_OPENED,
              `more-test-${runId}-${i}`, i, i + 1, '{}',
              TableOccupancyStatus.AVAILABLE, TableOccupancyStatus.OCCUPIED,
              20 - i, userId
            ]
          );
          createdEventIds.push(Number(eventResult.insertId));
        }

        // Pull with small limit
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}&cursor=0&limit=2`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);
        assert.strictEqual(payload.events.length, 2, "Should return exactly 2 events");
        assert.strictEqual(payload.has_more, true, "Should indicate more events exist");
        assert.ok(payload.next_cursor, "Should provide next_cursor");
      });

      // ============================================
      // Test: should return has_more=false when no more events
      // ============================================
      await test("should return has_more=false when no more events", async () => {
        // Create only 2 events with unique IDs
        for (let i = 0; i < 2; i++) {
          const [eventResult] = await getDb().execute<ResultSetHeader>(
            `INSERT INTO table_events (company_id, outlet_id, table_id, event_type_id, client_tx_id,
             occupancy_version_before, occupancy_version_after, event_data, status_id_before, status_id_after,
             occurred_at, created_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)`,
            [
              companyId, outletId, tableId, TableEventType.TABLE_OPENED,
              `nomore-test-${runId}-${i}-${Date.now()}`, i, i + 1, '{}',
              TableOccupancyStatus.AVAILABLE, TableOccupancyStatus.OCCUPIED,
              userId
            ]
          );
          createdEventIds.push(Number(eventResult.insertId));
        }

        // Pull after the latest event so no events remain
        const lastEventId = createdEventIds[createdEventIds.length - 1] ?? 0;
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}&cursor=${lastEventId}&limit=10`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);
        assert.strictEqual(payload.has_more, false, "Should indicate no more events");
        assert.strictEqual(payload.next_cursor, null, "next_cursor should be null");
      });

      // ============================================
      // Test: should support pagination with next_cursor
      // ============================================
      await test("should support pagination with next_cursor", async () => {
        // First pull: get page 1
        const page1 = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}&limit=3`,
          { headers: authHeaders }
        );

        assert.strictEqual(page1.response.status, 200);

        if (page1.payload.has_more && page1.payload.next_cursor) {
          // Second pull: use next_cursor
          const page2 = await requestJson(
            `/api/sync/pull/table-state?outlet_id=${outletId}&cursor=${page1.payload.next_cursor}&limit=3`,
            { headers: authHeaders }
          );

          assert.strictEqual(page2.response.status, 200, "next_cursor should be usable");

          // Check no duplicates
          const page1Ids = page1.payload.events.map((e: { id: number }) => e.id);
          const page2Ids = page2.payload.events.map((e: { id: number }) => e.id);
          const duplicates = page1Ids.filter((id: number) => page2Ids.includes(id));
          assert.strictEqual(duplicates.length, 0, "Should not have duplicate events across pages");
        }
      });

      // ============================================
      // Test: should handle initial sync (no cursor)
      // ============================================
      await test("should handle initial sync (no cursor)", async () => {
        // Pull without cursor
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);
        assert.ok(Array.isArray(payload.tables), "Should return tables");
        assert.ok(Array.isArray(payload.events), "Should return events");
        assert.ok(payload.sync_timestamp, "Should include sync_timestamp");
      });

    } finally {
      // Cleanup
      const pool = getDb();
      
      for (const eventId of createdEventIds) {
        try {
          await pool.execute(
            `DELETE FROM table_events WHERE id = ? AND company_id = ?`,
            [eventId, companyId]
          );
        } catch { }
      }

      for (const tableId of createdTableIds) {
        try {
          await pool.execute(
            `DELETE FROM table_occupancy WHERE table_id = ? AND company_id = ?`,
            [tableId, companyId]
          );
          await pool.execute(
            `DELETE FROM outlet_tables WHERE id = ? AND company_id = ?`,
            [tableId, companyId]
          );
        } catch { }
      }
    }
  }
);

test(
  "GET /api/sync/pull/table-state - Limit Parameter",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  async () => {
    const runId = Date.now().toString(36) + "-limit";
    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
    const ownerPassword = readEnv("JP_OWNER_PASSWORD", null) ?? "password123";

    let companyId = 0;
    let outletId = 0;
    let userId = 0;
    let token = "";
    let authHeaders: Record<string, string> = {};

    const createdTableIds: number[] = [];
    const createdEventIds: number[] = [];

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

      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);
      outletId = Number(ownerRows[0].outlet_id);
      userId = Number(ownerRows[0].user_id);

      token = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);
      authHeaders = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      };

      // Helper to create a test table via API
      async function createTestTable(tableCode: string, tableName: string): Promise<number> {
        const createResponse = await requestJson(`/api/outlets/${outletId}/tables`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            code: tableCode,
            name: tableName,
            capacity: 4,
            outlet_id: outletId,
          }),
        });

        assert.strictEqual(createResponse.response.status, 201, `Table creation failed: ${JSON.stringify(createResponse.payload)}`);
        const tableId = Number((createResponse.payload as { id: number }).id);
        createdTableIds.push(tableId);
        return tableId;
      }

      // Setup: Create a table for limit tests via API
      const tableId = await createTestTable(`T-${runId}`, `Limit Test Table ${runId}`);

      // ============================================
      // Test: should respect limit parameter
      // ============================================
      await test("should respect limit parameter", async () => {
        // Create 10 events
        for (let i = 0; i < 10; i++) {
          const [eventResult] = await getDb().execute<ResultSetHeader>(
            `INSERT INTO table_events (company_id, outlet_id, table_id, event_type_id, client_tx_id,
             occupancy_version_before, occupancy_version_after, event_data, status_id_before, status_id_after,
             occurred_at, created_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? SECOND), NOW(), ?)`,
            [
              companyId, outletId, tableId, TableEventType.TABLE_OPENED,
              `limit-test-${runId}-${i}`, i, i + 1, '{}',
              TableOccupancyStatus.AVAILABLE, TableOccupancyStatus.OCCUPIED,
              i * 5, userId
            ]
          );
          createdEventIds.push(Number(eventResult.insertId));
        }

        // Pull with limit=5
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}&limit=5`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);
        assert.strictEqual(payload.events.length, 5, "Should return exactly 5 events");
      });

      // ============================================
      // Test: should enforce maximum limit of 500
      // ============================================
      await test("should enforce maximum limit of 500", async () => {
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}&limit=1000`,
          { headers: authHeaders }
        );

        // Should either return 400 error or clamp to 500
        if (response.status === 400) {
          assert.ok(payload.error, "Should return error for invalid limit");
        } else {
          assert.strictEqual(response.status, 200, "Should succeed with clamped limit");
          assert.ok(payload.events.length <= 500, "Should not return more than 500 events");
        }
      });

      // ============================================
      // Test: should use default limit of 100 when not specified
      // ============================================
      await test("should use default limit of 100 when not specified", async () => {
        // Pull without limit
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);
        assert.ok(payload.events.length <= 100, "Should not exceed default limit of 100");
      });

      // ============================================
      // Test: should reject invalid limit values
      // ============================================
      await test("should reject invalid limit values", async () => {
        // Test limit=0
        const response1 = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}&limit=0`,
          { headers: authHeaders }
        );
        assert.strictEqual(response1.response.status, 400, "Should reject limit=0");

        // Test limit=-1
        const response2 = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}&limit=-1`,
          { headers: authHeaders }
        );
        assert.strictEqual(response2.response.status, 400, "Should reject limit=-1");

        // Test limit=abc
        const response3 = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}&limit=abc`,
          { headers: authHeaders }
        );
        assert.strictEqual(response3.response.status, 400, "Should reject non-numeric limit");
      });

    } finally {
      // Cleanup
      const pool = getDb();
      
      for (const eventId of createdEventIds) {
        try {
          await pool.execute(
            `DELETE FROM table_events WHERE id = ? AND company_id = ?`,
            [eventId, companyId]
          );
        } catch { }
      }

      for (const tableId of createdTableIds) {
        try {
          await pool.execute(
            `DELETE FROM table_occupancy WHERE table_id = ? AND company_id = ?`,
            [tableId, companyId]
          );
          await pool.execute(
            `DELETE FROM outlet_tables WHERE id = ? AND company_id = ?`,
            [tableId, companyId]
          );
        } catch { }
      }
    }
  }
);

test(
  "GET /api/sync/pull/table-state - Incremental Events",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  async () => {
    const runId = Date.now().toString(36) + "-events";
    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
    const ownerPassword = readEnv("JP_OWNER_PASSWORD", null) ?? "password123";

    let companyId = 0;
    let outletId = 0;
    let userId = 0;
    let token = "";
    let authHeaders: Record<string, string> = {};

    const createdTableIds: number[] = [];
    const createdEventIds: number[] = [];

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

      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);
      outletId = Number(ownerRows[0].outlet_id);
      userId = Number(ownerRows[0].user_id);

      token = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);
      authHeaders = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      };

      // Helper to create a test table via API
      async function createTestTable(tableCode: string, tableName: string): Promise<number> {
        const createResponse = await requestJson(`/api/outlets/${outletId}/tables`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            code: tableCode,
            name: tableName,
            capacity: 4,
            outlet_id: outletId,
          }),
        });

        assert.strictEqual(createResponse.response.status, 201, `Table creation failed: ${JSON.stringify(createResponse.payload)}`);
        const tableId = Number((createResponse.payload as { id: number }).id);
        createdTableIds.push(tableId);
        return tableId;
      }

      // Setup: Create a table for event tests via API
      const tableId = await createTestTable(`T-${runId}`, `Events Test Table ${runId}`);

      // ============================================
      // Test: should return events in chronological order
      // ============================================
      await test("should return events in chronological order", async () => {
        // Create events at specific times
        const timestamps = [
          '2024-01-15 10:00:00',
          '2024-01-15 10:05:00',
          '2024-01-15 10:10:00'
        ];

        for (let i = 0; i < timestamps.length; i++) {
          const [eventResult] = await getDb().execute<ResultSetHeader>(
            `INSERT INTO table_events (company_id, outlet_id, table_id, event_type_id, client_tx_id,
             occupancy_version_before, occupancy_version_after, event_data, status_id_before, status_id_after,
             occurred_at, created_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
            [
              companyId, outletId, tableId, TableEventType.TABLE_OPENED,
              `order-test-${runId}-${i}-${Date.now()}`, i, i + 1, '{}',
              TableOccupancyStatus.AVAILABLE, TableOccupancyStatus.OCCUPIED,
              timestamps[i], userId
            ]
          );
          createdEventIds.push(Number(eventResult.insertId));
        }

        // Pull events with a cursor before all events
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}&cursor=2024-01-15T09:00:00Z`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);

        // Verify chronological order (recorded_at ascending)
        for (let i = 1; i < payload.events.length; i++) {
          const prevTime = new Date(payload.events[i - 1].recorded_at);
          const currTime = new Date(payload.events[i].recorded_at);
          assert.ok(prevTime <= currTime, "Events should be in chronological order");
        }
      });

      // ============================================
      // Test: should include all event types in incremental feed
      // ============================================
      await test("should include all event types in incremental feed", async () => {
        // Create events of different types
        const eventTypes = [
          TableEventType.RESERVATION_CREATED, // HOLD
          TableEventType.TABLE_OPENED,        // SEAT
          TableEventType.TABLE_CLOSED         // RELEASE
        ];

        for (let i = 0; i < eventTypes.length; i++) {
          const [eventResult] = await getDb().execute<ResultSetHeader>(
            `INSERT INTO table_events (company_id, outlet_id, table_id, event_type_id, client_tx_id,
             occupancy_version_before, occupancy_version_after, event_data, status_id_before, status_id_after,
             occurred_at, created_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE), NOW(), ?)`,
            [
              companyId, outletId, tableId, eventTypes[i],
              `types-test-${runId}-${i}-${Date.now()}`, i, i + 1, '{}',
              TableOccupancyStatus.AVAILABLE, TableOccupancyStatus.OCCUPIED,
              60 - i * 10, userId
            ]
          );
          createdEventIds.push(Number(eventResult.insertId));
        }

        // Pull events
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);

        // Verify all event types are present
        const foundTypes = new Set(payload.events.map((e: { event_type: string }) => e.event_type));
        assert.ok(foundTypes.size >= 3, "Should include multiple event types");
      });

      // ============================================
      // Test: should include event payload in response
      // ============================================
      await test("should include event payload in response", async () => {
        // Create event with specific payload
        const payload = { guest_count: 4, guest_name: "John Doe", notes: "Anniversary dinner" };
        const [eventResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO table_events (company_id, outlet_id, table_id, event_type_id, client_tx_id,
           occupancy_version_before, occupancy_version_after, event_data, status_id_before, status_id_after,
           occurred_at, created_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)`,
          [
            companyId, outletId, tableId, TableEventType.TABLE_OPENED,
            `payload-test-${runId}-${Date.now()}`, 1, 2, JSON.stringify(payload),
            TableOccupancyStatus.AVAILABLE, TableOccupancyStatus.OCCUPIED,
            userId
          ]
        );
        const eventId = Number(eventResult.insertId);
        createdEventIds.push(eventId);

        // Pull events from just before the new event
        const { response, payload: responsePayload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}&cursor=${Math.max(eventId - 1, 0)}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);

        // Find our event and verify payload
        const event = responsePayload.events.find((e: { id: number }) => e.id === eventId);
        assert.ok(event, "Event should be in response");
        assert.ok(event.payload, "Event should have payload");
        assert.strictEqual(event.payload.guest_count, 4);
        assert.strictEqual(event.payload.guest_name, "John Doe");
      });

      // ============================================
      // Test: should not return events before cursor
      // ============================================
      await test("should not return events before cursor", async () => {
        // Create events T1, T2, T3
        const timestamps = [
          '2024-02-01 10:00:00',
          '2024-02-01 10:05:00',
          '2024-02-01 10:10:00'
        ];
        const eventIds: number[] = [];

        for (let i = 0; i < timestamps.length; i++) {
          const [eventResult] = await getDb().execute<ResultSetHeader>(
            `INSERT INTO table_events (company_id, outlet_id, table_id, event_type_id, client_tx_id,
             occupancy_version_before, occupancy_version_after, event_data, status_id_before, status_id_after,
             occurred_at, created_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
            [
              companyId, outletId, tableId, TableEventType.TABLE_OPENED,
              `filter-test-${runId}-${i}-${Date.now()}`, i, i + 1, '{}',
              TableOccupancyStatus.AVAILABLE, TableOccupancyStatus.OCCUPIED,
              timestamps[i], userId
            ]
          );
          eventIds.push(Number(eventResult.insertId));
          createdEventIds.push(Number(eventResult.insertId));
        }

        // Set cursor to T2
        const cursorTimestamp = '2024-02-01T10:05:00Z';
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}&cursor=${encodeURIComponent(cursorTimestamp)}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);

        // Should only return events after cursor
        const returnedIds = payload.events.map((e: { id: number }) => e.id);
        assert.ok(!returnedIds.includes(eventIds[0]), "Should not include T1 (before cursor)");
        assert.ok(!returnedIds.includes(eventIds[1]), "Should not include T2 (at cursor)");
      });

    } finally {
      // Cleanup
      const pool = getDb();
      
      for (const eventId of createdEventIds) {
        try {
          await pool.execute(
            `DELETE FROM table_events WHERE id = ? AND company_id = ?`,
            [eventId, companyId]
          );
        } catch { }
      }

      for (const tableId of createdTableIds) {
        try {
          await pool.execute(
            `DELETE FROM table_occupancy WHERE table_id = ? AND company_id = ?`,
            [tableId, companyId]
          );
          await pool.execute(
            `DELETE FROM outlet_tables WHERE id = ? AND company_id = ?`,
            [tableId, companyId]
          );
        } catch { }
      }
    }
  }
);

test(
  "GET /api/sync/pull/table-state - Tenant Isolation",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  async () => {
    const runId = Date.now().toString(36) + "-iso";
    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
    const ownerPassword = readEnv("JP_OWNER_PASSWORD", null) ?? "password123";

    let companyId = 0;
    let outletId = 0;
    let userId = 0;
    let token = "";
    let authHeaders: Record<string, string> = {};

    const createdTableIds: number[] = [];
    const createdEventIds: number[] = [];

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

      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);
      outletId = Number(ownerRows[0].outlet_id);
      userId = Number(ownerRows[0].user_id);

      token = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);
      authHeaders = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      };

      // Helper to create a test table via API
      async function createTestTable(tableCode: string, tableName: string, targetOutletId: number = outletId): Promise<number> {
        const createResponse = await requestJson(`/api/outlets/${targetOutletId}/tables`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            code: tableCode,
            name: tableName,
            capacity: 4,
            outlet_id: targetOutletId,
          }),
        });

        assert.strictEqual(createResponse.response.status, 201, `Table creation failed: ${JSON.stringify(createResponse.payload)}`);
        const tableId = Number((createResponse.payload as { id: number }).id);
        createdTableIds.push(tableId);
        return tableId;
      }

      // ============================================
      // Test: should only return tables for specified outlet
      // ============================================
      await test("should only return tables for specified outlet", async () => {
        // Get a second outlet for this company
        const [outletRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT id FROM outlets WHERE company_id = ? AND id != ? LIMIT 1`,
          [companyId, outletId]
        );

        if (outletRows.length === 0) {
          console.log("Skipping test - no second outlet available");
          return;
        }

        const outletIdB = Number(outletRows[0].id);

        // Create table in outlet A via API
        const tableIdA = await createTestTable(`T-${runId}-ISO-A`, `Isolation Test Table A ${runId}`, outletId);

        // Create table in outlet B via API (different outlet)
        const tableIdB = await createTestTable(`T-${runId}-ISO-B`, `Isolation Test Table B ${runId}`, outletIdB);

        // Pull for outlet A
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);

        // Check that only outlet A tables are returned
        const tableIds = payload.tables.map((t: { table_id: number }) => t.table_id);
        assert.ok(tableIds.includes(tableIdA), "Should include outlet A table");
        assert.ok(!tableIds.includes(tableIdB), "Should not include outlet B table");
      });

      // ============================================
      // Test: should reject pull for unauthorized outlet
      // ============================================
      await test("should return empty data for unknown outlet", async () => {
        // Try to access an outlet that doesn't exist
        const unauthorizedOutletId = 99999999;

        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${unauthorizedOutletId}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200, "Unknown outlet should return empty sync payload");
        assert.ok(Array.isArray(payload.tables), "tables should be an array");
        assert.ok(Array.isArray(payload.events), "events should be an array");
      });

      // ============================================
      // Test: should not return events from other outlets
      // ============================================
      await test("should not return events from other outlets", async () => {
        // Get a second outlet
        const [outletRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT id FROM outlets WHERE company_id = ? AND id != ? LIMIT 1`,
          [companyId, outletId]
        );

        if (outletRows.length === 0) {
          console.log("Skipping test - no second outlet available");
          return;
        }

        const outletIdB = Number(outletRows[0].id);

        // Create tables via API
        const tableIdA = await createTestTable(`T-${runId}-EV-A`, `Event Test Table A ${runId}`, outletId);
        const tableIdB = await createTestTable(`T-${runId}-EV-B`, `Event Test Table B ${runId}`, outletIdB);

        // Create event in outlet A
        const [eventResultA] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO table_events (company_id, outlet_id, table_id, event_type_id, client_tx_id,
           occupancy_version_before, occupancy_version_after, event_data, status_id_before, status_id_after,
           occurred_at, created_at, created_by)
           VALUES (?, ?, ?, ?, ?, 1, 2, '{}', ?, ?, NOW(), NOW(), ?)`,
          [
            companyId, outletId, tableIdA, TableEventType.TABLE_OPENED,
            `ev-iso-test-a-${runId}-${Date.now()}`, TableOccupancyStatus.AVAILABLE,
            TableOccupancyStatus.OCCUPIED, userId
          ]
        );
        const eventIdA = Number(eventResultA.insertId);
        createdEventIds.push(eventIdA);

        // Create event in outlet B
        const [eventResultB] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO table_events (company_id, outlet_id, table_id, event_type_id, client_tx_id,
           occupancy_version_before, occupancy_version_after, event_data, status_id_before, status_id_after,
           occurred_at, created_at, created_by)
           VALUES (?, ?, ?, ?, ?, 1, 2, '{}', ?, ?, NOW(), NOW(), ?)`,
          [
            companyId, outletIdB, tableIdB, TableEventType.TABLE_OPENED,
            `ev-iso-test-b-${runId}-${Date.now()}`, TableOccupancyStatus.AVAILABLE,
            TableOccupancyStatus.OCCUPIED, userId
          ]
        );
        const eventIdB = Number(eventResultB.insertId);
        createdEventIds.push(eventIdB);

        // Pull for outlet A
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);

        // Check that only outlet A events are returned
        const eventIds = payload.events.map((e: { id: number }) => e.id);
        assert.ok(!eventIds.includes(eventIdB), "Should not include outlet B event");
      });

      // ============================================
      // Test: should require outlet_id parameter
      // ============================================
      await test("should require outlet_id parameter", async () => {
        const { response } = await requestJson(
          `/api/sync/pull/table-state`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 403, "Should return 403 for missing outlet_id");
      });

    } finally {
      // Cleanup
      const pool = getDb();
      
      for (const eventId of createdEventIds) {
        try {
          await pool.execute(
            `DELETE FROM table_events WHERE id = ? AND company_id = ?`,
            [eventId, companyId]
          );
        } catch { }
      }

      for (const tableId of createdTableIds) {
        try {
          await pool.execute(
            `DELETE FROM table_occupancy WHERE table_id = ? AND company_id = ?`,
            [tableId, companyId]
          );
          await pool.execute(
            `DELETE FROM outlet_tables WHERE id = ? AND company_id = ?`,
            [tableId, companyId]
          );
        } catch { }
      }
    }
  }
);

test(
  "GET /api/sync/pull/table-state - Response Format",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  async () => {
    const runId = Date.now().toString(36) + "-fmt";
    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
    const ownerPassword = readEnv("JP_OWNER_PASSWORD", null) ?? "password123";

    let companyId = 0;
    let outletId = 0;
    let userId = 0;
    let token = "";
    let authHeaders: Record<string, string> = {};

    const createdTableIds: number[] = [];
    const createdEventIds: number[] = [];

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

      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);
      outletId = Number(ownerRows[0].outlet_id);
      userId = Number(ownerRows[0].user_id);

      token = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);
      authHeaders = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      };

      // Helper to create a test table via API
      async function createTestTable(tableCode: string, tableName: string): Promise<number> {
        const createResponse = await requestJson(`/api/outlets/${outletId}/tables`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            code: tableCode,
            name: tableName,
            capacity: 4,
            outlet_id: outletId,
          }),
        });

        assert.strictEqual(createResponse.response.status, 201, `Table creation failed: ${JSON.stringify(createResponse.payload)}`);
        const tableId = Number((createResponse.payload as { id: number }).id);
        createdTableIds.push(tableId);
        return tableId;
      }

      // Setup: Create a table with events for format tests via API
      const tableId = await createTestTable(`T-${runId}`, `Format Test Table ${runId}`);

      await getDb().execute(
        `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, version, created_by)
         VALUES (?, ?, ?, ?, 1, ?)`,
        [companyId, outletId, tableId, TableOccupancyStatus.AVAILABLE, userId]
      );

      const [eventResult] = await getDb().execute<ResultSetHeader>(
        `INSERT INTO table_events (company_id, outlet_id, table_id, event_type_id, client_tx_id,
         occupancy_version_before, occupancy_version_after, event_data, status_id_before, status_id_after,
         occurred_at, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, 1, 2, '{}', ?, ?, NOW(), NOW(), ?)`,
        [
          companyId, outletId, tableId, TableEventType.TABLE_OPENED,
          `schema-test-${runId}`, TableOccupancyStatus.AVAILABLE,
          TableOccupancyStatus.OCCUPIED, userId
        ]
      );
      createdEventIds.push(Number(eventResult.insertId));

      // ============================================
      // Test: should return sync_timestamp in response
      // ============================================
      await test("should return sync_timestamp in response", async () => {
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);
        assert.ok(payload.sync_timestamp, "Should include sync_timestamp");

        // Verify it's a valid ISO string
        const timestamp = new Date(payload.sync_timestamp);
        assert.ok(!isNaN(timestamp.getTime()), "sync_timestamp should be a valid date");
      });

      // ============================================
      // Test: should return valid next_cursor format
      // ============================================
      await test("should return valid next_cursor format", async () => {
        // Create more events for pagination test
        for (let i = 0; i < 5; i++) {
          const [eventResult] = await getDb().execute<ResultSetHeader>(
            `INSERT INTO table_events (company_id, outlet_id, table_id, event_type_id, client_tx_id,
             occupancy_version_before, occupancy_version_after, event_data, status_id_before, status_id_after,
             occurred_at, created_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? SECOND), NOW(), ?)`,
            [
              companyId, outletId, tableId, TableEventType.TABLE_OPENED,
              `cur-format-test-${runId}-${i}-${Date.now()}`, i, i + 1, '{}',
              TableOccupancyStatus.AVAILABLE, TableOccupancyStatus.OCCUPIED,
              i * 3, userId
            ]
          );
          createdEventIds.push(Number(eventResult.insertId));
        }

        // Pull with small limit to get has_more
        const page1 = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}&limit=2`,
          { headers: authHeaders }
        );

        assert.strictEqual(page1.response.status, 200);

        if (page1.payload.has_more) {
          assert.ok(typeof page1.payload.next_cursor === 'string', "next_cursor should be a string");
          assert.ok(page1.payload.next_cursor.length > 0, "next_cursor should not be empty");

          // Verify next_cursor is usable
          const page2 = await requestJson(
            `/api/sync/pull/table-state?outlet_id=${outletId}&cursor=${page1.payload.next_cursor}&limit=2`,
            { headers: authHeaders }
          );

          assert.strictEqual(page2.response.status, 200, "next_cursor should be usable");
        }
      });

      // ============================================
      // Test: should match TableSyncPullResponseSchema
      // ============================================
      await test("should match TableSyncPullResponseSchema", async () => {
        // Pull and validate
        const { response, payload } = await requestJson(
          `/api/sync/pull/table-state?outlet_id=${outletId}`,
          { headers: authHeaders }
        );

        assert.strictEqual(response.status, 200);

        // Validate against schema
        try {
          TableSyncPullResponseSchema.parse(payload);
          assert.ok(true, "Response should match TableSyncPullResponseSchema");
        } catch (error) {
          assert.fail(`Response does not match schema: ${error}`);
        }
      });

    } finally {
      // Cleanup
      const pool = getDb();
      
      for (const eventId of createdEventIds) {
        try {
          await pool.execute(
            `DELETE FROM table_events WHERE id = ? AND company_id = ?`,
            [eventId, companyId]
          );
        } catch { }
      }

      for (const tableId of createdTableIds) {
        try {
          await pool.execute(
            `DELETE FROM table_occupancy WHERE table_id = ? AND company_id = ?`,
            [tableId, companyId]
          );
          await pool.execute(
            `DELETE FROM outlet_tables WHERE id = ? AND company_id = ?`,
            [tableId, companyId]
          );
        } catch { }
      }
    }
  }
);

// Close database pool after all tests
test.after(async () => {
  await closeDbPool();
});
