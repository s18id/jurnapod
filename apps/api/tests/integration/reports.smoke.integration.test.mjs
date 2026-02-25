import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
  "reports integration: owner can view daily sales and journals",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    loadEnvIfPresent();

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let txClientId = "";
    let accountId = 0;
    let journalBatchId = 0;

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

      txClientId = randomUUID();
      const trxAt = new Date();
      const trxAtSql = trxAt.toISOString().slice(0, 19).replace("T", " ");

      const [txInsert] = await db.execute(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           client_tx_id,
           status,
           trx_at,
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, 'COMPLETED', ?, '', 1)`,
        [companyId, outletId, txClientId, trxAtSql]
      );
      const txId = Number(txInsert.insertId);

      await db.execute(
        `INSERT INTO pos_transaction_items (
           pos_transaction_id,
           company_id,
           outlet_id,
           line_no,
           item_id,
           qty,
           price_snapshot,
           name_snapshot
         ) VALUES (?, ?, ?, 1, 1, 1, 50000, 'Integration Item')`,
        [txId, companyId, outletId]
      );

      await db.execute(
        `INSERT INTO pos_transaction_payments (
           pos_transaction_id,
           company_id,
           outlet_id,
           payment_no,
           method,
           amount
         ) VALUES (?, ?, ?, 1, 'CASH', 50000)`,
        [txId, companyId, outletId]
      );

      const accountCode = `ITRPT${runId}`.slice(0, 32).toUpperCase();
      const [accountInsert] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, accountCode, `IT Reports Account ${runId}`]
      );
      accountId = Number(accountInsert.insertId);

      const [batchInsert] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at)
         VALUES (?, ?, 'IT_REPORT', ?, ?)`,
        [companyId, outletId, Number(Date.now()), trxAtSql]
      );
      journalBatchId = Number(batchInsert.insertId);

      const lineDate = trxAt.toISOString().slice(0, 10);
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
           (?, ?, ?, ?, ?, 100, 0, 'IT debit'),
           (?, ?, ?, ?, ?, 0, 100, 'IT credit')`,
        [journalBatchId, companyId, outletId, accountId, lineDate, journalBatchId, companyId, outletId, accountId, lineDate]
      );

      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 1);
      const dateFromIso = dateFrom.toISOString().slice(0, 10);
      const dateToIso = new Date().toISOString().slice(0, 10);

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

      const posResponse = await fetch(
        `${baseUrl}/api/reports/pos-transactions?outlet_id=${outletId}&date_from=${dateFromIso}&date_to=${dateToIso}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(posResponse.status, 200);
      const posBody = await posResponse.json();
      assert.equal(posBody.ok, true);
      assert.equal(Array.isArray(posBody.transactions), true);
      assert.equal(typeof posBody.total, "number");

      const dailySalesResponse = await fetch(
        `${baseUrl}/api/reports/daily-sales?outlet_id=${outletId}&date_from=${dateFromIso}&date_to=${dateToIso}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(dailySalesResponse.status, 200);
      const dailySalesBody = await dailySalesResponse.json();
      assert.equal(dailySalesBody.ok, true);
      assert.equal(dailySalesBody.rows.length > 0, true);

      const journalsResponse = await fetch(
        `${baseUrl}/api/reports/journals?outlet_id=${outletId}&date_from=${dateFromIso}&date_to=${dateToIso}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(journalsResponse.status, 200);
      const journalsBody = await journalsResponse.json();
      assert.equal(journalsBody.ok, true);
      assert.equal(
        journalsBody.journals.some((row) => row.id === journalBatchId && row.doc_type === "IT_REPORT"),
        true
      );

      const trialBalanceResponse = await fetch(
        `${baseUrl}/api/reports/trial-balance?outlet_id=${outletId}&date_from=${dateFromIso}&date_to=${dateToIso}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(trialBalanceResponse.status, 200);
      const trialBalanceBody = await trialBalanceResponse.json();
      assert.equal(trialBalanceBody.ok, true);
      assert.equal(
        trialBalanceBody.rows.some((row) => Number(row.account_id) === accountId),
        true
      );
      assert.equal(
        Number(trialBalanceBody.totals.total_debit) >= Number(trialBalanceBody.totals.total_credit),
        true
      );
    } finally {
      await stopApiServer(childProcess);

      if (journalBatchId > 0) {
        await db.execute("DELETE FROM journal_lines WHERE journal_batch_id = ?", [journalBatchId]);
        await db.execute("DELETE FROM journal_batches WHERE id = ?", [journalBatchId]);
      }

      if (accountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [accountId]);
      }

      if (txClientId) {
        await db.execute("DELETE FROM pos_transactions WHERE client_tx_id = ?", [txClientId]);
      }

      await db.end();
    }
  }
);
