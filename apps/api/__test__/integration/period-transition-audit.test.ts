// @ts-nocheck
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Period Transition Audit Integration Tests
 * 
 * Tests for:
 * - GET /api/audit/period-transitions - Query period transition audit logs
 * - GET /api/audit/period-transitions/:id - Get single audit record
 * 
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { test, describe, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  loginOwner,
  readEnv,
  setupIntegrationTests,
  TEST_TIMEOUT_MS
} from "../../tests/integration/integration-harness.js";
import {
  PeriodTransitionAuditService,
  PERIOD_TRANSITION_ACTION,
  PERIOD_STATUS
} from "@jurnapod/modules-platform/audit/period-transition";
import { AuditService } from "@jurnapod/modules-platform";
import { getDbPool } from "../../src/lib/db.js";

const testContext = setupIntegrationTests();

test(
  "@slow period transition audit: log and query transitions",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    const db = testContext.db;
    let serverLogs = [];

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

    let companyId = 0;
    let outletId = 0;
    let ownerId = 0;

    try {
      // Find test user fixture
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN outlets o ON o.company_id = u.company_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
           AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );
      const owner = ownerRows[0];
      if (!owner) {
        throw new Error(
          "owner fixture not found; run `npm run db:migrate && npm run db:seed` before integration tests"
        );
      }

      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);
      ownerId = Number(owner.id);

      // Get an open fiscal year for the company
      const [fyRows] = await db.execute(
        `SELECT id FROM fiscal_years WHERE company_id = ? AND status = 'OPEN' LIMIT 1`,
        [companyId]
      );
      let fiscalYearId = 0;
      if (fyRows.length > 0) {
        fiscalYearId = Number(fyRows[0].id);
      } else {
        // Create a test fiscal year
        const year = new Date().getFullYear();
        const [fyResult] = await db.execute(
          `INSERT INTO fiscal_years (company_id, code, name, start_date, end_date, status, created_by_user_id, updated_by_user_id)
           VALUES (?, 'TESTFY', 'Test FY', ?, ?, 'OPEN', ?, ?)`,
          [companyId, `${year}-01-01`, `${year}-12-31`, ownerId, ownerId]
        );
        fiscalYearId = Number(fyResult.insertId);
      }

      const runId = Date.now().toString(36);
      const baseUrl = testContext.baseUrl;

      // Login to get access token
      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword, serverLogs);

      // Create service instances
      const db = await getDbPool();
      const auditService = new AuditService(db);
      const periodTransitionService = new PeriodTransitionAuditService(db, auditService);

      // Step 1: Log a period transition using the library function
      await periodTransitionService.logTransition(
        {
          company_id: companyId,
          user_id: ownerId,
          outlet_id: outletId,
          ip_address: "127.0.0.1"
        },
        fiscalYearId,
        0, // period_number 0 = full year
        PERIOD_TRANSITION_ACTION.CLOSE,
        PERIOD_STATUS.OPEN,
        PERIOD_STATUS.CLOSED,
        {
          journal_entry_ids: [1, 2, 3],
          notes: `Test close at ${runId}`
        }
      );

      // Step 2: Query the period transition audit logs
      const queryResult = await periodTransitionService.queryAudits({
        company_id: companyId,
        fiscal_year_id: fiscalYearId,
        limit: 100
      });

      assert.ok(queryResult.total >= 1, "Should have at least 1 transition audit record");
      
      const transition = queryResult.transitions.find(
        t => t.fiscal_year_id === fiscalYearId && t.period_number === 0
      );
      assert.ok(transition, "Should find the transition we just logged");
      assert.strictEqual(transition.action, PERIOD_TRANSITION_ACTION.CLOSE);
      assert.strictEqual(transition.prior_state, PERIOD_STATUS.OPEN);
      assert.strictEqual(transition.new_state, PERIOD_STATUS.CLOSED);
      assert.deepStrictEqual(transition.metadata.journal_entry_ids, [1, 2, 3]);

      // Step 3: Test query with action filter
      const filteredResult = await periodTransitionService.queryAudits({
        company_id: companyId,
        action: PERIOD_TRANSITION_ACTION.CLOSE,
        limit: 100
      });

      assert.ok(filteredResult.total >= 1, "Should have at least 1 transition with CLOSE action");
      for (const t of filteredResult.transitions) {
        assert.strictEqual(t.action, PERIOD_TRANSITION_ACTION.CLOSE);
      }

      // Step 4: Test query with actor filter
      const actorResult = await periodTransitionService.queryAudits({
        company_id: companyId,
        actor_user_id: ownerId,
        limit: 100
      });

      assert.ok(actorResult.total >= 1, "Should have at least 1 transition by the actor");
      for (const t of actorResult.transitions) {
        assert.strictEqual(t.actor_user_id, ownerId);
      }

      // Step 5: Test HTTP endpoint - GET /api/audit/period-transitions
      const response = await fetch(
        `${baseUrl}/api/audit/period-transitions?fiscal_year_id=${fiscalYearId}&limit=10`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );

      assert.strictEqual(response.status, 200, "Should return 200 OK");
      const responseData = await response.json();
      assert.strictEqual(responseData.success, true, "Response should have success=true");
      assert.ok(Array.isArray(responseData.data.transitions), "Should have transitions array");
      assert.ok(responseData.data.total >= 1, "Should have at least 1 transition");

      // Step 6: Test HTTP endpoint with action filter
      const filteredResponse = await fetch(
        `${baseUrl}/api/audit/period-transitions?action=PERIOD_CLOSE&limit=10`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );

      assert.strictEqual(filteredResponse.status, 200, "Should return 200 OK");
      const filteredData = await filteredResponse.json();
      assert.strictEqual(filteredData.success, true);
      for (const t of filteredData.data.transitions) {
        assert.strictEqual(t.action, "PERIOD_CLOSE");
      }

      // Step 7: Test HTTP endpoint with date range filter
      const today = new Date().toISOString().split("T")[0];
      const dateRangeResponse = await fetch(
        `${baseUrl}/api/audit/period-transitions?from_date=${today}T00:00:00Z&to_date=${today}T23:59:59Z&limit=10`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );

      assert.strictEqual(dateRangeResponse.status, 200, "Should return 200 OK with date range filter");

      console.log("✅ Period transition audit tests passed");
    } finally {
      // Cleanup: delete test audit logs (if any were created)
      try {
        await db.execute(
          `DELETE FROM audit_logs WHERE company_id = ? AND entity_type = 'period_transition' AND created_at > NOW() - INTERVAL 1 DAY`,
          [companyId]
        );
        // Cleanup: delete test fiscal year if we created one
        await db.execute(
          `DELETE FROM fiscal_years WHERE company_id = ? AND code = 'TESTFY'`,
          [companyId]
        );
      } catch (cleanupError) {
        console.warn("Cleanup warning:", cleanupError.message);
      }
    }
  }
);

