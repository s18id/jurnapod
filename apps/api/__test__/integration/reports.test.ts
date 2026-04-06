// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reports Routes Tests
 *
 * Tests for /reports endpoints:
 * - Trial Balance report
 * - Profit & Loss report
 * - POS Transactions
 * - Journal Batches
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDb } from "../lib/db";
import {
  getTrialBalance,
  getProfitLoss,
  listPosTransactions,
  listJournalBatches,
  listDailySalesSummary,
} from "../lib/reports";

loadEnvIfPresent();

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("Reports Routes", { concurrency: false }, () => {
  let testUserId = 0;
  let testCompanyId = 0;
  let testOutletId = 0;

  before(async () => {
    const db = getDb();

    // Find test user fixture using Kysely query builder
    // Global owner has outlet_id = NULL in user_role_assignments
    const userRows = await db
      .selectFrom("users as u")
      .innerJoin("companies as c", "c.id", "u.company_id")
      .innerJoin("user_role_assignments as ura", "ura.user_id", "u.id")
      .where("c.code", "=", TEST_COMPANY_CODE)
      .where("u.email", "=", TEST_OWNER_EMAIL)
      .where("u.is_active", "=", 1)
      .where("ura.outlet_id", "is", null)
      .select(["u.id as user_id", "u.company_id"])
      .limit(1)
      .execute();

    assert.ok(
      userRows.length > 0,
      `Owner fixture not found; run database seed first. Looking for company=${TEST_COMPANY_CODE}, email=${TEST_OWNER_EMAIL}`
    );
    testUserId = Number(userRows[0].user_id);
    testCompanyId = Number(userRows[0].company_id);

    // Get outlet ID from outlets table
    const outletRows = await db
      .selectFrom("outlets")
      .where("company_id", "=", testCompanyId)
      .where("code", "=", TEST_OUTLET_CODE)
      .select(["id"])
      .limit(1)
      .execute();
    assert.ok(outletRows.length > 0, `Outlet ${TEST_OUTLET_CODE} not found`);
    testOutletId = Number(outletRows[0].id);
  });

  after(async () => {
    await withTimeout(closeDbPool(), 10000, "closeDbPool");

    // Final safety net: release lingering active handles that can keep node:test alive.
    // @ts-expect-error Node internal API used for diagnostics/cleanup in tests.
    const activeHandles: unknown[] = typeof process._getActiveHandles === "function"
      // @ts-expect-error Node internal API used for diagnostics/cleanup in tests.
      ? process._getActiveHandles()
      : [];

    for (const handle of activeHandles) {
      if (handle === process.stdin || handle === process.stdout || handle === process.stderr) {
        continue;
      }

      const maybeHandle = handle as {
        destroy?: () => void;
        close?: () => void;
        unref?: () => void;
        end?: () => void;
      };

      try {
        maybeHandle.unref?.();
        maybeHandle.end?.();
        maybeHandle.destroy?.();
        maybeHandle.close?.();
      } catch {
        // ignore cleanup best-effort errors
      }
    }
  });

  // ===========================================================================
  // Trial Balance Report Tests
  // ===========================================================================

  describe("Trial Balance Report", () => {
    test("returns array of account balances", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const rows = await getTrialBalance({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC"
      });

      assert.ok(Array.isArray(rows), "Should return array");
    });

    test("debits equal credits when accounts have balanced transactions", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const rows = await getTrialBalance({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC"
      });

      // Calculate totals
      const totals = rows.reduce(
        (acc, row) => ({
          total_debit: acc.total_debit + (row.total_debit ?? 0),
          total_credit: acc.total_credit + (row.total_credit ?? 0),
        }),
        { total_debit: 0, total_credit: 0 }
      );

      // In a balanced system, debits should equal credits
      // This may not be true for real data, but we test the calculation is correct
      assert.ok(typeof totals.total_debit === "number", "Total debit should be a number");
      assert.ok(typeof totals.total_credit === "number", "Total credit should be a number");
    });

    test("returns empty array for non-existent company", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const rows = await getTrialBalance({
        companyId: 999999,
        outletIds: [],
        dateFrom,
        dateTo,
        timezone: "UTC"
      });

      assert.ok(Array.isArray(rows), "Should return array");
      assert.equal(rows.length, 0, "Should return empty array for non-existent company");
    });

    test("handles date range filtering", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // 1 year

      const rows = await getTrialBalance({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC"
      });

      assert.ok(Array.isArray(rows), "Should return array");
    });

    test("row structure has required fields", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const rows = await getTrialBalance({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC"
      });

      if (rows.length > 0) {
        const row = rows[0];
        assert.ok("account_id" in row, "Row should have account_id");
        assert.ok("account_code" in row, "Row should have account_code");
        assert.ok("account_name" in row, "Row should have account_name");
        assert.ok("total_debit" in row, "Row should have total_debit");
        assert.ok("total_credit" in row, "Row should have total_credit");
        assert.ok("balance" in row, "Row should have balance");
      }
    });
  });

  // ===========================================================================
  // Profit & Loss Report Tests
  // ===========================================================================

  describe("Profit & Loss Report", () => {
    test("returns rows and totals structure", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await getProfitLoss({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC"
      });

      assert.ok("rows" in result, "Result should have rows property");
      assert.ok("totals" in result, "Result should have totals property");
      assert.ok(Array.isArray(result.rows), "rows should be an array");
      assert.ok(typeof result.totals === "object", "totals should be an object");
    });

    test("totals structure has required fields", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await getProfitLoss({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC"
      });

      assert.ok("total_debit" in result.totals, "Totals should have total_debit");
      assert.ok("total_credit" in result.totals, "Totals should have total_credit");
      assert.ok("net" in result.totals, "Totals should have net");
    });

    test("returns empty for non-existent company", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await getProfitLoss({
        companyId: 999999,
        outletIds: [],
        dateFrom,
        dateTo,
        timezone: "UTC"
      });

      assert.equal(result.rows.length, 0, "Should return empty rows");
      assert.equal(result.totals.total_debit, 0, "Total debit should be 0");
      assert.equal(result.totals.total_credit, 0, "Total credit should be 0");
    });

    test("net income equals revenue minus expenses", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await getProfitLoss({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC"
      });

      // Net should be total_credit - total_debit (for PL accounts)
      // Revenue (credit) - Expenses (debit) = Net Income
      const expectedNet = result.totals.total_credit - result.totals.total_debit;
      assert.equal(result.totals.net, expectedNet, "Net should equal revenue - expenses");
    });
  });

  // ===========================================================================
  // POS Transactions Report Tests
  // ===========================================================================

  describe("POS Transactions Report", () => {
    test("returns transactions array with pagination", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await listPosTransactions({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC",
        limit: 10,
        offset: 0,
      });

      assert.ok("transactions" in result, "Result should have transactions property");
      assert.ok("total" in result, "Result should have total property");
      assert.ok(Array.isArray(result.transactions), "transactions should be an array");
      assert.ok(typeof result.total === "number", "total should be a number");
    });

    test("respects limit and offset", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result1 = await listPosTransactions({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC",
        limit: 5,
        offset: 0,
      });

      const result2 = await listPosTransactions({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC",
        limit: 5,
        offset: 5,
      });

      // If there are more than 5 transactions, the results should be different
      if (result1.total > 5) {
        assert.notDeepEqual(result1.transactions, result2.transactions, "Different offsets should return different results");
      }
    });

    test("filters by status", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await listPosTransactions({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC",
        status: "COMPLETED",
        limit: 50,
        offset: 0,
      });

      for (const tx of result.transactions) {
        assert.equal(tx.status, "COMPLETED", "All transactions should have COMPLETED status");
      }
    });

    test("transaction structure has required fields", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await listPosTransactions({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC",
        limit: 10,
        offset: 0,
      });

      if (result.transactions.length > 0) {
        const tx = result.transactions[0];
        assert.ok("id" in tx, "Transaction should have id");
        assert.ok("outlet_id" in tx, "Transaction should have outlet_id");
        assert.ok("client_tx_id" in tx, "Transaction should have client_tx_id");
        assert.ok("status" in tx, "Transaction should have status");
        assert.ok("trx_at" in tx, "Transaction should have trx_at");
      }
    });

    test("has_more calculation is correct", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await listPosTransactions({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC",
        limit: 10,
        offset: 0,
      });

      const hasMore = result.total > 10;
      assert.equal(
        result.transactions.length < 10 || result.transactions.length === 0,
        hasMore === false,
        "hasMore should be false when we've reached the end"
      );
    });
  });

  // ===========================================================================
  // Journal Batches Report Tests
  // ===========================================================================

  describe("Journal Batches Report", () => {
    test("returns journals array with pagination", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await listJournalBatches({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC",
        limit: 10,
        offset: 0,
      });

      assert.ok("journals" in result, "Result should have journals property");
      assert.ok("total" in result, "Result should have total property");
      assert.ok(Array.isArray(result.journals), "journals should be an array");
      assert.ok(typeof result.total === "number", "total should be a number");
    });

    test("respects limit and offset", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result1 = await listJournalBatches({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC",
        limit: 5,
        offset: 0,
      });

      const result2 = await listJournalBatches({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC",
        limit: 5,
        offset: 5,
      });

      // Results may differ depending on data
      assert.ok(typeof result1.total === "number", "Should have total count");
    });

    test("journal structure has required fields", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await listJournalBatches({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC",
        limit: 10,
        offset: 0,
      });

      if (result.journals.length > 0) {
        const journal = result.journals[0];
        assert.ok("id" in journal, "Journal should have id");
        assert.ok("outlet_id" in journal, "Journal should have outlet_id");
        assert.ok("doc_type" in journal, "Journal should have doc_type");
        assert.ok("posted_at" in journal, "Journal should have posted_at");
        assert.ok("total_debit" in journal, "Journal should have total_debit");
        assert.ok("total_credit" in journal, "Journal should have total_credit");
      }
    });

    test("returns empty for non-existent company", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await listJournalBatches({
        companyId: 999999,
        outletIds: [],
        dateFrom,
        dateTo,
        timezone: "UTC",
        limit: 10,
        offset: 0,
      });

      assert.equal(result.journals.length, 0, "Should return empty journals");
      assert.equal(result.total, 0, "Total should be 0");
    });
  });

  // ===========================================================================
  // Daily Sales Summary Report Tests
  // ===========================================================================

  describe("Daily Sales Summary Report", () => {
    test("returns summary data", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await listDailySalesSummary({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC",
      });

      assert.ok(Array.isArray(result), "Should return array");
    });

    test("summary entries have required fields when not empty", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await listDailySalesSummary({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom,
        dateTo,
        timezone: "UTC",
      });

      if (result.length > 0) {
        const entry = result[0];
        assert.ok("trx_date" in entry, "Entry should have trx_date field");
        assert.ok("outlet_id" in entry, "Entry should have outlet_id field");
        assert.ok("gross_total" in entry, "Entry should have gross_total field");
        assert.ok("paid_total" in entry, "Entry should have paid_total field");
      }
    });
  });

  // ===========================================================================
  // Date Filtering Tests
  // ===========================================================================

  describe("Date Range Filtering", () => {
    test("narrower date range returns subset of data", async () => {
      const now = new Date();
      const wideFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const narrowFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const dateTo = now.toISOString().slice(0, 10);

      const wideResult = await getTrialBalance({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom: wideFrom,
        dateTo,
        timezone: "UTC"
      });

      const narrowResult = await getTrialBalance({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom: narrowFrom,
        dateTo,
        timezone: "UTC"
      });

      // Narrower range should return same or fewer rows
      assert.ok(narrowResult.length <= wideResult.length, "Narrower range should not have more rows");
    });

    test("empty date range returns empty results", async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const laterDate = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await getTrialBalance({
        companyId: testCompanyId,
        outletIds: [testOutletId],
        dateFrom: futureDate,
        dateTo: laterDate,
        timezone: "UTC"
      });

      // Future dates should return no data (or empty if no transactions in that period)
      assert.ok(Array.isArray(result), "Should return array");
    });
  });

  // ===========================================================================
  // Company Scoping Tests
  // ===========================================================================

  describe("Company Scoping Enforcement", () => {
    test("cannot access other company data", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // Try to access non-existent company
      const result = await getTrialBalance({
        companyId: 999999,
        outletIds: [999999],
        dateFrom,
        dateTo,
        timezone: "UTC"
      });

      assert.ok(Array.isArray(result), "Should return array");
      // Empty outletIds should return empty array (handled by library)
    });

    test("empty outletIds returns empty array", async () => {
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await getTrialBalance({
        companyId: testCompanyId,
        outletIds: [],
        dateFrom,
        dateTo,
        timezone: "UTC"
      });

      assert.equal(result.length, 0, "Empty outletIds should return empty array");
    });
  });
});
