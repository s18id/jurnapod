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
  "@slow reports integration: journals/trial-balance outlet filter excludes null-outlet rows",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    const db = testContext.db;
    let outletBatchId = 0;
    let nullBatchId = 0;
    let outletAccountId = 0;
    let nullAccountId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);

    try {
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

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const reportDate = "2026-03-15";
      const postedAtSql = "2026-03-15 12:00:00";

      const outletAccountCode = `ITRPTOS${runId}`.slice(0, 32).toUpperCase();
      const nullAccountCode = `ITRPTNS${runId}`.slice(0, 32).toUpperCase();

      const [outletAccountInsert] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, outletAccountCode, `Outlet scoped account ${runId}`]
      );
      outletAccountId = Number(outletAccountInsert.insertId);

      const [nullAccountInsert] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, nullAccountCode, `Null outlet account ${runId}`]
      );
      nullAccountId = Number(nullAccountInsert.insertId);

      const [outletBatchInsert] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at)
         VALUES (?, ?, 'IT_SCOPE_OUTLET', ?, ?)`,
        [companyId, outletId, Number(Date.now()), postedAtSql]
      );
      outletBatchId = Number(outletBatchInsert.insertId);

      const [nullBatchInsert] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at)
         VALUES (?, NULL, 'IT_SCOPE_NULL', ?, ?)`,
        [companyId, Number(Date.now()) + 1, postedAtSql]
      );
      nullBatchId = Number(nullBatchInsert.insertId);

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
         ) VALUES (?, ?, ?, ?, ?, 100, 0, 'Outlet scoped trial row')`,
        [outletBatchId, companyId, outletId, outletAccountId, reportDate]
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
         ) VALUES (?, ?, NULL, ?, ?, 75, 0, 'Null outlet trial row')`,
        [nullBatchId, companyId, nullAccountId, reportDate]
      );

      const baseUrl = testContext.baseUrl;

      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword, null);

      const journalsResponse = await fetch(
        `${baseUrl}/api/reports/journals?outlet_id=${outletId}&date_from=${reportDate}&date_to=${reportDate}&limit=100`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(journalsResponse.status, 200);
      const journalsBody = await journalsResponse.json();
      assert.equal(journalsBody.success, true);
      assert.equal(journalsBody.data.journals.some((row) => row.id === outletBatchId), true);
      assert.equal(journalsBody.data.journals.some((row) => row.id === nullBatchId), false);

      const trialBalanceResponse = await fetch(
        `${baseUrl}/api/reports/trial-balance?outlet_id=${outletId}&date_from=${reportDate}&date_to=${reportDate}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(trialBalanceResponse.status, 200);
      const trialBalanceBody = await trialBalanceResponse.json();
      assert.equal(trialBalanceBody.success, true);

      const accountIds = trialBalanceBody.data.rows.map((row) => Number(row.account_id));
      assert.equal(accountIds.includes(outletAccountId), true);
      assert.equal(accountIds.includes(nullAccountId), false);
    } finally {
      // Note: journal_lines are immutable (enforced by trigger) - cannot delete
      // journal_batches cannot be deleted due to FK constraint with journal_lines
      // Accounts referenced by journal_lines cannot be deleted due to FK constraint
      // Test data will remain as immutable records

    }
  }
);

test(
  "@slow reports integration: journals as_of keeps pagination snapshot stable across concurrent inserts",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    const db = testContext.db;
    let accountId = 0;
    const batchIds = [];

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const reportDate = "2026-03-16";
    const runId = Date.now().toString(36);
    const docType = `IT_JRNL_ASOF_${runId}`.slice(0, 32);

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

      const accountCode = `ITRPTJAS${runId}`.slice(0, 32).toUpperCase();
      const [accountInsert] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, accountCode, `Journal as_of account ${runId}`]
      );
      accountId = Number(accountInsert.insertId);

      const [batch1Insert] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at)
         VALUES (?, ?, ?, ?, '${reportDate} 10:00:00')`,
        [companyId, outletId, docType, Number(Date.now())]
      );
      batchIds.push(Number(batch1Insert.insertId));

      const [batch2Insert] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at)
         VALUES (?, ?, ?, ?, '${reportDate} 10:05:00')`,
        [companyId, outletId, docType, Number(Date.now()) + 1]
      );
      batchIds.push(Number(batch2Insert.insertId));

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
         ) VALUES
           (?, ?, ?, ?, ?, 100, 0, 'Journal as_of debit 1'),
           (?, ?, ?, ?, ?, 0, 100, 'Journal as_of credit 1'),
           (?, ?, ?, ?, ?, 100, 0, 'Journal as_of debit 2'),
           (?, ?, ?, ?, ?, 0, 100, 'Journal as_of credit 2')`,
        [
          batchIds[0],
          companyId,
          outletId,
          accountId,
          reportDate,
          batchIds[0],
          companyId,
          outletId,
          accountId,
          reportDate,
          batchIds[1],
          companyId,
          outletId,
          accountId,
          reportDate,
          batchIds[1],
          companyId,
          outletId,
          accountId,
          reportDate
        ]
      );

      const baseUrl = testContext.baseUrl;

      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword, null);

      const asOfIso = `${reportDate}T23:59:59.999Z`;
      const asOfResponse = await fetch(
        `${baseUrl}/api/reports/journals?outlet_id=${outletId}&date_from=${reportDate}&date_to=${reportDate}&as_of=${encodeURIComponent(asOfIso)}&limit=50&offset=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(asOfResponse.status, 200);
      const asOfBody = await asOfResponse.json();
      assert.equal(asOfBody.success, true);
      // Filter by our unique doc_type to avoid counting leftover test data
      const asOfFilteredJournals = asOfBody.data.journals.filter(j => j.doc_type === docType);
      assert.equal(asOfFilteredJournals.length, 2);

      const page1Response = await fetch(
        `${baseUrl}/api/reports/journals?outlet_id=${outletId}&date_from=${reportDate}&date_to=${reportDate}&limit=1&offset=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(page1Response.status, 200);
      const page1Body = await page1Response.json();
      assert.equal(page1Body.success, true);
      assert.equal(typeof page1Body.data.filters.as_of, "string");
      assert.equal(typeof page1Body.data.filters.as_of_id, "number");
      // page1 returns 1 journal (may not be ours due to other test data)
      assert.equal(page1Body.data.journals.length, 1);
      const firstPageBatchId = page1Body.data.journals[0]?.id;

      const [batch3Insert] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at)
         VALUES (?, ?, ?, ?, '${reportDate} 10:10:00')`,
        [companyId, outletId, docType, Number(Date.now()) + 2]
      );
      const concurrentBatchId = Number(batch3Insert.insertId);
      batchIds.push(concurrentBatchId);

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
         ) VALUES
           (?, ?, ?, ?, ?, 100, 0, 'Journal as_of debit 3'),
           (?, ?, ?, ?, ?, 0, 100, 'Journal as_of credit 3')`,
        [concurrentBatchId, companyId, outletId, accountId, reportDate, concurrentBatchId, companyId, outletId, accountId, reportDate]
      );

      const page2Response = await fetch(
        `${baseUrl}/api/reports/journals?outlet_id=${outletId}&date_from=${reportDate}&date_to=${reportDate}&limit=1&offset=1&as_of=${encodeURIComponent(page1Body.data.filters.as_of)}&as_of_id=${page1Body.data.filters.as_of_id}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(page2Response.status, 200);
      const page2Body = await page2Response.json();
      assert.equal(page2Body.success, true);
      // page2 returns 1 journal (may not be ours due to other test data)
      assert.equal(page2Body.data.journals.length, 1);

      const returnedPage2Ids = page2Body.data.journals.map((row) => row.id);
      // The concurrent batch should NOT appear in page2 (as_of snapshot excludes it)
      assert.equal(returnedPage2Ids.includes(concurrentBatchId), false);
      // firstPageBatchId should NOT appear in page2 (different page)
      assert.equal(returnedPage2Ids.includes(firstPageBatchId), false);
    } finally {
      // Note: journal_lines are immutable (enforced by trigger) - cannot delete
      // journal_batches cannot be deleted due to FK constraint with journal_lines
      // Accounts referenced by journal_lines cannot be deleted due to FK constraint
      // Test data will remain as immutable records

    }
  }
);