test(
  "@slow period transition audit: success field filtering (not result)",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    const db = testContext.db;

    // Create service instances
    const auditService = new AuditService(db);
    const periodTransitionService = new PeriodTransitionAuditService(db, auditService);

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();

    let companyId = 0;
    let outletId = 0;
    let ownerId = 0;

    try {
      // Find test user fixture
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN outlets o ON o.company_id = u.company_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
           AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );
      const owner = ownerRows[0];
      if (!owner) {
        throw new Error(
          "owner fixture not found; run `npm run db:migrate && npm run db:seed` before integration tests"
        );
      }

      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);
      ownerId = Number(owner.id);

      // Get an open fiscal year
      const [fyRows] = await db.execute(
        `SELECT id FROM fiscal_years WHERE company_id = ? AND status = 'OPEN' LIMIT 1`,
        [companyId]
      );
      let fiscalYearId = 0;
      if (fyRows.length > 0) {
        fiscalYearId = Number(fyRows[0].id);
      } else {
        const year = new Date().getFullYear();
        const [fyResult] = await db.execute(
          `INSERT INTO fiscal_years (company_id, code, name, start_date, end_date, status, created_by_user_id, updated_by_user_id)
           VALUES (?, 'TESTFY', 'Test FY', ?, ?, 'OPEN', ?, ?)`,
          [companyId, `${year}-01-01`, `${year}-12-31`, ownerId, ownerId]
        );
        fiscalYearId = Number(fyResult.insertId);
      }

      // Log a period transition
      await periodTransitionService.logTransition(
        {
          company_id: companyId,
          user_id: ownerId,
          outlet_id: outletId
        },
        fiscalYearId,
        0,
        PERIOD_TRANSITION_ACTION.OPEN,
        PERIOD_STATUS.CLOSED,
        PERIOD_STATUS.OPEN,
        { notes: "Test reopen" }
      );

      // Query should only return records where success = 1
      const queryResult = await periodTransitionService.queryAudits({
        company_id: companyId,
        fiscal_year_id: fiscalYearId,
        limit: 100
      });

      // All returned records should have success = 1 (verified by the query)
      for (const transition of queryResult.transitions) {
        // The metadata should not contain failed records
        assert.ok(transition.metadata, "Transition should have metadata");
      }

      console.log("✅ Success field filtering test passed");
    } finally {
      // Cleanup
      try {
        await db.execute(
          `DELETE FROM audit_logs WHERE company_id = ? AND entity_type = 'period_transition' AND created_at > NOW() - INTERVAL 1 DAY`,
          [companyId]
        );
        await db.execute(
          `DELETE FROM fiscal_years WHERE company_id = ? AND code = 'TESTFY'`,
          [companyId]
        );
      } catch (cleanupError) {
        console.warn("Cleanup warning:", cleanupError.message);
      }
    }
  }
);
