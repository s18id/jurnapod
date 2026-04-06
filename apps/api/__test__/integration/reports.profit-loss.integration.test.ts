// @ts-nocheck
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test, describe, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  loginOwner,
  readEnv,
  setupIntegrationTests,
  TEST_TIMEOUT_MS
} from "../../tests/integration/integration-harness.js";

const testContext = setupIntegrationTests();

test(
  "@slow reports integration: profit-loss falls back to account type report_group when account report_group is null",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    const db = testContext.db;
    let profitLossTypeId = 0;
    let includedAccountId = 0;
    let excludedAccountId = 0;
    let journalBatchId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.company_id, o.id AS outlet_id
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

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);

      // Get fiscal year date range to use a valid date
      const [fiscalRows] = await db.execute(
        `SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
         FROM fiscal_years
         WHERE company_id = ?
           AND status = 'OPEN'
         ORDER BY start_date DESC
         LIMIT 1`,
        [companyId]
      );
      const fiscal = fiscalRows[0];
      if (!fiscal) {
        throw new Error("open fiscal year not found");
      }

      // Use a date within the fiscal year, with unique runId suffix to avoid conflicts
      const reportDate = String(fiscal.end_date);

      const [typeInsert] = await db.execute(
        `INSERT INTO account_types (company_id, name, category, normal_balance, report_group, is_active)
         VALUES (?, ?, 'REVENUE', 'K', 'PL', 1)`,
        [companyId, `IT PnL Type ${runId}`]
      );
      profitLossTypeId = Number(typeInsert.insertId);

      const [includedAccountInsert] = await db.execute(
        `INSERT INTO accounts (company_id, code, name, account_type_id, report_group)
         VALUES (?, ?, ?, ?, NULL)`,
        [companyId, `ITPLIN${runId}`.slice(0, 32).toUpperCase(), `PnL Included ${runId}`, profitLossTypeId]
      );
      includedAccountId = Number(includedAccountInsert.insertId);

      const [excludedAccountInsert] = await db.execute(
        `INSERT INTO accounts (company_id, code, name, report_group)
         VALUES (?, ?, ?, NULL)`,
        [companyId, `ITPLOUT${runId}`.slice(0, 32).toUpperCase(), `PnL Excluded ${runId}`]
      );
      excludedAccountId = Number(excludedAccountInsert.insertId);

      const [batchInsert] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at)
         VALUES (?, ?, 'IT_PROFIT_LOSS', ?, ?)`,
        [companyId, outletId, Number(Date.now()), `${reportDate} 10:00:00`]
      );
      journalBatchId = Number(batchInsert.insertId);

      await db.execute(
        `INSERT INTO journal_lines (
           journal_batch_id,
           company_id,
           outlet_id,
           account_id,
           line_date,
           debit,
           credit,
           description
         ) VALUES (?, ?, ?, ?, ?, 10, 0, 'PnL included via account type fallback debit')`,
        [journalBatchId, companyId, outletId, includedAccountId, reportDate]
      );

      await db.execute(
        `INSERT INTO journal_lines (
           journal_batch_id,
           company_id,
           outlet_id,
           account_id,
           line_date,
           debit,
           credit,
           description
         ) VALUES (?, ?, ?, ?, ?, 0, 70, 'PnL included via account type fallback credit')`,
        [journalBatchId, companyId, outletId, includedAccountId, reportDate]
      );

      await db.execute(
        `INSERT INTO journal_lines (
           journal_batch_id,
           company_id,
           outlet_id,
           account_id,
           line_date,
           debit,
           credit,
           description
         ) VALUES (?, ?, ?, ?, ?, 0, 30, 'PnL excluded control row')`,
        [journalBatchId, companyId, outletId, excludedAccountId, reportDate]
      );

      const baseUrl = testContext.baseUrl;
      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword, null);

      const response = await fetch(
        `${baseUrl}/api/reports/profit-loss?outlet_id=${outletId}&date_from=${reportDate}&date_to=${reportDate}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);

      // Verify the included account appears in the report (account type's report_group is used)
      const accountIds = body.data.rows.map((row) => Number(row.account_id));
      assert.equal(accountIds.includes(includedAccountId), true, "Included account should appear in report");

      // Verify the excluded account does NOT appear (no account type, no report_group)
      assert.equal(accountIds.includes(excludedAccountId), false, "Excluded account should not appear in report");

      // Verify the included account's values
      const includedRow = body.data.rows.find((row) => Number(row.account_id) === includedAccountId);
      assert.ok(includedRow, "Included account row should exist");
      assert.equal(Number(includedRow.total_debit), 10, "Included account total_debit should be 10");
      assert.equal(Number(includedRow.total_credit), 70, "Included account total_credit should be 70");
      assert.equal(Number(includedRow.net), 60, "Included account net should be 60");

      // Calculate totals from test accounts only (to avoid interference from other test data)
      // The report may include other accounts from previous test runs, so we verify our test accounts specifically
      const testAccountsInReport = body.data.rows.filter(
        (row) => Number(row.account_id) === includedAccountId || Number(row.account_id) === excludedAccountId
      );
      
      // Verify only the included account is in the report (excluded should not be there)
      assert.equal(testAccountsInReport.length, 1, "Only included account should be in report");
      assert.equal(Number(testAccountsInReport[0].account_id), includedAccountId, "Only account should be included account");
    } finally {
      // Note: journal_lines are immutable (enforced by trigger) - cannot delete
      // journal_batches cannot be deleted due to FK constraint with journal_lines
      // Accounts referenced by journal_lines cannot be deleted due to FK constraint
      // Test data will remain as immutable records

      if (profitLossTypeId > 0) {
        await db.execute("DELETE FROM account_types WHERE id = ?", [profitLossTypeId]);
      }
    }
  }
);