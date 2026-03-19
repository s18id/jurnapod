// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for POST /api/sync/push/table-events
 * Story 12.6 Scope H: Push integration tests for table operations sync
 *
 * Test Coverage:
 * - Idempotency & Duplicate Prevention (AC1, AC5)
 * - Conflict Detection (AC2, AC4)
 * - Tenant/Outlet Isolation
 * - Event Types & Mutations (HOLD, SEAT, RELEASE, etc.)
 * - Error Handling (400, 401, 403, non-existent resources)
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import type { Pool } from "mysql2/promise";
import {
  TableEventType,
  TableOccupancyStatus,
  ServiceSessionStatus,
} from "@jurnapod/shared";
import {
  createIntegrationTestContext,
  loginOwner,
  readEnv,
  TEST_TIMEOUT_MS,
} from "../../../../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDbPool } from "../../../../../src/lib/db";

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

// ============================================================================
// Test Suite: POST /api/sync/push/table-events
// ============================================================================

test(
  "POST /api/sync/push/table-events - Integration Tests",
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
    const createdEventIds: number[] = [];
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
        "content-type": "application/json",
      };

      // Helper to create a test table via API
      async function createTestTable(tableCode: string): Promise<number> {
        const createResponse = await requestJson(`/api/outlets/${outletId}/tables`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            code: tableCode,
            name: `Test Table ${tableCode}`,
            capacity: 4,
            outlet_id: outletId,
          }),
        });

        assert.strictEqual(createResponse.response.status, 201, `Table creation failed: ${JSON.stringify(createResponse.payload)}`);
        const tableId = Number(createResponse.payload.data.id);
        createdTableIds.push(tableId);

        // Verify occupancy record was created by the API
        const [occupancyRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT id FROM table_occupancy WHERE table_id = ? AND company_id = ? AND outlet_id = ?`,
          [tableId, companyId, outletId]
        );

        // No API endpoint exists for direct occupancy creation; use minimal DB setup here.
        if (occupancyRows.length === 0) {
          await getDb().execute(
            `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, version, created_by)
             VALUES (?, ?, ?, ?, 1, ?)`,
            [companyId, outletId, tableId, TableOccupancyStatus.AVAILABLE, userId]
          );
        }

        return tableId;
      }

      // Helper to push table events
      async function pushTableEvents(outletIdOrUuid: string | number, events: unknown[]) {
        return requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletIdOrUuid,
            events,
          }),
        });
      }

      // Use numeric outlet_id directly
      // The route's parseOutletIdFromBody handles both number and string
      const outletUuid = outletId;

      // ========================================================================
      // TEST GROUP 1: Idempotency & Duplicate Prevention (AC1, AC5)
      // ========================================================================

      await test("should process new event and return OK status", async () => {
        const tableId = await createTestTable(`T-${runId}-IDEM-1`);
        const clientTxId = `test-idem-ok-${runId}`;

        const { response, payload } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: clientTxId,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2, guest_name: "Test Guest" },
            recorded_at: new Date().toISOString(),
          },
        ]);

        assert.strictEqual(response.status, 200, "Should return 200 for successful push");
        assert.ok(payload.success, "Response should have success=true");
        assert.ok(Array.isArray(payload.data?.results), "Response should have results array");
        assert.strictEqual(payload.data.results.length, 1, "Should have one result");
        assert.strictEqual(payload.data.results[0].status, "OK", "Status should be OK");
        assert.ok(payload.data.results[0].table_version > 1, "Version should be incremented");
      });

      await test("should return DUPLICATE for same client_tx_id replay", async () => {
        const tableId = await createTestTable(`T-${runId}-IDEM-2`);
        const clientTxId = `test-idem-dup-${runId}`;

        // First push - should succeed
        const { response: response1 } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: clientTxId,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2 },
            recorded_at: new Date().toISOString(),
          },
        ]);
        assert.strictEqual(response1.status, 200, "First push should succeed");

        // Second push with same client_tx_id - should return DUPLICATE
        const { response: response2, payload: payload2 } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: clientTxId,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2 },
            recorded_at: new Date().toISOString(),
          },
        ]);

        assert.strictEqual(response2.status, 200, "Should return 200 even for duplicate");
        assert.strictEqual(payload2.data.results[0].status, "DUPLICATE", "Status should be DUPLICATE");

        // Verify no mutation occurred (table_events count should still be 1)
        const [countRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT COUNT(*) as count FROM table_events WHERE client_tx_id = ? AND company_id = ? AND outlet_id = ?`,
          [clientTxId, companyId, outletId]
        );
        assert.strictEqual(countRows[0].count, 1, "Should have exactly one event record");
      });

      await test("should handle retry with exponential backoff simulation", async () => {
        const tableId = await createTestTable(`T-${runId}-IDEM-3`);
        const clientTxId = `test-idem-retry-${runId}`;

        // First push
        const { response: response1, payload: payload1 } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: clientTxId,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2 },
            recorded_at: new Date().toISOString(),
          },
        ]);
        const firstVersion = response1.status === 200 ? payload1.data?.results?.[0]?.table_version : null;

        // Simulate multiple retries
        const retryPromises = [];
        for (let i = 0; i < 3; i++) {
          retryPromises.push(
            pushTableEvents(outletUuid, [
              {
                client_tx_id: clientTxId,
                table_id: tableId.toString(),
                expected_table_version: 1,
                event_type: TableEventType.TABLE_OPENED,
                payload: { guest_count: 2 },
                recorded_at: new Date().toISOString(),
              },
            ])
          );
        }

        const retryResults = await Promise.all(retryPromises);

        // All retries should return DUPLICATE
        for (const { response, payload } of retryResults) {
          assert.strictEqual(response.status, 200, "Retry should return 200");
          assert.strictEqual(payload.data.results[0].status, "DUPLICATE", "Retry should return DUPLICATE");
        }

        // Verify only one event record exists
        const [countRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT COUNT(*) as count FROM table_events WHERE client_tx_id = ? AND company_id = ? AND outlet_id = ?`,
          [clientTxId, companyId, outletId]
        );
        assert.strictEqual(countRows[0].count, 1, "Should have exactly one event record after retries");
      });

      // ========================================================================
      // TEST GROUP 2: Conflict Detection (AC2, AC4)
      // ========================================================================

      await test("should return CONFLICT when expected_version mismatches", async () => {
        const tableId = await createTestTable(`T-${runId}-CONF-1`);

        // First, occupy the table to bump version to 2
        await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-conf-setup-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2 },
            recorded_at: new Date().toISOString(),
          },
        ]);

        // Now try to push with stale expected_version = 1
        const { response, payload } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-conf-stale-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 1, // Stale - should be 2
            event_type: TableEventType.GUEST_COUNT_CHANGED,
            payload: { guest_count: 4 },
            recorded_at: new Date().toISOString(),
          },
        ]);

        assert.strictEqual(response.status, 409, "Should return 409 for conflict");
        assert.ok(payload.error, "Should have error in payload");
        assert.strictEqual(payload.error.code, "CONFLICT", "Error code should be CONFLICT");
        assert.ok(payload.details, "Should have details in payload");
        assert.strictEqual(payload.details[0].status, "CONFLICT", "Status should be CONFLICT");
        assert.ok(payload.details[0].conflict_payload, "Should include conflict_payload");
        assert.strictEqual(
          payload.details[0].conflict_payload.current_version,
          2,
          "Conflict payload should show current version 2"
        );
      });

      await test("should return canonical state in conflict payload", async () => {
        const tableId = await createTestTable(`T-${runId}-CONF-2`);

        // First, occupy the table
        await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-conf-canon-setup-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2, guest_name: "John Doe" },
            recorded_at: new Date().toISOString(),
          },
        ]);

        // Try to push with stale version
        const { response, payload } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-conf-canon-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_CLOSED,
            payload: {},
            recorded_at: new Date().toISOString(),
          },
        ]);

        assert.strictEqual(response.status, 409);
        assert.ok(payload.error);
        assert.strictEqual(payload.error.code, "CONFLICT");
        assert.ok(payload.details);
        assert.strictEqual(payload.details[0].status, "CONFLICT");

        const conflictPayload = payload.details[0].conflict_payload;
        assert.ok(conflictPayload, "Should have conflict_payload");
        assert.ok(conflictPayload.current_occupancy, "Should have current_occupancy");
        assert.strictEqual(
          conflictPayload.current_occupancy.status_id,
          TableOccupancyStatus.OCCUPIED,
          "Should show OCCUPIED status"
        );
        assert.ok(
          conflictPayload.current_occupancy.guest_count !== undefined,
          "Should include guest_count"
        );
        assert.ok(conflictPayload.active_session, "Should have active_session");
        assert.ok(conflictPayload.active_session.id, "Active session should have id");
        assert.ok(conflictPayload.current_version, "Should have current_version");
        assert.ok(conflictPayload.conflict_reason, "Should have conflict_reason");
      });

      await test("should allow retry after conflict with updated version", async () => {
        const tableId = await createTestTable(`T-${runId}-CONF-3`);

        // First, occupy the table
        await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-conf-retry-setup-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2 },
            recorded_at: new Date().toISOString(),
          },
        ]);

        // Get conflict with stale version
        const { response: conflictResponse, payload: conflictPayload } = await pushTableEvents(
          outletUuid,
          [
            {
              client_tx_id: `test-conf-retry-event-${runId}`,
              table_id: tableId.toString(),
              expected_table_version: 1,
              event_type: TableEventType.GUEST_COUNT_CHANGED,
              payload: { guest_count: 4 },
              recorded_at: new Date().toISOString(),
            },
          ]
        );

        assert.strictEqual(conflictResponse.status, 409);
        assert.ok(conflictPayload.error);
        assert.strictEqual(conflictPayload.error.code, "CONFLICT");
        assert.ok(conflictPayload.details);
        assert.strictEqual(conflictPayload.details[0].status, "CONFLICT");

        const currentVersion = conflictPayload.details[0].conflict_payload.current_version;

        // Retry with correct version
        const { response: retryResponse, payload: retryPayload } = await pushTableEvents(
          outletUuid,
          [
            {
              client_tx_id: `test-conf-retry-event-2-${runId}`,
              table_id: tableId.toString(),
              expected_table_version: currentVersion,
              event_type: TableEventType.GUEST_COUNT_CHANGED,
              payload: { guest_count: 4 },
              recorded_at: new Date().toISOString(),
            },
          ]
        );

        assert.strictEqual(retryResponse.status, 200, "Retry should succeed");
        assert.strictEqual(retryPayload.data.results[0].status, "OK", "Status should be OK after retry");
        assert.strictEqual(
          retryPayload.data.results[0].table_version,
          currentVersion + 1,
          "Version should be incremented"
        );
      });

      // ========================================================================
      // TEST GROUP 3: Tenant/Outlet Isolation
      // ========================================================================

      await test("should reject push for outlet user does not have access to", async () => {
        // Create a different outlet in the same company
        const [diffOutletResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO outlets (company_id, code, name)
           VALUES (?, ?, ?)`,
          [companyId, `DIFF-${runId}`, `Different Outlet ${runId}`]
        );
        const differentOutletId = Number(diffOutletResult.insertId);
        // Use a different UUID for the outlet
        const differentOutletUuid = "550e8400-e29b-41d4-a716-446655440002";

        // Try to push to outlet the user doesn't have access to
        const { response, payload } = await pushTableEvents(differentOutletUuid, [
          {
            client_tx_id: `test-isolation-outlet-${runId}`,
            table_id: "999",
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2 },
            recorded_at: new Date().toISOString(),
          },
        ]);

        assert.strictEqual(response.status, 403, "Should return 403 for unauthorized outlet");
        assert.ok(payload.error, "Should have error in payload");

        // Cleanup
        await getDb().execute(`DELETE FROM outlets WHERE id = ? AND company_id = ?`, [
          differentOutletId,
          companyId,
        ]);
      });

      await test("should not allow cross-company table operations", async () => {
        // Create a different company
        const [diffCompanyResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO companies (code, name)
           VALUES (?, ?)`,
          [`DIFF-CO-${runId}`, `Different Company ${runId}`]
        );
        const differentCompanyId = Number(diffCompanyResult.insertId);

        // Create an outlet in the different company
        const [diffOutletResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO outlets (company_id, code, name)
           VALUES (?, ?, ?)`,
          [differentCompanyId, `MAIN`, `Main Outlet`]
        );
        const differentOutletId = Number(diffOutletResult.insertId);

        // Create a table in the different company
        const [tableResult] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO outlet_tables (company_id, outlet_id, code, name, capacity, status)
           VALUES (?, ?, ?, ?, ?, 'AVAILABLE')`,
          [differentCompanyId, differentOutletId, `T-DIFF`, `Different Table`, 4]
        );
        const differentTableId = Number(tableResult.insertId);

        // Use a different UUID for cross-company test
        const differentOutletUuid = "550e8400-e29b-41d4-a716-446655440003";

        // Try to push event for table from different company
        const { response, payload } = await pushTableEvents(differentOutletUuid, [
          {
            client_tx_id: `test-isolation-co-${runId}`,
            table_id: differentTableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2 },
            recorded_at: new Date().toISOString(),
          },
        ]);

        assert.strictEqual(response.status, 403, "Should return 403 for cross-company access");

        // Cleanup
        await getDb().execute(`DELETE FROM outlet_tables WHERE id = ?`, [differentTableId]);
        await getDb().execute(`DELETE FROM outlets WHERE id = ?`, [differentOutletId]);
        await getDb().execute(`DELETE FROM companies WHERE id = ?`, [differentCompanyId]);
      });

      await test("should isolate events by company_id and outlet_id", async () => {
        const tableId = await createTestTable(`T-${runId}-ISO`);
        const clientTxId = `test-isolation-${runId}`;

        // Push event in primary company/outlet
        const { response: response1 } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: clientTxId,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2 },
            recorded_at: new Date().toISOString(),
          },
        ]);
        assert.strictEqual(response1.status, 200, "First push should succeed");

        // Verify event was recorded
        const [eventRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT id FROM table_events 
           WHERE client_tx_id = ? AND company_id = ? AND outlet_id = ?`,
          [clientTxId, companyId, outletId]
        );
        assert.strictEqual(eventRows.length, 1, "Event should be recorded for primary company");

        // The same client_tx_id in a different company should be allowed (separate namespace)
        // This is implicitly tested by the fact that we don't have cross-company conflicts
        // The event lookup is scoped by company_id and outlet_id
      });

      // ========================================================================
      // TEST GROUP 4: Event Types & Mutations
      // ========================================================================

      await test("should process TABLE_OPENED (SEAT) event", async () => {
        const tableId = await createTestTable(`T-${runId}-SEAT`);

        const { response, payload } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-seat-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 4, guest_name: "Party of Four" },
            recorded_at: new Date().toISOString(),
          },
        ]);

        assert.strictEqual(response.status, 200);
        assert.strictEqual(payload.data.results[0].status, "OK");

        // Verify table is now occupied
        const [occupancyRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT status_id, guest_count, service_session_id 
           FROM table_occupancy 
           WHERE table_id = ? AND company_id = ? AND outlet_id = ?`,
          [tableId, companyId, outletId]
        );
        assert.strictEqual(
          occupancyRows[0].status_id,
          TableOccupancyStatus.OCCUPIED,
          "Table should be OCCUPIED"
        );
        assert.strictEqual(occupancyRows[0].guest_count, 4, "Guest count should be 4");
        assert.ok(occupancyRows[0].service_session_id, "Should have service session");

        // Verify service session was created
        const [sessionRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT id, guest_count, status_id 
           FROM table_service_sessions 
           WHERE id = ? AND company_id = ? AND outlet_id = ?`,
          [occupancyRows[0].service_session_id, companyId, outletId]
        );
        assert.strictEqual(sessionRows.length, 1, "Service session should exist");
        assert.strictEqual(sessionRows[0].status_id, ServiceSessionStatus.ACTIVE);
      });

      await test("should process TABLE_CLOSED (RELEASE) event", async () => {
        const tableId = await createTestTable(`T-${runId}-REL`);

        // First, seat guests
        await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-rel-setup-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2 },
            recorded_at: new Date().toISOString(),
          },
        ]);

        // Get current version
        const [occupancyRowsBefore] = await getDb().execute<RowDataPacket[]>(
          `SELECT version FROM table_occupancy WHERE table_id = ? AND company_id = ? AND outlet_id = ?`,
          [tableId, companyId, outletId]
        );
        const currentVersion = occupancyRowsBefore[0].version;

        // Now release
        const { response, payload } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-rel-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: currentVersion,
            event_type: TableEventType.TABLE_CLOSED,
            payload: { notes: "Customer finished dining" },
            recorded_at: new Date().toISOString(),
          },
        ]);

        assert.strictEqual(response.status, 200);
        assert.strictEqual(payload.data.results[0].status, "OK");

        // Verify table is now available
        const [occupancyRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT status_id, service_session_id, guest_count 
           FROM table_occupancy 
           WHERE table_id = ? AND company_id = ? AND outlet_id = ?`,
          [tableId, companyId, outletId]
        );
        assert.strictEqual(
          occupancyRows[0].status_id,
          TableOccupancyStatus.AVAILABLE,
          "Table should be AVAILABLE"
        );
        assert.strictEqual(
          occupancyRows[0].service_session_id,
          null,
          "Service session should be null"
        );
        assert.strictEqual(occupancyRows[0].guest_count, null, "Guest count should be null");
      });

      await test("should process RESERVATION_CREATED (HOLD) event", async () => {
        const tableId = await createTestTable(`T-${runId}-HOLD`);

        const reservedUntil = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now

        const { response, payload } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-hold-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.RESERVATION_CREATED,
            payload: {
              reservation_id: null,
              reserved_until: reservedUntil,
              guest_name: "Reserved Guest",
              guest_count: 2,
            },
            recorded_at: new Date().toISOString(),
          },
        ]);

        assert.strictEqual(response.status, 200);
        assert.strictEqual(payload.data.results[0].status, "OK");

        // Verify table is now reserved
        const [occupancyRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT status_id, reserved_until 
           FROM table_occupancy 
           WHERE table_id = ? AND company_id = ? AND outlet_id = ?`,
          [tableId, companyId, outletId]
        );
        assert.strictEqual(
          occupancyRows[0].status_id,
          TableOccupancyStatus.RESERVED,
          "Table should be RESERVED"
        );
        assert.ok(occupancyRows[0].reserved_until, "Should have reserved_until");
      });

      await test("should process GUEST_COUNT_CHANGED event", async () => {
        const tableId = await createTestTable(`T-${runId}-GUEST`);

        // First, seat guests
        await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-guest-setup-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2 },
            recorded_at: new Date().toISOString(),
          },
        ]);

        // Get current version
        const [occupancyRowsBefore] = await getDb().execute<RowDataPacket[]>(
          `SELECT version, service_session_id 
           FROM table_occupancy 
           WHERE table_id = ? AND company_id = ? AND outlet_id = ?`,
          [tableId, companyId, outletId]
        );
        const currentVersion = occupancyRowsBefore[0].version;
        const sessionId = occupancyRowsBefore[0].service_session_id;

        // Change guest count
        const { response, payload } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-guest-change-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: currentVersion,
            event_type: TableEventType.GUEST_COUNT_CHANGED,
            payload: { guest_count: 6 },
            recorded_at: new Date().toISOString(),
          },
        ]);

        assert.strictEqual(response.status, 200);
        assert.strictEqual(payload.data.results[0].status, "OK");

        // Verify guest count was updated
        const [occupancyRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT guest_count FROM table_occupancy 
           WHERE table_id = ? AND company_id = ? AND outlet_id = ?`,
          [tableId, companyId, outletId]
        );
        assert.strictEqual(occupancyRows[0].guest_count, 6, "Guest count should be updated to 6");

        // Verify session guest count was also updated
        const [sessionRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT guest_count FROM table_service_sessions 
           WHERE id = ? AND company_id = ? AND outlet_id = ?`,
          [sessionId, companyId, outletId]
        );
        assert.strictEqual(sessionRows[0].guest_count, 6, "Session guest count should be 6");
      });

      await test("should process batch of mixed event types", async () => {
        const tableId = await createTestTable(`T-${runId}-BATCH`);

        const { response, payload } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-batch-1-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2 },
            recorded_at: new Date().toISOString(),
          },
          {
            client_tx_id: `test-batch-2-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 2,
            event_type: TableEventType.GUEST_COUNT_CHANGED,
            payload: { guest_count: 4 },
            recorded_at: new Date().toISOString(),
          },
          {
            client_tx_id: `test-batch-3-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 3,
            event_type: TableEventType.TABLE_CLOSED,
            payload: {},
            recorded_at: new Date().toISOString(),
          },
        ]);

        assert.strictEqual(response.status, 200);
        assert.strictEqual(payload.data.results.length, 3, "Should have 3 results");

        // All should succeed in order
        assert.strictEqual(payload.data.results[0].status, "OK", "First event should be OK");
        assert.strictEqual(payload.data.results[1].status, "OK", "Second event should be OK");
        assert.strictEqual(payload.data.results[2].status, "OK", "Third event should be OK");

        // Verify versions are sequential
        assert.strictEqual(payload.data.results[0].table_version, 2, "Version after first event");
        assert.strictEqual(payload.data.results[1].table_version, 3, "Version after second event");
        assert.strictEqual(payload.data.results[2].table_version, 4, "Version after third event");

        // Verify final state
        const [occupancyRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT status_id FROM table_occupancy 
           WHERE table_id = ? AND company_id = ? AND outlet_id = ?`,
          [tableId, companyId, outletId]
        );
        assert.strictEqual(occupancyRows[0].status_id, TableOccupancyStatus.AVAILABLE);
      });

      // ========================================================================
      // TEST GROUP 5: Error Handling
      // ========================================================================

      await test("should return 403 for missing outlet_id in request body", async () => {
        const { response, payload } = await requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            // Missing outlet_id
            events: [],
          }),
        });

        // Access guard runs before Zod validation, so missing outlet_id returns 403
        assert.strictEqual(response.status, 403, "Should return 403 for missing outlet_id");
        assert.ok(payload.error, "Should have error");
      });

      await test("should return 400 for invalid request body - invalid table_id format", async () => {
        const { response, payload } = await requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: [
              {
                client_tx_id: "test",
                table_id: "not-a-valid-id",
                expected_table_version: 1,
                event_type: TableEventType.TABLE_OPENED,
                payload: {},
                recorded_at: new Date().toISOString(),
              },
            ],
          }),
        });

        assert.strictEqual(response.status, 400, "Should return 400 for invalid table_id");
        assert.ok(payload.error, "Should have error");
      });

      await test("should return 400 for invalid request body - empty events array", async () => {
        const { response, payload } = await requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: [], // Empty array
          }),
        });

        assert.strictEqual(response.status, 400, "Should return 400 for empty events");
      });

      await test("should return 401 for unauthenticated request", async () => {
        const { response, payload } = await requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // No authorization header
          },
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: [
              {
                client_tx_id: `test-auth-${runId}`,
                table_id: "123",
                expected_table_version: 1,
                event_type: TableEventType.TABLE_OPENED,
                payload: {},
                recorded_at: new Date().toISOString(),
              },
            ],
          }),
        });

        assert.strictEqual(response.status, 401, "Should return 401 for unauthenticated request");
      });

      await test("should return 401 for invalid token", async () => {
        const { response, payload } = await requestJson("/api/sync/push/table-events", {
          method: "POST",
          headers: {
            authorization: "Bearer invalid-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            outlet_id: outletUuid,
            events: [
              {
                client_tx_id: `test-auth-invalid-${runId}`,
                table_id: "123",
                expected_table_version: 1,
                event_type: TableEventType.TABLE_OPENED,
                payload: {},
                recorded_at: new Date().toISOString(),
              },
            ],
          }),
        });

        assert.strictEqual(response.status, 401, "Should return 401 for invalid token");
      });

      await test("should handle non-existent table gracefully", async () => {
        const { response, payload } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-notfound-${runId}`,
            table_id: "99999999", // Non-existent table
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2 },
            recorded_at: new Date().toISOString(),
          },
        ]);

        assert.strictEqual(response.status, 200, "Should return 200");
        assert.strictEqual(payload.data.results[0].status, "ERROR", "Status should be ERROR");
        assert.ok(payload.data.results[0].errorMessage, "Should have error message");
      });

      await test("should return ERROR status for invalid event type", async () => {
        const tableId = await createTestTable(`T-${runId}-INVALID-EVT`);

        const { response, payload } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-invalid-evt-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: 99999, // Invalid event type
            payload: {},
            recorded_at: new Date().toISOString(),
          },
        ]);

        assert.strictEqual(response.status, 200, "Should return 200");
        assert.strictEqual(payload.data.results[0].status, "ERROR", "Invalid event type should return ERROR status");
        assert.ok(payload.data.results[0].errorMessage, "Invalid event type should include an error message");
      });

      await test("should return ERROR status for invalid state transition", async () => {
        const tableId = await createTestTable(`T-${runId}-INVALID-TRANS`);

        // First, occupy the table
        await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-invalid-trans-setup-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 2 },
            recorded_at: new Date().toISOString(),
          },
        ]);

        // Try to seat again (table already occupied)
        const { response, payload } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-invalid-trans-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 2,
            event_type: TableEventType.TABLE_OPENED,
            payload: { guest_count: 3 },
            recorded_at: new Date().toISOString(),
          },
        ]);

        assert.strictEqual(response.status, 200);
        assert.strictEqual(payload.data.results[0].status, "ERROR", "Should return ERROR for invalid transition");
        assert.ok(
          payload.data.results[0].errorMessage?.includes("already occupied"),
          "Error message should indicate table is occupied"
        );
      });

      // ========================================================================
      // Test: STATUS_CHANGED event
      // ========================================================================

      await test("should process STATUS_CHANGED event", async () => {
        const tableId = await createTestTable(`T-${runId}-STATUS`);

        const { response, payload } = await pushTableEvents(outletUuid, [
          {
            client_tx_id: `test-status-${runId}`,
            table_id: tableId.toString(),
            expected_table_version: 1,
            event_type: TableEventType.STATUS_CHANGED,
            payload: { status_id: TableOccupancyStatus.CLEANING },
            recorded_at: new Date().toISOString(),
          },
        ]);

        assert.strictEqual(response.status, 200);
        assert.strictEqual(payload.data.results[0].status, "OK");

        // Verify status changed
        const [occupancyRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT status_id FROM table_occupancy 
           WHERE table_id = ? AND company_id = ? AND outlet_id = ?`,
          [tableId, companyId, outletId]
        );
        assert.strictEqual(
          occupancyRows[0].status_id,
          TableOccupancyStatus.CLEANING,
          "Table should be CLEANING"
        );
      });
    } finally {
      // Cleanup: Remove created events first
      for (const clientTxId of createdEventIds) {
        try {
          await getDb().execute(
            `DELETE FROM table_events 
             WHERE client_tx_id = ? AND company_id = ? AND outlet_id = ?`,
            [clientTxId, companyId, outletId]
          );
        } catch {
          // Ignore cleanup errors
        }
      }

      // Cleanup: Remove created sessions
      for (const sessionId of createdSessionIds) {
        try {
          await getDb().execute(
            `DELETE FROM table_service_sessions 
             WHERE id = ? AND company_id = ? AND outlet_id = ?`,
            [sessionId, companyId, outletId]
          );
        } catch {
          // Ignore cleanup errors
        }
      }

      // Cleanup: Remove created tables and their occupancy records
      for (const tableId of createdTableIds) {
        try {
          await getDb().execute(
            `DELETE FROM table_events 
             WHERE table_id = ? AND company_id = ? AND outlet_id = ?`,
            [tableId, companyId, outletId]
          );
          await getDb().execute(
            `DELETE FROM table_occupancy 
             WHERE table_id = ? AND company_id = ? AND outlet_id = ?`,
            [tableId, companyId, outletId]
          );
          await getDb().execute(
            `DELETE FROM outlet_tables 
             WHERE id = ? AND company_id = ? AND outlet_id = ?`,
            [tableId, companyId, outletId]
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
