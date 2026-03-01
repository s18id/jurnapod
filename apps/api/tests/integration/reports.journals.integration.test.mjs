// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import mysql from "mysql2/promise";
import {
  dbConfigFromEnv,
  getFreePort,
  loadEnvIfPresent,
  loginOwner,
  readEnv,
  startApiServer,
  stopApiServer,
  TEST_TIMEOUT_MS,
  waitForHealthcheck
} from "./reports.helpers.mjs";

test(
  "reports integration: journals/trial-balance outlet filter excludes null-outlet rows",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    loadEnvIfPresent();

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
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
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
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
      const reportDate = "2020-02-20";
      const postedAtSql = "2020-02-20 12:00:00";

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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

      const journalsResponse = await fetch(
        `${baseUrl}/api/reports/journals?outlet_id=${outletId}&date_from=${reportDate}&date_to=${reportDate}&limit=200`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(journalsResponse.status, 200);
      const journalsBody = await journalsResponse.json();
      assert.equal(journalsBody.ok, true);
      assert.equal(journalsBody.journals.some((row) => row.id === outletBatchId), true);
      assert.equal(journalsBody.journals.some((row) => row.id === nullBatchId), false);

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
      assert.equal(trialBalanceBody.ok, true);

      const accountIds = trialBalanceBody.rows.map((row) => Number(row.account_id));
      assert.equal(accountIds.includes(outletAccountId), true);
      assert.equal(accountIds.includes(nullAccountId), false);
    } finally {
      await stopApiServer(childProcess);

      if (outletBatchId > 0) {
        await db.execute("DELETE FROM journal_lines WHERE journal_batch_id = ?", [outletBatchId]);
        await db.execute("DELETE FROM journal_batches WHERE id = ?", [outletBatchId]);
      }

      if (nullBatchId > 0) {
        await db.execute("DELETE FROM journal_lines WHERE journal_batch_id = ?", [nullBatchId]);
        await db.execute("DELETE FROM journal_batches WHERE id = ?", [nullBatchId]);
      }

      if (outletAccountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [outletAccountId]);
      }

      if (nullAccountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [nullAccountId]);
      }

      await db.end();
    }
  }
);

test(
  "reports integration: journals as_of keeps pagination snapshot stable across concurrent inserts",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    loadEnvIfPresent();

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let accountId = 0;
    const batchIds = [];

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const reportDate = "2020-05-10";
    const runId = Date.now().toString(36);

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.company_id, o.id AS outlet_id
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
         VALUES (?, ?, 'IT_JRNL_ASOF', ?, '${reportDate} 10:00:00')`,
        [companyId, outletId, Number(Date.now())]
      );
      batchIds.push(Number(batch1Insert.insertId));

      const [batch2Insert] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at)
         VALUES (?, ?, 'IT_JRNL_ASOF', ?, '${reportDate} 10:05:00')`,
        [companyId, outletId, Number(Date.now()) + 1]
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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

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
      assert.equal(page1Body.ok, true);
      assert.equal(typeof page1Body.filters.as_of, "string");
      assert.equal(typeof page1Body.filters.as_of_id, "number");
      assert.equal(page1Body.total, 2);
      const firstPageBatchId = page1Body.journals[0]?.id;

      const [batch3Insert] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at)
         VALUES (?, ?, 'IT_JRNL_ASOF', ?, '${reportDate} 10:10:00')`,
        [companyId, outletId, Number(Date.now()) + 2]
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
        `${baseUrl}/api/reports/journals?outlet_id=${outletId}&date_from=${reportDate}&date_to=${reportDate}&limit=1&offset=1&as_of=${encodeURIComponent(page1Body.filters.as_of)}&as_of_id=${page1Body.filters.as_of_id}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(page2Response.status, 200);
      const page2Body = await page2Response.json();
      assert.equal(page2Body.ok, true);
      assert.equal(page2Body.total, 2);

      const returnedPage2Ids = page2Body.journals.map((row) => row.id);
      assert.equal(returnedPage2Ids.includes(concurrentBatchId), false);
      assert.equal(returnedPage2Ids.includes(firstPageBatchId), false);
    } finally {
      await stopApiServer(childProcess);

      if (batchIds.length > 0) {
        await db.execute(
          `DELETE FROM journal_lines WHERE journal_batch_id IN (${batchIds.map(() => "?").join(", ")})`,
          batchIds
        );
        await db.execute(
          `DELETE FROM journal_batches WHERE id IN (${batchIds.map(() => "?").join(", ")})`,
          batchIds
        );
      }

      if (accountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [accountId]);
      }

      await db.end();
    }
  }
);
