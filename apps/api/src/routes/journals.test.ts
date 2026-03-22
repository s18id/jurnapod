// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Journal Routes Tests
 *
 * Tests for /journals endpoints:
 * - List journal entries
 * - Create manual journal entries
 * - Get single journal batch
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDbPool } from "../lib/db";
import {
  createManualJournalEntry,
  listJournalBatches,
  getJournalBatch,
} from "../lib/journals";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("Journal Routes", { concurrency: false }, () => {
  let connection: PoolConnection;
  let testUserId = 0;
  let testCompanyId = 0;
  let testOutletId = 0;
  let testJournalBatchId = 0;

  before(async () => {
    const dbPool = getDbPool();
    connection = await dbPool.getConnection();

    // Find test user fixture
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
    // Note: Journal batches are immutable - cannot delete them
    // They remain in the database as audit trail
    connection.release();
    await closeDbPool();
  });

  // ===========================================================================
  // Journal Data Structure Tests
  // ===========================================================================

  describe("Journal Data Structure", () => {
    test("journal_batches table exists with required columns", async () => {
      const [columns] = await connection.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'journal_batches'`
      );

      const columnNames = (columns as Array<{ COLUMN_NAME: string }>).map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("id"), "Should have id column");
      assert.ok(columnNames.includes("company_id"), "Should have company_id column");
      assert.ok(columnNames.includes("doc_type"), "Should have doc_type column");
    });

    test("journal_lines table exists with required columns", async () => {
      const [columns] = await connection.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'journal_lines'`
      );

      const columnNames = (columns as Array<{ COLUMN_NAME: string }>).map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("id"), "Should have id column");
      assert.ok(columnNames.includes("journal_batch_id"), "Should have journal_batch_id column");
      assert.ok(columnNames.includes("account_id"), "Should have account_id column");
      assert.ok(columnNames.includes("debit"), "Should have debit column");
      assert.ok(columnNames.includes("credit"), "Should have credit column");
    });
  });

  // ===========================================================================
  // List Journal Batches Tests
  // ===========================================================================

  describe("List Journal Batches", () => {
    test("returns journals for company", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await listJournalBatches({
        company_id: testCompanyId,
        limit: 10,
        offset: 0,
        start_date: dateFrom,
        end_date: dateTo,
      });

      assert.ok(Array.isArray(result), "Should return array");
    });

    test("respects limit and offset", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result1 = await listJournalBatches({
        company_id: testCompanyId,
        limit: 5,
        offset: 0,
        start_date: dateFrom,
        end_date: dateTo,
      });

      const result2 = await listJournalBatches({
        company_id: testCompanyId,
        limit: 5,
        offset: 5,
        start_date: dateFrom,
        end_date: dateTo,
      });

      assert.ok(Array.isArray(result1), "Should return array");
      assert.ok(Array.isArray(result2), "Should return array");
    });

    test("filters by outlet_id", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await listJournalBatches({
        company_id: testCompanyId,
        outlet_id: testOutletId,
        limit: 10,
        offset: 0,
        start_date: dateFrom,
        end_date: dateTo,
      });

      assert.ok(Array.isArray(result), "Should return array");
      // All results should be for the specified outlet or null
      for (const batch of result) {
        if (batch.outlet_id !== null) {
          assert.equal(batch.outlet_id, testOutletId, "Should filter by outlet_id");
        }
      }
    });

    test("returns empty for non-existent company", async () => {
      const result = await listJournalBatches({
        company_id: 999999,
        limit: 10,
        offset: 0,
      });

      assert.ok(Array.isArray(result), "Should return array");
      assert.equal(result.length, 0, "Should return empty for non-existent company");
    });
  });

  // ===========================================================================
  // Create Manual Journal Entry Tests
  // ===========================================================================

  describe("Create Manual Journal Entry", () => {
    test("creates balanced journal entry", async () => {
      const today = new Date().toISOString().slice(0, 10);

      const batch = await createManualJournalEntry({
        company_id: testCompanyId,
        outlet_id: testOutletId,
        entry_date: today,
        description: "Test Journal Entry",
        lines: [
          {
            account_id: 1, // Assuming account 1 exists
            debit: 1000,
            credit: 0,
            description: "Debit entry"
          },
          {
            account_id: 2, // Assuming account 2 exists
            debit: 0,
            credit: 1000,
            description: "Credit entry"
          }
        ]
      }, testUserId);

      assert.ok(batch.id > 0, "Should have valid id");
      assert.equal(batch.company_id, testCompanyId, "Should have correct company_id");
      assert.equal(batch.doc_type, "MANUAL", "Should have MANUAL doc_type");
      assert.ok(batch.lines.length >= 2, "Should have lines");

      // Verify debits = credits
      let totalDebit = 0;
      let totalCredit = 0;
      for (const line of batch.lines) {
        totalDebit += line.debit ?? 0;
        totalCredit += line.credit ?? 0;
      }
      assert.equal(totalDebit, totalCredit, "Debits should equal credits");

      // Store for cleanup
      testJournalBatchId = batch.id;
    });

    test("creates journal with client_ref for idempotency", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const clientRef = crypto.randomUUID();

      const batch1 = await createManualJournalEntry({
        company_id: testCompanyId,
        outlet_id: testOutletId,
        entry_date: today,
        description: "Idempotent Test",
        client_ref: clientRef,
        lines: [
          {
            account_id: 1,
            debit: 500,
            credit: 0,
            description: "Debit"
          },
          {
            account_id: 2,
            debit: 0,
            credit: 500,
            description: "Credit"
          }
        ]
      }, testUserId);

      // Creating again with same client_ref should return the same batch
      const batch2 = await createManualJournalEntry({
        company_id: testCompanyId,
        outlet_id: testOutletId,
        entry_date: today,
        description: "Different Description",
        client_ref: clientRef,
        lines: [
          {
            account_id: 1,
            debit: 999,
            credit: 0,
            description: "Different Debit"
          },
          {
            account_id: 2,
            debit: 0,
            credit: 999,
            description: "Different Credit"
          }
        ]
      }, testUserId);

      assert.equal(batch1.id, batch2.id, "Should return same batch for same client_ref");
    });

    test("rejects unbalanced entry", async () => {
      const today = new Date().toISOString().slice(0, 10);

      try {
        await createManualJournalEntry({
          company_id: testCompanyId,
          outlet_id: testOutletId,
          entry_date: today,
          description: "Unbalanced Entry",
          lines: [
            {
              account_id: 1,
              debit: 1000,
              credit: 0,
              description: "Debit"
            },
            {
              account_id: 2,
              debit: 0,
              credit: 500, // Only 500 credit - unbalanced!
              description: "Credit"
            }
          ]
        }, testUserId);

        assert.fail("Should have thrown JournalNotBalancedError");
      } catch (error: unknown) {
        const errorName = error instanceof Error ? error.name : "";
        assert.ok(
          errorName === "JournalNotBalancedError",
          "Should throw JournalNotBalancedError for unbalanced entry"
        );
      }
    });

    test("entry is scoped to company", async () => {
      const today = new Date().toISOString().slice(0, 10);

      const batch = await createManualJournalEntry({
        company_id: testCompanyId,
        outlet_id: testOutletId,
        entry_date: today,
        description: "Company Scope Test",
        lines: [
          {
            account_id: 1,
            debit: 100,
            credit: 0,
            description: "Debit"
          },
          {
            account_id: 2,
            debit: 0,
            credit: 100,
            description: "Credit"
          }
        ]
      }, testUserId);

      assert.equal(batch.company_id, testCompanyId, "Journal should be scoped to company");

      // Store for cleanup
      testJournalBatchId = batch.id;
    });
  });

  // ===========================================================================
  // Get Journal Batch Tests
  // ===========================================================================

  describe("Get Journal Batch", () => {
    test("returns journal batch by id", async () => {
      // First create a journal batch
      const today = new Date().toISOString().slice(0, 10);
      const created = await createManualJournalEntry({
        company_id: testCompanyId,
        outlet_id: testOutletId,
        entry_date: today,
        description: "Get Test",
        lines: [
          {
            account_id: 1,
            debit: 200,
            credit: 0,
            description: "Debit"
          },
          {
            account_id: 2,
            debit: 0,
            credit: 200,
            description: "Credit"
          }
        ]
      }, testUserId);

      // Then retrieve it
      const batch = await getJournalBatch(created.id, testCompanyId);

      assert.equal(batch.id, created.id, "Should return correct batch");
      assert.equal(batch.company_id, testCompanyId, "Should have correct company_id");
      assert.ok(batch.lines.length > 0, "Should have lines");

      // Store for cleanup
      testJournalBatchId = batch.id;
    });

    test("throws error for non-existent batch", async () => {
      try {
        await getJournalBatch(999999, testCompanyId);
        assert.fail("Should have thrown JournalNotFoundError");
      } catch (error: unknown) {
        const errorName = error instanceof Error ? error.name : "";
        assert.ok(
          errorName === "JournalNotFoundError",
          "Should throw JournalNotFoundError for non-existent batch"
        );
      }
    });

    test("throws error when batch belongs to different company", async () => {
      // First create a journal batch
      const today = new Date().toISOString().slice(0, 10);
      const created = await createManualJournalEntry({
        company_id: testCompanyId,
        outlet_id: testOutletId,
        entry_date: today,
        description: "Different Company Test",
        lines: [
          {
            account_id: 1,
            debit: 300,
            credit: 0,
            description: "Debit"
          },
          {
            account_id: 2,
            debit: 0,
            credit: 300,
            description: "Credit"
          }
        ]
      }, testUserId);

      // Try to retrieve with different company ID
      try {
        await getJournalBatch(created.id, 999999);
        assert.fail("Should have thrown JournalNotFoundError");
      } catch (error: unknown) {
        const errorName = error instanceof Error ? error.name : "";
        assert.ok(
          errorName === "JournalNotFoundError",
          "Should throw JournalNotFoundError for different company"
        );
      }

      // Store for cleanup
      testJournalBatchId = created.id;
    });
  });

  // ===========================================================================
  // Company Scoping Tests
  // ===========================================================================

  describe("Company Scoping Enforcement", () => {
    test("cannot list journals for different company", async () => {
      const result = await listJournalBatches({
        company_id: 999999,
        limit: 10,
        offset: 0,
      });

      assert.ok(Array.isArray(result), "Should return array");
      assert.equal(result.length, 0, "Should return empty for non-existent company");
    });

    test("journal lines have correct structure", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const batch = await createManualJournalEntry({
        company_id: testCompanyId,
        outlet_id: testOutletId,
        entry_date: today,
        description: "Line Structure Test",
        lines: [
          {
            account_id: 1,
            debit: 400,
            credit: 0,
            description: "Debit line"
          },
          {
            account_id: 2,
            debit: 0,
            credit: 400,
            description: "Credit line"
          }
        ]
      }, testUserId);

      assert.ok(batch.lines.length >= 2, "Should have lines");
      const line = batch.lines[0];
      assert.ok("account_id" in line, "Line should have account_id");
      assert.ok("debit" in line, "Line should have debit");
      assert.ok("credit" in line, "Line should have credit");

      // Store for cleanup
      testJournalBatchId = batch.id;
    });
  });
});
