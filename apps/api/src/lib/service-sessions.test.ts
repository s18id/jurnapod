// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for service-sessions.ts
 * Tests core service session management functions
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDbPool } from "./db";
import {
  getSession,
  listSessions,
  addSessionLine,
  updateSessionLine,
  removeSessionLine,
  lockSessionForPayment,
  closeSession,
  SessionNotFoundError,
  SessionConflictError,
  InvalidSessionStatusError,
  SessionValidationError,
  ServiceSessionStatus,
  type AddSessionLineInput,
  type UpdateSessionLineInput,
  type LockSessionInput,
  type CloseSessionInput,
} from "./service-sessions";

loadEnvIfPresent();

type FixtureContext = {
  companyId: bigint;
  outletId: bigint;
};

async function resolveFixtureContext(): Promise<FixtureContext> {
  const pool = getDbPool();
  const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
  const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT c.id AS company_id, o.id AS outlet_id
     FROM companies c
     INNER JOIN outlets o ON o.company_id = c.id
     WHERE c.code = ? AND o.code = ?
     LIMIT 1`,
    [companyCode, outletCode]
  );

  assert.ok(rows.length > 0, "Fixture company/outlet not found; run seed first");
  return {
    companyId: BigInt(rows[0].company_id),
    outletId: BigInt(rows[0].outlet_id)
  };
}

async function createTestTable(pool: ReturnType<typeof getDbPool>, companyId: bigint, outletId: bigint, runId: string): Promise<bigint> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO outlet_tables (company_id, outlet_id, code, name, zone, capacity, status, status_id)
     VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', 1)`,
    [companyId, outletId, `TST-${runId}`.slice(0, 32), `Test Table ${runId}`, "Test Zone", 4]
  );
  return BigInt(result.insertId);
}

async function createTestSession(pool: ReturnType<typeof getDbPool>, companyId: bigint, outletId: bigint, tableId: bigint, statusId: number = ServiceSessionStatus.ACTIVE): Promise<bigint> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO table_service_sessions (company_id, outlet_id, table_id, status_id, started_at, guest_count, created_at, updated_at, created_by)
     VALUES (?, ?, ?, ?, NOW(), 2, NOW(), NOW(), 'test-user')`,
    [companyId, outletId, tableId, statusId]
  );
  
  const sessionId = BigInt(result.insertId);
  
  // Set table occupancy to OCCUPIED for ACTIVE sessions
  if (statusId === ServiceSessionStatus.ACTIVE) {
    await pool.execute(
      `INSERT INTO table_occupancy (company_id, outlet_id, table_id, status_id, service_session_id, guest_count, created_by)
       VALUES (?, ?, ?, 2, ?, 2, 'test-user')
       ON DUPLICATE KEY UPDATE status_id = 2, service_session_id = VALUES(service_session_id), guest_count = 2`,
      [companyId, outletId, tableId, sessionId]
    );
  }
  
  return sessionId;
}

async function getOrCreateTestItem(pool: ReturnType<typeof getDbPool>, companyId: bigint): Promise<bigint> {
  // Try to find an existing item
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM items WHERE company_id = ? LIMIT 1`,
    [companyId]
  );
  
  if (rows.length > 0) {
    return BigInt(rows[0].id);
  }
  
  // Create a test item if none exists
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO items (company_id, sku, name, item_type, is_active, track_stock, created_at, updated_at)
     VALUES (?, 'TEST-ITEM', 'Test Item', 'PRODUCT', 1, 0, NOW(), NOW())`,
    [companyId]
  );
  
  return BigInt(result.insertId);
}

async function cleanupTestData(pool: ReturnType<typeof getDbPool>, companyId: bigint, outletId: bigint, sessionIds: bigint[], tableIds: bigint[], itemIds: bigint[] = []) {
  // Clean up in reverse order of dependencies
  for (const sessionId of sessionIds) {
    await pool.execute(
      `DELETE FROM table_service_session_lines WHERE session_id = ?`,
      [sessionId]
    );
    // Note: table_events is append-only, cannot DELETE
    // Events will remain as audit trail
  }
  
  for (const sessionId of sessionIds) {
    await pool.execute(
      `DELETE FROM table_service_sessions WHERE id = ? AND company_id = ? AND outlet_id = ?`,
      [sessionId, companyId, outletId]
    );
  }
  
  for (const tableId of tableIds) {
    await pool.execute(
      `DELETE FROM table_occupancy WHERE table_id = ? AND company_id = ? AND outlet_id = ?`,
      [tableId, companyId, outletId]
    );
    await pool.execute(
      `DELETE FROM outlet_tables WHERE id = ? AND company_id = ? AND outlet_id = ?`,
      [tableId, companyId, outletId]
    );
  }
  
  // Clean up test items
  for (const itemId of itemIds) {
    await pool.execute(
      `DELETE FROM items WHERE id = ? AND company_id = ? AND sku = 'TEST-ITEM'`,
      [itemId, companyId]
    );
  }
}

// ============================================================================
// TEST 1: getSession - returns session with lines, 404 if not found
// ============================================================================
test(
  "getSession - returns session with lines when found",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];
    const createdItemIds: bigint[] = [];

    try {
      // Get a real product from the company
      const [productRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM items WHERE company_id = ? LIMIT 1`,
        [companyId]
      );
      const productId = productRows.length > 0 ? productRows[0].id : null;

      if (!productId) {
        // Create a test product if none exists
        const [itemResult] = await pool.execute<ResultSetHeader>(
          `INSERT INTO items (company_id, name, item_type, sku) VALUES (?, ?, 'PRODUCT', ?)`,
          [companyId, `Test Product ${runId}`, `TEST-${runId}`]
        );
        createdItemIds.push(BigInt(itemResult.insertId));
      }

      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);
      
      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      // Add a line to the session
      await pool.execute(
        `INSERT INTO table_service_session_lines (session_id, line_number, product_id, product_name, quantity, unit_price, discount_amount, tax_amount, line_total, is_voided, created_at, updated_at)
         VALUES (?, 1, ?, 'Test Product', 2, 10.00, 0, 0, 20.00, 0, NOW(), NOW())`,
        [sessionId, productId ?? createdItemIds[0]]
      );

      const session = await getSession(companyId, outletId, sessionId);

      assert.ok(session, "Session should be found");
      assert.equal(session?.id, sessionId, "Session ID should match");
      assert.equal(session?.companyId, companyId, "Company ID should match");
      assert.equal(session?.outletId, outletId, "Outlet ID should match");
      assert.equal(session?.tableId, tableId, "Table ID should match");
      assert.equal(session?.statusId, ServiceSessionStatus.ACTIVE, "Status should be ACTIVE");
      assert.equal(session?.lines.length, 1, "Session should have 1 line");
      assert.equal(session?.lines[0].productName, "Test Product", "Line product name should match");
      assert.equal(session?.lines[0].quantity, 2, "Line quantity should match");
      assert.equal(session?.lines[0].lineTotal, 20.00, "Line total should match");
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds, createdItemIds);
    }
  }
);

