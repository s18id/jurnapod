// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Routes Tests
 *
 * Tests for sync API routes (health and check-duplicate) with DB pool cleanup.
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { sql } from "kysely";
import {
  loadEnvIfPresent,
  readEnv,
  getFreePort,
  startApiServer,
  waitForHealthcheck,
  stopApiServer,
  loginOwner,
} from "../../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDb } from "../../lib/db";
import { buildLoginThrottleKeys } from "../../lib/auth-throttle";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
const TEST_OWNER_PASSWORD = readEnv("JP_OWNER_PASSWORD", null) ?? "password";

describe("Sync Routes", { concurrency: false }, () => {
  let db: ReturnType<typeof getDb>;
  let testUserId = 0;
  let testCompanyId = 0;
  let testOutletId = 0;
  let baseUrl = "";
  let accessToken = "";
  let apiServer: ReturnType<typeof startApiServer> | null = null;

  before(async () => {
    db = getDb();

    // Find test user fixture - global owner has outlet_id = NULL in user_role_assignments
    const userRows = await sql<{ user_id: number; company_id: number }>`
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

    assert.ok(userRows.rows.length > 0, `Owner fixture not found; run database seed first. Looking for company=${TEST_COMPANY_CODE}, email=${TEST_OWNER_EMAIL}`);
    testUserId = Number(userRows.rows[0].user_id);
    testCompanyId = Number(userRows.rows[0].company_id);

    // Get outlet ID from outlets table
    const outletRows = await sql<{ id: number }>`
      SELECT id FROM outlets WHERE company_id = ${testCompanyId} AND code = ${TEST_OUTLET_CODE} LIMIT 1
    `.execute(db);
    assert.ok(outletRows.rows.length > 0, `Outlet ${TEST_OUTLET_CODE} not found`);
    testOutletId = Number(outletRows.rows[0].id);

    const port = await getFreePort();
    apiServer = startApiServer(port);
    baseUrl = `http://127.0.0.1:${port}`;
    await waitForHealthcheck(baseUrl, apiServer.childProcess, apiServer.serverLogs);

    accessToken = await loginOwner(
      baseUrl,
      TEST_COMPANY_CODE,
      TEST_OWNER_EMAIL,
      TEST_OWNER_PASSWORD,
    );
  });

  after(async () => {
    if (apiServer) {
      await stopApiServer(apiServer.childProcess);
      apiServer = null;
    }
    await closeDbPool();
  });

  describe("Auth Throttle Functions (used by sync)", () => {
    test("buildLoginThrottleKeys generates correct key structure for sync scenarios", () => {
      const keys = buildLoginThrottleKeys({
        companyCode: TEST_COMPANY_CODE,
        email: TEST_OWNER_EMAIL,
        ipAddress: "192.168.1.100"
      });

      assert.equal(keys.length, 2);
      assert.equal(keys[0].scope, "primary");
      assert.equal(keys[1].scope, "ip");
      assert.ok(keys[0].hash.length > 0);
      assert.ok(keys[1].hash.length > 0);
    });

    test("buildLoginThrottleKeys handles null ipAddress", () => {
      const keys = buildLoginThrottleKeys({
        companyCode: TEST_COMPANY_CODE,
        email: TEST_OWNER_EMAIL,
        ipAddress: null
      });

      assert.equal(keys.length, 2);
      assert.ok(keys[1].raw.includes("unknown"));
    });
  });

  describe("Check-Duplicate Route Logic", () => {
    test("check-duplicate query returns nothing for non-existent transaction", async () => {
      const nonExistentClientTxId = crypto.randomUUID();

      const rows = await sql<{ id: number; created_at: Date }>`
        SELECT id, created_at
         FROM pos_transactions
         WHERE company_id = ${testCompanyId} AND client_tx_id = ${nonExistentClientTxId}
         LIMIT 1
      `.execute(db);

      assert.equal(rows.rows.length, 0, "Should not find non-existent transaction");
    });

    test("check-duplicate query finds existing transaction by client_tx_id", async () => {
      const clientTxId = crypto.randomUUID();

      // Create a test transaction
      const insertResult = await sql`
        INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id,
          status, service_type, trx_at, opened_at,
          discount_percent, discount_fixed, discount_code
        ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${clientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)
      `.execute(db);

      const transactionId = Number(insertResult.insertId);

      try {
        // Verify duplicate check finds it
        const rows = await sql<{ id: number; created_at: Date }>`
          SELECT id, created_at
           FROM pos_transactions
           WHERE company_id = ${testCompanyId} AND client_tx_id = ${clientTxId}
           LIMIT 1
        `.execute(db);

        assert.equal(rows.rows.length, 1, "Should find the transaction");
        assert.equal(rows.rows[0].id, transactionId);
        assert.ok(rows.rows[0].created_at);
      } finally {
        // Cleanup
        await sql`DELETE FROM pos_transactions WHERE id = ${transactionId}`.execute(db);
      }
    });

    test("check-duplicate is scoped to company (tenant isolation)", async () => {
      const clientTxId = crypto.randomUUID();

      // Create a transaction
      const insertResult = await sql`
        INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id,
          status, service_type, trx_at, opened_at,
          discount_percent, discount_fixed, discount_code
        ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${clientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)
      `.execute(db);

      const transactionId = Number(insertResult.insertId);

      try {
        // Query with different company_id should not find it
        const wrongCompanyRows = await sql<{ id: number; created_at: Date }>`
          SELECT id, created_at
           FROM pos_transactions
           WHERE company_id = ${testCompanyId + 99999} AND client_tx_id = ${clientTxId}
           LIMIT 1
        `.execute(db);

        assert.equal(wrongCompanyRows.rows.length, 0, "Should not find transaction from different company");

        // Query with correct company_id should find it
        const correctRows = await sql<{ id: number; created_at: Date }>`
          SELECT id, created_at
           FROM pos_transactions
           WHERE company_id = ${testCompanyId} AND client_tx_id = ${clientTxId}
           LIMIT 1
        `.execute(db);

        assert.equal(correctRows.rows.length, 1, "Should find transaction with correct company_id");
      } finally {
        // Cleanup
        await sql`DELETE FROM pos_transactions WHERE id = ${transactionId}`.execute(db);
      }
    });

    test("unique constraint enforces company_id + client_tx_id uniqueness", async () => {
      const clientTxId = crypto.randomUUID();

      // Create first transaction
      const insertResult = await sql`
        INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id,
          status, service_type, trx_at, opened_at,
          discount_percent, discount_fixed, discount_code
        ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${clientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)
      `.execute(db);

      const transactionId = Number(insertResult.insertId);

      try {
        // Attempt to insert duplicate should fail
        await assert.rejects(
          async () => {
            await sql`
              INSERT INTO pos_transactions (
                company_id, outlet_id, cashier_user_id, client_tx_id,
                status, service_type, trx_at, opened_at,
                discount_percent, discount_fixed, discount_code
              ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${clientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)
            `.execute(db);
          },
          (error: unknown) => {
            const mysqlError = error as { code?: string; errno?: number };
            return mysqlError.code === "ER_DUP_ENTRY" || mysqlError.errno === 1062;
          }
        );
      } finally {
        // Cleanup
        await sql`DELETE FROM pos_transactions WHERE id = ${transactionId}`.execute(db);
      }
    });

    test("same client_tx_id allowed for different companies", async () => {
      const clientTxId = crypto.randomUUID();

      // Create first transaction for current company
      const insertResult1 = await sql`
        INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id,
          status, service_type, trx_at, opened_at,
          discount_percent, discount_fixed, discount_code
        ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${clientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)
      `.execute(db);

      const transactionId1 = Number(insertResult1.insertId);

      try {
        // Verify the unique constraint includes company_id and client_tx_id
        const constraintRows = await sql<{ COLUMN_NAME: string; SEQ_IN_INDEX: number }>`
          SELECT COLUMN_NAME, SEQ_IN_INDEX
           FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'pos_transactions'
             AND INDEX_NAME LIKE '%client_tx%'
           ORDER BY SEQ_IN_INDEX
        `.execute(db);

        assert.ok(constraintRows.rows.length >= 2, "Should have at least 2 columns in unique index");
        const columnNames = constraintRows.rows.map((r) => r.COLUMN_NAME);
        assert.ok(columnNames.includes("company_id"), "Unique index should include company_id");
        assert.ok(columnNames.includes("client_tx_id"), "Unique index should include client_tx_id");
      } finally {
        // Cleanup
        await sql`DELETE FROM pos_transactions WHERE id = ${transactionId1}`.execute(db);
      }
    });

    test("check-duplicate endpoint is read-only (preflight-only semantics)", async () => {
      const clientTxId = crypto.randomUUID();

      // Insert a transaction first
      const insertResult = await sql`
        INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id,
          status, service_type, trx_at, opened_at,
          discount_percent, discount_fixed, discount_code
        ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${clientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)
      `.execute(db);

      const transactionId = Number(insertResult.insertId);
      const initialUpdatedAt = await sql`SELECT updated_at FROM pos_transactions WHERE id = ${transactionId}`.execute(db);

      try {
        const response = await fetch(`${baseUrl}/api/sync/check-duplicate`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            company_id: testCompanyId,
            client_tx_id: clientTxId,
          }),
        });

        assert.equal(response.status, 200);
        const body = await response.json() as { is_duplicate: boolean; existing_id?: number };
        assert.equal(body.is_duplicate, true);
        assert.equal(body.existing_id, transactionId);

        // Verify state was NOT modified by the read operation
        const afterCheckUpdatedAt = await sql`SELECT updated_at FROM pos_transactions WHERE id = ${transactionId}`.execute(db);
        const initialTime = new Date((initialUpdatedAt.rows[0] as { updated_at: Date }).updated_at).getTime();
        const afterCheckTime = new Date((afterCheckUpdatedAt.rows[0] as { updated_at: Date }).updated_at).getTime();

        // Timestamps should be exactly the same (no update occurred)
        assert.equal(afterCheckTime, initialTime, "Read operation should not modify updated_at timestamp");

        // Count should remain exactly 1 (no duplicate created)
        const countResult = await sql`SELECT COUNT(*) as cnt FROM pos_transactions WHERE company_id = ${testCompanyId} AND client_tx_id = ${clientTxId}`.execute(db);
        const count = Number((countResult.rows[0] as { cnt: number }).cnt);
        assert.equal(count, 1, "Read operation should not create duplicate entry");
      } finally {
        // Cleanup
        await sql`DELETE FROM pos_transactions WHERE id = ${transactionId}`.execute(db);
      }
    });
  });

  describe("Sync Module Health Check", () => {
    test("checkSyncModuleHealth function exists and returns expected structure", async () => {
      const { checkSyncModuleHealth } = await import("../../lib/sync-modules");

      const health = await checkSyncModuleHealth();

      assert.ok(typeof health.healthy === "boolean", "Should return healthy boolean");
      assert.ok(typeof health.modules === "object", "Should return modules object");
      assert.ok("batchProcessor" in health, "Should return batchProcessor status");
    });
  });
});

// Standard DB pool cleanup - runs after all tests in this file
test.after(async () => {
  await closeDbPool();
});
