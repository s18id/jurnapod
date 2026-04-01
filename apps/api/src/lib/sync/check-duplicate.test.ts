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
import { closeDbPool, getDb } from "../db";
import type { KyselySchema } from "@/lib/db";
import { sql } from "kysely";
import { checkDuplicateClientTx, type DuplicateCheckResult } from "./check-duplicate";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("checkDuplicateClientTx", { concurrency: false }, () => {
  let db: KyselySchema;
  let testUserId = 0;
  let testCompanyId = 0;
  let testOutletId = 0;

  before(async () => {
    db = getDb();

    // Find test user fixture - global owner has outlet_id = NULL
    const userRows = await sql`
      SELECT u.id AS user_id, u.company_id
      FROM users u
      INNER JOIN companies c ON c.id = u.company_id
      INNER JOIN user_role_assignments ura ON ura.user_id = u.id
      WHERE c.code = ${TEST_COMPANY_CODE}
        AND u.email = ${TEST_OWNER_EMAIL}
        AND u.is_active = 1
        AND ura.outlet_id IS NULL
      LIMIT 1
    `.execute(db);

    assert.ok(
      userRows.rows.length > 0,
      `Owner fixture not found; run database seed first. Looking for company=${TEST_COMPANY_CODE}, email=${TEST_OWNER_EMAIL}`
    );
    testUserId = Number((userRows.rows[0] as { user_id: number }).user_id);
    testCompanyId = Number((userRows.rows[0] as { company_id: number }).company_id);

    // Get outlet ID from outlets table
    const outletRows = await sql`
      SELECT id FROM outlets WHERE company_id = ${testCompanyId} AND code = ${TEST_OUTLET_CODE} LIMIT 1
    `.execute(db);
    assert.ok(outletRows.rows.length > 0, `Outlet ${TEST_OUTLET_CODE} not found`);
    testOutletId = Number((outletRows.rows[0] as { id: number }).id);
  });

  after(async () => {
    await closeDbPool();
  });

  // ===========================================================================
  // Helper Functions
  // ===========================================================================

  async function insertTestTransaction(clientTxId: string): Promise<number> {
    // client_tx_id is char(36) in the schema, so we use a proper UUID format
    const result = await sql`
      INSERT INTO pos_transactions (
        company_id, outlet_id, cashier_user_id, client_tx_id, 
        status, service_type, trx_at, payload_sha256, payload_hash_version,
        created_at, updated_at
      ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${clientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), 'test-hash', 2, NOW(), NOW())
    `.execute(db);
    
    return Number(result.insertId);
  }

  async function deleteTestTransaction(clientTxId: string): Promise<void> {
    await sql`
      DELETE FROM pos_transactions WHERE client_tx_id = ${clientTxId} AND company_id = ${testCompanyId}
    `.execute(db);
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
        db
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
        db
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
          db
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
        // Insert using the same db that will be passed to check
        const insertResult = await sql`
          INSERT INTO pos_transactions (
            company_id, outlet_id, cashier_user_id, client_tx_id, 
            status, service_type, trx_at, payload_sha256, payload_hash_version,
            created_at, updated_at
          ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${clientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), 'test-hash', 2, NOW(), NOW())
        `.execute(db);
        
        // Use the same db for check
        const result = await checkDuplicateClientTx(
          testCompanyId,
          clientTxId,
          db
        );
        
        assert.equal(result.isDuplicate, true, "Should find duplicate using provided db");
        assert.strictEqual(result.existingId, Number(insertResult.insertId), "existingId should match");
      } finally {
        await deleteTestTransaction(clientTxId);
      }
    });

    test("works without connection (uses default pool)", async () => {
      const clientTxId = randomUUID();
      
      try {
        // Insert using the shared db
        await sql`
          INSERT INTO pos_transactions (
            company_id, outlet_id, cashier_user_id, client_tx_id, 
            status, service_type, trx_at, payload_sha256, payload_hash_version,
            created_at, updated_at
          ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${clientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), 'test-hash', 2, NOW(), NOW())
        `.execute(db);
        
        // Call without db - should use default pool
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
        db
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
          db
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