test(
  "getSession - returns null when session not found",
  { concurrency: false, timeout: 30000 },
  async () => {
    const { companyId, outletId } = await resolveFixtureContext();
    const nonExistentSessionId = BigInt(999999999);

    const session = await getSession(companyId, outletId, nonExistentSessionId);

    assert.strictEqual(session, null, "Should return null for non-existent session");
  }
);

// ============================================================================
// TEST 2: listSessions - filters by status, pagination works
// ============================================================================
test(
  "listSessions - filters by status and pagination works",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];

    try {
      // Create 3 tables and sessions
      for (let i = 0; i < 3; i++) {
        const tableId = await createTestTable(pool, companyId, outletId, `${runId}-${i}`);
        createdTableIds.push(tableId);
        
        const statusId = i === 0 ? ServiceSessionStatus.CLOSED : ServiceSessionStatus.ACTIVE;
        const sessionId = await createTestSession(pool, companyId, outletId, tableId, statusId);
        createdSessionIds.push(sessionId);
      }

      // Test 1: List all sessions
      const allResult = await listSessions({
        companyId,
        outletId,
        limit: 10,
        offset: 0
      });

      assert.ok(allResult.sessions.length >= 3, "Should return at least 3 sessions");
      assert.ok(allResult.total >= 3, "Total should be at least 3");

      // Test 2: Filter by ACTIVE status
      const activeResult = await listSessions({
        companyId,
        outletId,
        limit: 10,
        offset: 0,
        statusId: ServiceSessionStatus.ACTIVE
      });

      assert.ok(activeResult.sessions.every(s => s.statusId === ServiceSessionStatus.ACTIVE), 
        "All sessions should be ACTIVE");

      // Test 3: Filter by CLOSED status
      const closedResult = await listSessions({
        companyId,
        outletId,
        limit: 10,
        offset: 0,
        statusId: ServiceSessionStatus.CLOSED
      });

      assert.ok(closedResult.sessions.every(s => s.statusId === ServiceSessionStatus.CLOSED), 
        "All sessions should be CLOSED");
      assert.ok(closedResult.sessions.length >= 1, "Should have at least 1 closed session");

      // Test 4: Pagination
      const pageResult = await listSessions({
        companyId,
        outletId,
        limit: 2,
        offset: 0
      });

      assert.equal(pageResult.sessions.length, 2, "Should return exactly 2 sessions per page");
      assert.equal(pageResult.limit, 2, "Limit should be 2");
      assert.equal(pageResult.offset, 0, "Offset should be 0");
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

// ============================================================================
// TEST 3: addSessionLine - creates line, checks ACTIVE status, logs event
// ============================================================================
test(
  "addSessionLine - creates line in ACTIVE session and logs event",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];
    const createdItemIds: bigint[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);
      
      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      const productId = await getOrCreateTestItem(pool, companyId);
      if (productId > 0) {
        createdItemIds.push(productId);
      }

      const input: AddSessionLineInput = {
        companyId,
        outletId,
        sessionId,
        productId,
        productName: "Burger",
        productSku: "BRG-001",
        quantity: 2,
        unitPrice: 15.50,
        discountAmount: 1.00,
        taxAmount: 2.90,
        notes: "Extra cheese",
        createdBy: "test-user",
        clientTxId: `add-line-${runId}`
      };

      const line = await addSessionLine(input);

      assert.ok(line.id > 0, "Line should have valid ID");
      assert.equal(line.sessionId, sessionId, "Line session ID should match");
      assert.equal(line.productId, productId, "Product ID should match");
      assert.equal(line.productName, "Burger", "Product name should match");
      assert.equal(line.productSku, "BRG-001", "Product SKU should match");
      assert.equal(line.quantity, 2, "Quantity should match");
      assert.equal(line.unitPrice, 15.50, "Unit price should match");
      assert.equal(line.discountAmount, 1.00, "Discount amount should match");
      assert.equal(line.taxAmount, 2.90, "Tax amount should match");
      // lineTotal = (2 * 15.50) - 1.00 + 2.90 = 31.00 - 1.00 + 2.90 = 32.90
      assert.equal(line.lineTotal, 32.90, "Line total should be calculated correctly");
      assert.equal(line.notes, "Extra cheese", "Notes should match");
      assert.equal(line.isVoided, false, "Line should not be voided");

      // Verify event was logged
      const [eventRows] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM table_events WHERE service_session_id = ? AND client_tx_id = ?`,
        [sessionId, input.clientTxId]
      );

      assert.equal(eventRows.length, 1, "Should have one event logged");
      assert.equal(eventRows[0].event_type_id, 9, "Event type should be SESSION_LINE_ADDED (9)");
      const eventData = JSON.parse(eventRows[0].event_data);
      assert.equal(eventData.productName, "Burger", "Event data should include product name");
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds, createdItemIds);
    }
  }
);

// ============================================================================
// TEST 4: addSessionLine idempotency - same clientTxId returns existing line
// ============================================================================
test(
  "addSessionLine - idempotent with same clientTxId",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];
    const createdItemIds: bigint[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);
      
      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      const productId = await getOrCreateTestItem(pool, companyId);
      if (productId > 0) {
        createdItemIds.push(productId);
      }

      const clientTxId = `idempotent-${runId}`;

      const input: AddSessionLineInput = {
        companyId,
        outletId,
        sessionId,
        productId,
        productName: "Fries",
        quantity: 1,
        unitPrice: 5.00,
        createdBy: "test-user",
        clientTxId
      };

      // First call
      const line1 = await addSessionLine(input);
      
      // Second call with same clientTxId
      const line2 = await addSessionLine(input);

      assert.equal(line1.id, line2.id, "Should return same line ID");
      assert.equal(line1.productName, line2.productName, "Should return same product");

      // Verify only one line exists
      const [lineRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM table_service_session_lines WHERE session_id = ?`,
        [sessionId]
      );
      assert.equal(lineRows[0].count, 1, "Should have only one line in database");
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds, createdItemIds);
    }
  }
);

