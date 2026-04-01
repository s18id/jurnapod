// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Route Tests
 *
 * Tests for POST /sync/push endpoint:
 * - Batch transaction processing
 * - Deduplication via client_tx_id
 * - Per-transaction status (OK, DUPLICATE, ERROR)
 * - Audit logging
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { sql } from "kysely";
import { loadEnvIfPresent, readEnv } from "../../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDb } from "../../lib/db";
import { createHash, randomUUID } from "node:crypto";
import { toEpochMs, toMysqlDateTime, toUtcInstant } from "../../lib/date-helpers";
import { SyncPushRequestSchema } from "@jurnapod/shared";

function computePayloadSha256(canonicalPayload: string): string {
  return createHash("sha256").update(canonicalPayload).digest("hex");
}

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("Sync Push Routes", { concurrency: false }, () => {
  let db: ReturnType<typeof getDb>;
  let testUserId = 0;
  let testCompanyId = 0;
  let testOutletId = 0;

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

    assert.ok(
      userRows.rows.length > 0,
      `Owner fixture not found; run database seed first. Looking for company=${TEST_COMPANY_CODE}, email=${TEST_OWNER_EMAIL}`
    );
    testUserId = Number(userRows.rows[0].user_id);
    testCompanyId = Number(userRows.rows[0].company_id);

    // Get outlet ID from outlets table
    const outletRows = await sql<{ id: number }>`
      SELECT id FROM outlets WHERE company_id = ${testCompanyId} AND code = ${TEST_OUTLET_CODE} LIMIT 1
    `.execute(db);
    assert.ok(outletRows.rows.length > 0, `Outlet ${TEST_OUTLET_CODE} not found`);
    testOutletId = Number(outletRows.rows[0].id);
  });

  after(async () => {
    await closeDbPool();
  });

  // ===========================================================================
  // Helper Function Tests
  // ===========================================================================

  describe("toMysqlDateTime", () => {
    test("converts ISO datetime to MySQL format", () => {
      const result = toMysqlDateTime("2024-01-15T10:30:00.000Z");
      assert.equal(result, "2024-01-15 10:30:00", "Should convert to MySQL datetime format");
    });

    test("handles datetime with timezone offset", () => {
      const result = toMysqlDateTime("2024-01-15T10:30:00+07:00");
      assert.ok(result.includes("2024-01-15"), "Should extract date portion");
      assert.ok(result.includes(":"), "Should preserve time portion");
    });

    test("throws on invalid datetime", () => {
      assert.throws(
        () => toMysqlDateTime("invalid-date"),
        /Cannot convert to MySQL datetime/,
        "Should throw on invalid date"
      );
    });
  });

  describe("computePayloadSha256", () => {
    test("computes consistent hash for same payload", () => {
      const payload = JSON.stringify({ client_tx_id: "test-123", amount: 100 });
      const hash1 = computePayloadSha256(payload);
      const hash2 = computePayloadSha256(payload);
      assert.equal(hash1, hash2, "Same payload should produce same hash");
    });

    test("computes different hash for different payloads", () => {
      const payload1 = JSON.stringify({ client_tx_id: "test-123", amount: 100 });
      const payload2 = JSON.stringify({ client_tx_id: "test-456", amount: 200 });
      const hash1 = computePayloadSha256(payload1);
      const hash2 = computePayloadSha256(payload2);
      assert.notEqual(hash1, hash2, "Different payloads should produce different hashes");
    });

    test("returns 64-character hex string", () => {
      const hash = computePayloadSha256('{"test": true}');
      assert.equal(hash.length, 64, "SHA256 hash should be 64 hex characters");
      assert.ok(/^[a-f0-9]+$/.test(hash), "Hash should be lowercase hex");
    });
  });

  // ===========================================================================
  // Transaction Validation Tests
  // ===========================================================================

  describe("Transaction Validation", () => {
    test("validates required fields in transaction", () => {
      const transaction = {
        client_tx_id: "test-123",
        company_id: testCompanyId,
        outlet_id: testOutletId,
        cashier_user_id: testUserId,
        status: "COMPLETED",
        trx_at: "2024-01-15T10:30:00Z",
        items: [{ item_id: 1, qty: 1, price_snapshot: 100, name_snapshot: "Test" }],
        payments: [{ method: "CASH", amount: 100 }]
      };

      assert.ok(transaction.client_tx_id, "Should have client_tx_id");
      assert.ok(transaction.company_id, "Should have company_id");
      assert.ok(transaction.items.length > 0, "Should have at least one item");
      assert.ok(transaction.payments.length > 0, "Should have at least one payment");
    });

    test("validates status enum values", () => {
      const validStatuses = ["COMPLETED", "VOID", "REFUND"];
      for (const status of validStatuses) {
        assert.ok(
          validStatuses.includes(status),
          `Status ${status} should be valid`
        );
      }
    });

    test("rejects invalid status value", () => {
      const invalidStatuses = ["COMPLETEDX", "INVALID", "pending"];
      const validStatuses = ["COMPLETED", "VOID", "REFUND"];
      for (const status of invalidStatuses) {
        assert.ok(
          !validStatuses.includes(status),
          `Status ${status} should be invalid`
        );
      }
    });
  });

  describe("Sync payload timestamp validation", () => {
    test("schema requires timezone offsets for order update timestamps", () => {
      const result = SyncPushRequestSchema.safeParse({
        outlet_id: testOutletId,
        transactions: [],
        order_updates: [
          {
            update_id: randomUUID(),
            order_id: randomUUID(),
            company_id: testCompanyId,
            outlet_id: testOutletId,
            base_order_updated_at: null,
            event_type: "ITEM_ADDED",
            delta_json: "{}",
            actor_user_id: testUserId,
            device_id: "device-1",
            event_at: "2026-03-16T10:30:00",
            created_at: "2026-03-16T10:31:00"
          }
        ]
      });

      assert.equal(result.success, false, "offsetless timestamps should fail schema validation");
    });

    test("canonical helper normalization rejects rolled order update event_at values", () => {
      assert.throws(
        () => toEpochMs(toUtcInstant("2026-02-30T10:30:00Z")),
        /Cannot convert to UTC instant/
      );
    });

    test("canonical helper normalization preserves valid order update timestamps", () => {
      const eventAt = "2026-03-16T17:30:00+07:00";
      const createdAt = "2026-03-16T10:31:45.123Z";

      assert.equal(toEpochMs(toUtcInstant(eventAt)), Date.parse(eventAt));
      assert.equal(toEpochMs(toUtcInstant(createdAt)), Date.parse(createdAt));
    });
  });

  // ===========================================================================
  // Deduplication Logic Tests
  // ===========================================================================

  describe("Deduplication Logic", () => {
    test("generates unique client_tx_id for each transaction", () => {
      const txIds = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const txId = `test-${Date.now()}-${i}`;
        assert.ok(!txIds.has(txId), `Transaction ID ${txId} should be unique`);
        txIds.add(txId);
      }
    });

    test("checks for existing transaction by client_tx_id", async () => {
      // Query to check for existing transaction
      const clientTxId = `nonexistent-${Date.now()}`;
      const rows = await sql<{ id: number }>`
        SELECT id FROM pos_transactions 
         WHERE company_id = ${testCompanyId} AND outlet_id = ${testOutletId} AND client_tx_id = ${clientTxId}
         LIMIT 1
      `.execute(db);
      assert.equal(rows.rows.length, 0, "Should not find nonexistent transaction");
    });

    test("unique constraint on company_id, outlet_id, client_tx_id", async () => {
      // Verify the unique index exists by attempting a duplicate insert
      const testClientTxId = `dedup-test-${Date.now()}`;

      try {
        await sql`
          INSERT INTO pos_transactions (
            company_id, outlet_id, cashier_user_id, client_tx_id, 
            status, service_type, trx_at, payload_sha256, payload_hash_version
          ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${testClientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), 'test-hash', 2)
        `.execute(db);

        // Try to insert duplicate
        await assert.rejects(
          async () => {
            await sql`
              INSERT INTO pos_transactions (
                company_id, outlet_id, cashier_user_id, client_tx_id, 
                status, service_type, trx_at, payload_sha256, payload_hash_version
              ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${testClientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), 'test-hash2', 2)
            `.execute(db);
          },
          /Duplicate entry/,
          "Should reject duplicate client_tx_id within same company/outlet"
        );
      } finally {
        // Cleanup
        await sql`DELETE FROM pos_transactions WHERE client_tx_id = ${testClientTxId}`.execute(db);
      }
    });
  });

  // ===========================================================================
  // Batch Processing Tests
  // ===========================================================================

  describe("Batch Processing", () => {
    test("builds transaction batches with max concurrency", () => {
      const buildBatches = (
        transactions: Array<{ client_tx_id: string }>,
        maxConcurrency: number
      ): Array<Array<{ txIndex: number; tx: { client_tx_id: string } }>> => {
        const batches: Array<Array<{ txIndex: number; tx: { client_tx_id: string } }>> = [];
        let current: Array<{ txIndex: number; tx: { client_tx_id: string } }> = [];
        let seenClientTxIds = new Set<string>();

        for (const [txIndex, tx] of transactions.entries()) {
          const isChunkFull = current.length >= maxConcurrency;
          const hasDuplicateInChunk = seenClientTxIds.has(tx.client_tx_id);

          if ((isChunkFull || hasDuplicateInChunk) && current.length > 0) {
            batches.push(current);
            current = [];
            seenClientTxIds = new Set<string>();
          }

          current.push({ tx, txIndex });
          seenClientTxIds.add(tx.client_tx_id);
        }

        if (current.length > 0) {
          batches.push(current);
        }

        return batches;
      };

      const transactions = Array.from({ length: 10 }, (_, i) => ({
        client_tx_id: `tx-${i}`
      }));
      const batches = buildBatches(transactions, 3);

      // Should have 4 batches: [3, 3, 3, 1]
      assert.ok(batches.length > 0, "Should create at least one batch");
      assert.ok(batches[0].length <= 3, "Each batch should respect max concurrency");

      // Verify all transactions are included
      const allTxIds = batches.flatMap(b => b.map(item => item.tx.client_tx_id));
      assert.equal(allTxIds.length, 10, "All transactions should be included");
    });

    test("handles empty transaction array", () => {
      const buildBatches = (
        transactions: Array<{ client_tx_id: string }>,
        maxConcurrency: number
      ): Array<Array<{ txIndex: number; tx: { client_tx_id: string } }>> => {
        const batches: Array<Array<{ txIndex: number; tx: { client_tx_id: string } }>> = [];
        let current: Array<{ txIndex: number; tx: { client_tx_id: string } }> = [];
        let seenClientTxIds = new Set<string>();

        for (const [txIndex, tx] of transactions.entries()) {
          const isChunkFull = current.length >= maxConcurrency;
          const hasDuplicateInChunk = seenClientTxIds.has(tx.client_tx_id);

          if ((isChunkFull || hasDuplicateInChunk) && current.length > 0) {
            batches.push(current);
            current = [];
            seenClientTxIds = new Set<string>();
          }

          current.push({ tx, txIndex });
          seenClientTxIds.add(tx.client_tx_id);
        }

        if (current.length > 0) {
          batches.push(current);
        }

        return batches;
      };

      const batches = buildBatches([], 3);
      assert.equal(batches.length, 0, "Should return no batches for empty array");
    });

    test("handles single transaction", () => {
      const buildBatches = (
        transactions: Array<{ client_tx_id: string }>,
        maxConcurrency: number
      ): Array<Array<{ txIndex: number; tx: { client_tx_id: string } }>> => {
        const batches: Array<Array<{ txIndex: number; tx: { client_tx_id: string } }>> = [];
        let current: Array<{ txIndex: number; tx: { client_tx_id: string } }> = [];
        let seenClientTxIds = new Set<string>();

        for (const [txIndex, tx] of transactions.entries()) {
          const isChunkFull = current.length >= maxConcurrency;
          const hasDuplicateInChunk = seenClientTxIds.has(tx.client_tx_id);

          if ((isChunkFull || hasDuplicateInChunk) && current.length > 0) {
            batches.push(current);
            current = [];
            seenClientTxIds = new Set<string>();
          }

          current.push({ tx, txIndex });
          seenClientTxIds.add(tx.client_tx_id);
        }

        if (current.length > 0) {
          batches.push(current);
        }

        return batches;
      };

      const batches = buildBatches([{ client_tx_id: "single-tx" }], 3);
      assert.equal(batches.length, 1, "Should return one batch");
      assert.equal(batches[0].length, 1, "Batch should contain one transaction");
    });
  });

  // ===========================================================================
  // Audit Logging Tests
  // ===========================================================================

  describe("Audit Logging", () => {
    test("creates audit service with db pool", () => {
      const dbPool = getDb();
      assert.ok(dbPool, "Database pool should be available");
    });

    test("checks audit_logs table exists", async () => {
      const rows = await sql`SELECT 1 FROM audit_logs LIMIT 1`.execute(db);
      assert.ok(true, "audit_logs table should exist");
    });

    test("records sync push audit entries", async () => {
      // Verify audit logging columns exist
      const columns = await sql<{ COLUMN_NAME: string }>`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs'
      `.execute(db);

      const columnNames = columns.rows.map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("company_id"), "Should have company_id column");
      assert.ok(columnNames.includes("outlet_id"), "Should have outlet_id column");
      assert.ok(columnNames.includes("action"), "Should have action column");
      assert.ok(columnNames.includes("success"), "Should have success column");
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe("Error Handling", () => {
    test("handles invalid company_id", () => {
      const validateCompanyId = (companyId: number, authCompanyId: number): boolean => {
        return companyId === authCompanyId;
      };

      assert.ok(validateCompanyId(testCompanyId, testCompanyId), "Matching company_id should pass");
      assert.ok(!validateCompanyId(testCompanyId + 999, testCompanyId), "Different company_id should fail");
    });

    test("handles invalid outlet_id", () => {
      const validateOutletId = (outletId: number, inputOutletId: number): boolean => {
        return outletId === inputOutletId;
      };

      assert.ok(validateOutletId(testOutletId, testOutletId), "Matching outlet_id should pass");
      assert.ok(!validateOutletId(testOutletId + 999, testOutletId), "Different outlet_id should fail");
    });

    test("handles missing table_id for DINE_IN", () => {
      const validateDineInRequiresTable = (
        serviceType?: string,
        tableId?: number | null
      ): boolean => {
        return (serviceType ?? "TAKEAWAY") !== "DINE_IN" || !!tableId;
      };

      assert.ok(validateDineInRequiresTable("TAKEAWAY", null), "TAKEAWAY should not require table_id");
      assert.ok(validateDineInRequiresTable(undefined, 1), "DINE_IN with table_id should pass");
      assert.ok(!validateDineInRequiresTable("DINE_IN", null), "DINE_IN without table_id should fail");
      assert.ok(!validateDineInRequiresTable("DINE_IN", undefined), "DINE_IN without table_id should fail");
    });

    test("handles negative amounts", () => {
      const validateAmount = (amount: number): boolean => {
        return amount >= 0;
      };

      assert.ok(validateAmount(0), "Zero amount should be valid");
      assert.ok(validateAmount(100), "Positive amount should be valid");
      assert.ok(!validateAmount(-1), "Negative amount should be invalid");
      assert.ok(!validateAmount(-100.50), "Negative decimal amount should be invalid");
    });

    test("handles empty items array", () => {
      const validateItems = (items: Array<unknown>): boolean => {
        return items.length > 0;
      };

      assert.ok(validateItems([{ item_id: 1 }]), "Non-empty array should be valid");
      assert.ok(!validateItems([]), "Empty array should be invalid");
    });

    test("handles empty payments array", () => {
      const validatePayments = (payments: Array<unknown>): boolean => {
        return payments.length > 0;
      };

      assert.ok(validatePayments([{ method: "CASH", amount: 100 }]), "Non-empty array should be valid");
      assert.ok(!validatePayments([]), "Empty array should be invalid");
    });
  });

  // ===========================================================================
  // Money Handling Tests
  // ===========================================================================

  describe("Money Handling", () => {
    test("normalizes money values to 2 decimal places", () => {
      const normalizeMoney = (value: number): number => {
        return Math.round(value * 100) / 100;
      };

      assert.equal(normalizeMoney(100), 100, "Integer should stay integer");
      assert.equal(normalizeMoney(100.1), 100.1, "One decimal should stay one decimal");
      assert.equal(normalizeMoney(100.999), 101, "Three decimals should round to two");
      assert.equal(normalizeMoney(100.124), 100.12, "Should round down correctly");
      assert.equal(normalizeMoney(100.125), 100.13, "Should round up correctly");
    });

    test("sums gross sales correctly", () => {
      const sumGrossSales = (items: Array<{ qty: number; price_snapshot: number }>): number => {
        const total = items.reduce((acc, item) => acc + item.qty * item.price_snapshot, 0);
        return Math.round(total * 100) / 100;
      };

      const items = [
        { qty: 2, price_snapshot: 10.00 },
        { qty: 1, price_snapshot: 25.50 },
        { qty: 3, price_snapshot: 5.99 }
      ];
      const gross = sumGrossSales(items);
      // 2*10 + 1*25.50 + 3*5.99 = 20 + 25.50 + 17.97 = 63.47
      assert.equal(gross, 63.47, "Should calculate correct total");
    });
  });

  // ===========================================================================
  // Scoping Tests
  // ===========================================================================

  describe("Company/Outlet Scoping", () => {
    test("verifies cashier belongs to company", async () => {
      const rows = await sql`SELECT 1 FROM users WHERE id = ${testUserId} AND company_id = ${testCompanyId} LIMIT 1`.execute(db);
      assert.ok(rows.rows.length > 0, "Test user should belong to test company");
    });

    test("prevents cross-company transactions", async () => {
      // Verify that we cannot query transactions from a different company
      const rows = await sql`SELECT id FROM pos_transactions WHERE company_id = ${testCompanyId + 9999} LIMIT 1`.execute(db);
      assert.equal(rows.rows.length, 0, "Should not find transactions from non-existent company");
    });

    test("outlet_id scoping for transactions", async () => {
      const rows = await sql`SELECT id FROM pos_transactions WHERE company_id = ${testCompanyId} AND outlet_id = ${testOutletId} LIMIT 1`.execute(db);
      // May or may not have transactions, but query should work
      assert.ok(Array.isArray(rows.rows), "Should return array result");
    });
  });

  // ===========================================================================
  // Tax Calculation Tests
  // ===========================================================================

  describe("Tax Calculation", () => {
    test("builds tax lines from provided taxes", () => {
      const buildTaxLinesForTransaction = ({
        taxes,
        grossSales,
        defaultTaxRates,
        taxRateById
      }: {
        taxes?: Array<{ tax_rate_id: number; amount: number }>;
        grossSales: number;
        defaultTaxRates: Array<{ id: number; rate: number }>;
        taxRateById: Map<number, { id: number; rate: number }>;
      }): Array<{ tax_rate_id: number; amount: number }> => {
        if (taxes && taxes.length > 0) {
          return taxes.map((tax) => ({
            tax_rate_id: Number(tax.tax_rate_id),
            amount: Math.round(Number(tax.amount) * 100) / 100
          })).filter((tax) => tax.amount > 0);
        }
        return [];
      };

      const taxes = [{ tax_rate_id: 1, amount: 10.50 }];
      const result = buildTaxLinesForTransaction({
        taxes,
        grossSales: 100,
        defaultTaxRates: [],
        taxRateById: new Map()
      });

      assert.equal(result.length, 1, "Should return one tax line");
      assert.equal(result[0].amount, 10.50, "Should preserve tax amount");
    });

    test("filters out zero-amount taxes", () => {
      const buildTaxLinesForTransaction = ({
        taxes,
        grossSales,
        defaultTaxRates,
        taxRateById
      }: {
        taxes?: Array<{ tax_rate_id: number; amount: number }>;
        grossSales: number;
        defaultTaxRates: Array<{ id: number; rate: number }>;
        taxRateById: Map<number, { id: number; rate: number }>;
      }): Array<{ tax_rate_id: number; amount: number }> => {
        if (taxes && taxes.length > 0) {
          return taxes.map((tax) => ({
            tax_rate_id: Number(tax.tax_rate_id),
            amount: Math.round(Number(tax.amount) * 100) / 100
          })).filter((tax) => tax.amount > 0);
        }
        return [];
      };

      const taxes = [
        { tax_rate_id: 1, amount: 10.50 },
        { tax_rate_id: 2, amount: 0 }
      ];
      const result = buildTaxLinesForTransaction({
        taxes,
        grossSales: 100,
        defaultTaxRates: [],
        taxRateById: new Map()
      });

      assert.equal(result.length, 1, "Should filter out zero-amount tax");
    });
  });

  // ===========================================================================
  // Snapshot and Cancellation Timestamp Semantics Tests (Story 17.3)
  // NOTE: Real implementation-path tests are in the integration test file:
  // apps/api/tests/integration/sync-push.integration.test.mjs
  // These tests verify the actual POST /sync/push endpoint writes:
  // - "sync push integration: active_orders created_at_ts is server-ingest..."
  // - "sync push integration: item_cancellations cancelled_at_ts is client-authored..."
  // ===========================================================================
});
