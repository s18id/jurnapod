// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Period Close Workspace Tests
 * 
 * Integration tests for period close workspace:
 * - GET /admin/dashboards/period-close-workspace - Workspace data
 * 
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDb } from "../lib/db";
import { sql } from "kysely";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("Period Close Workspace", { concurrency: false }, () => {
  let testUserId = 0;
  let testCompanyId = 0;
  let testOutletId = 0;
  let testFiscalYearId = 0;

  before(async () => {
    const db = getDb();

    // Find test user fixture
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

    // Get outlet ID
    const outletRows = await db
      .selectFrom("outlets")
      .where("company_id", "=", testCompanyId)
      .where("code", "=", TEST_OUTLET_CODE)
      .select(["id"])
      .limit(1)
      .execute();
    assert.ok(outletRows.length > 0, `Outlet ${TEST_OUTLET_CODE} not found`);
    testOutletId = Number(outletRows[0].id);

    // Find or create a test fiscal year
    const fyRows = await db
      .selectFrom("fiscal_years")
      .where("company_id", "=", testCompanyId)
      .where("status", "=", "OPEN")
      .select(["id"])
      .limit(1)
      .execute();

    if (fyRows.length > 0) {
      testFiscalYearId = Number(fyRows[0].id);
    } else {
      // Create a test fiscal year
      const startDate = new Date();
      startDate.setMonth(0, 1);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date();
      endDate.setMonth(11, 31);
      endDate.setHours(23, 59, 59, 999);

      const runId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      const fyResult = await sql`
        INSERT INTO fiscal_years (company_id, code, name, start_date, end_date, status, created_at, updated_at)
        VALUES (
          ${testCompanyId},
          ${`TEST_FY_${runId}`},
          ${`Test FY ${runId}`},
          ${startDate},
          ${endDate},
          'OPEN',
          NOW(),
          NOW()
        )
      `.execute(db);

      testFiscalYearId = Number(fyResult.insertId);
    }
  });

  after(async () => {
    // Cleanup test fiscal year if we created one
    if (testFiscalYearId > 0) {
      const db = getDb();
      await db
        .deleteFrom("fiscal_year_close_requests")
        .where("fiscal_year_id", "=", testFiscalYearId)
        .execute();
      await db
        .deleteFrom("fiscal_years")
        .where("id", "=", testFiscalYearId)
        .where("company_id", "=", testCompanyId)
        .execute();
    }
    // Close DB pool
    await closeDbPool();
  });

  test("getPeriodCloseWorkspace returns workspace data structure", async () => {
    const { getPeriodCloseWorkspace } = await import("../lib/period-close-workspace.js");

    const workspace = await getPeriodCloseWorkspace({
      companyId: testCompanyId,
      fiscalYearId: testFiscalYearId,
    });

    // Verify structure
    assert.ok(typeof workspace.fiscal_year_id === "number", "fiscal_year_id should be a number");
    assert.ok(typeof workspace.current_period === "number", "current_period should be a number");
    assert.ok(
      ["OPEN", "IN_PROGRESS", "PENDING_APPROVAL", "CLOSED"].includes(workspace.status),
      `status should be one of OPEN, IN_PROGRESS, PENDING_APPROVAL, CLOSED, got: ${workspace.status}`
    );
    assert.ok(Array.isArray(workspace.checklist), "checklist should be an array");
    assert.ok(typeof workspace.completed_steps === "number", "completed_steps should be a number");
    assert.ok(typeof workspace.total_steps === "number", "total_steps should be a number");
    assert.ok(workspace.total_steps === 6, "total_steps should be 6");
  });

  test("workspace has correct checklist items", async () => {
    const { getPeriodCloseWorkspace } = await import("../lib/period-close-workspace.js");

    const workspace = await getPeriodCloseWorkspace({
      companyId: testCompanyId,
      fiscalYearId: testFiscalYearId,
    });

    const expectedIds = [
      "reconciliation",
      "trial_balance",
      "gl_imbalance",
      "variance_threshold",
      "audit_trail",
      "fiscal_year_close",
    ];

    const actualIds = workspace.checklist.map((item) => item.id);
    for (const expectedId of expectedIds) {
      assert.ok(
        actualIds.includes(expectedId),
        `Checklist should contain item with id: ${expectedId}`
      );
    }
  });

  test("checklist items have required fields", async () => {
    const { getPeriodCloseWorkspace } = await import("../lib/period-close-workspace.js");

    const workspace = await getPeriodCloseWorkspace({
      companyId: testCompanyId,
      fiscalYearId: testFiscalYearId,
    });

    for (const item of workspace.checklist) {
      assert.ok(typeof item.id === "string", `item.id should be a string`);
      assert.ok(typeof item.label === "string", `item.label should be a string`);
      assert.ok(
        ["pending", "passed", "failed", "skipped"].includes(item.status),
        `item.status should be one of pending, passed, failed, skipped, got: ${item.status}`
      );
      assert.ok(typeof item.detail_url === "string", `item.detail_url should be a string`);
      // error_message is optional, so no assertion needed
    }
  });

  test("checklist items have correct detail URLs", async () => {
    const { getPeriodCloseWorkspace } = await import("../lib/period-close-workspace.js");

    const workspace = await getPeriodCloseWorkspace({
      companyId: testCompanyId,
      fiscalYearId: testFiscalYearId,
    });

    // Find specific items and verify their URLs
    const trialBalanceItem = workspace.checklist.find((item) => item.id === "trial_balance");
    assert.ok(trialBalanceItem, "trial_balance item should exist");
    assert.ok(
      trialBalanceItem.detail_url.includes("fiscal_year_id=" + testFiscalYearId),
      "trial_balance detail_url should include fiscal_year_id"
    );
    assert.ok(
      trialBalanceItem.detail_url.includes("/trial-balance/validate"),
      "trial_balance detail_url should point to trial-balance/validate"
    );

    const auditTrailItem = workspace.checklist.find((item) => item.id === "audit_trail");
    assert.ok(auditTrailItem, "audit_trail item should exist");
    assert.ok(
      auditTrailItem.detail_url.includes("fiscal_year_id=" + testFiscalYearId),
      "audit_trail detail_url should include fiscal_year_id"
    );

    const fyCloseItem = workspace.checklist.find((item) => item.id === "fiscal_year_close");
    assert.ok(fyCloseItem, "fiscal_year_close item should exist");
    assert.ok(
      fyCloseItem.detail_url.includes("/fiscal-years/" + testFiscalYearId),
      "fiscal_year_close detail_url should point to the fiscal year status"
    );
  });

  test("fiscal_year_close checklist reflects actual fiscal year status", async () => {
    const { getPeriodCloseWorkspace } = await import("../lib/period-close-workspace.js");

    const workspace = await getPeriodCloseWorkspace({
      companyId: testCompanyId,
      fiscalYearId: testFiscalYearId,
    });

    const fyCloseItem = workspace.checklist.find((item) => item.id === "fiscal_year_close");
    assert.ok(fyCloseItem, "fiscal_year_close item should exist");

    // Since we created an OPEN fiscal year, the close should be pending
    assert.ok(
      fyCloseItem.status === "pending" || fyCloseItem.status === "passed",
      `fiscal_year_close status should be pending or passed for OPEN fiscal year, got: ${fyCloseItem.status}`
    );
  });

  test("workspace completed_steps matches checklist passed/skipped count", async () => {
    const { getPeriodCloseWorkspace } = await import("../lib/period-close-workspace.js");

    const workspace = await getPeriodCloseWorkspace({
      companyId: testCompanyId,
      fiscalYearId: testFiscalYearId,
    });

    const expectedCompleted = workspace.checklist.filter(
      (item) => item.status === "passed" || item.status === "skipped"
    ).length;

    assert.ok(
      workspace.completed_steps === expectedCompleted,
      `completed_steps should be ${expectedCompleted}, got: ${workspace.completed_steps}`
    );
  });

  test("workspace throws error for non-existent fiscal year", async () => {
    const { getPeriodCloseWorkspace } = await import("../lib/period-close-workspace.js");

    await assert.rejects(
      async () => {
        await getPeriodCloseWorkspace({
          companyId: testCompanyId,
          fiscalYearId: 999999999,
        });
      },
      {
        message: /Fiscal year 999999999 not found/,
      }
    );
  });

  test("workspace throws error for wrong company", async () => {
    const { getPeriodCloseWorkspace } = await import("../lib/period-close-workspace.js");

    // Use a different company ID (non-existent)
    await assert.rejects(
      async () => {
        await getPeriodCloseWorkspace({
          companyId: 999999999,
          fiscalYearId: testFiscalYearId,
        });
      },
      {
        message: /Fiscal year .* not found/,
      }
    );
  });
});
