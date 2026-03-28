// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Duplicate Detection Library Tests
 * 
 * Tests for checkDuplicateClientTx function:
 * - No duplicate found
 * - Duplicate found
 * - Transaction connection support
 * 
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { randomUUID } from "node:crypto";
import { loadEnvIfPresent, readEnv } from "../../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDbPool } from "../db";
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { checkDuplicateClientTx, type DuplicateCheckResult } from "./check-duplicate";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("checkDuplicateClientTx", { concurrency: false }, () => {
  let connection: PoolConnection;
  let testUserId = 0;
  let testCompanyId = 0;
  let testOutletId = 0;

  before(async () => {
    const dbPool = getDbPool();
    connection = await dbPool.getConnection();

    // Find test user fixture with company and outlets
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
  // Helper Functions
  // ===========================================================================

  async function insertTestTransaction(clientTxId: string): Promise<number> {
    // client_tx_id is char(36) in the schema, so we use a proper UUID format
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO pos_transactions (
        company_id, outlet_id, cashier_user_id, client_tx_id, 
        status, service_type, trx_at, payload_sha256, payload_hash_version,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), 'test-hash', 2, NOW(), NOW())`,
      [testCompanyId, testOutletId, testUserId, clientTxId]
    );
    
    return result.insertId;
  }

  async function deleteTestTransaction(clientTxId: string): Promise<void> {
    await connection.execute(
      `DELETE FROM pos_transactions WHERE client_tx_id = ? AND company_id = ?`,
      [clientTxId, testCompanyId]
    );
  }

  // ===========================================================================
  // Test Cases
  // ===========================================================================

  describe("No duplicate found", () => {
    test("returns isDuplicate: false for non-existent clientTxId", async () => {
      const nonExistentId = randomUUID();
      
      const result = await checkDuplicateClientTx(
        testCompanyId,
        nonExistentId,
        connection
      );
      
      assert.equal(result.isDuplicate, false, "Should not find duplicate");
      assert.strictEqual(result.existingId, undefined, "existingId should be undefined");
      assert.strictEqual(result.createdAt, undefined, "createdAt should be undefined");
    });

    test("returns isDuplicate: false for non-existent company", async () => {
      const clientTxId = randomUUID();
      
      const result = await checkDuplicateClientTx(
        999999,
        clientTxId,
        connection
      );
      
      assert.equal(result.isDuplicate, false, "Should not find duplicate for non-existent company");
    });
  });

  describe("Duplicate found", () => {
    test("returns isDuplicate: true with correct details when duplicate exists", async () => {
      const clientTxId = randomUUID();
      
      try {
        // Insert a transaction
        const txId = await insertTestTransaction(clientTxId);
        
        // Check for duplicate
        const result = await checkDuplicateClientTx(
          testCompanyId,
          clientTxId,
          connection
        );
        
        assert.equal(result.isDuplicate, true, "Should find duplicate");
        assert.strictEqual(result.existingId, txId, "existingId should match inserted tx");
        assert.ok(result.createdAt instanceof Date, "createdAt should be a Date");
      } finally {
        await deleteTestTransaction(clientTxId);
      }
    });
  });

  describe("Transaction connection support", () => {
    test("uses provided connection when passed", async () => {
      const clientTxId = randomUUID();
      
      try {
        // Insert using the same connection that will be passed to check
        const [insertResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO pos_transactions (
            company_id, outlet_id, cashier_user_id, client_tx_id, 
            status, service_type, trx_at, payload_sha256, payload_hash_version,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), 'test-hash', 2, NOW(), NOW())`,
          [testCompanyId, testOutletId, testUserId, clientTxId]
        );
        
        // Use the same connection for check
        const result = await checkDuplicateClientTx(
          testCompanyId,
          clientTxId,
          connection
        );
        
        assert.equal(result.isDuplicate, true, "Should find duplicate using provided connection");
        assert.strictEqual(result.existingId, insertResult.insertId, "existingId should match");
      } finally {
        await deleteTestTransaction(clientTxId);
      }
    });

    test("works without connection (uses default pool)", async () => {
      const clientTxId = randomUUID();
      
      try {
        // Insert using the shared connection
        await connection.execute<ResultSetHeader>(
          `INSERT INTO pos_transactions (
            company_id, outlet_id, cashier_user_id, client_tx_id, 
            status, service_type, trx_at, payload_sha256, payload_hash_version,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), 'test-hash', 2, NOW(), NOW())`,
          [testCompanyId, testOutletId, testUserId, clientTxId]
        );
        
        // Call without connection - should use default pool
        const result = await checkDuplicateClientTx(
          testCompanyId,
          clientTxId
        );
        
        assert.equal(result.isDuplicate, true, "Should find duplicate using default pool");
      } finally {
        await deleteTestTransaction(clientTxId);
      }
    });
  });

  describe("Interface contract", () => {
    test("returns correct DuplicateCheckResult structure for non-duplicate", async () => {
      const clientTxId = randomUUID();
      
      const result = await checkDuplicateClientTx(
        testCompanyId,
        clientTxId,
        connection
      );
      
      // Verify the result structure
      assert.ok(typeof result.isDuplicate === "boolean", "isDuplicate should be boolean");
      assert.equal(result.isDuplicate, false, "Should not be duplicate");
      assert.strictEqual(result.existingId, undefined, "existingId should be undefined for non-duplicate");
      assert.strictEqual(result.createdAt, undefined, "createdAt should be undefined for non-duplicate");
    });

    test("returns correct DuplicateCheckResult structure for duplicate", async () => {
      const clientTxId = randomUUID();
      
      try {
        await insertTestTransaction(clientTxId);
        
        const result = await checkDuplicateClientTx(
          testCompanyId,
          clientTxId,
          connection
        );
        
        // Verify the result structure
        assert.ok(typeof result.isDuplicate === "boolean", "isDuplicate should be boolean");
        assert.equal(result.isDuplicate, true, "Should be duplicate");
        assert.ok(typeof result.existingId === "number", "existingId should be number when duplicate");
        assert.ok(result.createdAt instanceof Date, "createdAt should be Date when duplicate");
      } finally {
        await deleteTestTransaction(clientTxId);
      }
    });
  });
});
