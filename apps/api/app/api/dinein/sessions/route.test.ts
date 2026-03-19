// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for dine-in sessions API
 *
 * NOTE ON FIXTURE SETUP: Per integration test policy (docs/project-context.md),
 * business entities should be created via API endpoints when available.
 *
 * For this suite:
 * - Service session creation uses POST /api/dinein/tables/:tableId/seat (API-driven)
 * - Status transitions use session control APIs (lock-payment / close) when needed
 * - Direct SQL is retained only where no setup endpoint exists in scope (table creation)
 *   and for teardown/read-only verification.
 *
 * Therefore, direct SQL writes are necessary for:
 * - Creating test outlet_tables (no POST /tables endpoint in this scope)
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
  "Dine-in sessions API - full integration test suite",
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
    const createdSnapshotIds: string[] = [];

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
      // Helper function to create test table
      // ============================================
      async function createTestTable(codeSuffix: string): Promise<number> {
        const [result] = await getDb().execute<ResultSetHeader>(
          `INSERT INTO outlet_tables (company_id, outlet_id, code, name, capacity, status)
           VALUES (?, ?, ?, ?, ?, 'AVAILABLE')`,
          [companyId, outletId, `TST-${runId}-${codeSuffix}`.slice(0, 32), `Test Table ${codeSuffix} ${runId}`, 4]
        );
        const tableId = Number(result.insertId);
        createdTableIds.push(tableId);
        return tableId;
      }

      // ============================================
      // Helper function to get an existing seeded test item
      // ============================================
      async function getOrCreateTestItem(): Promise<number> {
        // Fixture policy: use existing seeded business entities in integration tests.
        const [rows] = await getDb().execute<RowDataPacket[]>(
          `SELECT id FROM items WHERE company_id = ? LIMIT 1`,
          [companyId]
        );

        if (rows.length > 0) {
          return Number(rows[0].id);
        }

        throw new Error("No seeded item found for integration fixtures; run seed first");
      }

      // ============================================
      // Helper function to create test session
      // ============================================
      async function createTestSession(tableId: number, statusId: number = 1): Promise<number> {
        const seatTx = `seat-${runId}-${tableId}-${statusId}`;
        const seatResult = await requestJson(`/api/dinein/tables/${tableId}/seat?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            guestCount: 2,
            notes: `fixture-${seatTx}`,
            expectedVersion: 1,
          }),
        });

        assert.strictEqual(
          seatResult.response.status,
          200,
          `Failed to seat test table ${tableId}: ${JSON.stringify(seatResult.payload)}`
        );

        const sessionId = Number(seatResult.payload?.data?.sessionId);
        assert.ok(Number.isFinite(sessionId) && sessionId > 0, "Seat response should include sessionId");
        createdSessionIds.push(sessionId);

        if (statusId === 2) {
          const lockResult = await requestJson(`/api/dinein/sessions/${sessionId}/lock-payment?outletId=${outletId}`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ clientTxId: `lock-${runId}-${sessionId}` }),
          });
          assert.strictEqual(lockResult.response.status, 200, `Failed to lock session fixture ${sessionId}`);
        } else if (statusId === 3) {
          const snapshotId = `snap-${runId}-${sessionId}`;
          await createTestSnapshot(snapshotId, tableId);
          const lockResult = await requestJson(`/api/dinein/sessions/${sessionId}/lock-payment?outletId=${outletId}`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              clientTxId: `lock-${runId}-${sessionId}`,
              posOrderSnapshotId: snapshotId,
            }),
          });
          assert.strictEqual(lockResult.response.status, 200, `Failed to lock session fixture ${sessionId}`);

          const closeResult = await requestJson(`/api/dinein/sessions/${sessionId}/close?outletId=${outletId}`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ clientTxId: `close-${runId}-${sessionId}` }),
          });
          assert.strictEqual(closeResult.response.status, 200, `Failed to close session fixture ${sessionId}`);
        }

        return sessionId;
      }

      async function createTestSnapshot(snapshotId: string, tableId: number | null = null): Promise<void> {
        await getDb().execute(
          `INSERT INTO pos_order_snapshots
           (order_id, company_id, outlet_id, service_type, order_state, order_status, is_finalized, paid_amount, opened_at, table_id, updated_at, created_at)
           VALUES (?, ?, ?, 'DINE_IN', 'OPEN', 'OPEN', 0, 0, NOW(), ?, NOW(), NOW())`,
          [snapshotId, companyId, outletId, tableId]
        );
        createdSnapshotIds.push(snapshotId);
      }

      // ============================================
      // TEST 1: POST /sessions/:id/lines - creates line with auth
      // ============================================
      await test("POST /sessions/:id/lines - creates line with authentication", async () => {
        const tableId = await createTestTable("L1");
        const sessionId = await createTestSession(tableId, 1);
        const itemId = await getOrCreateTestItem();

        const { response, payload } = await requestJson(`/api/dinein/sessions/${sessionId}/lines?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            itemId: itemId,
            itemName: "Test Burger",
            unitPrice: 15.50,
            quantity: 2,
            notes: "Extra cheese",
            clientTxId: `line-${runId}-1`
          })
        });

        assert.strictEqual(response.status, 201, `Expected 201, got ${response.status}: ${JSON.stringify(payload)}`);
        assert.strictEqual(payload.data.success, true, "Response should indicate success");
        assert.ok(payload.data.line, "Response should include line");
        assert.strictEqual(payload.data.line.productName, "Test Burger", "Product name should match");
        assert.strictEqual(payload.data.line.quantity, 2, "Quantity should match");
        assert.strictEqual(payload.data.line.unitPrice, 15.50, "Unit price should match");
        assert.ok(payload.data.line.id, "Line should have an ID");
      });

      // ============================================
      // TEST 2: POST /sessions/:id/lines - 409 if not active
      // ============================================
      await test("POST /sessions/:id/lines - returns 409 if session is not ACTIVE", async () => {
        const tableId = await createTestTable("L2");
        const sessionId = await createTestSession(tableId, 2); // LOCKED_FOR_PAYMENT (non-ACTIVE)
        const itemId = await getOrCreateTestItem();

        const { response, payload } = await requestJson(`/api/dinein/sessions/${sessionId}/lines?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            itemId: itemId,
            itemName: "Test Item",
            unitPrice: 10.00,
            quantity: 1,
            clientTxId: `line-${runId}-2`
          })
        });

        assert.strictEqual(response.status, 409, "Should return 409 for non-ACTIVE session");
        assert.ok(payload.error, "Error should be present");
        assert.strictEqual(payload.error.code, "NOT_ACTIVE", "Error code should be NOT_ACTIVE");
      });

      // ============================================
      // TEST 3: PATCH /sessions/:id/lines/:lineId - updates line
      // ============================================
      await test("PATCH /sessions/:id/lines/:lineId - updates line", async () => {
        const tableId = await createTestTable("L3");
        const sessionId = await createTestSession(tableId, 1);
        const itemId = await getOrCreateTestItem();

        // First, create a line
        const { payload: createPayload } = await requestJson(`/api/dinein/sessions/${sessionId}/lines?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            itemId: itemId,
            itemName: "Original Name",
            unitPrice: 10.00,
            quantity: 1,
            clientTxId: `line-${runId}-3-create`
          })
        });

        const lineId = createPayload.data.line.id;

        // Now update the line
        const { response, payload } = await requestJson(`/api/dinein/sessions/${sessionId}/lines/${lineId}?outletId=${outletId}`, {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify({
            quantity: 3,
            unitPrice: 12.00,
            notes: "Updated notes",
            clientTxId: `update-line-${runId}-${lineId}`
          })
        });

        assert.strictEqual(response.status, 200, "Should return 200 for successful update");
        assert.strictEqual(payload.data.success, true, "Response should indicate success");
        assert.strictEqual(payload.data.line.quantity, 3, "Quantity should be updated");
        assert.strictEqual(payload.data.line.unitPrice, 12.00, "Unit price should be updated");
        assert.strictEqual(payload.data.line.notes, "Updated notes", "Notes should be updated");
      });

      // ============================================
      // TEST 4: DELETE /sessions/:id/lines/:lineId - removes line
      // ============================================
      await test("DELETE /sessions/:id/lines/:lineId - removes line", async () => {
        const tableId = await createTestTable("L4");
        const sessionId = await createTestSession(tableId, 1);
        const itemId = await getOrCreateTestItem();

        // Create a line to delete
        const { payload: createPayload } = await requestJson(`/api/dinein/sessions/${sessionId}/lines?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            itemId: itemId,
            itemName: "Item To Delete",
            unitPrice: 8.00,
            quantity: 1,
            clientTxId: `line-${runId}-4-create`
          })
        });

        const lineId = createPayload.data.line.id;

        // Delete the line
        const { response } = await requestJson(`/api/dinein/sessions/${sessionId}/lines/${lineId}?outletId=${outletId}`, {
          method: "DELETE",
          headers: authHeaders,
          body: JSON.stringify({
            clientTxId: `delete-line-${runId}-${lineId}`
          })
        });

        assert.strictEqual(response.status, 204, "Should return 204 for successful deletion");
      });

      // ============================================
      // TEST 5: POST /sessions/:id/lock-payment - locks session
      // ============================================
      await test("POST /sessions/:id/lock-payment - locks session for payment", async () => {
        const tableId = await createTestTable("L5");
        const sessionId = await createTestSession(tableId, 1);
        const itemId = await getOrCreateTestItem();

        // Add a line first
        await requestJson(`/api/dinein/sessions/${sessionId}/lines?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            itemId: itemId,
            itemName: "Test Item",
            unitPrice: 20.00,
            quantity: 1,
            clientTxId: `line-${runId}-5`
          })
        });

        const { response, payload } = await requestJson(`/api/dinein/sessions/${sessionId}/lock-payment?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            clientTxId: `lock-${runId}-5`
          })
        });

        assert.strictEqual(response.status, 200, "Should return 200 for successful lock");
        assert.strictEqual(payload.data.success, true, "Response should indicate success");
        assert.strictEqual(payload.data.session.statusId, 2, "Session status should be LOCKED_FOR_PAYMENT (2)");
        assert.ok(payload.data.session.lockedAt, "LockedAt should be set");
        assert.strictEqual(payload.data.session.lineCount, 1, "Line count should be 1");
      });

      // ============================================
      // TEST 6: POST /sessions/:id/finalize-batch - finalizes open lines and syncs snapshot
      // ============================================
      await test("POST /sessions/:id/finalize-batch - finalizes batch and syncs snapshot", async () => {
        const tableId = await createTestTable("L6");
        const sessionId = await createTestSession(tableId, 1);
        const itemId = await getOrCreateTestItem();
        const snapshotId = `snap-${runId}-6`.slice(0, 36);

        await createTestSnapshot(snapshotId, tableId);

        // Persist snapshot link at session level (required for finalize-batch)
        await getDb().execute(
          `UPDATE table_service_sessions
           SET pos_order_snapshot_id = ?
           WHERE id = ? AND company_id = ? AND outlet_id = ?`,
          [snapshotId, sessionId, companyId, outletId]
        );

        await requestJson(`/api/dinein/sessions/${sessionId}/lines?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            itemId,
            itemName: "Batch Item A",
            unitPrice: 11.25,
            quantity: 2,
            clientTxId: `line-${runId}-6-a`
          })
        });

        await requestJson(`/api/dinein/sessions/${sessionId}/lines?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            itemId,
            itemName: "Batch Item A",
            unitPrice: 11.25,
            quantity: 1,
            clientTxId: `line-${runId}-6-b`
          })
        });

        const { response, payload } = await requestJson(`/api/dinein/sessions/${sessionId}/finalize-batch?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            clientTxId: `finalize-${runId}-6`
          })
        });

        assert.strictEqual(response.status, 200, "Should return 200 for successful batch finalize");
        assert.strictEqual(payload.data.success, true, "Response should indicate success");
        assert.strictEqual(payload.data.batchNo, 1, "First finalized batch should be 1");
        assert.ok(payload.data.sessionVersion >= 2, "Session version should increase");

        const [checkpointRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT batch_no FROM table_service_session_checkpoints WHERE session_id = ? AND company_id = ? AND outlet_id = ?`,
          [sessionId, companyId, outletId]
        );
        assert.strictEqual(checkpointRows.length, 1, "Checkpoint row should be created");
        assert.strictEqual(Number(checkpointRows[0].batch_no), 1, "Checkpoint batch no should be 1");

        const [snapshotLineRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT item_id, qty FROM pos_order_snapshot_lines WHERE order_id = ? AND company_id = ? AND outlet_id = ?`,
          [snapshotId, companyId, outletId]
        );
        assert.strictEqual(snapshotLineRows.length, 1, "Duplicate item lines should aggregate into one snapshot row");
        assert.strictEqual(Number(snapshotLineRows[0].qty), 3, "Aggregated quantity should match finalized lines");
      });

      // ============================================
      // TEST 7: POST /sessions/:id/lines/:lineId/adjust - reduces quantity with reason
      // ============================================
      await test("POST /sessions/:id/lines/:lineId/adjust - reduces quantity with reason", async () => {
        const tableId = await createTestTable("L7");
        const sessionId = await createTestSession(tableId, 1);
        const itemId = await getOrCreateTestItem();

        const { payload: createPayload } = await requestJson(`/api/dinein/sessions/${sessionId}/lines?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            itemId,
            itemName: "Adjustable Item",
            unitPrice: 14.00,
            quantity: 3,
            clientTxId: `line-${runId}-7-create`
          })
        });

        const lineId = createPayload.data.line.id;

        const { response, payload } = await requestJson(`/api/dinein/sessions/${sessionId}/lines/${lineId}/adjust?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            clientTxId: `adjust-${runId}-7`,
            action: "REDUCE_QTY",
            qtyDelta: 1,
            reason: "Customer changed mind"
          })
        });

        assert.strictEqual(response.status, 200, "Should return 200 for successful adjustment");
        assert.strictEqual(payload.data.success, true, "Response should indicate success");
        assert.strictEqual(payload.data.line.quantity, 2, "Quantity should be reduced by qtyDelta");
        assert.ok(payload.data.sessionVersion >= 2, "Session version should increase");
      });

      // ============================================
      // TEST 8: POST /sessions/:id/close - closes session
      // ============================================
      await test("POST /sessions/:id/close - closes session", async () => {
        const tableId = await createTestTable("L8");
        const sessionId = await createTestSession(tableId, 1);
        const itemId = await getOrCreateTestItem();
        const snapshotId = `snap-${runId}-8`.slice(0, 36);

        await createTestSnapshot(snapshotId, tableId);

        // Add a line and lock first
        await requestJson(`/api/dinein/sessions/${sessionId}/lines?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            itemId: itemId,
            itemName: "Close Test Item",
            unitPrice: 25.00,
            quantity: 1,
            clientTxId: `line-${runId}-8`
          })
        });

        await requestJson(`/api/dinein/sessions/${sessionId}/lock-payment?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            clientTxId: `lock-${runId}-8`,
            posOrderSnapshotId: snapshotId
          })
        });

        // Now close the session
        const { response, payload } = await requestJson(`/api/dinein/sessions/${sessionId}/close?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            clientTxId: `close-${runId}-8`
          })
        });

        assert.strictEqual(response.status, 200, "Should return 200 for successful close");
        assert.strictEqual(payload.data.success, true, "Response should indicate success");
        assert.strictEqual(payload.data.session.statusId, 3, "Session status should be CLOSED (3)");
        assert.ok(payload.data.session.closedAt, "ClosedAt should be set");
      });

      // ============================================
      // TEST 8b: POST /sessions/:id/close - syncs lines to snapshot and finalizes order
      // ============================================
      await test("POST /sessions/:id/close - syncs lines to pos_order_snapshot_lines from persisted snapshot link", async () => {
        const tableId = await createTestTable("L6B");
        const sessionId = await createTestSession(tableId, 1);
        const itemId = await getOrCreateTestItem();
        const posOrderSnapshotId = `snapshot-${runId}-6b`;

        await createTestSnapshot(posOrderSnapshotId, tableId);

        // Add a line to the session
        await requestJson(`/api/dinein/sessions/${sessionId}/lines?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            itemId: itemId,
            itemName: "Snapshot Test Item",
            unitPrice: 30.00,
            quantity: 2,
            clientTxId: `line-${runId}-6b-1`
          })
        });

        // Lock with posOrderSnapshotId to persist link
        await requestJson(`/api/dinein/sessions/${sessionId}/lock-payment?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            clientTxId: `lock-${runId}-6b`,
            posOrderSnapshotId: posOrderSnapshotId
          })
        });

        // Close the session
        const { response, payload } = await requestJson(`/api/dinein/sessions/${sessionId}/close?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            clientTxId: `close-${runId}-6b`
          })
        });

        assert.strictEqual(response.status, 200, "Should return 200 for successful close");
        assert.strictEqual(payload.data.success, true, "Response should indicate success");

        // Verify session persisted snapshot link
        const [sessionRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT pos_order_snapshot_id FROM table_service_sessions WHERE id = ?`,
          [sessionId]
        );
        assert.strictEqual(sessionRows[0]?.pos_order_snapshot_id, posOrderSnapshotId, "Session should have posOrderSnapshotId");

        // Verify snapshot was finalized
        const [snapshotRows] = await getDb().execute<RowDataPacket[]>(
          `SELECT is_finalized, order_state, order_status FROM pos_order_snapshots WHERE order_id = ?`,
          [posOrderSnapshotId]
        );
        assert.strictEqual(snapshotRows[0]?.is_finalized, 1, "Snapshot should be finalized");
        assert.strictEqual(snapshotRows[0]?.order_state, "CLOSED", "Snapshot order_state should be CLOSED");
        assert.strictEqual(snapshotRows[0]?.order_status, "COMPLETED", "Snapshot order_status should be COMPLETED");

      });

      // ============================================
      // TEST 9: GET /sessions - lists with pagination
      // ============================================
      await test("GET /sessions - lists sessions with pagination", async () => {
        // Create multiple sessions
        for (let i = 0; i < 3; i++) {
          const tableId = await createTestTable(`LIST${i}`);
          await createTestSession(tableId, 1);
        }

        const { response, payload } = await requestJson(`/api/dinein/sessions?outletId=${outletId}&limit=2&offset=0`, {
          method: "GET",
          headers: authHeaders
        });

        assert.strictEqual(response.status, 200, "Should return 200");
        assert.ok(Array.isArray(payload.data?.sessions), "Response should include sessions array");
        assert.strictEqual(payload.data.sessions.length, 2, "Should return 2 sessions per page");
        assert.ok(payload.data.pagination, "Response should include pagination");
        assert.strictEqual(payload.data.pagination.limit, 2, "Pagination limit should be 2");
      });

      // ============================================
      // TEST 10: GET /sessions/:id - returns session with lines and events
      // ============================================
      await test("GET /sessions/:id - returns session with lines", async () => {
        const tableId = await createTestTable("DETAIL");
        const sessionId = await createTestSession(tableId, 1);
        const itemId1 = await getOrCreateTestItem();
        const itemId2 = await getOrCreateTestItem();

        // Add lines to the session
        await requestJson(`/api/dinein/sessions/${sessionId}/lines?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            itemId: itemId1,
            itemName: "Detail Item 1",
            unitPrice: 10.00,
            quantity: 2,
            clientTxId: `line-${runId}-8-1`
          })
        });

        await requestJson(`/api/dinein/sessions/${sessionId}/lines?outletId=${outletId}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            itemId: itemId2,
            itemName: "Detail Item 2",
            unitPrice: 5.00,
            quantity: 1,
            clientTxId: `line-${runId}-8-2`
          })
        });

        const { response, payload } = await requestJson(`/api/dinein/sessions/${sessionId}?outletId=${outletId}`, {
          method: "GET",
          headers: authHeaders
        });

        assert.strictEqual(response.status, 200, "Should return 200");
        assert.strictEqual(payload.data.id, sessionId.toString(), "Session ID should match");
        assert.ok(Array.isArray(payload.data.lines), "Response should include lines array");
        assert.strictEqual(payload.data.lines.length, 2, "Should have 2 lines");
        assert.strictEqual(payload.data.lineCount, 2, "Line count should be 2");
        assert.ok(payload.data.totalAmount, "Total amount should be calculated");
      });

      // ============================================
      // TEST 11: 404 for non-existent session
      // ============================================
      await test("GET /sessions/:id - returns 404 for non-existent session", async () => {
        const nonExistentSessionId = 99999999;

        const { response, payload } = await requestJson(`/api/dinein/sessions/${nonExistentSessionId}?outletId=${outletId}`, {
          method: "GET",
          headers: authHeaders
        });

        assert.strictEqual(response.status, 404, "Should return 404 for non-existent session");
        assert.ok(payload.error, "Error should be present");
        assert.strictEqual(payload.error.code, "NOT_FOUND", "Error code should be NOT_FOUND");
      });

      // ============================================
      // TEST 12: Auth required - 401 without token
      // ============================================
      await test("All endpoints require authentication - returns 401 without token", async () => {
        const tableId = await createTestTable("AUTH");
        const sessionId = await createTestSession(tableId, 1);

        // Test GET /sessions
        const listResponse = await requestJson(`/api/dinein/sessions?outletId=${outletId}`, {
          method: "GET"
        });
        assert.strictEqual(listResponse.response.status, 401, "GET /sessions should require auth");

        // Test GET /sessions/:id
        const getResponse = await requestJson(`/api/dinein/sessions/${sessionId}?outletId=${outletId}`, {
          method: "GET"
        });
        assert.strictEqual(getResponse.response.status, 401, "GET /sessions/:id should require auth");

        // Test POST /sessions/:id/lines
        const postResponse = await requestJson(`/api/dinein/sessions/${sessionId}/lines?outletId=${outletId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId: 1, itemName: "Test", unitPrice: 10, quantity: 1, clientTxId: "test" })
        });
        assert.strictEqual(postResponse.response.status, 401, "POST /lines should require auth");

        // Test POST /sessions/:id/lock-payment
        const lockResponse = await requestJson(`/api/dinein/sessions/${sessionId}/lock-payment?outletId=${outletId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientTxId: "test" })
        });
        assert.strictEqual(lockResponse.response.status, 401, "POST /lock-payment should require auth");

        // Test POST /sessions/:id/close
        const closeResponse = await requestJson(`/api/dinein/sessions/${sessionId}/close?outletId=${outletId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientTxId: "test" })
        });
        assert.strictEqual(closeResponse.response.status, 401, "POST /close should require auth");
      });

    } finally {
      // Cleanup
      for (const snapshotId of createdSnapshotIds) {
        try {
          await getDb().execute(
            `DELETE FROM pos_order_snapshot_lines WHERE order_id = ? AND company_id = ? AND outlet_id = ?`,
            [snapshotId, companyId, outletId]
          );
          await getDb().execute(
            `DELETE FROM pos_order_snapshots WHERE order_id = ? AND company_id = ? AND outlet_id = ?`,
            [snapshotId, companyId, outletId]
          );
        } catch {
          // Ignore cleanup errors
        }
      }

      for (const sessionId of createdSessionIds) {
        try {
          await getDb().execute(
            `DELETE FROM table_service_session_lines WHERE session_id = ?`,
            [sessionId]
          );
          // Note: table_events is append-only with triggers that prevent DELETE
          // We skip deleting events as they serve as audit trail
          await getDb().execute(
            `DELETE FROM table_service_sessions WHERE id = ? AND company_id = ? AND outlet_id = ?`,
            [sessionId, companyId, outletId]
          );
        } catch {
          // Ignore cleanup errors
        }
      }

      for (const tableId of createdTableIds) {
        try {
          await getDb().execute(
            `DELETE FROM table_occupancy WHERE table_id = ? AND company_id = ? AND outlet_id = ?`,
            [tableId, companyId, outletId]
          );
          await getDb().execute(
            `DELETE FROM outlet_tables WHERE id = ? AND company_id = ? AND outlet_id = ?`,
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
