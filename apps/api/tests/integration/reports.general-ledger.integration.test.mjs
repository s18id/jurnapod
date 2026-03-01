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
  "reports integration: general-ledger account pagination returns lines with running balance",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    loadEnvIfPresent();

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let accountId = 0;
    let journalBatchId = 0;
    let page2LineId = 0;

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
      const reportDate = "2020-06-10";
      const openingDate = "2020-06-09";

      const accountCode = `ITRPTGL${runId}`.slice(0, 32).toUpperCase();
      const [accountInsert] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, accountCode, `General ledger account ${runId}`]
      );
      accountId = Number(accountInsert.insertId);

      const [batchInsert] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at)
         VALUES (?, ?, 'IT_GL', ?, '${reportDate} 09:00:00')`,
        [companyId, outletId, Number(Date.now())]
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
         ) VALUES (?, ?, ?, ?, ?, 200, 0, 'Opening balance')`,
        [journalBatchId, companyId, outletId, accountId, openingDate]
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
         ) VALUES (?, ?, ?, ?, ?, 100, 0, 'Period debit 1')`,
        [journalBatchId, companyId, outletId, accountId, reportDate]
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
         ) VALUES (?, ?, ?, ?, ?, 0, 40, 'Period credit')`,
        [journalBatchId, companyId, outletId, accountId, reportDate]
      );

      const [line3Insert] = await db.execute(
        `INSERT INTO journal_lines (
           journal_batch_id,
           company_id,
           outlet_id,
           account_id,
           line_date,
           debit,
           credit,
           description
         ) VALUES (?, ?, ?, ?, ?, 10, 0, 'Period debit 2')`,
        [journalBatchId, companyId, outletId, accountId, reportDate]
      );
      page2LineId = Number(line3Insert.insertId);

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

      const ledgerResponse = await fetch(
        `${baseUrl}/api/reports/general-ledger?outlet_id=${outletId}&account_id=${accountId}&date_from=${reportDate}&date_to=${reportDate}&line_limit=2&line_offset=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(ledgerResponse.status, 200);
      const ledgerBody = await ledgerResponse.json();
      assert.equal(ledgerBody.ok, true);
      assert.equal(Array.isArray(ledgerBody.rows), true);
      assert.equal(ledgerBody.rows.length, 1);
      assert.equal(Number(ledgerBody.rows[0].account_id), accountId);
      assert.equal(ledgerBody.rows[0].lines.length, 2);
      assert.equal(Number(ledgerBody.rows[0].opening_balance), 200);
      assert.equal(Number(ledgerBody.rows[0].lines[0].balance), 300);
      assert.equal(Number(ledgerBody.rows[0].lines[1].balance), 260);

      const ledgerPage2Response = await fetch(
        `${baseUrl}/api/reports/general-ledger?outlet_id=${outletId}&account_id=${accountId}&date_from=${reportDate}&date_to=${reportDate}&line_limit=2&line_offset=2`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(ledgerPage2Response.status, 200);
      const ledgerPage2Body = await ledgerPage2Response.json();
      assert.equal(ledgerPage2Body.ok, true);
      assert.equal(ledgerPage2Body.rows.length, 1);
      assert.equal(ledgerPage2Body.rows[0].lines.length, 1);
      assert.equal(Number(ledgerPage2Body.rows[0].lines[0].line_id), page2LineId);
      assert.equal(Number(ledgerPage2Body.rows[0].lines[0].balance), 270);
    } finally {
      await stopApiServer(childProcess);

      if (journalBatchId > 0) {
        await db.execute("DELETE FROM journal_lines WHERE journal_batch_id = ?", [journalBatchId]);
        await db.execute("DELETE FROM journal_batches WHERE id = ?", [journalBatchId]);
      }

      if (accountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [accountId]);
      }

      await db.end();
    }
  }
);