test(
  "addSessionLine - idempotent replay returns original line even after newer lines",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];
    const createdItemIds: bigint[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);

      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      const productId = await getOrCreateTestItem(pool, companyId);
      if (productId > 0n) {
        createdItemIds.push(productId);
      }

      const txA = `line-a-${runId}`;
      const txB = `line-b-${runId}`;

      const lineA = await addSessionLine({
        companyId,
        outletId,
        sessionId,
        productId,
        productName: "Original A",
        quantity: 1,
        unitPrice: 10,
        createdBy: "test-user",
        clientTxId: txA,
      });

      const lineB = await addSessionLine({
        companyId,
        outletId,
        sessionId,
        productId,
        productName: "Later B",
        quantity: 2,
        unitPrice: 20,
        createdBy: "test-user",
        clientTxId: txB,
      });

      assert.notEqual(lineA.id, lineB.id, "Second line should be different line");

      const replayA = await addSessionLine({
        companyId,
        outletId,
        sessionId,
        productId,
        productName: "Mutated Name",
        quantity: 99,
        unitPrice: 999,
        createdBy: "test-user",
        clientTxId: txA,
      });

      assert.equal(replayA.id, lineA.id, "Replay must return original line for txA");
      assert.equal(replayA.productName, lineA.productName, "Replay must return original payload data");
      assert.equal(replayA.quantity, lineA.quantity, "Replay must keep original quantity");
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds, createdItemIds);
    }
  }
);

