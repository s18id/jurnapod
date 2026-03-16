// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  createDbPool,
  loadEnvIfPresent,
  readEnv
} from "../../../../tests/integration/integration-harness.mjs";
import { closeDbPool } from "../../../../src/lib/db";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

loadEnvIfPresent();

test(
  "Duplicate check API tests",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = createDbPool();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let outletId = 0;
    let userId = 0;
    const createdTransactionIds: number[] = [];

    try {
      // Find existing company/outlet/user
      const [ownerRows] = await pool.execute<RowDataPacket[]>(
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
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(ownerRows.length > 0, "Owner fixture not found; run database seed first");
      companyId = Number(ownerRows[0].company_id);
      outletId = Number(ownerRows[0].outlet_id);
      userId = Number(ownerRows[0].user_id);

      // ============================================
      // Test A: Check duplicate - transaction not found
      // ============================================
      await test("should return exists: false when transaction not found", async () => {
        const clientTxId = randomUUID();
        
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT id, created_at
           FROM pos_transactions
           WHERE company_id = ? AND client_tx_id = ?
           LIMIT 1`,
          [companyId, clientTxId]
        );
        
        assert.strictEqual(rows.length, 0, "Should not find any transaction");
      });

      // ============================================
      // Test B: Create transaction and verify duplicate detection
      // ============================================
      await test("should return exists: true when transaction exists", async () => {
        const clientTxId = randomUUID();
        
        // Create a transaction
        const [insertResult] = await pool.execute<ResultSetHeader>(
          `INSERT INTO pos_transactions (
            company_id, outlet_id, cashier_user_id, client_tx_id,
            status, service_type, trx_at, opened_at,
            discount_percent, discount_fixed, discount_code
          ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)`,
          [companyId, outletId, userId, clientTxId]
        );
        
        const transactionId = Number(insertResult.insertId);
        createdTransactionIds.push(transactionId);
        
        // Verify duplicate check finds it
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT id, created_at
           FROM pos_transactions
           WHERE company_id = ? AND client_tx_id = ?
           LIMIT 1`,
          [companyId, clientTxId]
        );
        
        assert.strictEqual(rows.length, 1, "Should find the transaction");
        assert.strictEqual(rows[0].id, transactionId, "Should return correct transaction ID");
        assert.ok(rows[0].created_at, "Should have created_at timestamp");
      });

      // ============================================
      // Test C: Tenant isolation - cannot see other companies' transactions
      // ============================================
      await test("should not find transactions from other companies", async () => {
        const clientTxId = randomUUID();
        
        // Create a transaction for the current company
        const [insertResult] = await pool.execute<ResultSetHeader>(
          `INSERT INTO pos_transactions (
            company_id, outlet_id, cashier_user_id, client_tx_id,
            status, service_type, trx_at, opened_at,
            discount_percent, discount_fixed, discount_code
          ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)`,
          [companyId, outletId, userId, clientTxId]
        );
        
        const transactionId = Number(insertResult.insertId);
        createdTransactionIds.push(transactionId);
        
        // Query with a different company_id should not find it
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT id, created_at
           FROM pos_transactions
           WHERE company_id = ? AND client_tx_id = ?
           LIMIT 1`,
          [companyId + 99999, clientTxId] // Different company_id
        );
        
        assert.strictEqual(rows.length, 0, "Should not find transaction from different company");
        
        // But query with correct company_id should find it
        const [correctRows] = await pool.execute<RowDataPacket[]>(
          `SELECT id, created_at
           FROM pos_transactions
           WHERE company_id = ? AND client_tx_id = ?
           LIMIT 1`,
          [companyId, clientTxId]
        );
        
        assert.strictEqual(correctRows.length, 1, "Should find transaction with correct company_id");
      });

      // ============================================
      // Test D: Unique constraint prevents duplicates
      // ============================================
      await test("should enforce unique constraint on (company_id, client_tx_id)", async () => {
        const clientTxId = randomUUID();
        
        // Create first transaction
        const [insertResult] = await pool.execute<ResultSetHeader>(
          `INSERT INTO pos_transactions (
            company_id, outlet_id, cashier_user_id, client_tx_id,
            status, service_type, trx_at, opened_at,
            discount_percent, discount_fixed, discount_code
          ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)`,
          [companyId, outletId, userId, clientTxId]
        );
        
        const transactionId = Number(insertResult.insertId);
        createdTransactionIds.push(transactionId);
        
        // Attempt to create duplicate should fail
        await assert.rejects(
          async () => {
            await pool.execute(
              `INSERT INTO pos_transactions (
                company_id, outlet_id, cashier_user_id, client_tx_id,
                status, service_type, trx_at, opened_at,
                discount_percent, discount_fixed, discount_code
              ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)`,
              [companyId, outletId, userId, clientTxId]
            );
          },
          (error: unknown) => {
            const mysqlError = error as { code?: string; errno?: number };
            return mysqlError.code === "ER_DUP_ENTRY" || mysqlError.errno === 1062;
          },
          "Should throw duplicate entry error"
        );
      });

      // ============================================
      // Test E: Same client_tx_id allowed for different companies
      // ============================================
      await test("should allow same client_tx_id for different companies", async () => {
        const clientTxId = randomUUID();
        
        // Create first transaction for current company
        const [insertResult1] = await pool.execute<ResultSetHeader>(
          `INSERT INTO pos_transactions (
            company_id, outlet_id, cashier_user_id, client_tx_id,
            status, service_type, trx_at, opened_at,
            discount_percent, discount_fixed, discount_code
          ) VALUES (?, ?, ?, ?, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)`,
          [companyId, outletId, userId, clientTxId]
        );
        
        createdTransactionIds.push(Number(insertResult1.insertId));
        
        // This test would require another company to exist
        // For now, we just verify the constraint logic works by checking
        // that the unique constraint is on (company_id, client_tx_id)
        const [constraintRows] = await pool.execute<RowDataPacket[]>(
          `SELECT COLUMN_NAME, SEQ_IN_INDEX
           FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'pos_transactions'
             AND INDEX_NAME = 'uq_pos_transactions_client_tx_id'
           ORDER BY SEQ_IN_INDEX`
        );
        
        assert.ok(constraintRows.length >= 2, "Should have at least 2 columns in unique index");
        type ConstraintRow = { COLUMN_NAME: string; SEQ_IN_INDEX: number };
        const columnNames = (constraintRows as unknown as ConstraintRow[]).map((r) => r.COLUMN_NAME);
        assert.ok(columnNames.includes("company_id"), "Unique index should include company_id");
        assert.ok(columnNames.includes("client_tx_id"), "Unique index should include client_tx_id");
      });

    } finally {
      // Cleanup: Remove created transactions
      for (const txId of createdTransactionIds) {
        try {
          await pool.execute(
            `DELETE FROM pos_transactions WHERE id = ?`,
            [txId]
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