// ============================================================================
// TEST 5: updateSessionLine - updates quantity/price, recalculates total
// ============================================================================
test(
  "updateSessionLine - updates line and recalculates total",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];
    const createdItemIds: bigint[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);
      
      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      const productId = await getOrCreateTestItem(pool, companyId);
      if (productId > 0) {
        createdItemIds.push(productId);
      }

      // Create initial line
      const [lineResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO table_service_session_lines (session_id, line_number, product_id, product_name, quantity, unit_price, discount_amount, tax_amount, line_total, is_voided, created_at, updated_at)
         VALUES (?, 1, ?, 'Original Product', 1, 10.00, 0, 0, 10.00, 0, NOW(), NOW())`,
        [sessionId, productId]
      );
      const lineId = BigInt(lineResult.insertId);

      const input: UpdateSessionLineInput = {
        companyId,
        outletId,
        sessionId,
        lineId,
        quantity: 3,
        unitPrice: 12.00,
        notes: "Updated notes",
        updatedBy: "test-user",
        clientTxId: `update-line-${runId}`
      };

      const updatedLine = await updateSessionLine(input);

      assert.equal(updatedLine.id, lineId, "Line ID should match");
      assert.equal(updatedLine.quantity, 3, "Quantity should be updated");
      assert.equal(updatedLine.unitPrice, 12.00, "Unit price should be updated");
      assert.equal(updatedLine.notes, "Updated notes", "Notes should be updated");
      // lineTotal = 3 * 12.00 = 36.00
      assert.equal(updatedLine.lineTotal, 36.00, "Line total should be recalculated");
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds, createdItemIds);
    }
  }
);

// ============================================================================
// TEST 6: removeSessionLine - deletes line, logs event
// ============================================================================
test(
  "removeSessionLine - deletes line and logs event",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];
    const createdItemIds: bigint[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);
      
      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      const productId = await getOrCreateTestItem(pool, companyId);
      if (productId > 0) {
        createdItemIds.push(productId);
      }

      // Create line to remove
      const [lineResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO table_service_session_lines (session_id, line_number, product_id, product_name, quantity, unit_price, discount_amount, tax_amount, line_total, is_voided, created_at, updated_at)
         VALUES (?, 1, ?, 'Product To Remove', 2, 8.00, 0, 0, 16.00, 0, NOW(), NOW())`,
        [sessionId, productId]
      );
      const lineId = BigInt(lineResult.insertId);

      const result = await removeSessionLine({
        companyId,
        outletId,
        sessionId,
        lineId,
        updatedBy: "test-user",
        clientTxId: `remove-line-${runId}`
      });

      assert.equal(result.success, true, "Remove should succeed");
      assert.equal(result.lineId, lineId, "Should return deleted line ID");

      // Verify line was deleted
      const [lineRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM table_service_session_lines WHERE id = ?`,
        [lineId]
      );
      assert.equal(lineRows[0].count, 0, "Line should be deleted from database");

      // Verify event was logged
      const [eventRows] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM table_events WHERE service_session_id = ? AND client_tx_id = ?`,
        [sessionId, `remove-line-${runId}`]
      );
      assert.equal(eventRows.length, 1, "Should have one event logged");
      assert.equal(eventRows[0].event_type_id, 11, "Event type should be SESSION_LINE_REMOVED (11)");
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds, createdItemIds);
    }
  }
);

// ============================================================================
// TEST 7: lockSessionForPayment - ACTIVE→LOCKED transition
// ============================================================================
test(
  "lockSessionForPayment - transitions from ACTIVE to LOCKED_FOR_PAYMENT",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);
      
      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      const input: LockSessionInput = {
        companyId,
        outletId,
        sessionId,
        clientTxId: `lock-${runId}`,
        updatedBy: "test-user"
      };

      const lockedSession = await lockSessionForPayment(input);

      assert.equal(lockedSession.id, sessionId, "Session ID should match");
      assert.equal(lockedSession.statusId, ServiceSessionStatus.LOCKED_FOR_PAYMENT, "Status should be LOCKED_FOR_PAYMENT");
      assert.ok(lockedSession.lockedAt !== null, "LockedAt should be set");

      // Verify event was logged
      const [eventRows] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM table_events WHERE service_session_id = ? AND client_tx_id = ?`,
        [sessionId, `lock-${runId}`]
      );
      assert.equal(eventRows.length, 1, "Should have one event logged");
      assert.equal(eventRows[0].event_type_id, 12, "Event type should be SESSION_LOCKED (12)");
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

// ============================================================================
// TEST 8: lockSessionForPayment - rejects if not ACTIVE (409)
// ============================================================================
test(
  "lockSessionForPayment - rejects if session is not ACTIVE",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);
      
      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.CLOSED);
      createdSessionIds.push(sessionId);

      const input: LockSessionInput = {
        companyId,
        outletId,
        sessionId,
        clientTxId: `lock-fail-${runId}`,
        updatedBy: "test-user"
      };

      await assert.rejects(
        async () => lockSessionForPayment(input),
        (error: unknown) => {
          assert.ok(error instanceof InvalidSessionStatusError, "Should throw InvalidSessionStatusError");
          const err = error as InvalidSessionStatusError;
          assert.equal(err.currentStatus, ServiceSessionStatus.CLOSED, "Error should indicate CLOSED status");
          assert.ok(Array.isArray(err.expectedStatus) || err.expectedStatus === ServiceSessionStatus.ACTIVE, 
            "Error should indicate ACTIVE is expected");
          return true;
        }
      );
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

// ============================================================================
// TEST 9: closeSession - LOCKED→CLOSED, finalizes order, releases occupancy
// ============================================================================
test(
  "closeSession - transitions from LOCKED_FOR_PAYMENT to CLOSED and releases occupancy",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];
    const snapshotId = `snap-${runId}`.slice(0, 36);

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);
      
      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.LOCKED_FOR_PAYMENT);
      createdSessionIds.push(sessionId);

      const nowTs = Date.now();
      await pool.execute(
        `INSERT INTO pos_order_snapshots
         (order_id, company_id, outlet_id, service_type, order_state, order_status, is_finalized, paid_amount, opened_at, opened_at_ts, updated_at, updated_at_ts)
         VALUES (?, ?, ?, 'DINE_IN', 'OPEN', 'OPEN', 0, 0, NOW(), ?, NOW(), ?)`,
        [snapshotId, companyId, outletId, nowTs, nowTs]
      );

      // Update session to be locked with persisted snapshot link
      await pool.execute(
        `UPDATE table_service_sessions
         SET status_id = ?,
             locked_at = NOW(),
             pos_order_snapshot_id = ?
         WHERE id = ?`,
        [ServiceSessionStatus.LOCKED_FOR_PAYMENT, snapshotId, sessionId]
      );

      const input: CloseSessionInput = {
        companyId,
        outletId,
        sessionId,
        clientTxId: `close-${runId}`,
        updatedBy: "test-user"
      };

      const closedSession = await closeSession(input);

      assert.equal(closedSession.id, sessionId, "Session ID should match");
      assert.equal(closedSession.statusId, ServiceSessionStatus.CLOSED, "Status should be CLOSED");
      assert.ok(closedSession.closedAt !== null, "ClosedAt should be set");

      // Verify table occupancy was released
      const [occupancyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT status_id, service_session_id FROM table_occupancy WHERE table_id = ? AND company_id = ? AND outlet_id = ?`,
        [tableId, companyId, outletId]
      );
      
      if (occupancyRows.length > 0) {
        assert.equal(occupancyRows[0].status_id, 1, "Occupancy should be AVAILABLE (1)");
        assert.equal(occupancyRows[0].service_session_id, null, "Service session ID should be cleared");
      }

      // Verify event was logged
      const [eventRows] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM table_events WHERE service_session_id = ? AND client_tx_id = ?`,
        [sessionId, `close-${runId}`]
      );
      assert.equal(eventRows.length, 1, "Should have one event logged");
      assert.equal(eventRows[0].event_type_id, 13, "Event type should be SESSION_CLOSED (13)");
    } finally {
      await pool.execute(
        `DELETE FROM pos_order_snapshot_lines WHERE order_id = ? AND company_id = ? AND outlet_id = ?`,
        [snapshotId, companyId, outletId]
      );
      await pool.execute(
        `DELETE FROM pos_order_snapshots WHERE order_id = ? AND company_id = ? AND outlet_id = ?`,
        [snapshotId, companyId, outletId]
      );
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

// ============================================================================
// TEST 10: closeSession - ACTIVE→CLOSED with snapshot
// ============================================================================
test(
  "closeSession - transitions from ACTIVE to CLOSED with snapshot",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];
    const snapshotId = `snap-active-${runId}`.slice(0, 36);

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);
      
      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      // Create snapshot for the session (required for closing)
      const nowTs = Date.now();
      await pool.execute(
        `INSERT INTO pos_order_snapshots
         (order_id, company_id, outlet_id, service_type, order_state, order_status, is_finalized, paid_amount, opened_at, opened_at_ts, updated_at, updated_at_ts)
         VALUES (?, ?, ?, 'DINE_IN', 'OPEN', 'OPEN', 0, 0, NOW(), ?, NOW(), ?)`,
        [snapshotId, companyId, outletId, nowTs, nowTs]
      );

      // Link snapshot to session (required for close invariant)
      await pool.execute(
        `UPDATE table_service_sessions
         SET pos_order_snapshot_id = ?
         WHERE id = ?`,
        [snapshotId, sessionId]
      );

      const input: CloseSessionInput = {
        companyId,
        outletId,
        sessionId,
        clientTxId: `close-active-${runId}`,
        updatedBy: "test-user"
      };

      const closedSession = await closeSession(input);

      assert.equal(closedSession.statusId, ServiceSessionStatus.CLOSED, "Status should be CLOSED");
      assert.ok(closedSession.closedAt !== null, "ClosedAt should be set");
    } finally {
      await pool.execute(
        `DELETE FROM pos_order_snapshot_lines WHERE order_id = ? AND company_id = ? AND outlet_id = ?`,
        [snapshotId, companyId, outletId]
      );
      await pool.execute(
        `DELETE FROM pos_order_snapshots WHERE order_id = ? AND company_id = ? AND outlet_id = ?`,
        [snapshotId, companyId, outletId]
      );
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

// ============================================================================
// TEST 10b: closeSession - snapshot lines have correct timestamp semantics (Story 17.3)
// This test exercises syncSnapshotLinesFromSession through the closeSession path
// and verifies the remaining snapshot line timestamp semantics:
// - updated_at_ts: snapshot freshness derived from source line updated_at
// ============================================================================
test(
  "closeSession - snapshot lines derive freshness from source lines (Story 17.3 / 18.2)",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];
    const snapshotId = `snap-ts-${runId}`.slice(0, 36);

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);

      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      // Create and link a snapshot
      const nowTs = Date.now();
      await pool.execute(
        `INSERT INTO pos_order_snapshots
         (order_id, company_id, outlet_id, service_type, order_state, order_status, is_finalized, paid_amount, opened_at, opened_at_ts, updated_at, updated_at_ts)
         VALUES (?, ?, ?, 'DINE_IN', 'OPEN', 'OPEN', 0, 0, NOW(), ?, NOW(), ?)`,
        [snapshotId, companyId, outletId, nowTs, nowTs]
      );

      // Update session to be ACTIVE with snapshot link (simulating lock being called)
      await pool.execute(
        `UPDATE table_service_sessions
         SET pos_order_snapshot_id = ?
         WHERE id = ?`,
        [snapshotId, sessionId]
      );

      // Add a session line (this is what will be synced to snapshot lines)
      const productId = await getOrCreateTestItem(pool, companyId);
      const sourceLineUpdatedAt = new Date("2026-03-20T10:15:00.000Z");
      await pool.execute(
        `INSERT INTO table_service_session_lines
          (session_id, line_number, product_id, product_name, product_sku, quantity, unit_price, discount_amount, tax_amount, line_total, is_voided, created_at, updated_at)
         VALUES (?, 1, ?, 'Test Product', 'TEST-SKU', 2, 15.00, 0, 0, 30.00, 0, NOW(), ?)`,
        [sessionId, productId, sourceLineUpdatedAt]
      );

      // Close the session - this triggers syncSnapshotLinesFromSession internally
      const input: CloseSessionInput = {
        companyId,
        outletId,
        sessionId,
        clientTxId: `close-ts-${runId}`,
        updatedBy: "test-user"
      };

      const closedSession = await closeSession(input);

      assert.equal(closedSession.id, sessionId, "Session ID should match");
      assert.equal(closedSession.statusId, ServiceSessionStatus.CLOSED, "Status should be CLOSED");

      // Verify the retained snapshot line timestamp semantics
      const [lineRows] = await pool.execute<RowDataPacket[]>(
        `SELECT updated_at_ts
         FROM pos_order_snapshot_lines
         WHERE order_id = ? AND company_id = ? AND outlet_id = ?`,
        [snapshotId, companyId, outletId]
      );

      assert.ok(lineRows.length > 0, "Should have created snapshot lines via syncSnapshotLinesFromSession");

      const { updated_at_ts } = lineRows[0];

      const storedUpdatedAtTs = Number(updated_at_ts);
      const [expectedRows] = await pool.execute<RowDataPacket[]>(
        `SELECT UNIX_TIMESTAMP(?) * 1000 AS expected_updated_at_ts`,
        [sourceLineUpdatedAt]
      );
      const expectedUpdatedAtTs = Number(expectedRows[0].expected_updated_at_ts);

      // updated_at_ts is derived from the latest source line updated_at
      assert.ok(
        Math.abs(storedUpdatedAtTs - expectedUpdatedAtTs) < 1000,
        `updated_at_ts (${storedUpdatedAtTs}) should reflect source line freshness (~${expectedUpdatedAtTs})`
      );

    } finally {
      await pool.execute(
        `DELETE FROM pos_order_snapshot_lines WHERE order_id = ? AND company_id = ? AND outlet_id = ?`,
        [snapshotId, companyId, outletId]
      );
      await pool.execute(
        `DELETE FROM pos_order_snapshots WHERE order_id = ? AND company_id = ? AND outlet_id = ?`,
        [snapshotId, companyId, outletId]
      );
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

// ============================================================================
// TEST 11: closeSession - rejects if already closed
// ============================================================================
test(
  "closeSession - rejects if session is already CLOSED",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);
      
      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.CLOSED);
      createdSessionIds.push(sessionId);

      // Update to closed
      await pool.execute(
        `UPDATE table_service_sessions SET status_id = ?, closed_at = NOW() WHERE id = ?`,
        [ServiceSessionStatus.CLOSED, sessionId]
      );

      const input: CloseSessionInput = {
        companyId,
        outletId,
        sessionId,
        clientTxId: `close-fail-${runId}`,
        updatedBy: "test-user"
      };

      await assert.rejects(
        async () => closeSession(input),
        (error: unknown) => {
          assert.ok(error instanceof InvalidSessionStatusError, "Should throw InvalidSessionStatusError");
          const err = error as InvalidSessionStatusError;
          assert.equal(err.currentStatus, ServiceSessionStatus.CLOSED, "Error should indicate CLOSED status");
          return true;
        }
      );
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

// ============================================================================
// TEST 12: Tenant isolation - wrong company/outlet returns null/404
// ============================================================================
test(
  "Tenant isolation - wrong company returns null for getSession",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);
      
      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      // Try to access with wrong company
      const wrongCompanyId = companyId + BigInt(999999);
      const session = await getSession(wrongCompanyId, outletId, sessionId);
      
      assert.strictEqual(session, null, "Should return null for wrong company");
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

test(
  "Tenant isolation - wrong outlet returns null for getSession",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);
      
      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      // Try to access with wrong outlet
      const wrongOutletId = outletId + BigInt(999999);
      const session = await getSession(companyId, wrongOutletId, sessionId);
      
      assert.strictEqual(session, null, "Should return null for wrong outlet");
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

test(
  "Tenant isolation - wrong company returns empty list for listSessions",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);
      
      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      // Try to list with wrong company
      const wrongCompanyId = companyId + BigInt(999999);
      const result = await listSessions({
        companyId: wrongCompanyId,
        outletId,
        limit: 10,
        offset: 0
      });
      
      assert.equal(result.sessions.length, 0, "Should return empty list for wrong company");
      assert.equal(result.total, 0, "Total should be 0 for wrong company");
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

test(
  "Tenant isolation - addSessionLine throws SessionNotFoundError for wrong company",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);
      
      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      // Try to add line with wrong company
      const wrongCompanyId = companyId + BigInt(999999);
      
      await assert.rejects(
        async () => addSessionLine({
          companyId: wrongCompanyId,
          outletId,
          sessionId,
          productId: BigInt(100),
          productName: "Test",
          quantity: 1,
          unitPrice: 10.00,
          createdBy: "test-user",
          clientTxId: `tenant-test-${runId}`
        }),
        (error: unknown) => {
          assert.ok(error instanceof SessionNotFoundError, "Should throw SessionNotFoundError");
          return true;
        }
      );
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

test(
  "addSessionLine - throws InvalidSessionStatusError when session is not ACTIVE",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);
      
      // Create a LOCKED session
      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.LOCKED_FOR_PAYMENT);
      createdSessionIds.push(sessionId);

      await assert.rejects(
        async () => addSessionLine({
          companyId,
          outletId,
          sessionId,
          productId: BigInt(100),
          productName: "Test",
          quantity: 1,
          unitPrice: 10.00,
          createdBy: "test-user",
          clientTxId: `add-line-locked-${runId}`
        }),
        (error: unknown) => {
          assert.ok(error instanceof InvalidSessionStatusError, "Should throw InvalidSessionStatusError");
          return true;
        }
      );
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

// ============================================================================
// TEST 13: addSessionLine - validates product exists and belongs to company
// ============================================================================
test(
  "addSessionLine - throws SessionValidationError for non-existent product",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);

      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      // Use a non-existent product ID
      const nonExistentProductId = BigInt(999999999);

      await assert.rejects(
        async () => addSessionLine({
          companyId,
          outletId,
          sessionId,
          productId: nonExistentProductId,
          productName: "Non-existent Product",
          quantity: 1,
          unitPrice: 10.00,
          createdBy: "test-user",
          clientTxId: `add-line-invalid-product-${runId}`
        }),
        (error: unknown) => {
          assert.ok(error instanceof SessionValidationError, "Should throw SessionValidationError");
          assert.equal((error as SessionValidationError).message, "Product not found or not accessible", "Error message should match");
          return true;
        }
      );
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

test(
  "addSessionLine - throws SessionValidationError for product from different company",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);

      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      // Create a product for a different company
      const [differentCompanyResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO companies (code, name, created_at, updated_at)
         VALUES (?, ?, NOW(), NOW())`,
        [`DIFF-COMP-${runId}`, `Different Company ${runId}`]
      );
      const differentCompanyId = BigInt(differentCompanyResult.insertId);

      const [differentProductResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, sku, name, item_type, is_active, track_stock, created_at, updated_at)
         VALUES (?, ?, 'Other Company Product', 'PRODUCT', 1, 0, NOW(), NOW())`,
        [differentCompanyId, `DIFF-PROD-${runId}`]
      );
      const differentProductId = BigInt(differentProductResult.insertId);

      try {
        await assert.rejects(
          async () => addSessionLine({
            companyId,
            outletId,
            sessionId,
            productId: differentProductId,
            productName: "Other Company Product",
            quantity: 1,
            unitPrice: 10.00,
            createdBy: "test-user",
            clientTxId: `add-line-wrong-company-${runId}`
          }),
          (error: unknown) => {
            assert.ok(error instanceof SessionValidationError, "Should throw SessionValidationError");
            assert.equal((error as SessionValidationError).message, "Product not found or not accessible", "Error message should match");
            return true;
          }
        );
      } finally {
        // Cleanup different company's data
        await pool.execute(
          `DELETE FROM items WHERE id = ? AND company_id = ?`,
          [differentProductId, differentCompanyId]
        );
        await pool.execute(
          `DELETE FROM companies WHERE id = ?`,
          [differentCompanyId]
        );
      }
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

// Test: Idempotency replay is scoped by clientTxId per outlet (duplicate in other session is conflict)
test(
  "addSessionLine - duplicate clientTxId in different session throws conflict",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];

    try {
      // Create two tables and two sessions
      const tableId1 = await createTestTable(pool, companyId, outletId, `${runId}-A`);
      createdTableIds.push(tableId1);
      const tableId2 = await createTestTable(pool, companyId, outletId, `${runId}-B`);
      createdTableIds.push(tableId2);

      const sessionId1 = await createTestSession(pool, companyId, outletId, tableId1, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId1);
      const sessionId2 = await createTestSession(pool, companyId, outletId, tableId2, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId2);

      const productId = await getOrCreateTestItem(pool, companyId);
      const clientTxId = `scoped-${runId}`;

      // Add line to session 1
      const line1 = await addSessionLine({
        companyId,
        outletId,
        sessionId: sessionId1,
        productId,
        productName: "Session 1 Item",
        quantity: 1,
        unitPrice: 10.00,
        createdBy: "test-user",
        clientTxId
      });

      // Same clientTxId in a different session should fail as conflict
      await assert.rejects(
        async () => addSessionLine({
          companyId,
          outletId,
          sessionId: sessionId2,
          productId,
          productName: "Session 2 Item",
          quantity: 2,
          unitPrice: 20.00,
          createdBy: "test-user",
          clientTxId
        }),
        (error: unknown) => {
          assert.ok(error instanceof SessionConflictError, "Should throw SessionConflictError");
          return true;
        }
      );

      // Retry to session 1 with same clientTxId - should return existing line (idempotency replay)
      const line1Replay = await addSessionLine({
        companyId,
        outletId,
        sessionId: sessionId1,
        productId,
        productName: "Different Name", // Should be ignored due to idempotency
        quantity: 99, // Should be ignored due to idempotency
        unitPrice: 999.00, // Should be ignored due to idempotency
        createdBy: "test-user",
        clientTxId
      });

      assert.strictEqual(line1.id, line1Replay.id, "Replay should return same line for same session");
      assert.strictEqual(line1Replay.productName, "Session 1 Item", "Replay should return original data");
      assert.strictEqual(line1Replay.quantity, 1, "Replay should return original quantity");
    } finally {
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

// Test: Lock retry preserves existing snapshot link
test(
  "lockSessionForPayment - retry preserves existing snapshot link",
  { concurrency: false, timeout: 30000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdSessionIds: bigint[] = [];
    const createdTableIds: bigint[] = [];
    const createdSnapshotIds: string[] = [];

    try {
      const tableId = await createTestTable(pool, companyId, outletId, runId);
      createdTableIds.push(tableId);

      const sessionId = await createTestSession(pool, companyId, outletId, tableId, ServiceSessionStatus.ACTIVE);
      createdSessionIds.push(sessionId);

      // Create snapshot
      const snapshotId = `snap-${runId}`;
      const nowTs = Date.now();
      await pool.execute(
        `INSERT INTO pos_order_snapshots (order_id, company_id, outlet_id, service_type, order_state, order_status, is_finalized, opened_at, opened_at_ts, updated_at, updated_at_ts)
         VALUES (?, ?, ?, 'DINE_IN', 'OPEN', 'OPEN', 0, NOW(), ?, NOW(), ?)`,
        [snapshotId, companyId, outletId, nowTs, nowTs]
      );
      createdSnapshotIds.push(snapshotId);

      const clientTxId = `lock-${runId}`;

      // First lock with snapshot
      const firstLock = await lockSessionForPayment({
        companyId,
        outletId,
        sessionId,
        clientTxId,
        posOrderSnapshotId: snapshotId,
        updatedBy: "test-user"
      });

      assert.strictEqual(firstLock.statusId, ServiceSessionStatus.LOCKED_FOR_PAYMENT, "Session should be locked");

      // Verify snapshot is linked
      const [rows1] = await pool.execute<RowDataPacket[]>(
        `SELECT pos_order_snapshot_id FROM table_service_sessions WHERE id = ?`,
        [sessionId]
      );
      assert.strictEqual(rows1[0]?.pos_order_snapshot_id, snapshotId, "Snapshot should be linked after first lock");

      // Retry lock with SAME clientTxId but WITHOUT snapshot - should be idempotent and preserve link
      const secondLock = await lockSessionForPayment({
        companyId,
        outletId,
        sessionId,
        clientTxId, // Same ID for idempotency
        // posOrderSnapshotId omitted - should preserve existing link
        updatedBy: "test-user"
      });

      assert.strictEqual(secondLock.statusId, ServiceSessionStatus.LOCKED_FOR_PAYMENT, "Session should remain locked");

      // Verify snapshot link is preserved
      const [rows2] = await pool.execute<RowDataPacket[]>(
        `SELECT pos_order_snapshot_id FROM table_service_sessions WHERE id = ?`,
        [sessionId]
      );
      assert.strictEqual(rows2[0]?.pos_order_snapshot_id, snapshotId, "Snapshot link should be preserved on idempotent retry without snapshot");

    } finally {
      // Cleanup snapshots
      for (const snapId of createdSnapshotIds) {
        await pool.execute(
          `DELETE FROM pos_order_snapshot_lines WHERE order_id = ? AND company_id = ? AND outlet_id = ?`,
          [snapId, companyId, outletId]
        );
        await pool.execute(
          `DELETE FROM pos_order_snapshots WHERE order_id = ? AND company_id = ? AND outlet_id = ?`,
          [snapId, companyId, outletId]
        );
      }
      await cleanupTestData(pool, companyId, outletId, createdSessionIds, createdTableIds);
    }
  }
);

// Close database pool after all tests
test.after(async () => {
  await closeDbPool();
});
